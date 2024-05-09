import { LiquidityPoolKeysV4, LiquidityStateV4, TxVersion } from "@raydium-io/raydium-sdk"
import { connection, lite_rpc, httpOnlyRpcs, connectionAlt1 } from "../adapter/rpc"
import { RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, USDC_ADDRESS, WSOL_ADDRESS, config as SystemConfig, config } from "../utils";
import { BlockhashWithExpiryBlockHeight, Commitment, ComputeBudgetProgram, Connection, PublicKey, RpcResponseAndContext, TransactionError, TransactionInstruction, TransactionMessage, Version, VersionedMessage, VersionedTransaction, VersionedTransactionResponse, sendAndConfirmRawTransaction } from "@solana/web3.js";
import { BotLiquidity } from "./liquidity";
import BN from "bn.js";
import { TransactionCompute, TxBalance, TxPool } from "../types";

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { payer } from "../adapter/payer";
import { logger } from "../utils/logger";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import idl from '../idl/amm_proxy.json'
import sleep from "atomic-sleep";
import { getSimulationComputeUnits } from "@solana-developers/helpers";
import { sendTxUsingJito } from "../adapter/jito";
import { toBuffer } from "../utils/instruction";
import { BotBundle } from "./bundle";

export const getAmmIdFromSignature = async (signature: string) : Promise<PublicKey | undefined> => {
  const response = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed'
  })

  if(!response) { return undefined }

  return getAmmIdFromTransaction(response.transaction.message)
}

/**
 * Retrieve Raydium AMM ID from the transaction
 * @param message 
 * @returns 
 */
export const getAmmIdFromTransaction = (message: VersionedMessage) : PublicKey | undefined => {
  for (let ins of message.compiledInstructions) {
    if(ins.data.length > 0 && message.staticAccountKeys[ins.programIdIndex].toBase58() === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
      return message.staticAccountKeys[ins.accountKeyIndexes[1]]
    }
  }
}

export class BotTransaction {

  /**
   * Generate pool keys KV from transaction signature
   * Only can read transaction from "confirmed" transaction
   * @param signature 
   * @returns 
   */
  static generatePoolKeysFromSignature = async (signature: string): Promise<LiquidityPoolKeysV4 | undefined> => {
    const response = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    })
  
    if(!response) { return undefined }

    const ammId = this.getAmmIdFromTransaction(response.transaction.message)

    if(!ammId) { return undefined }

    return BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId!)
  }

  static getAmmIdFromTransaction = (message: VersionedMessage) : PublicKey | undefined => {
    for (let ins of message.compiledInstructions) {
      if(ins.data.length > 0 && message.staticAccountKeys[ins.programIdIndex].toBase58() === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
        // console.log(ins.accountKeyIndexes.forEach(i => console.log(message.staticAccountKeys[i])))
        return message.staticAccountKeys[ins.accountKeyIndexes[1]]
      }
    }
  }

  static getAmmIdFromSignature = async (signature: string) : Promise<PublicKey | undefined> => {
    const response = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    })
    
    if(!response) { return undefined }
  
    // return this.getAmmIdFromTransaction(response.transaction.message)
  }

  // Read mint token balance from transaction
  static getBalanceFromTransaction = (preTokenBalances: TxBalance[], postTokenBalances: TxBalance[], mint: PublicKey) : BN => {
    const tokenPreAccount = preTokenBalances.filter(
      (account) =>
        account.mint === mint.toBase58() &&
        account.owner === RAYDIUM_AUTHORITY_V4_ADDRESS
    )[0];
    const tokenPostAccount = postTokenBalances.filter(
      (account) =>
        account.mint === mint.toBase58() &&
        account.owner === RAYDIUM_AUTHORITY_V4_ADDRESS
    )[0];

    const tokenAmount = tokenPreAccount.amount.sub(tokenPostAccount.amount)

    return tokenAmount
  }

  static sendTransactionToMultipleRpcs =  async(transaction: VersionedTransaction) => {
    let signature

    httpOnlyRpcs.forEach((rpc) => {
      signature = rpc.sendRawTransaction(
        transaction.serialize(),
        {
          maxRetries: 3,
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        },
      );
    })

    return signature
  }

  static formatTransactionToTxPool(streamName: string, tx: VersionedTransactionResponse): TxPool {
    const message = tx.transaction.message

    const preTokenBalances = tx.meta?.preTokenBalances?.map((token: any) => ({
      mint: token.mint,
      owner: token.owner,
      amount: new BN(token.uiTokenAmount.amount),
      decimals: token.uiTokenAmount.decimals,
    })) || [];
  
    const postTokenBalances = tx.meta?.postTokenBalances?.map((token: any) => ({
      mint: token.mint,
      owner: token.owner,
      amount: new BN(token.uiTokenAmount.amount),
      decimals: token.uiTokenAmount.decimals,
    })) || [];

    let err = undefined
    if(tx.meta?.err) {
      let metaErr: any = tx.meta?.err
      if(metaErr.InstructionError && metaErr.InstructionError.length > 0) {
        err = metaErr.InstructionError[1].Custom
      }
    }

    return {
      mempoolTxns: {
        source: streamName,
        signature: tx.transaction.signatures[0],
        accountKeys: message.staticAccountKeys.map((e: any) => e.toBase58()),
        recentBlockhash: message.recentBlockhash,
        instructions: message.compiledInstructions.map((e: any) => {
          return {
            programIdIndex: e.programIdIndex,
            accounts: e.accountKeyIndexes || [],
            data: Buffer.from(e.data, 'base64').toString('hex')
          }
        }),
        innerInstructions: [],
        addressTableLookups: message.addressTableLookups.map((e: any) => {
          return {
            accountKey: e.accountKey.toBase58(),
            writableIndexes: e.writableIndexes || [],
            readonlyIndexes: e.readonlyIndexes || []
          }
        }),
        preTokenBalances,
        postTokenBalances,
        computeUnitsConsumed: tx.meta?.computeUnitsConsumed || 0,
        err
      },
      timing: {
        listened: new Date().getTime(),
        preprocessed: 0,
        processed: 0,
        send: 0
      }
    }
  }

  /**
   * Capture sendRawTransaction error and return error separately
   * this to prevent from the bot stop unexpectedly
   * If it detect blockhash not found, retry again?
   * @param transaction 
   * @param blockhashResult 
   */
  static sendAutoRetryTransaction =  async(conn: Connection, transaction: VersionedTransaction, jitoTipAmount: BN = new BN(0)) : Promise<string> => {
    const rawTransaction = transaction.serialize()
  
    let method = config.get('send_tx_method')
    let signature

    switch(method) {
      case 'jito_send_tx':
        let bundle = await sendTxUsingJito({
          serializedTx: transaction.serialize(),
          region: 'random'
        })

        signature = bundle.result
        break
      case 'jito_send_bundle':
        let bundleId = await BotBundle.submitBundle({
          vtransaction: transaction,
          expectedProfit: new BN(0),
          tipAmount: jitoTipAmount
        })

        signature = bundleId
        break
      case 'base64':
        signature = await BotTransaction.sendBase64Transaction(transaction)
        break;
      case 'rpc':
      default:
        signature = await conn.sendRawTransaction(rawTransaction, {
          skipPreflight: true,
          preflightCommitment: 'confirmed'
        })
        break
    }
    
    return signature
  }

  static async sendBase64Transaction(transaction: VersionedTransaction) : Promise<string> {
    const resp = await fetch(config.get('http_rpc_url'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [
          toBuffer(transaction.serialize()).toString('base64'),
          {
            encoding: "base64",
            skipPreflight: true,
            maxRetries: 1,
            preflightCommitment: "confirmed"
          }
        ]
      })
    })
    const json = await resp.json();
    return json.result
  }

  static sendJitoTransaction =  async(transaction: VersionedTransaction) : Promise<string> => {

    let signature = await sendTxUsingJito({
      serializedTx: transaction.serialize(),
      region: 'mainnet'
    })
    
    return signature
  }
  
  static async runSimulation (conn: Connection, instructions: TransactionInstruction[], blockhash: string) : Promise<RpcResponseAndContext<anchor.web3.SimulatedTransactionResponse>> {
    // let cu = await getSimulationComputeUnits(conn, instructions, payer.publicKey, [])
    const simulatedMessageV0 = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash,
			instructions: [
        ...instructions,
			],
		}).compileToV0Message()

		const simTx = new VersionedTransaction(simulatedMessageV0)
    
    let simulate = await conn.simulateTransaction(simTx, {
      replaceRecentBlockhash: true,
      commitment: 'confirmed'
    }) 
    
    if(simulate.value.err) {
      logger.error(simulate.value.err)
      throw new Error(`Simulation error: ${simulate.value.err}`)
    }

    return simulate
  }

  static async getExpectedComputeUnitFromTransactions (conn: Connection, instructions: TransactionInstruction[], blockhash: string) : Promise<number> {
    // let cu = await getSimulationComputeUnits(conn, instructions, payer.publicKey, [])
    const simulatedMessageV0 = new TransactionMessage({
			payerKey: payer.publicKey,
			recentBlockhash: blockhash,
			instructions: [
        ...instructions,
			],
		}).compileToV0Message()

		const simTx = new VersionedTransaction(simulatedMessageV0)
    
		let cu = await conn.simulateTransaction(simTx, {
      replaceRecentBlockhash: true,
      commitment: 'confirmed'
    })

    if(!cu || !cu.value.unitsConsumed) { return 0 }

    return Math.ceil(cu.value.unitsConsumed * 1.01)
  }

  static sendToSwapProgram = async (
    conn: Connection,
    poolKeys: LiquidityPoolKeysV4,
    sourceTokenAccount: PublicKey,
    destTokenAccount: PublicKey,
    amountIn: BN,
    amountOut: BN,
    startInstructions: TransactionInstruction[],
    config: {
      compute: TransactionCompute,
      blockhash?: string
    }
  ) => {

    try {

      const blockResponse = await connection.getLatestBlockhashAndContext('confirmed')

      const program = new anchor.Program(
        idl as anchor.Idl, 
        SystemConfig.get('swap_program_id'),
        new anchor.AnchorProvider(connection, new NodeWallet(payer), {})
      )
      
      const instruction = await program.methods.proxySwapBaseIn(
        amountIn,
        amountOut
      )
      .accounts({
        ammProgram: poolKeys.programId,
        amm: poolKeys.id,
        ammAuthority: poolKeys.authority,
        ammOpenOrders: poolKeys.openOrders,
        ammCoinVault: poolKeys.baseVault,
        ammPcVault: poolKeys.quoteVault,
        marketProgram: poolKeys.marketProgramId,
        market: poolKeys.marketId,
        marketBids: poolKeys.marketBids,
        marketAsks: poolKeys.marketAsks,
        marketEventQueue: poolKeys.marketEventQueue,
        marketCoinVault: poolKeys.marketBaseVault,
        marketPcVault: poolKeys.marketQuoteVault,
        marketVaultSigner: poolKeys.marketAuthority,
        userTokenSource: sourceTokenAccount,
        userTokenDestination: destTokenAccount,
        userSourceOwner: payer.publicKey,
      })
      .instruction()

      // const cu = await this.getExpectedComputeUnitFromTransactions(connectionAlt1, [
      //   ...startInstructions,
      //   instruction
      // ])

      let computeInstructions: TransactionInstruction[] = []

      if (config?.compute && config?.compute.units > 0) {
        computeInstructions.push(
          ComputeBudgetProgram.setComputeUnitLimit({
            units: 55000,
            // units: 55000
          })
        )
      }
  
      if (config?.compute && config?.compute.units > 0) {
        computeInstructions.push(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: config.compute.microLamports,
          })
        )
      }

      const messageV0 = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: blockResponse.value.blockhash as string,
        instructions: [
          ...computeInstructions,
          ...startInstructions,
          instruction,
        ],
      }).compileToV0Message()
      
      const transaction = new VersionedTransaction(messageV0)
      transaction.sign([payer])

      return this.sendAutoRetryTransaction(conn, transaction)

    } catch(e: any) {
      logger.warn(`${e.toString()}`)
    }
  }
}
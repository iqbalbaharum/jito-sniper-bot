import { LiquidityPoolKeysV4, LiquidityStateV4, TxVersion } from "@raydium-io/raydium-sdk"
import { connection, lite_rpc, httpOnlyRpcs } from "../adapter/rpc"
import { RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, USDC_ADDRESS, WSOL_ADDRESS, config } from "../utils";
import { Commitment, ComputeBudgetProgram, PublicKey, TransactionInstruction, VersionedMessage, VersionedTransaction } from "@solana/web3.js";
import { BotLiquidity } from "./liquidity";
import BN from "bn.js";
import { TransactionCompute, TxBalance } from "../types";

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { payer } from "../adapter/payer";
import { logger } from "../utils/logger";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import idl from '../idl/amm_proxy.json'

const getTokenMintFromSignature = async (signature: string): Promise<string | undefined> => {
	let tx;
  let timer = new Date().getTime();

	while (true) {
    let res = await fetch(
      `https://api.helius.xyz/v0/transactions/?api-key=${config.get('helius_api_key')}&commitment=confirmed`,
      {
        method: 'POST',
        body: JSON.stringify({
          transactions: [`${signature}`],
        }),
      }
    );

    const json = await res.json();
    tx = json[0];
    if (tx) {
      break;
    }

    if (new Date().getTime() - timer > 30000) {
      return undefined
    }
  }

	const token = tx.tokenTransfers.find(
		(token: any) =>
			token.mint !== WSOL_ADDRESS &&
			token.fromUserAccount === RAYDIUM_AUTHORITY_V4_ADDRESS
	);
	
	if(!token) {
		return undefined
	}

	if (token.mint === USDC_ADDRESS) {
    return undefined
  }

	return token.mint
}

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

export {
    getTokenMintFromSignature
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

  static sendTransaction =  async(transaction: VersionedTransaction, commitment: Commitment) => {
    let signature 
    httpOnlyRpcs.forEach((rpc) => {
      signature = rpc.sendRawTransaction(
        transaction.serialize(),
        {
          maxRetries: 5,
          skipPreflight: true,
        },
      );
    })

    signature = lite_rpc.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: true,
      },
    );

    return signature
  }

  static sendToSwapProgram = async (
    poolKeys: LiquidityPoolKeysV4,
    sourceTokenAccount: PublicKey,
    destTokenAccount: PublicKey,
    amountIn: BN,
    amountOut: BN,
    compute: TransactionCompute,
    startInstructions: TransactionInstruction[]
  ) => {

    const program = new anchor.Program(
      idl as anchor.Idl, 
      config.get('swap_program_id'),
      new anchor.AnchorProvider(connection, new NodeWallet(payer), {})
    )

    const tx = await program.methods.proxySwapBaseIn(
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
      .preInstructions([
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: compute.microLamports }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: compute.units }),
        ...startInstructions
      ])
      .postInstructions([])
      .signers([
        payer
      ]).rpc({
        skipPreflight: false
      });
    
  }
}
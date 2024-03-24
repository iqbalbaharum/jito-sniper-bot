/**
 * Copy trade - ooo5qMf4R5ExWmnjGsb8ZD33UkmqBAnTtyN9D5Ne4Kn
 */
import { AddressLookupTableAccount, Commitment, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { confirmedConnection, connection } from "../adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, Logger, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { JUPITER_ADDRESS, OPENBOOK_V1_ADDRESS, RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils/const";
import { config as SystemConfig, config } from "../utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "../services/token-account";
import { BotLiquidity, BotLookupTable, getAccountPoolKeysFromAccountDataV4, getLiquidityMintState, getTokenInWallet } from "../services";
import sleep from "atomic-sleep";
import { submitBundle } from "../services/bundle";
import { mainSearcherClient } from "../adapter/jito";
import { ArbIdea, BalanceTracker, BotLiquidityState, LookupIndex, MempoolTransaction, TransactionCompute, TxInstruction, TxPool } from "../types";
import { BotTransaction, getAmmIdFromSignature } from "../services/transaction";
import { logger } from "../utils/logger";
import { RaydiumAmmCoder } from "../utils/coder";
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { BotError } from "../types/error";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import { IxSwapBaseIn } from "../utils/coder/layout";
import { payer } from "../adapter/payer";
import { ExistingRaydiumMarketStorage } from "../storage";
import { mempool } from "../generators";

// let trackedLiquidityPool: Set<string> = new Set<string>()
let trackedPoolKeys: Map<string, LiquidityPoolKeys> = new Map<
  string,
  LiquidityPoolKeys>();
let mints: Map<string, BotLiquidityState> = new Map<
  string,
  BotLiquidityState
>();

// tracked for interested LP activities, number would reflect the number of LP
let countLiquidityPool: Map<string, number> = new Map()

let lookupTable: BotLookupTable
let botTokenAccount: BotTokenAccount
let existingMarkets: ExistingRaydiumMarketStorage

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const onBundleResult = () => {
  mainSearcherClient.onBundleResult(
    (bundleResult) => {
      const bundleId = bundleResult.bundleId;
      const isAccepted = bundleResult.accepted;
      const isRejected = bundleResult.rejected;
      
      if (isAccepted) {
        logger.info(
          `Bundle ${bundleId} accepted in slot ${bundleResult.accepted?.slot}`,
        );
      }

      if (isRejected) {
        logger.warn(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
      }
    },
    (error) => {
      logger.error(error);
    },
  );
};

const processBuy = async (ammId: PublicKey, ata: PublicKey, blockhash: string) => {

  if(existingMarkets.isExisted(ammId)) {
    return
  }
  
  const poolKeys = await BotLiquidity.getAccountPoolKeysFromAccountDataV4(ammId)
  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

  if(!poolKeys) { return }
  
  logger.info(new Date(), `BUY ${info.mint.toBase58()}`)

  let signature = await buyToken(
    poolKeys, 
    ata,
    SystemConfig.get('token_purchase_in_sol') * LAMPORTS_PER_SOL,
    new BN(0 * LAMPORTS_PER_SOL),
    blockhash
  )

  if(!signature) { return }
  
  logger.info(`Buy TX send: ${signature}`)

  trackedPoolKeys.set(ammId.toBase58(), poolKeys)
  mints.set(ammId.toBase58(), {
    ammId,
    mint: info.mint,
    mintDecimal: info.decimal,
    isMintBase: info.isMintBase
  })

  // add into the record
  existingMarkets.add(ammId)

  return signature
}

async function processSell(
  ata: PublicKey,
  ammId: PublicKey,
  mint: PublicKey, 
  amount: BN,
  config: {
    blockhash: String
    compute: TransactionCompute
  },
  poolKeys?: LiquidityPoolKeysV4, ) {
  
  if(!poolKeys) {
    poolKeys = trackedPoolKeys.get(ammId!.toBase58())
    if(!poolKeys) { return }
  }

  if(amount === undefined || amount.isZero()) { return }

  logger.info(new Date(), `SELL | ${mint.toBase58()} ${amount.toString()}`)
  const signature = await sellToken(
    poolKeys, 
    ata, 
    amount,
    config
  )
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BigNumberish, expectedProfit: BN, blockhash?: string) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amount,
      0,
      'in',
      {
        compute: {
          microLamports: 10000,
          units: 101337
        },
        blockhash
      }
    );
  
    return await BotTransaction.sendTransaction(transaction, SystemConfig.get('default_commitment') as Commitment)
  } catch(e: any) {
    logger.error(e.toString())
    return ''
  }
}

const sellToken = async (
  keys: LiquidityPoolKeysV4,
  ata: PublicKey,
  amount: BN,
  config: {
    blockhash: String
    compute: TransactionCompute
  }) => {
  try {
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'out',
      ata,
      amount,
      0,
      'in',
      config
    );
    
    // let expected = new BN(0)
    // if(!expectedProfit.isZero()) {
    //   expected = expectedProfit
    // }
  
    // const arb: ArbIdea = {
    //   vtransaction: transaction,
    //   expectedProfit: expected
    // }

    // return await submitBundle(arb)
    return await BotTransaction.sendTransaction(transaction, SystemConfig.get('default_commitment') as Commitment)
  } catch(e) {
    console.log(e)
  }
}

const getAmmIdFromMempoolTx = async (tx: MempoolTransaction, instruction: TxInstruction) => {
  const accountIndexes: number[] = instruction.accounts || []
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)

  let ammId: PublicKey | undefined

  const accountIndex = accountIndexes[1]
  
  if(accountIndex >= tx.accountKeys.length) {
    const lookupIndex = accountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[accountIndex])
  }

  return ammId
}

// Most Raydium transaction is using swapBaseIn, so the bot need to figure out if this transaction
// is "in" @ "out" direction. This can be achieved by checking UserSourceTokenAccount and check if it's similar
// as the signer ATA account. If it's a WSOL, then it's a "in" process, and vice versa
// For swapBaseIn instruction, the position of "UserSourceTokenAccount" is at position #16
const processSwapBaseIn = async (swapBaseIn: IxSwapBaseIn, instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  
  const tx = txPool.mempoolTxns

  // Find the transaction is buy or sell by checking 
  const accountIndexes: number[] = Array.from(instruction.accounts)
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)
  let sourceTA: PublicKey | undefined
  let destTA: PublicKey | undefined
  let ammId: PublicKey | undefined
  let serumProgramId: PublicKey | undefined
  let signer: PublicKey | undefined

  // ammId
  const ammIdAccountIndex = accountIndexes[1]
  if(ammIdAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = ammIdAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[ammIdAccountIndex])
  }

  if(!ammId) { return }

  // BUG: There's another method for Raydium swap which move the array positions
  // to differentiate which position, check the position of OPENBOOK program Id in accountKeys
  const serumAccountIndex = accountIndexes[7]
  if(serumAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = serumAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    serumProgramId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    serumProgramId = new PublicKey(tx.accountKeys[serumAccountIndex])
  }

  let sourceAccountIndex
  let destinationAccountIndex
  let signerAccountIndex
  if(serumProgramId?.toBase58() === OPENBOOK_V1_ADDRESS) {
    sourceAccountIndex = accountIndexes[15]
    destinationAccountIndex = accountIndexes[16]
    signerAccountIndex = accountIndexes[17]
  } else {
    sourceAccountIndex = accountIndexes[14]
    destinationAccountIndex = accountIndexes[15]
    signerAccountIndex = accountIndexes[16]
  }

  // signer
  if(signerAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = signerAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    signer = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    signer = new PublicKey(tx.accountKeys[signerAccountIndex])
  }

  // source 
  if(sourceAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = sourceAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    sourceTA = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    sourceTA = new PublicKey(tx.accountKeys[sourceAccountIndex])
  }

  // destination 
  if(destinationAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = destinationAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await lookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    destTA = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    destTA = new PublicKey(tx.accountKeys[destinationAccountIndex])
  }
  
  if(!sourceTA || !destTA || !ammId || !signer) { return }
  const state = mints.get(ammId!.toBase58())
  if(!state) { return }

  let count = countLiquidityPool.get(ammId.toBase58())

  // BUG: The bot tracked the ammId before tx is finalize, so the buy tx appear in request
  // To counter the bug, skip any tx if sourceTA is similar with user WSOL address
  
  if(count === undefined) { return }
  if(count > 0) { return }

  

  let isBuyTradeAction = false
  let signerWSOLAccount = await BotTokenAccount.getAssociatedTokenAccount(new PublicKey(WSOL_ADDRESS), signer)

  if(!signerWSOLAccount.equals(sourceTA) && !signerWSOLAccount.equals(destTA)) {
    return
  }

  if(signerWSOLAccount.equals(sourceTA)) {
    isBuyTradeAction = true
  } else {
    if(!signerWSOLAccount.equals(destTA)) {
      return
    }
  }

  if(isBuyTradeAction) {
    // processBuy
  } else {
    // processSell
    await processSell(
      ata,
      ammId,
      state.mint, 
      {
        compute: {
          units: 1000000,
          microLamports: 101337
        },
        blockhash: txPool.mempoolTxns.recentBlockhash
      }
    )
  }
  
  let amount = parseFloat(swapBaseIn.amountIn.toString()) / LAMPORTS_PER_SOL
}

const processTx = async (tx: TxPool, ata: PublicKey) => {
  try {
    for(const ins of tx.mempoolTxns.instructions) {
      const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]
      if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
        const decodedIx = coder.instruction.decode(Buffer.from(ins.data))
        
        if(decodedIx.hasOwnProperty('swapBaseIn')) {
          console.log(`Swap: ${tx.mempoolTxns.signature}`)
          await processSwapBaseIn((decodedIx as any).swapBaseIn, ins, tx, ata)
        }
      }
    }
  } catch(e) {
    console.log(e)
  }
}

(async () => {
  try {
    const { ata } = await setupWSOLTokenAccount(true, 0.07)
  
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }

    lookupTable = new BotLookupTable()
    botTokenAccount = new BotTokenAccount()
    existingMarkets = new ExistingRaydiumMarketStorage()

    const mempoolUpdates = mempool(['ooo5qMf4R5ExWmnjGsb8ZD33UkmqBAnTtyN9D5Ne4Kn', payer.publicKey.toBase58()])
    for await (const update of mempoolUpdates) {
      processTx(update, ata) // You can process the updates as needed
    }
  } catch(e) {
    console.log(e)
  }
})();
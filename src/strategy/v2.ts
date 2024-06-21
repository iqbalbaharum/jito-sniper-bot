/**
 * Microservices trade
 */
import { AddressLookupTableAccount, Commitment, Connection, LAMPORTS_PER_SOL, Logs, MessageAccountKeys, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { confirmedConnection, connection } from "../adapter/rpc";
import { BigNumberish, LIQUIDITY_STATE_LAYOUT_V4, LiquidityPoolKeys, LiquidityPoolKeysV4, LiquidityState, LiquidityStateV4, Logger, MARKET_STATE_LAYOUT_V3, getMultipleAccountsInfo, parseBigNumberish } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import { JUPITER_ADDRESS, OPENBOOK_V1_ADDRESS, RAYDIUM_AUTHORITY_V4_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS } from "../utils/const";
import { config as SystemConfig, config } from "../utils/config";
import { BotTokenAccount, setupWSOLTokenAccount } from "../library/token-account";
import { BotLiquidity, BotLookupTable, BotMarket, getLiquidityMintState, getTokenInWallet } from "../library";
import sleep from "atomic-sleep";
import { mainSearcherClient } from "../adapter/jito";
import { LookupIndex, MempoolTransaction, TxInstruction, TxPool, PoolInfo } from "../types";
import { BotTransaction, getAmmIdFromSignature } from "../library/transaction";
import { logger } from "../utils/logger";
import { RaydiumAmmCoder } from "../utils/coder";
import raydiumIDL from '../idl/raydiumAmm.json'
import { Idl } from "@coral-xyz/anchor";
import { IxSwapBaseIn } from "../utils/coder/layout";
import { payer } from "../adapter/payer";
import { getTxs, mempool, subscribeAmmIdToMempool, unsubscribeAmmIdToMempool } from "../generators";
import { blockhasher, blockhasherv2, countLiquidityPool, existingMarkets, mints, tokenBalances, poolKeys, trackedAmm } from "../adapter/storage";
import { BotQueue } from "../library/queue";
import { BotTrade, BotTradeType } from "../library/trade";
import { TradeEntry } from "../types/trade";
import { BotgRPC } from "../library/grpc";
import { BotTradeTracker } from "../library/trade-tracker";
import { BotTrackedAmm } from "../library/tracked-amm";

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const processBuy = async (tradeId: string, ammId: PublicKey, microLamports: number = 500000, delay: number = 0) => {
  
  const isTracked = await trackedAmm.get(ammId)
  if(isTracked === false) { return }
  
  const pKeys = await BotLiquidity.getAccountPoolKeys(ammId)

  if(!pKeys) { return }

  // Check the pool open time before proceed,
  // If the pool is not yet open, then sleep before proceeding
  // At configuration to check if for how long the system willing to wait
  let waitForTge = false
  let different = pKeys.poolOpenTime * 1000 - new Date().getTime();
  if (different > 0) {
    logger.warn(`Sleep ${ammId} | ${different} ms`)
    if (different <= SystemConfig.get('pool_opentime_wait_max')) {
      waitForTge = true
      return
    } else {
      return;
    }
  }

  const info = BotLiquidity.getMintInfoFromWSOLPair(pKeys)
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }

  await poolKeys.set(ammId, pKeys)
  await mints.set(ammId, {
    ammId,
    mint: info.mint,
    mintDecimal: info.decimal,
    isMintBase: info.isMintBase
  })

  existingMarkets.add(ammId)

  await BotTrade.processed(
    tradeId, 
    'buy',
    new BN(SystemConfig.get('token_purchase_in_sol') * LAMPORTS_PER_SOL),
    new BN(0),
    {
      microLamports,
      sendTxMethod: 'rpc',
      units: 65000
    }
  )

  if(waitForTge) {
    BotTrade.execute(tradeId, BotTradeType.SINGLE, delay + different)
  } else {
    BotTrade.execute(tradeId, BotTradeType.SINGLE, delay)
  }
}

async function processSell(tradeId: string, ammId: PublicKey, execCount: number = 1, execInterval: number = 1000, microLamports: number = 500000) {
  
  // Check if the we have confirmed balance before
  // executing sell
  const balance = await tokenBalances.get(ammId)
  if(balance === undefined) { return }
  
  if(balance && !balance.remaining.isZero()) {
    if(!balance.remaining.isNeg()) {

      let amountIn = new BN(0)

      // Check if balance.chunk is lower than remaining.
      if(balance.remaining.gt(balance.chunk)) {
        amountIn = balance.chunk
      } else {
        amountIn = balance.remaining
      }

      await BotTrade.processed(
        tradeId, 
        'sell', 
        amountIn,
        new BN(SystemConfig.get('minimum_amount_out')), 
        {
          microLamports,
          units: 20000,
          runSimulation: SystemConfig.get('run_simulation_flag'),
          sendTxMethod: 'rpc'
        }
      )
      
      if(execCount - 1 > 0) {
        await BotTrade.execute(tradeId, BotTradeType.REPEAT, 0, { every: execInterval, limit: execCount - 1})
      } else {
        await BotTrade.execute(tradeId, BotTradeType.SINGLE, 0)
      }

    }
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
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[accountIndex])
  }

  return ammId
}

/**
 * Burst sell trade based on balance chuck
 * @param ammId 
 * @param ata 
 * @param blockhash 
 * @returns 
 */
const burstSellAfterLP = async(tradeId: string, ammId: PublicKey) => {
  logger.info(`Burst TXs | ${ammId.toBase58()}`)
    const state = await mints.get(ammId!)
    if(!state) { return }
    const totalChunck = SystemConfig.get('tx_balance_chuck_division')
    processSell(tradeId, ammId, Math.floor(totalChunck/ 4), 1800, SystemConfig.get('burst_microlamport'))
}

const processWithdraw = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  const tx = txPool.mempoolTxns

  let tradeId = await BotTrade.listen(TradeEntry.WITHDRAW)

  let ammId: PublicKey | undefined = await getAmmIdFromMempoolTx(tx, instruction)
  if(!ammId) { return }
  
  await BotTrade.preprocessed(tradeId, ammId)

  // If the token is not available, then buy the token. This to cover use cases:
  // 1. Didnt buy token initially
  // 2. Buy failed 
  let count: number | undefined = await countLiquidityPool.get(ammId)
  if(count === undefined || count === null) {
    if(await existingMarkets.isExisted(ammId)) {
      await BotTrade.abandoned(tradeId)
      return
    }
    
    await processBuy(tradeId, ammId, 80000)
    await countLiquidityPool.set(ammId, 0)
  } else {
    await countLiquidityPool.set(ammId, count - 1)
  }

  if(count === undefined) { return }

  // Burst sell transaction, if rugpull detected
  await burstSellAfterLP(tradeId, ammId)
}

const processInitialize2 = async (instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  const tx = txPool.mempoolTxns
  
  const tradeId = await BotTrade.listen(TradeEntry.INITIAILIZE2)

  const accountIndexes: number[] = instruction.accounts || []
  const lookupsForAccountKeyIndex: LookupIndex[] = BotLookupTable.generateTableLookup(tx.addressTableLookups)

  let ammId: PublicKey | undefined

  const accountIndex = accountIndexes[4]
  
  if(accountIndex >= tx.accountKeys.length) {
    const lookupIndex = accountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[accountIndex])
  }

  if(!ammId) { return }

  await BotTrade.preprocessed(tradeId, ammId)

  if(await existingMarkets.isExisted(ammId)) {
    return
  }

  // To add delay buy, add DELAYED_BUY_TOKEN_IN_MS in environment
  await processBuy(tradeId, ammId, 500000, SystemConfig.get('delayed_buy_token_in_ms'))
}

// Most Raydium transaction is using swapBaseIn, so the bot need to figure out if this transaction
// is "in" @ "out" direction. This can be achieved by checking the mint token balance in transaction, 
// if mint token is negative, then it is sell, and if positive value it's buy
const processSwapBaseIn = async (swapBaseIn: IxSwapBaseIn, instruction: TxInstruction, txPool: TxPool, ata: PublicKey) => {
  
  const tx = txPool.mempoolTxns

  blockhasherv2.set({
    recentBlockhash: txPool.mempoolTxns.recentBlockhash
  })

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
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    ammId = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    ammId = new PublicKey(tx.accountKeys[ammIdAccountIndex])
  }

  if(!ammId) { return }

  // Check if this ammId is within the sell attempt configured.
  let tracker = await BotTradeTracker.getTracker(ammId)
  if(tracker) {
    if(tracker.sellAttemptCount > SystemConfig.get('max_sell_attempt')) {
      BotTrackedAmm.unregister(ammId)
      return
    }
  }
  
  // BUG: There's another method for Raydium swap which move the array positions
  // to differentiate which position, check the position of OPENBOOK program Id in accountKeys
  const serumAccountIndex = accountIndexes[7]
  if(serumAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = serumAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
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
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    signer = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    signer = new PublicKey(tx.accountKeys[signerAccountIndex])
  }
  
  // source 
  if(sourceAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = sourceAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    sourceTA = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    sourceTA = new PublicKey(tx.accountKeys[sourceAccountIndex])
  }

  // destination 
  if(destinationAccountIndex >= tx.accountKeys.length) {
    const lookupIndex = destinationAccountIndex - tx.accountKeys.length
    const lookup = lookupsForAccountKeyIndex[lookupIndex]
    const table = await BotLookupTable.getLookupTable(new PublicKey(lookup?.lookupTableKey))
    destTA = table?.state.addresses[lookup?.lookupTableIndex]
  } else {
    destTA = new PublicKey(tx.accountKeys[destinationAccountIndex])
  }
  
  if(!sourceTA || !destTA || !ammId || !signer) { return }

  const state = await mints.get(ammId!)
  if(!state) { return }
  
  let txAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, state.mint)
  let txSolAmount = BotTransaction.getBalanceFromTransaction(tx.preTokenBalances, tx.postTokenBalances, new PublicKey(WSOL_ADDRESS))
  
  let count = await countLiquidityPool.get(ammId)
  
  // This function to calculate the latest balance token in payer wallet.
  // The getBalanceFromTransaction, can identify if the tx is BUY @ SELL call
  if(sourceTA.equals(ata) || signer.equals(payer.publicKey)) {
    return
  }

  // Validate if the swap fullfill certain condition
  // 1. LP have been removed (Check LP count)
  // 2. Buy swap
  // 3. Tracked poolKeys
  if(count === undefined || count === null) { return }
  if(count > 0) { return }

  // Check if the amm is tracked, only proceed tracked amm
  let isTracked = await trackedAmm.get(ammId)
  if(!isTracked) { return }

  let pKeys
  pKeys = await poolKeys.get(ammId!)
  if(!pKeys) { return }
  
  let isBuyTradeAction = false

  if(txAmount.isNeg()) { isBuyTradeAction = false } else { isBuyTradeAction = true }
  
  const amount = parseFloat(txSolAmount.abs().toString()) / LAMPORTS_PER_SOL

  if(!isBuyTradeAction || (isBuyTradeAction && amount < SystemConfig.get('min_sol_trigger'))) {
    return 
  }

  let tradeId = await BotTrade.listen(TradeEntry.SWAPBASEIN)
  await BotTrade.preprocessed(tradeId, ammId)

  const totalChunck = SystemConfig.get('tx_balance_chuck_division')
  // The strategy similar as bot v3 (old). On every trade triggered,
  // burst out a number of txs (chunk)
  // let blockhash = txPool.mempoolTxns.recentBlockhash
  // let units = 35000
  // let microLamports = 500000

  logger.warn(`Potential entry ${ammId} | ${amount} SOL`)
  processSell(tradeId, ammId, Math.floor(totalChunck/ 5), 2000, SystemConfig.get('sell_microlamport'))
}

const processTx = async (tx: TxPool, ata: PublicKey) => {
  for(const ins of tx.mempoolTxns.instructions) {
    const programId = tx.mempoolTxns.accountKeys[ins.programIdIndex]

    if(programId === RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS) {
      
      try {
        let dataBuffer = Buffer.from(ins.data)
        const decodedIx = coder.instruction.decode(dataBuffer)
        if(decodedIx.hasOwnProperty('withdraw')) { // remove liquidity
          logger.info(`Withdraw ${tx.mempoolTxns.signature}`)
          await processWithdraw(ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('swapBaseIn')) {
          await processSwapBaseIn((decodedIx as any).swapBaseIn, ins, tx, ata)
        } else if(decodedIx.hasOwnProperty('initialize2')) {
          logger.info(`Initialize2 ${tx.mempoolTxns.signature}`)
          await processInitialize2(ins, tx, ata)
        }
      } catch(e:any) {
        console.log(tx.mempoolTxns.signature, e)
      }
    }
  }
}

(async () => {
  try {
    const { ata } = await setupWSOLTokenAccount(true, 0.3)
    
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }

    mempool([])

    // reinitialise poolkeys
    subscribeAmmIdToMempool([RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS])
    subscribeAmmIdToMempool(['7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'])
    
    BotTrackedAmm.init()
    
    logger.info(`Starting bot V2`)

    for await (const update of getTxs()) {
      processTx(update, ata) // You can process the updates as needed
    }

  } catch(e) {
    console.log(e)
  }
})();
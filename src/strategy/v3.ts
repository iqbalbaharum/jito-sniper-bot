/**
 * Microservices trade
 * Attempt simulate tx every seconds after LP totally removed
 * Result (13/05/24)
 *  - Only buy token, and simulation always failed 
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
import { mempool } from "../generators";
import { blockhasher, countLiquidityPool, existingMarkets, mints, tokenBalances, poolKeys } from "../adapter/storage";
import { BotQueue } from "../library/queue";
import { BotTrade, BotTradeType } from "../library/trade";
import { TradeEntry } from "../types/trade";
import { BotgRPC } from "../library/grpc";

const coder = new RaydiumAmmCoder(raydiumIDL as Idl)

const processBuy = async (tradeId: string, ammId: PublicKey) => {
  
  const pKeys = await BotLiquidity.getAccountPoolKeys(ammId)

  if(!pKeys) { return }
  // Check the pool open time before proceed,
  // If the pool is not yet open, then sleep before proceeding
  // At configuration to check if for how long the system willing to wait
  let different = pKeys.poolOpenTime * 1000 - new Date().getTime();
  if (different > 0) {
    logger.warn(`Sleep ${ammId} | ${different} ms`)
    if (different <= SystemConfig.get('pool_opentime_wait_max')) {
      BotTrade.execute(tradeId, different)
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

  // add into the record
  existingMarkets.add(ammId)

  await BotTrade.processed(
    tradeId, 
    'buy',
    new BN(SystemConfig.get('token_purchase_in_sol') * LAMPORTS_PER_SOL),
    new BN(0),
    {}
  )

  // delayed buy to make sure we the buy confirmation
  BotTrade.execute(tradeId, BotTradeType.SINGLE, 0)
}

async function processSell(tradeId: string, execCount: number = 1, execInterval: number = 1000) {
  await BotTrade.processed(
    tradeId, 
    'sell', 
    new BN(0), 
    new BN(SystemConfig.get('minimum_amount_out')),
    {
      microLamports: 120000,
      units: 45000,
      refetchBalance: true,
      runSimulation: true
    }
  )

  await BotTrade.execute(tradeId, BotTradeType.REPEAT, 0, { every: execInterval, limit: execCount})
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
    
    let buyTradeId = await BotTrade.duplicate(tradeId)
    if(buyTradeId) {
      await processBuy(buyTradeId, ammId)
      await countLiquidityPool.set(ammId, 0)
    }
  } else {
    await countLiquidityPool.set(ammId, count - 1)
  }

  processSell(
    tradeId,
    SystemConfig.get('trade_limit'),
    500
  )
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

    const mempoolUpdates = mempool([
      RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS,
      '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'
    ])
    
    logger.info(`Starting bot V3`)

    for await (const update of mempoolUpdates) {
      processTx(update, ata) // You can process the updates as needed
    }

  } catch(e) {
    console.log(e)
  }
})();
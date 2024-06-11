import { Job, Worker } from "bullmq"
import { config as SystemConfig, config } from "../utils"
import { logger } from "../utils/logger";
import { BotLiquidity, BotLookupTable, setupWSOLTokenAccount } from "../library";
import { AddressLookupTableAccount, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { BotTransaction } from "../library/transaction";
import { connection, send_tx_rpc } from "../adapter/rpc";
import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { blockhasher, blockhasherv2, existingMarkets, mints, tokenBalances, trackedPoolKeys, trader } from "../adapter/storage";
import { QueueKey } from "../types/queue-key";
import { Trade } from "../types/trade";
import { BotTrade } from "../library/trade";
import sleep from "atomic-sleep";
import { TxMethod } from "../types";

const process = async (tradeId: string, trade: Trade, ata: PublicKey) => {
  
  if(!trade.ammId) {
    await BotTrade.abandoned(tradeId)
    return
  }

  const poolKeys = await trackedPoolKeys.get(trade.ammId)
  if(!poolKeys) { 
    BotTrade.abandoned(tradeId)
    return
  }

  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }
  
  if(!poolKeys) { return }

  await swap(
    tradeId,
    trade,
    poolKeys, 
    ata
  )

  // TODO This should be in done in payer service not here
  await BotTrade.completed(tradeId)
}

/**
 * 
 * @param tradeId 
 * @param trade 
 * @param keys 
 * @param ata 
 * @returns 
 */
const swap = async (tradeId: string, trade: Trade, keys: LiquidityPoolKeysV4, ata: PublicKey) => {

  if(!trade.ammId) { return }
  
  let alts: AddressLookupTableAccount[] = []

  try {
    let raydiumAlt = SystemConfig.get('raydium_alt')
    if(raydiumAlt) {
      let alt = await BotLookupTable.getLookupTable(new PublicKey(raydiumAlt))
      if(alt) {
        alts.push(alt)
      }
    }
  } catch(e: any) {
    // BotTrade.error(tradeId, e.toString())
    // On error, still can proceed to execute
  }

  // set the swap direction
  let direction : 'in' | 'out' = trade.action === 'buy' ? 'in' : 'out'

  let amount = trade.amountIn

  // Update the balance chunk from database
  if(trade.opts?.refetchBalance) {
    const balance = await tokenBalances.get(trade.ammId)
    amount = balance?.chunk || trade.amountIn
  }

  if(amount.isZero()) {
    return
  }
  
  try {
    
    let block = await blockhasher.get()
    
    let tip = trade.opts?.jitoTipAmount ? trade.opts.jitoTipAmount : new BN(0)
    
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      direction,
      ata,
      amount,
      trade.amountOut,
      'in',
      {
        compute: {
          microLamports: trade.opts?.microLamports || 0,
          units: trade.opts?.units || 60000,
        },
        blockhash: block.recentBlockhash,
        alts,
        jitoTipAmount: tip,
        runSimulation: trade.opts?.runSimulation ? trade.opts.runSimulation : false,
        txMethod: trade.opts?.sendTxMethod as TxMethod
      }
    );
    
    let selectedConnection : Connection = connection
    if(SystemConfig.get('use_send_tx_rpc')) {
      selectedConnection = send_tx_rpc
    }

    let signature = await BotTransaction.sendAutoRetryTransaction(selectedConnection, transaction, trade.opts?.sendTxMethod as TxMethod, tip)
    await BotTrade.transactionSent(tradeId, signature)
  } catch(e: any) {
    BotTrade.transactionSent(tradeId, '', e.toString())
  }
}

async function cleanUp() {

}

async function main() {

	const { ata } = await setupWSOLTokenAccount(true, 0.3)
    
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }

	const worker = new Worker(QueueKey.Q_TX, 
			async (job: Job) => {
        try {
          let tradeId = job.data

          const trade = await trader.get(tradeId)
          if(!trade) { return }
          logger.info(`Executing incoming trade | ${tradeId} | ${trade.ammId}`)

          process(tradeId, trade, ata)
        } catch (e) {
          console.log(e)
        }
			},
			{
				connection: {
						host: SystemConfig.get('redis_host'),
						port: SystemConfig.get('redis_port')
				},
        concurrency: config.get('trade_concurrency'),
        stalledInterval: 1000,
        lockDuration: 1000,
        drainDelay: 0.5,
			}
	)

	worker.on('error', (err: any) => {
		logger.error(`Queue error`)
		logger.error(err)
	});
}



main()
import { Job, Worker } from "bullmq"
import { config as SystemConfig } from "../utils"
import { logger } from "../utils/logger";
import { BotLiquidity, BotLookupTable, setupWSOLTokenAccount } from "../library";
import { AddressLookupTableAccount, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { BotTransaction } from "../library/transaction";
import { connection, lite_rpc } from "../adapter/rpc";
import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { blockhasher, existingMarkets, mints, trackedPoolKeys, trader } from "../adapter/storage";
import { QueueKey } from "../types/queue-key";
import { Trade } from "../types/trade";
import { BotTrade } from "../library/trade";
import sleep from "atomic-sleep";

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

  let count = trade.opts?.execCount || 1
  let sleepTime = trade.opts?.execInterval || 1
  
  for(let i = 0; i < count; i++) {
    try {
      let block = await blockhasher.get()
      const transaction = await BotLiquidity.makeSimpleSwapInstruction(
        keys,
        direction,
        ata,
        trade.amountIn,
        trade.amountOut,
        'in',
        {
          compute: {
            microLamports: trade.opts?.microLamports || 500000,
            units: trade.opts?.units || 60000
          },
          blockhash: block.recentBlockhash,
          alts
        }
      );

      let selectedConnection : Connection = connection
      if(SystemConfig.get('use_lite_rpc')) {
        selectedConnection = lite_rpc
      }

      let signature = await BotTransaction.sendAutoRetryTransaction(selectedConnection, transaction)
      await BotTrade.transactionSent(tradeId, signature)

    } catch(e: any) {
      BotTrade.transactionSent(tradeId, '', e.toString())
    }
    
    sleep(sleepTime)
  }

  
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
          
          logger.info(`Executing incoming trade | ${trade.ammId}`)

          process(tradeId, trade, ata)
        } catch (e) {
          console.log(e)
        }
			}, 
			{
				connection: {
						host: SystemConfig.get('redis_host'),
						port: SystemConfig.get('redis_port')
				}
			}
	)

	worker.on('error', (err: any) => {
		logger.error(`Queue error`)
		logger.error(err)
	});
}



main()
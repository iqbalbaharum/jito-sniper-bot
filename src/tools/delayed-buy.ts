import { Job, Worker } from "bullmq"
import { config as SystemConfig } from "../utils"
import { logger } from "../utils/logger";
import { BotLiquidity, setupWSOLTokenAccount } from "../services";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { BotTransaction } from "../services/transaction";
import { connection, lite_rpc } from "../adapter/rpc";
import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { blockhasher, existingMarkets, mints, trackedPoolKeys } from "../adapter/storage";

const processBuy = async (ammId: PublicKey, ata: PublicKey) => {
  
  const poolKeys = await BotLiquidity.getAccountPoolKeys(ammId)
  if(!poolKeys) { return }

  const info = BotLiquidity.getMintInfoFromWSOLPair(poolKeys)
  // Cancel process if pair is not WSOL
  if(info.mint === undefined) { return }
  
  if(!poolKeys) { return }
  
  logger.info(new Date(), `BUY ${ammId.toBase58()} | ${info.mint.toBase58()}`)
  
  let signature = await buyToken(
    poolKeys, 
    ata,
    new BN(SystemConfig.get('token_purchase_in_sol') * LAMPORTS_PER_SOL)
  )

  if(!signature) { return }
  
  logger.info(`BUY TX ${ammId} | ${signature}`)

  await trackedPoolKeys.set(ammId, poolKeys)
  await mints.set(ammId, {
    ammId,
    mint: info.mint,
    mintDecimal: info.decimal,
    isMintBase: info.isMintBase
  })

  // add into the record
  existingMarkets.add(ammId)

  return signature
}

const buyToken = async (keys: LiquidityPoolKeysV4, ata: PublicKey, amount: BN) => {
  try {
    let block = await blockhasher.get()
    const transaction = await BotLiquidity.makeSimpleSwapInstruction(
      keys,
      'in',
      ata,
      amount,
      0,
      'in',
      {
        compute: {
          microLamports: 500000,
          units: 60000
        },
        blockhash: block.recentBlockhash
      }
    );

    let selectedConnection : Connection = connection
    if(SystemConfig.get('use_lite_rpc')) {
      selectedConnection = lite_rpc
    }

    return BotTransaction.sendAutoRetryTransaction(selectedConnection, transaction)
  } catch(e: any) {
    logger.error(e.toString())
    return ''
  }
}

async function main() {

	const { ata } = await setupWSOLTokenAccount(true, 0.3)
    
    if(!ata) { 
      logger.error('No WSOL Account initialize')
      return 
    }

	const delayedWorker = new Worker(SystemConfig.get('queue_name'), 
			async (job: Job) => {
				logger.info(`Executing just opened market | ${job.data}`)
				processBuy(job.data, ata)
			}, 
			{
				connection: {
						host: SystemConfig.get('redis_host'),
						port: SystemConfig.get('redis_port')
				}
			}
	)

	delayedWorker.on('error', err => {
		logger.error(err)
	});
}



main()
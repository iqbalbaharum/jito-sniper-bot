import BN from "bn.js";
import { trader } from "../adapter/storage";
import { Trade, TradeEntry, TradeOptions, TradeSignature } from "../types/trade";
import { PublicKey } from "@solana/web3.js";
import { v4 as uuidv4 } from 'uuid';
import { delayedQueue, txQueue } from "../adapter/queue";
import { QueueKey } from "../types/queue-key";
import { logger } from "../utils/logger";

export class BotTrade {
  
	/**
	 * Create empty container for the trade
	 * @returns return trade container unique id (uuid)
	 */
	static async listen(entry: TradeEntry) : Promise<string> {
		let uuid = uuidv4()
		await trader.set(uuid, {
			ammId: undefined,
			amountIn: new BN(0),
			amountOut: new BN(0),
			action: undefined,
			entry,
			err: undefined,
			signature: [],
			timing: {
					listened: new Date().getTime(),
					preprocessed: 0,
					processed: 0,
					completed: 0
			},
			opts: {}
		})

		return uuid
	}

	static async abandoned(uuid: string) {
		let trade = await trader.get(uuid)
		if(trade) {
			trader.remove(uuid)
		}
	}

	static async error(uuid: string, err: string) {
		let trade = await trader.get(uuid)
		if(trade) {
			trade.err = err
			trader.set(uuid, trade)

			logger.error(`${trade.ammId!.toBase58()} | ERR | ${err}`)
		}
	}

	static async preprocessed(uuid: string, ammId: PublicKey) {
		let trade = await trader.get(uuid)
		if(trade) {
			trade.ammId = ammId
			trade.timing.preprocessed = new Date().getTime()
			trader.set(uuid, trade)
		}
	}

	static async processed(uuid: string, action: 'buy' | 'sell', amountIn: BN, amountOut: BN, opts?: TradeOptions) {
		let trade = await trader.get(uuid)
		if(trade) {
			trade.amountIn = amountIn
			trade.amountOut = amountOut
			trade.action = action
			trade.opts = opts
			trade.timing.processed = new Date().getTime()
			trader.set(uuid, trade)

			await txQueue.add(QueueKey.Q_TX, uuid)

			logger.info(`${trade.ammId?.toBase58()} | ${action.toUpperCase()} | ${uuid}`)
		}
	}

	static async transactionSent(uuid: string, signature: string, err?: string) {
		let trade = await trader.get(uuid)

		if(trade) {
			trade.signature.push({
				signature,
				timestamp: new Date().getTime(),
				err
			})
			trader.set(uuid, trade)

			logger.info(`${trade.ammId!.toBase58()} | ${trade.action?.toUpperCase()} | ${signature.toUpperCase()}`)
		}
	}

	static async completed(uuid: string) {
		let trade = await trader.get(uuid)
		if(trade) {
			trade.timing.completed = new Date().getTime()
			trader.set(uuid, trade)
		}
	}
}
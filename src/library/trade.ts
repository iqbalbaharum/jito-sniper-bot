import BN from "bn.js";
import { trader } from "../adapter/storage";
import { Trade, TradeEntry, TradeOptions, TradeSignature } from "../types/trade";
import { PublicKey } from "@solana/web3.js";
import { v4 as uuidv4 } from 'uuid';
import { delayedQueue, txQueue } from "../adapter/queue";
import { QueueKey } from "../types/queue-key";
import { logger } from "../utils/logger";

export enum BotTradeType {
	SINGLE,
	REPEAT
}

export class BotTrade {
  
	/**
	 * Create empty container for the trade
	 * @returns return trade container unique id (tradeId)
	 */
	static async listen(entry: TradeEntry) : Promise<string> {
		let tradeId = uuidv4()
		await trader.set(tradeId, {
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

		return tradeId
	}

	static async duplicate(tradeId: string): Promise<string | undefined> {
		let trade = await trader.get(tradeId)
		if(trade) {
			let newTradeId = uuidv4()
			trader.set(newTradeId, trade)
			return newTradeId
		}

		return undefined
	}

	static async abandoned(tradeId: string) {
		let trade = await trader.get(tradeId)
		if(trade) {
			trader.remove(tradeId)
		}
	}

	static async error(tradeId: string, err: string) {
		let trade = await trader.get(tradeId)
		if(trade) {
			trade.err = err
			trader.set(tradeId, trade)

			logger.error(`${trade.ammId!.toBase58()} | ERR | ${err}`)
		}
	}

	static async preprocessed(tradeId: string, ammId: PublicKey) {
		let trade = await trader.get(tradeId)
		if(trade) {
			trade.ammId = ammId
			trade.timing.preprocessed = new Date().getTime()
			trader.set(tradeId, trade)
		}
	}

	static async processed(tradeId: string, action: 'buy' | 'sell', amountIn: BN, amountOut: BN, opts?: TradeOptions) {
		let trade = await trader.get(tradeId)
		if(trade) {
			trade.amountIn = amountIn
			trade.amountOut = amountOut
			trade.action = action
			trade.opts = opts
			trade.timing.processed = new Date().getTime()
			trader.set(tradeId, trade)

			logger.info(`${trade.ammId?.toBase58()} | ${action.toUpperCase()} | ${tradeId}`)
		}
	}

	static async transactionSent(tradeId: string, signature: string, err?: string) {
		let trade = await trader.get(tradeId)

		if(trade) {
			trade.signature.push({
				signature,
				timestamp: new Date().getTime(),
				err
			})
			trader.set(tradeId, trade)

			if(signature) {
				logger.info(`${trade.ammId!.toBase58()} | ${trade.action?.toUpperCase()} | ${signature}`)
			}

			if(err) {
				logger.info(`${trade.ammId!.toBase58()} | ${err}`)
			}
		}
	}

	static async completed(tradeId: string) {
		let trade = await trader.get(tradeId)
		if(trade) {
			trade.timing.completed = new Date().getTime()
			trader.set(tradeId, trade)
		}
	}

	static async execute(tradeId: string, type: BotTradeType, delay: number = 0, repeat?: { every: number, limit: number}) {
		let trade = await trader.get(tradeId)
		if(trade) {
			switch(type){
				case BotTradeType.REPEAT:
					await txQueue.add(QueueKey.Q_TX, tradeId, {
						repeat: { 
							...repeat,
							immediately: true
						}, 
						jobId: tradeId 
					})
					break;
				case BotTradeType.SINGLE:
				default:
					await txQueue.add(QueueKey.Q_TX, tradeId, { delay: delay, repeat, jobId: tradeId })
					break
			}
		}
	}
}
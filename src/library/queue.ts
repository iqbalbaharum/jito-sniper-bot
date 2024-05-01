import { PublicKey } from "@solana/web3.js";
import { delayedQueue, txQueue } from "../adapter/queue";
import { QueueKey } from "../types/queue-key";

export class BotQueue {

	static async addTrade(tradeId: string) {
		await txQueue.add(QueueKey.Q_TX, tradeId)
	}

  // Add delayed market
  // Because of the nature of NodeJS scheduling, we add 100 ms delayed
  static async addDelayedMarket(ammId: PublicKey, delayInMs: number) {
    await delayedQueue.add(QueueKey.Q_DELAYED, ammId.toBase58(), { delay: delayInMs + 100 })
  }
}
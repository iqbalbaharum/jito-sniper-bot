import { PublicKey } from "@solana/web3.js";
import { tradeTracker } from "../adapter/storage";
import { TradeTracker } from "../types";

export class BotTradeTracker {

    static async init(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(!tracker) {
            tradeTracker.set(ammId.toBase58(), {
                buyAttemptCount: 0,
                buyFinalizedCount: 0,
                sellAttemptCount: 0,
                sellFinalizedCount: 0,
                lastBuyAt: 0,
                lastSellAt: 0
            })
        }
    }

    static async buyAttempt(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(tracker) {
            tracker.buyAttemptCount++
            tradeTracker.set(ammId.toBase58(), tracker)
        }
    }

    static async sellAttempt(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(tracker) {
            tracker.sellAttemptCount++
            tradeTracker.set(ammId.toBase58(), tracker)
        }
    }

    static async buyFinalized(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(tracker) {
            tracker.buyFinalizedCount++
            tracker.lastBuyAt = new Date().getTime()
            tradeTracker.set(ammId.toBase58(), tracker)
        }
    }

    static async sellFinalized(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(tracker) {
            tracker.sellFinalizedCount++
            tracker.lastSellAt = new Date().getTime()
            tradeTracker.set(ammId.toBase58(), tracker)
        }
    }

    static async getTracker(ammId: PublicKey) : Promise<TradeTracker | undefined> {
        let tracker = await tradeTracker.get(ammId.toBase58())
        return tracker
    }
}
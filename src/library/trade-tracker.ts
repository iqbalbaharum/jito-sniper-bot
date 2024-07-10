import { PublicKey } from "@solana/web3.js";
import { tradeTracker } from "../adapter/storage";
import { TradeTracker } from "../types";

export class BotTradeTracker {

    static async init(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(!tracker) {
            await tradeTracker.set(ammId.toBase58(), {
                buyAttemptCount: 0,
                buyFinalizedCount: 0,
                sellAttemptCount: 0,
                sellFinalizedCount: 0,
                lastBuyAt: 0,
                lastSellAt: 0,
                lastBuySendTxAt: 0,
                lastSellSendTxAt: 0,
                totalTimeBuyFinalized: 0,
                totalTimeSellFinalized: 0
            } as TradeTracker)
        }
    }

    static async buyAttempt(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(tracker) {
            tracker.buyAttemptCount++
            await tradeTracker.set(ammId.toBase58(), tracker)
        }
    }

    // static async buySendTx(ammId: PublicKey) {
    //     let tracker = await tradeTracker.get(ammId.toBase58())
    //     if(tracker) {
    //         tracker.lastBuySendTxAt = new Date().getTime() 
    //         await tradeTracker.set(ammId.toBase58(), tracker)
    //     }
    // }

    // static async sellSendTx(ammId: PublicKey) {
    //     let tracker = await tradeTracker.get(ammId.toBase58())
    //     if(tracker) {
    //         tracker.lastSellSendTxAt = new Date().getTime()
    //         await tradeTracker.set(ammId.toBase58(), tracker)
    //     }
    // }

    static async sellAttempt(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(tracker) {
            tracker.sellAttemptCount++
            await tradeTracker.set(ammId.toBase58(), tracker)
        }
    }

    static async sellAttemptReset(ammId: PublicKey) {
        let tracker = await tradeTracker.get(ammId.toBase58())
        if(tracker) {
            tracker.sellAttemptCount = 0
            await tradeTracker.set(ammId.toBase58(), tracker)
        }
    }

    // static async buyFinalized(ammId: PublicKey) {
    //     let tracker = await tradeTracker.get(ammId.toBase58())
    //     if(tracker) {
    //         tracker.buyFinalizedCount++
    //         tracker.lastBuyAt = new Date().getTime()
    //         tracker.totalTimeBuyFinalized = tracker.totalTimeBuyFinalized + (tracker.lastBuyAt - tracker.lastBuySendTxAt)
    //         tracker.lastBuySendTxAt = 0
    //         await tradeTracker.set(ammId.toBase58(), tracker)
    //     }
    // }

    // static async sellFinalized(ammId: PublicKey) {
    //     let tracker = await tradeTracker.get(ammId.toBase58())
    //     if(tracker) {
    //         tracker.sellFinalizedCount++
    //         tracker.lastSellAt = new Date().getTime()
    //         tracker.totalTimeSellFinalized = tracker.totalTimeSellFinalized + (tracker.lastSellAt - tracker.lastBuySendTxAt)
    //         tracker.lastSellAt = 0
    //         await tradeTracker.set(ammId.toBase58(), tracker)
    //     }
    // }

    static async getTracker(ammId: PublicKey) : Promise<TradeTracker | undefined> {
        let tracker = await tradeTracker.get(ammId.toBase58())
        return tracker
    }
}
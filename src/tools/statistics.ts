import { tradeTracker, trader } from "../adapter/storage"
import { TradeEntry } from "../types"
import { logger } from "../utils/logger"


async function trade() {
    let total = 0
    let buyCount = 0
    let buyFailed = 0

    let sellCount = 0
    let sellFailed = 0

    let buyPreprocessedTotal = 0
    let buyPreprocessedCount = 0
    let buyProcessedTotal = 0
    let buyProcessedCount = 0
    let buyCompletedTotal = 0
    let buyCompletedCount = 0

    let sellPreprocessedTotal = 0
    let sellPreprocessedCount = 0
    let sellProcessedTotal = 0
    let sellProcessedCount = 0
    let sellCompletedTotal = 0
    let sellCompletedCount = 0

    let createdLPCount = 0
    let removedLPCount = 0
    let possibleEntryCount = 0

    // get total trade
    let uuids = await trader.getAllKeys()
    total = uuids.length

    for(const uuid of uuids) {
        let trade = await trader.get(uuid)
        if(!trade) { continue }

        // Completed trade
        if(trade.timing.processed > 0) {
            
            switch(trade.entry) {
                case TradeEntry.INITIAILIZE2:
                    createdLPCount++
                    break
                case TradeEntry.WITHDRAW:
                    removedLPCount++
                    break
                case TradeEntry.SWAPBASEIN:
                    possibleEntryCount++
                    break
            }

            if(trade.action === 'buy') {
                buyCount++
                if(!trade.signature) {
                    buyFailed++
                }
                
                if(trade.timing.preprocessed != 0) {
                    buyPreprocessedTotal = buyPreprocessedTotal + (trade.timing.preprocessed - trade.timing.listened) 
                    buyPreprocessedCount++  
                }

                if(trade.timing.processed != 0) {
                    buyProcessedTotal = buyProcessedTotal + (trade.timing.processed - trade.timing.preprocessed) 
                    buyProcessedCount++  
                }

                if(trade.timing.completed != 0) {
                    buyCompletedTotal = buyCompletedTotal + (trade.timing.completed - trade.timing.processed) 
                    buyCompletedCount++  
                }
            }

            if(trade.action === 'sell') {
                sellCount++
                if(!trade.err) {
                    sellFailed++
                }

                if(trade.timing.preprocessed != 0) {
                    sellPreprocessedTotal = sellPreprocessedTotal + (trade.timing.preprocessed - trade.timing.listened) 
                    sellPreprocessedCount++  
                }

                if(trade.timing.processed != 0) {
                    sellProcessedTotal = sellProcessedTotal + (trade.timing.processed - trade.timing.preprocessed) 
                    sellProcessedCount++  
                }

                if(trade.signature.length > 0 && trade.timing.completed != 0) {
                    sellCompletedTotal = sellCompletedTotal + (trade.timing.completed - trade.timing.processed) 
                    sellCompletedCount++  
                }
            }
        }
    }

    logger.info(`-------------------------------- TRADE ---------------------------------`)
    logger.info(`TOTAL TRADE: ${total}`)
    logger.info(`LP CREATED: ${createdLPCount}`)
    logger.info(`LP REMOVED: ${removedLPCount}`)
    logger.info(`POSSIBLE ENTRY: ${possibleEntryCount}`)
    logger.info(`-------------------------------- BUY ---------------------------------`)
    logger.info(`BUY COUNT: ${buyCount}`)
    logger.info(`BUY W/ ERROR COUNT: ${buyFailed}`)
    logger.info(`PREPROCESSED (AVG): ${buyPreprocessedTotal / buyPreprocessedCount} ms`)
    logger.info(`PROCESSED (AVG): ${buyProcessedTotal / buyProcessedCount} ms`)
    logger.info(`COMPLETED (AVG): ${buyCompletedTotal / buyCompletedCount} ms`)
    logger.info(`-------------------------------- SELL --------------------------------`)
    logger.info(`SELL COUNT: ${sellCount}`)
    logger.info(`SELL W/ ERROR COUNT: ${sellFailed}`)
    logger.info(`PREPROCESSED (AVG): ${sellPreprocessedTotal / sellPreprocessedCount} ms`)
    logger.info(`PROCESSED (AVG): ${sellProcessedTotal / sellProcessedCount} ms`)
    logger.info(`COMPLETED (AVG): ${sellCompletedTotal / sellCompletedCount} ms`)
}

async function tracker() {

    let total = 0
    let totalBuyAttemptCount = 0
    let buyFinalizedCount = 0
    let totalBuyFinalizedCount = 0

    let totalSellAttemptCount = 0
    let sellFinalizedCount = 0
    let totalSellFinalizedCount = 0
    
    let totalTimeBuyCount = 0
    let grantTotalTimeBuyFinalized = 0

    let totalTimeSellCount = 0
    let grantTotalTimeSellFinalized = 0

    const ammIds = await tradeTracker.getAllKeys()
    for(const ammId of ammIds) {
        let tracker = await tradeTracker.get(ammId)
        if(!tracker) { continue }

        total++

        if(tracker.buyAttemptCount > 0) {
            totalBuyAttemptCount = totalBuyAttemptCount + tracker.buyAttemptCount
        }

        if(tracker.buyFinalizedCount > 0) {
            buyFinalizedCount++
            totalBuyFinalizedCount = totalBuyFinalizedCount + tracker.buyFinalizedCount
        }

        if(tracker.sellAttemptCount > 0) {
            totalSellAttemptCount = totalSellAttemptCount + tracker.sellAttemptCount
        }

        if(tracker.sellFinalizedCount > 0) {
            sellFinalizedCount++
            totalSellFinalizedCount = totalSellFinalizedCount + tracker.sellFinalizedCount
        }

        if(tracker.totalTimeBuyFinalized > 0) {
            totalTimeBuyCount++
            grantTotalTimeBuyFinalized = grantTotalTimeBuyFinalized + (tracker.totalTimeBuyFinalized/tracker.buyFinalizedCount)
        }

        if(tracker.totalTimeSellFinalized > 0) {
            totalTimeSellCount++
            grantTotalTimeSellFinalized = grantTotalTimeSellFinalized + (tracker.totalTimeSellFinalized/tracker.sellFinalizedCount)
        }
    }

    logger.info(`-------------------------------- TRACKER ---------------------------------`)
    logger.info(`TOTAL TRACKED TOKEN: ${total}`)
    logger.info(`-------------------------------- AVERAGE ---------------------------------`)
    logger.info(`BUY ATTEMPT PERCENTAGE: ${totalBuyAttemptCount / total * 100} %`)
    logger.info(`BUY FINALIZED PERCENTAGE: ${buyFinalizedCount / total * 100} %`)
    logger.info(`SELL ATTEMPT COUNT: ${totalSellAttemptCount/total * 100} %`)
    logger.info(`SELL FINALIZED COUNT: ${totalSellFinalizedCount/sellFinalizedCount * 100} %`)
    logger.info(`BUY SPEED (AVG): ${grantTotalTimeBuyFinalized/totalTimeBuyCount} ms`)
    logger.info(`SELL SPEED (AVG): ${grantTotalTimeSellFinalized/totalTimeSellCount} ms`)
}

async function main() {

    trade()  
    tracker()  
    
    return
}   

main()
import { tradeTracker, trader } from "../adapter/storage"
import { TradeEntry } from "../types"
import { logger } from "../utils/logger"

type StatByHour = {
    total: number,
    createdLP: number,
    removedLP: number,
    possibleEntry: number
}

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

    const statsByHour: { [key: string]: StatByHour } = {}

    // get total trade
    let uuids = await trader.getAllKeys()
    total = uuids.length

    for(const uuid of uuids) {
        let trade = await trader.get(uuid)
        if(!trade) { continue }

        const tradeHour = new Date(trade.timing.processed).getHours().toString()

        if (!statsByHour[tradeHour]) {
            statsByHour[tradeHour] = {
                total: 0,
                createdLP: 0,
                removedLP: 0,
                possibleEntry: 0
            }
        }

        statsByHour[tradeHour].total++

        // Completed trade
        if(trade.timing.processed > 0) {
            
            switch(trade.entry) {
                case TradeEntry.INITIAILIZE2:
                    createdLPCount++
                    statsByHour[tradeHour].createdLP++
                    break
                case TradeEntry.WITHDRAW:
                    removedLPCount++
                    statsByHour[tradeHour].removedLP++
                    break
                case TradeEntry.SWAPBASEIN:
                    possibleEntryCount++
                    statsByHour[tradeHour].possibleEntry++
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

    console.log(`-------------------------------- TRADE ---------------------------------`)
    console.log(`TOTAL TRADE: ${total}`)
    console.log(`LP CREATED: ${createdLPCount}`)
    console.log(`LP REMOVED: ${removedLPCount}`)
    console.log(`POSSIBLE ENTRY: ${possibleEntryCount}`)
    console.log(`----------------------------- HOURLY TRADE ------------------------------`)
    for (const [hour, stats] of Object.entries(statsByHour)) {
        console.log(`${hour.toString().padStart(2, '0')}:00 - ${hour.toString().padStart(2, '0')}:59`)
        console.log(`  TOTAL: ${stats.total}`)
        console.log(`  LP CREATED: ${stats.createdLP}`)
        console.log(`  LP REMOVED: ${stats.removedLP}`)
        console.log(`  POSSIBLE ENTRY: ${stats.possibleEntry}`)
    }
    console.log(`-------------------------------- BUY ---------------------------------`)
    console.log(`BUY COUNT: ${buyCount}`)
    console.log(`BUY W/ ERROR COUNT: ${buyFailed}`)
    console.log(`PREPROCESSED (AVG): ${buyPreprocessedTotal / buyPreprocessedCount} ms`)
    console.log(`PROCESSED (AVG): ${buyProcessedTotal / buyProcessedCount} ms`)
    console.log(`COMPLETED (AVG): ${buyCompletedTotal / buyCompletedCount} ms`)
    console.log(`-------------------------------- SELL --------------------------------`)
    console.log(`SELL COUNT: ${sellCount}`)
    console.log(`SELL W/ ERROR COUNT: ${sellFailed}`)
    console.log(`PREPROCESSED (AVG): ${sellPreprocessedTotal / sellPreprocessedCount} ms`)
    console.log(`PROCESSED (AVG): ${sellProcessedTotal / sellProcessedCount} ms`)
    console.log(`COMPLETED (AVG): ${sellCompletedTotal / sellCompletedCount} ms`)
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

    let minBuySpeed = Infinity
    let maxBuySpeed = -Infinity
    let minSellSpeed = Infinity
    let maxSellSpeed = -Infinity

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
            let buySpeed = grantTotalTimeBuyFinalized = grantTotalTimeBuyFinalized + (tracker.totalTimeBuyFinalized/tracker.buyFinalizedCount)
            if (buySpeed < minBuySpeed) minBuySpeed = buySpeed
            if (buySpeed > maxBuySpeed) maxBuySpeed = buySpeed
        }

        if(tracker.totalTimeSellFinalized > 0) {
            totalTimeSellCount++
            let sellSpeed = grantTotalTimeSellFinalized = grantTotalTimeSellFinalized + (tracker.totalTimeSellFinalized/tracker.sellFinalizedCount)
            if (sellSpeed < minSellSpeed) minSellSpeed = sellSpeed
            if (sellSpeed > maxSellSpeed) maxSellSpeed = sellSpeed
        }
    }

    console.log(`-------------------------------- TRACKER ---------------------------------`)
    console.log(`TOTAL TRACKED TOKEN: ${total}`)
    console.log(`-------------------------------- AVERAGE ---------------------------------`)
    console.log(`BUY ATTEMPT PERCENTAGE: ${totalBuyAttemptCount} (${totalBuyAttemptCount / total * 100} %)`)
    console.log(`BUY FINALIZED PERCENTAGE: ${buyFinalizedCount} (${buyFinalizedCount / total * 100} %)`)
    console.log(`SELL ATTEMPT COUNT: ${totalSellAttemptCount/total * 100} %`)
    console.log(`SELL FINALIZED COUNT: ${totalSellFinalizedCount/sellFinalizedCount * 100} %`)
    console.log(`BUY SPEED (AVG): ${grantTotalTimeBuyFinalized/totalTimeBuyCount} ms`)
    console.log(`FASTEST BUY SPEED: ${minBuySpeed} ms`)
    console.log(`SLOWEST BUY SPEED: ${maxBuySpeed} ms`)
    console.log(`SELL SPEED (AVG): ${grantTotalTimeSellFinalized/totalTimeSellCount} ms`)
    console.log(`FASTEST SELL SPEED: ${minSellSpeed} ms`)
    console.log(`SLOWEST SELL SPEED: ${maxSellSpeed} ms`)
}

async function main() {

    trade()  
    tracker()  
    
    return
}   

main()
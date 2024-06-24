import { PublicKey } from "@solana/web3.js"
import { signatureTracker, trackedAmm, tradeTracker, trader } from "../adapter/storage"
import { TradeEntry } from "../types"
import { logger } from "../utils/logger"

type StatByHour = {
    total: number,
    createdLP: number,
    removedLP: number,
    possibleEntry: number
}

function formatDateTime(date: Date): string {
    const year = date.getFullYear().toString()
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hour = date.getHours().toString().padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:00 - ${hour}:59`
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
    const sources: { [key: string]: number } = {}
    
    // get total trade
    let uuids = await trader.getAllKeys()
    total = uuids.length

    for(const uuid of uuids) {
        let trade = await trader.get(uuid)
        if(!trade) { continue }

        if(trade.timing.listened > 0) {
            
            const tradeDate = new Date(trade.timing.listened)
            const tradeDateHourKey = formatDateTime(tradeDate)

            if (!sources[trade.source]) {
                sources[trade.source] = 0
            }
            sources[trade.source]++

            if (!statsByHour[tradeDateHourKey]) {
                statsByHour[tradeDateHourKey] = {
                    total: 0,
                    createdLP: 0,
                    removedLP: 0,
                    possibleEntry: 0
                }
            }

            statsByHour[tradeDateHourKey].total++
            
            switch(trade.entry) {
                case TradeEntry.INITIAILIZE2:
                    createdLPCount++
                    statsByHour[tradeDateHourKey].createdLP++
                    break
                case TradeEntry.WITHDRAW:
                    removedLPCount++
                    statsByHour[tradeDateHourKey].removedLP++
                    break
                case TradeEntry.SWAPBASEIN:
                    possibleEntryCount++
                    statsByHour[tradeDateHourKey].possibleEntry++
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
    console.log(``)
    console.log(`----------------------------- HOURLY TRADE ------------------------------`)
    for (const [dateHour, stats] of Object.entries(statsByHour)) {
        console.log(`${dateHour}:`)
        console.log(`  TOTAL: ${stats.total}`)
        console.log(`  LP CREATED: ${stats.createdLP}`)
        console.log(`  LP REMOVED: ${stats.removedLP}`)
        console.log(`  POSSIBLE ENTRY: ${stats.possibleEntry}`)
    }
    console.log(``)
    console.log(`------------------------------ SOURCES -------------------------------`)

    for (const [source, count] of Object.entries(sources)) {
        console.log(`${source}: ${count}`)
    }
    console.log(``)
    console.log(`-------------------------------- BUY ---------------------------------`)
    console.log(`BUY COUNT: ${buyCount}`)
    console.log(`BUY W/ ERROR COUNT: ${buyFailed}`)
    console.log(`PREPROCESSED (AVG): ${buyPreprocessedTotal / buyPreprocessedCount} ms`)
    console.log(`PROCESSED (AVG): ${buyProcessedTotal / buyProcessedCount} ms`)
    console.log(`COMPLETED (AVG): ${buyCompletedTotal / buyCompletedCount} ms`)
    console.log(``)
    console.log(`-------------------------------- SELL --------------------------------`)
    console.log(`SELL COUNT: ${sellCount}`)
    console.log(`SELL W/ ERROR COUNT: ${sellFailed}`)
    console.log(`PREPROCESSED (AVG): ${sellPreprocessedTotal / sellPreprocessedCount} ms`)
    console.log(`PROCESSED (AVG): ${sellProcessedTotal / sellProcessedCount} ms`)
    console.log(`COMPLETED (AVG): ${sellCompletedTotal / sellCompletedCount} ms`)
}

async function tracker() {

    let total = 0
    let totalTrackedToken = 0

    let totalBuyAttemptCount = 0
    let buyFinalizedCount = 0
    let totalBuyFinalizedCount = 0

    let totalSellAttemptCount = 0
    let sellFinalizedCount = 0
    let totalSellFinalizedCount = 0

    const ammIds = await tradeTracker.getAllKeys()
    for(const ammId of ammIds) {
        let tracker = await tradeTracker.get(ammId)
        let tracked = await trackedAmm.get(new PublicKey(ammId))

        if(!tracker || !tracked) { continue }

        total++

        if(tracked === true) { totalTrackedToken++ }

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
    }

    console.log(`-------------------------------- TRACKER ---------------------------------`)
    console.log(`TOTAL TRACKED TOKEN: ${total}`)
    console.log(`-------------------------------- AVERAGE ---------------------------------`)
    console.log(`BUY ATTEMPT PERCENTAGE: ${totalBuyAttemptCount} (${totalBuyAttemptCount / total * 100} %)`)
    console.log(`SELL ATTEMPT COUNT: ${totalSellAttemptCount/total * 100} %`)
}

async function speed() {

    let total = 0
    let totalSucceed = 0
    let totalFailed = 0

    let totalSpeed = 0
    
    const signatures = await signatureTracker.getAllKeys()
    for (const signature of signatures) {
        total++

        const tracker = await signatureTracker.get(signature)
        if(tracker) {
            
            if(!tracker.onChainAt) {
                totalFailed++
                continue
            }

            totalSucceed++
            totalSpeed += tracker.onChainAt - tracker.requestAt * 1000
        }
    }

    console.log(`-------------------------------- SPEED ---------------------------------`)
    console.log(`TOTAL TRACKED TOKEN: ${total}`)
    console.log(`TOTAL SUCCESS: ${totalSucceed} (${totalSucceed/total * 100}%)`)
    console.log(`TOTAL FAILED: ${totalFailed} (${totalFailed/total * 100}%)`)
    console.log(`TX SPEED (AVG): ${totalSpeed / totalSucceed} ms`)
}

async function main() {

    await trade()  
    await tracker()  
    await speed()

    process.exit()
}   

main()
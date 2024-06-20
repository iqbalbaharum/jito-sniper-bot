import { trader } from "../adapter/storage"
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

    logger.info(`TOTAL TRADE: ${total}`)
    logger.info(`LP CREATED: ${createdLPCount}`)
    logger.info(`LP REMOVED: ${removedLPCount}`)
    logger.info(`POSSIBLE ENTRY: ${possibleEntryCount}`)
    logger.info(`-------------------------------- BUY ---------------------------------`)
    logger.info(`BUY COUNT: ${buyCount}`)
    logger.info(`BUY W/ ERROR COUNT: ${buyFailed}`)
    logger.info(`PREPROCESSED (AVG): ${buyPreprocessedTotal / buyPreprocessedCount} MS`)
    logger.info(`PROCESSED (AVG): ${buyProcessedTotal / buyProcessedCount} MS`)
    logger.info(`COMPLETED (AVG): ${buyCompletedTotal / buyCompletedCount} MS`)
    logger.info(`-------------------------------- SELL --------------------------------`)
    logger.info(`SELL COUNT: ${sellCount}`)
    logger.info(`SELL W/ ERROR COUNT: ${sellFailed}`)
    logger.info(`PREPROCESSED (AVG): ${sellPreprocessedTotal / sellPreprocessedCount} MS`)
    logger.info(`PROCESSED (AVG): ${sellProcessedTotal / sellProcessedCount} MS`)
    logger.info(`COMPLETED (AVG): ${sellCompletedTotal / sellCompletedCount} MS`)
}

async function main() {

    trade()    
    
    return
}   

main()
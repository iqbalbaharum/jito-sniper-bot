import { PublicKey } from "@solana/web3.js"
import { mints, signatureTracker, trackedAmm, tradeTracker, trader } from "../adapter/storage"
import { TradeEntry } from "../types"
import { logger } from "../utils/logger"

async function trade() {

    // get total trade
    let uuids = await trader.getAllKeys()

    let buys = []
    let sells = []

    for(const uuid of uuids) {
        let trade = await trader.get(uuid)
        if(!trade) { continue }

        if(trade.timing.listened > 0) {

            if(!trade.ammId) { return }

            if(trade.action === 'buy') {
                buys.push(trade.ammId)
            }

            if(trade.action === 'sell') {
                sells.push(trade.ammId)
            }
        }
    }

    console.log(`----------------------------- BUY ------------------------------`)
    for (const buy of buys) {
        console.log(`${buy}`)
    }
    console.log(``)
    console.log(`---------------------------- SELL ------------------------------`)
    for (const sell of sells) {
        console.log(`${sell}`)
    }
    console.log(``)
}

async function main() {

    await trade()

    process.exit()
}   

main()
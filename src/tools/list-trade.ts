import { PublicKey } from "@solana/web3.js"
import { mints, signatureTracker, trackedAmm, tradeTracker, trader } from "../adapter/storage"
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

    // get total trade
    let uuids = await trader.getAllKeys()

    let buys = []
        let sells = []

    for(const uuid of uuids) {
        let trade = await trader.get(uuid)
        if(!trade) { continue }

        if(trade.timing.listened > 0) {

            if(!trade.ammId) { return }

            const mint = await mints.get(trade.ammId)

            if(trade.action === 'buy') {
                buys.push(mint?.mint)
            }

            if(trade.action === 'sell') {
                sells.push(mint?.mint)
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
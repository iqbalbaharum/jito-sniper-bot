import { BotLookupTable, BotTokenAccount } from "../services"
import { BlockHashStorage, CountLiquidityPoolStorage, ExistingRaydiumMarketStorage, MintStorage, PoolKeysStorage, TokenChunkStorage } from "../storage"
import { redisClient } from "./redis"

let lookupTable = new BotLookupTable(redisClient, false)
let botTokenAccount = new BotTokenAccount(redisClient, true)
let existingMarkets = new ExistingRaydiumMarketStorage(redisClient, true)
let countLiquidityPool = new CountLiquidityPoolStorage(redisClient, true)
let tokenBalances = new TokenChunkStorage(redisClient, true)
let trackedPoolKeys = new PoolKeysStorage(redisClient, true)
let mints = new MintStorage(redisClient, true)
let blockhasher = new BlockHashStorage(redisClient)

export {
    lookupTable,
    botTokenAccount,
    existingMarkets,
    countLiquidityPool,
    tokenBalances,
    trackedPoolKeys,
    mints,
    blockhasher
}
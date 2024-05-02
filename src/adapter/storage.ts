import { BotLookupTable, BotTokenAccount } from "../library"
import { BlockHashStorage, CountLiquidityPoolStorage, ExistingRaydiumMarketStorage, LookupTableStorage, MintStorage, OpenbookMarketStorage, PoolKeysStorage, TokenAccountStorage, TokenChunkStorage } from "../storage"
import { AmmStateStorage } from "../storage/amm"
import { TradeStorage } from "../storage/trade"
import { TransactionSignatureBalanceUpdateStorage } from "../storage/tx-balance-update"
import { redisClient, redisClient1, redisClient2, redisClient3, redisClient4, redisClient5 } from "./redis"

// config
let blockhasher = new BlockHashStorage(redisClient)

// signature
let txBalanceUpdater = new TransactionSignatureBalanceUpdateStorage(redisClient2)

// trade
let trader = new TradeStorage(redisClient1)

// amm
let ammState = new AmmStateStorage(redisClient4, true)
let existingMarkets = new ExistingRaydiumMarketStorage(redisClient4, true)
let countLiquidityPool = new CountLiquidityPoolStorage(redisClient4, true)
let tokenBalances = new TokenChunkStorage(redisClient4, true)
let trackedPoolKeys = new PoolKeysStorage(redisClient4, true)
let mints = new MintStorage(redisClient4, true)
let openbookMarket = new OpenbookMarketStorage(redisClient4)

// lookup table
let lookupTableStore = new LookupTableStorage(redisClient3, true)

// token account
let tokenAccountStore = new TokenAccountStorage(redisClient5, true)

export {
    lookupTableStore,
    ammState,
    openbookMarket,
    tokenAccountStore,
    existingMarkets,
    countLiquidityPool,
    tokenBalances,
    trackedPoolKeys,
    mints,
    blockhasher,
    // tx
    txBalanceUpdater,
    trader
}
import { BotLookupTable, BotTokenAccount } from "../library"
import { BlockHashStorage, CountLiquidityPoolStorage, ExistingRaydiumMarketStorage, LookupTableStorage, MintStorage, OpenbookMarketStorage, PoolKeysStorage, SignatureTrackerStorage, TickStorage, TokenAccountStorage, TokenChunkStorage, TrackedAmm, TradeTrackerStorage } from "../storage"
import { AmmStateStorage } from "../storage/amm"
import { BlockHashV2Storage } from "../storage/blockhash-v2"
import { TradeStorage } from "../storage/trade"
import { TransactionSignatureBalanceUpdateStorage } from "../storage/tx-balance-update"
import { redisClient, redisClient1, redisClient2, redisClient3, redisClient4, redisClient5, redisClient6, redisClient7 } from "./redis"

// config
let blockhasher = new BlockHashStorage(redisClient)
let blockhasherv2 = new BlockHashV2Storage(redisClient)

// signature
let txBalanceUpdater = new TransactionSignatureBalanceUpdateStorage(redisClient2)

// trade
let trader = new TradeStorage(redisClient1)

// amm
let ammState = new AmmStateStorage(redisClient4, true)
let existingMarkets = new ExistingRaydiumMarketStorage(redisClient4, true)
let countLiquidityPool = new CountLiquidityPoolStorage(redisClient4, true)
let tokenBalances = new TokenChunkStorage(redisClient4, true)
let poolKeys = new PoolKeysStorage(redisClient4, true)
let trackedAmm = new TrackedAmm(redisClient4)
let mints = new MintStorage(redisClient4, true)
let openbookMarket = new OpenbookMarketStorage(redisClient4)
let tradeTracker = new TradeTrackerStorage(redisClient4)

// lookup table
let lookupTableStore = new LookupTableStorage(redisClient3, true)

// token account
let tokenAccountStore = new TokenAccountStorage(redisClient5, true)

// tick
let tickStorage = new TickStorage(redisClient6)

// signature
let signatureTracker = new SignatureTrackerStorage(redisClient7)

export {
    lookupTableStore,
    ammState,
    openbookMarket,
    tokenAccountStore,
    existingMarkets,
    countLiquidityPool,
    tradeTracker,
    tokenBalances,
    poolKeys,
    trackedAmm,
    mints,
    blockhasher,
    blockhasherv2,
    // tx
    txBalanceUpdater,
    trader,
    // tick
    tickStorage,
    // signature
    signatureTracker
}
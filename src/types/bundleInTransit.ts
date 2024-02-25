import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk"
import { PublicKey } from "@solana/web3.js"
import { BotLiquidityState } from "./state"

export type BundleInTransit = {
    mint: PublicKey,
    timestamp: number,
    poolKeys: LiquidityPoolKeysV4,
    state: BotLiquidityState
}
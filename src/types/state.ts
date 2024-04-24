import { PublicKey } from "@solana/web3.js"
import BN from "bn.js"

export type BotLiquidityState = {
    ammId: PublicKey
    mint: PublicKey
    mintDecimal: number,
    isMintBase: boolean,
}
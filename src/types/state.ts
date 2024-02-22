import { PublicKey } from "@solana/web3.js"
import BN from "bn.js"

export type BotLiquidityState = {
    mint: PublicKey
    mintDecimal: number,
    isMintBase: Boolean
    lastWSOLInAmount: BN
    lastWSOLOutAmount: BN
    lastTokenInAmount: BN
    lastTokenOutAmount: BN
    // wsolAmountInVault: BN
}
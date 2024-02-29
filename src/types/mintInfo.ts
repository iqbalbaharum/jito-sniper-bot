import { PublicKey } from "@solana/web3.js"
import BN from "bn.js"

export type MintInfo = {
    mint: PublicKey | undefined,
    decimal: number,
    isMintBase: boolean
}
import { VersionedTransaction } from "@solana/web3.js"
import BN from "bn.js"

export type ArbIdea = {
    vtransaction: VersionedTransaction,
    expectedProfit: BN
}
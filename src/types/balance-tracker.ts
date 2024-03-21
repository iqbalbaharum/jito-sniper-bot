import BN from "bn.js"

export type BalanceTracker = {
    total: BN,
    remaining: BN,
    chuck: BN
}
import BN from "bn.js"

export type TokenChunk = {
    total: BN,
    remaining: BN,
    chuck: BN,
    isConfirmed: boolean,
    isUsedUp: boolean
}
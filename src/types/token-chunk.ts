import BN from "bn.js"

export type TokenChunk = {
    total: BN,
    remaining: BN,
    chunk: BN,
    isConfirmed: boolean,
    isUsedUp: boolean
}
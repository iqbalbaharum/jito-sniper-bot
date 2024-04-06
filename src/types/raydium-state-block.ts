import BN from "bn.js"

export type RaydiumStateBlock = {
    ammId: string,
    timeRangeInBlock: number,
    blockTimestamp: number,
    lastestTimestamp: number,
    firstWSOLInBlock: BN,
    firstWSOLOutBlock: BN
    latestWSOLIn: BN
    latestWSOLOut: BN
}
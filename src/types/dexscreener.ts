export type DexscreenerResponse = {
    pairs: SinglePair[]
}

export type SinglePair = {
    chainId: string,
    dexId: string
    pairAddress: string,
    baseToken: string,
    liquidity: PairLiquidity
}

export type PairLiquidity = {
    base: number
    quote: number
}
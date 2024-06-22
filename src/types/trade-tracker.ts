export type TradeTracker = {
    buyAttemptCount: number,
    buyFinalizedCount: number,
    sellAttemptCount: number,
    sellFinalizedCount: number,
    lastBuyAt: number,
    lastSellAt: number,
    lastBuySendTxAt: number,
    lastSellSendTxAt: number,
    totalTimeBuyFinalized: number,
    totalTimeSellFinalized: number
}
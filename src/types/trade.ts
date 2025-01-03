import { PublicKey } from "@solana/web3.js"
import BN from "bn.js"
import { TxMethod } from "./tx-method"

export type TradeTiming = {
	listened: number,
	preprocessed: number,
	processed: number
    completed: number,
    abandoned: number
}

export enum AbandonedReason {
    NONE,
    NO_AMM_ID,
    NO_POOLKEY,
    MARKET_EXISTED,
    NO_LP,
    NOT_TRACKED = 5,
    NO_STATE,
    NO_BALANCE,
    EXCEED_WAITING_TIME,
    NO_MINT,
    EXCEED_SELL_ATTEMPT = 10,
    INCOMPLETE_TOKENACCOUNT_DATA,
    NO_BUY_AFTER_WITHDRAW,
    NO_SELL_AFTER_WITHDRAW,
    LP_AVAILABLE,
    API_FAILED = 15
}

export type TradeOptions = {
    microLamports?: number,
    units?: number,
    refetchBalance?: boolean,
    expectedProfit?: BN,
    tipAmount?: BN,
    runSimulation?: boolean,
    sendTxMethods: TxMethod[],
}

export type TradeSignature = {
    signature: string,
    timestamp: number,
    err?: string,
}

export enum TradeEntry {
    INITIAILIZE2 = 'initialized2',
    WITHDRAW = 'withdraw',
    SWAPBASEIN = 'swapBaseIn'
}

export type Trade = {
    ammId: PublicKey | undefined,
    amountIn: BN,
    amountOut: BN,
    action: 'buy' | 'sell' | undefined,
    entry: TradeEntry,
    timing: TradeTiming,
    signature: TradeSignature[],
    source: string,
    abandonedReason: AbandonedReason,
    err: string | undefined,
    opts?: TradeOptions,
}
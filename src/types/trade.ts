import { PublicKey } from "@solana/web3.js"
import BN from "bn.js"
import { TxMethod } from "./tx-method"

export type TradeTiming = {
	listened: number,
	preprocessed: number,
	processed: number
    completed: number
}

export type TradeOptions = {
    microLamports?: number,
    units?: number,
    refetchBalance?: boolean,
    expectedProfit?: BN,
    jitoTipAmount?: BN,
    runSimulation?: boolean,
    sendTxMethod?: TxMethod,
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
    err: string | undefined,
    opts?: TradeOptions,
}
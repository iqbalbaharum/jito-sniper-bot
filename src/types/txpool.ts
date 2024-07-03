import { CompiledInnerInstruction } from "@solana/web3.js"
import { InnerInstruction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage"
import BN from "bn.js"

export type PoolTiming = {
	listened: number,
	preprocessed: number,
	processed: number
	send: number
}

export type TxAddressLookupTable = {
	accountKey: string,
	writableIndexes: number[],
	readonlyIndexes: number[]
}

export type TxInstruction = {
	programIdIndex: number,
	accounts: number[],
	data: Buffer | string
}

export type TxInnerInstruction = {
	instructions: TxInstruction[]
}

export type TxBalance = {
	mint: string,
	owner: string,
	decimals: number,
	amount: BN
}

export type MempoolTransaction = {
	source: string
	filter?: string[]
	signature: string
	accountKeys: string[]
	recentBlockhash: string
	instructions: TxInstruction[]
	innerInstructions: TxInnerInstruction[],
	addressTableLookups: TxAddressLookupTable[],
	preTokenBalances: TxBalance[]
	postTokenBalances: TxBalance[]
	computeUnitsConsumed: number,
	err?: number | null
}

export type LookupIndex = {
	lookupTableIndex: number
	lookupTableKey: string
}

export type TxPool = {
	mempoolTxns: MempoolTransaction,
	timing: PoolTiming
	blockTime?: number
}
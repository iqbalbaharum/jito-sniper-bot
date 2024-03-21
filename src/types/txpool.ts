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
	data: Buffer
}

export type TxBalance = {
	mint: string,
	owner: string,
	decimals: number,
	amount: BN
}

export type MempoolTransaction = {
	source: string
	signature: string
	accountKeys: string[]
	recentBlockhash: string
	instructions: TxInstruction[]
	addressTableLookups: TxAddressLookupTable[],
	preTokenBalances: TxBalance[]
	postTokenBalances: TxBalance[]
}

export type LookupIndex = {
	lookupTableIndex: number
	lookupTableKey: string
}

export type TxPool = {
	mempoolTxns: MempoolTransaction,
	timing: PoolTiming
}
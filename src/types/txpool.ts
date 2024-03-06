export type PoolTiming = {

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

export type MempoolTransaction = {
	signature: string
	accountKeys: string[]
	recentBlockhash: string
	instructions: TxInstruction[]
	addressTableLookups: TxAddressLookupTable[]
}

export type LookupIndex = {
	lookupTableIndex: number
	lookupTableKey: string
}

export type TxPool = {
	mempoolTxns: MempoolTransaction,
	// timing: PoolTiming
}
import { VersionedTransaction } from "@solana/web3.js"
import BN from "bn.js"

export type SwapInstruction = {
	transaction: VersionedTransaction, 
	minAmountOut?: BN, 
	amountOut?: BN
}
import { PublicKey } from "@solana/web3.js"
import { CopyTradeAmount } from "../types"

export class CopyTrades {
	trades: Map<string, CopyTradeAmount> = new Map()

	set(ammId: PublicKey, data: CopyTradeAmount) {
		this.trades.set(ammId.toBase58(), data)
	}

	get(ammId: PublicKey) : CopyTradeAmount | undefined {
		return this.trades.get(ammId.toBase58())
	}
}
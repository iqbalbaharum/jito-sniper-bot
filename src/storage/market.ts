import { PublicKey } from "@solana/web3.js";

export class ExistingRaydiumMarketStorage {
	markets: Set<string>;

    constructor() {
        this.markets = new Set()
    }

    add(marketId: PublicKey) {
        this.markets.add(marketId.toBase58())
    }

    remove(marketId: PublicKey) {
        this.markets.delete(marketId.toBase58())
    }

    isExisted(marketId: PublicKey) : boolean {
       return this.markets.has(marketId.toBase58())
    }
}
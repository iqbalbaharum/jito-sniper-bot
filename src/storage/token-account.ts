import { PublicKey } from "@solana/web3.js";

export class TokenAccountStorage {
	tokenAccounts: Map<string, Buffer>;

    constructor() {
        this.tokenAccounts = new Map()
    }

    set(ta: PublicKey, buffer: Buffer) {
        this.tokenAccounts.set(ta.toBase58(), buffer)
    }

    get(ta: PublicKey) : Buffer | undefined {
       return this.tokenAccounts.get(ta.toBase58())
    }

    exist(ta: PublicKey) : Boolean {
			return this.tokenAccounts.has(ta.toBase58())
    }
}
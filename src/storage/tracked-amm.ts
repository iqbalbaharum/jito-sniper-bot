import { PublicKey } from "@solana/web3.js"
import { CopyTradeAmount, TokenTick } from "../types"
import { StorageKeys } from "../types/storage-keys"
import { BaseStorage } from "./base-storage"
import { subscribeAmmIdToMempool, unsubscribeAmmIdToMempool } from "../generators"
import { logger } from "../utils/logger"

export class TrackedAmm extends BaseStorage {
    client: any

	constructor(client: any) {
        super(StorageKeys.KEY_TRACKEDAMM)
        this.client = client
    }

	async set(ammId: PublicKey, tracked: boolean) {
		this.client.hSet(ammId.toBase58(), this.key, tracked ? 'YES' : 'NO')
	}

	async get(ammId: PublicKey) : Promise<boolean | undefined> {
		let isTracked = await this.client.hGet(ammId.toBase58(), this.key)
		if(isTracked === 'YES') { return true }
		else if(isTracked === 'NO')  { return false }
		else { return undefined }
	}

	async getAll() : Promise<string[]> {
		const keys = await this.client.keys('*')
		return keys.map((key: string) => key);
	}
}
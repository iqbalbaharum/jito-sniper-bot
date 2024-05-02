import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";

export class ExistingRaydiumMarketStorage extends BaseStorage {
	markets: Set<string>;
    // Redis client
    client: any
    useRedis: boolean
    
    constructor(client: any, useRedis: boolean) {
        super(StorageKeys.KEY_EXISTINGMARKET)
        this.markets = new Set()

        this.client = client
        this.useRedis = useRedis
    }

    async add(marketId: PublicKey) {
        if(this.useRedis) {
            await this.client.hSet(`${marketId.toBase58()}`, this.key, 'ok')
        } else {
            this.markets.add(marketId.toBase58())
        }
    }

    async remove(marketId: PublicKey) {
        if(this.useRedis) {
            await this.client.hDel(`${marketId.toBase58()}`, this.key)
        } else {
            this.markets.delete(marketId.toBase58())
        }
    }

    async isExisted(marketId: PublicKey) : Promise<boolean> {
        if(this.useRedis) {
            return await this.client.hExists(`${marketId.toBase58()}`, this.key)
        } else {
            return this.markets.has(marketId.toBase58())
        }
    }
}
import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";

export class CountLiquidityPoolStorage extends BaseStorage {
	countLiquidityPool: Map<string, number>
    // Redis client
    client: any
    useRedis: boolean
    
    constructor(client: any, useRedis: boolean) {
        super(StorageKeys.KEY_COUNTLP)
        this.countLiquidityPool = new Map()

        this.client = client
        this.useRedis = useRedis
    }

    async get(ammId: PublicKey) : Promise<number | undefined> {
        if(this.useRedis) {
            return await this.client.hGet(`${ammId.toBase58()}`, this.key)
        } else {
            return this.countLiquidityPool.get(ammId.toBase58())
        }
    }

    async set(ammId: PublicKey, count: number) {
        if(this.useRedis) {
            await this.client.hSet(`${ammId.toBase58()}`, this.key, count)
        } else {
            this.countLiquidityPool.set(ammId.toBase58(), count)
        }
    }
}
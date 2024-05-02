import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";

export class AmmStateStorage extends BaseStorage {
    // Redis client
    client: any
    
    constructor(client: any, useRedis: boolean) {
        super(StorageKeys.KEY_AMMSTATE)

        this.client = client
    }

    async set(ammId: PublicKey, data: string) {
        await this.client.hSet(`${ammId.toBase58()}`, this.key, data)
    }

    async get(ammId: PublicKey) {
        return await this.client.hGet(`${ammId.toBase58()}`, this.key)
    }
}
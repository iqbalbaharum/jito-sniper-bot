import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";

export class OpenbookMarketStorage extends BaseStorage {
    // Redis client
    client: any
    
    constructor(client: any) {
        super(StorageKeys.KEY_AMMSTATE)

        this.client = client
    }

    async set(mint: PublicKey, data: string) {
        await this.client.hSet(`${mint.toBase58()}`, this.key, data)
    }

    async get(mint: PublicKey) {
        return await this.client.hGet(`${mint.toBase58()}`, this.key)
    }
}
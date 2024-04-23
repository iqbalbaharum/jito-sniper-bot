import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";

export class TokenAccountStorage extends BaseStorage {
	tokenAccounts: Map<string, Buffer>;
    // Redis client
    client: any
    useRedis: boolean
     
    constructor(client: any, useRedis: boolean) {
        
        super(StorageKeys.KEY_TOKENACCOUNT)

        this.tokenAccounts = new Map()
        this.client = client
        this.useRedis = useRedis
    }

    async set(ta: PublicKey, buffer: Buffer) {
        if(this.useRedis) {
            await this.client.hSet(`${ta.toBase58()}`, this.key, buffer.toString('hex'))
        } else {
            this.tokenAccounts.set(ta.toBase58(), buffer) 
        }
        
    }

    async get(ta: PublicKey) : Promise<Buffer | undefined> {
        if(this.useRedis) {
            return await this.client.hGet(`${ta.toBase58()}`, this.key)
        } else {
            return this.tokenAccounts.get(ta.toBase58())
        }
       
    }

    async exist(ta: PublicKey) : Promise<Boolean> {
        if(this.useRedis) {
            return await this.client.hExists(`${ta.toBase58()}`, this.key)
        } else {
            return this.tokenAccounts.has(ta.toBase58())
        }
    }
}

import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";
import { TokenChunk } from "../types";
import { BN } from "bn.js";

export class TokenChunkStorage extends BaseStorage {
    tokenChunks: Map<string, TokenChunk> = new Map<string, TokenChunk>()
    // Redis client
    client: any
    useRedis: boolean
    
    constructor(client: any, useRedis: boolean) {
        super(StorageKeys.KEY_TOKENCHUNK)
        this.tokenChunks = new Map()

        this.client = client
        this.useRedis = useRedis
    }

    async get(ammId: PublicKey) : Promise<TokenChunk | undefined> {
        if(this.useRedis) {
            let chunk = await this.client.hGet(`${ammId.toBase58()}`, this.key)
            if(chunk) {
                return this.deserialize(chunk)
            } else {
                return undefined
            }

        } else {
            return this.tokenChunks.get(ammId.toBase58())
        }
    }

    async set(ammId: PublicKey, chunk: TokenChunk) {
        if(this.useRedis) {
            await this.client.hSet(`${ammId.toBase58()}`, this.key, this.serialize(chunk))
        } else {
            this.tokenChunks.set(ammId.toBase58(), chunk)
        }
    }

    async isUsedUp(ammId: PublicKey) {
        let chunk = await this.get(ammId)
        if(chunk) {
            chunk.remaining = new BN(0)
            chunk.isUsedUp = true
            this.set(ammId, chunk)
        }
    }

    async isConfirm(ammId: PublicKey) {
        let chunk = await this.get(ammId)
        if(chunk) {
            chunk.isConfirmed = true
            this.set(ammId, chunk)
        }
    }

    private serialize(chunk: TokenChunk) : string {
        return JSON.stringify(chunk)
    }

    private deserialize(sChunk: string) : TokenChunk {
        let c = JSON.parse(sChunk, (key, value) => {
            if (key === 'total' || key === 'remaining' || key === 'chunk') {
                return new BN(value, 16);
            }
            return value;
        })
        return {
            total: c.total,
            remaining: c.remaining,
            chunk: c.chunk,
            isConfirmed: c.isConfirmed,
            isUsedUp: c.isUsedUp
        }
    }
}
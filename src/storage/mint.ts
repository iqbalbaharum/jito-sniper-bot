import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";
import { BotLiquidityState, PoolInfo } from "../types";

export class MintStorage extends BaseStorage {
	mints: Map<string, BotLiquidityState>
    // Redis client
    client: any
    useRedis: boolean
    
    constructor(client: any, useRedis: boolean) {
        super(StorageKeys.KEY_MINTDETAIL)
        this.mints = new Map()

        this.client = client
        this.useRedis = useRedis
    }

    async get(ammId: PublicKey) : Promise<BotLiquidityState | undefined> {
        if(this.useRedis) {
            let mint = await this.client.hGet(`${ammId.toBase58()}`, this.key)
            if(mint) {
                return this.deserialize(mint)
            } else {
                return undefined
            }

        } else {
            return this.mints.get(ammId.toBase58())
        }
    }

    async set(ammId: PublicKey, mint: BotLiquidityState) {
        if(this.useRedis) {
            await this.client.hSet(`${ammId.toBase58()}`, this.key, this.serialize(mint))
        } else {
            this.mints.set(ammId.toBase58(), mint)
        }
    }

    private serialize(state: BotLiquidityState) : string {
        return JSON.stringify(state)
    }

    private deserialize(mintString: string) : BotLiquidityState {
        const data = JSON.parse(mintString)

        return {
            ammId: new PublicKey(data.ammId),
            mint: new PublicKey(data.mint),
            mintDecimal: data.mintDecimal,
            isMintBase: data.isMintBase
        }
    }
}
import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";
import { LiquidityPoolKeys, LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
import { PoolInfo } from "../types";
import { BotLiquidity } from "../services";

export class PoolKeysStorage extends BaseStorage {
	trackedPoolKeys: Map<string, LiquidityPoolKeys & PoolInfo>;
    // Redis client
    client: any
    useRedis: boolean
    
    constructor(client: any, useRedis: boolean) {
        super(StorageKeys.KEY_POOLKEYS)
        this.trackedPoolKeys = new Map()

        this.client = client
        this.useRedis = useRedis
    }

    async get(ammId: PublicKey) : Promise<LiquidityPoolKeysV4 & PoolInfo | undefined> {
        if(this.useRedis) {
            let poolKeysString = await this.client.hGet(`${ammId.toBase58()}`, this.key)
            if(poolKeysString) { return this.deserializeLiquidityPoolKeys(poolKeysString) }
            else { return undefined }

        } else {
            return this.trackedPoolKeys.get(ammId.toBase58())
        }
    }

    async set(ammId: PublicKey, poolKeys: LiquidityPoolKeysV4 & PoolInfo) {
        if(this.useRedis) {
            await this.client.hSet(`${ammId.toBase58()}`, this.key, this.serializeLiquidityPoolKeys(poolKeys))
        } else {
            this.trackedPoolKeys.set(ammId.toBase58(), poolKeys)
        }
    }

    async remove(ammId: PublicKey) {
        if(this.useRedis) {
            await this.client.hDel(`${ammId.toBase58()}`, this.key)
        } else {
            this.trackedPoolKeys.delete(ammId.toBase58())
        }
    }

    private serializeLiquidityPoolKeys(poolkeys: LiquidityPoolKeysV4 & PoolInfo): string {
		return JSON.stringify(poolkeys)
	}

	private deserializeLiquidityPoolKeys(poolkeysString: string): LiquidityPoolKeysV4 & PoolInfo {
		const keys = JSON.parse(poolkeysString)

		return {
			id: new PublicKey(keys.id),
			baseMint: new PublicKey(keys.baseMint),
			quoteMint: new PublicKey(keys.quoteMint),
			lpMint: new PublicKey(keys.lpMint),
			baseDecimals: keys.baseDecimals,
			quoteDecimals: keys.quoteDecimals,
			lpDecimals: keys.lpDecimals,
			version: keys.version,
			programId: new PublicKey(keys.programId),
			authority: new PublicKey(keys.authority),
			openOrders: new PublicKey(keys.openOrders),
			targetOrders: new PublicKey(keys.targetOrders),
			baseVault: new PublicKey(keys.baseVault),
			quoteVault: new PublicKey(keys.quoteVault),
			marketVersion: keys.marketVersion,
			marketProgramId: new PublicKey(keys.marketProgramId),
			marketId: new PublicKey(keys.marketId),
			marketAuthority: new PublicKey(keys.marketAuthority),
			marketBaseVault: new PublicKey(keys.baseVault),
			marketQuoteVault: new PublicKey(keys.quoteVault),
			marketBids: new PublicKey(keys.marketBids),
			marketAsks: new PublicKey(keys.marketAsks),
			marketEventQueue: new PublicKey(keys.marketEventQueue),
			withdrawQueue: new PublicKey(keys.withdrawQueue),
			lpVault: new PublicKey(keys.lpVault),
			lookupTableAccount: new PublicKey(keys.lookupTableAccount),
			poolOpenTime: keys.poolOpenTime
		}
	}
}
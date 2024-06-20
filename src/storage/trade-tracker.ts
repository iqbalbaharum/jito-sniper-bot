import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";
import { Trade, TradeOptions, TradeTiming } from "../types/trade";
import { TradeTracker } from "../types";

export class TradeTrackerStorage extends BaseStorage {
    client: any
    
    constructor(client: any) {
        super(StorageKeys.KEY_TRADETRACKER)

        this.client = client
    }

    async set(ammId: string, trade: TradeTracker) {
        return await this.client.hSet(ammId, this.key, this.serialize(trade))
    }

    async get(ammId: string) : Promise<TradeTracker | undefined> {
        let str = await this.client.hGet(ammId, this.key)
        if(str) {
           return this.deserialize(str)
        }

        return undefined
    }

    private serialize(trade: TradeTracker) : string {
        return JSON.stringify(trade)
    }

    private deserialize(tradeStr: string) : TradeTracker {
        let d = JSON.parse(tradeStr)
        return d
    }
}
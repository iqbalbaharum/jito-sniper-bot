import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";
import { AbandonedReason, Trade, TradeOptions, TradeTiming } from "../types/trade";
import { BN } from "bn.js";

export class TradeStorage extends BaseStorage {
    client: any
    
    constructor(client: any) {
        super(StorageKeys.KEY_TRADE)

        this.client = client
    }

    async set(uuid: string, trade: Trade) {
        await this.client.hSet(uuid, this.key, this.serialize(trade))
    }

    async get(uuid: string) : Promise<Trade | undefined> {
        let str = await this.client.hGet(uuid, this.key)
        if(str) {
           return this.deserialize(str)
        }

        return undefined
    }

    async remove(uuid: string) {
        await this.client.hDel(uuid, this.key)
    }

    async getAllKeys() : Promise<string[]> {
        const keys = await this.client.keys('*')
		return keys.map((key: string) => key);
    }

    private serialize(trade: Trade) : string {
        return JSON.stringify(trade)
    }

    private deserialize(tradeStr: string) : Trade {
        let d = JSON.parse(tradeStr)
        return {
            ammId: d.ammId ? new PublicKey(d.ammId) : undefined,
            amountIn: new BN(d.amountIn, 16),
            amountOut: new BN(d.amountOut, 16),
            action: d.action,
            signature: d.signature,
            entry: d.entry,
            timing: d.timing as TradeTiming,
            abandonedReason: d.abandonedReason as AbandonedReason,
            err: d.err,
            opts: d.opts as TradeOptions
        }
    }
}
import { LiquidityStateLayoutV4 } from "@raydium-io/raydium-sdk";
import { TxPool } from "../types";
import { KeyedAccountInfo } from "@solana/web3.js";

export abstract class BaseStateGenerator {
    
    private _streamName: string

    get streamName(): string {
        return this._streamName
    }

    constructor(sourceName: string) {
        this._streamName = sourceName
    }

    protected abstract listen(): AsyncGenerator<KeyedAccountInfo>
}
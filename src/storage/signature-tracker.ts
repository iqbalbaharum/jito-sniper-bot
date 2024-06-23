import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";
import { SignatureTracker } from "../types/signature-tracker";

export class SignatureTrackerStorage extends BaseStorage {
    client: any
    
    constructor(client: any) {
        super(StorageKeys.KEY_SIGNATURETRACKER)

        this.client = client
    }

    async set(signature: string, tracker: SignatureTracker) {
        return await this.client.hSet(signature, this.key, this.serialize(tracker))
    }

    async get(signature: string) : Promise<SignatureTracker | undefined> {
        let str = await this.client.hGet(signature, this.key)
        if(str) {
           return this.deserialize(str)
        }

        return undefined
    }

    async getAllKeys() : Promise<string[]> {
		const keys = await this.client.keys('*')
		return keys.map((key: string) => key);
	}

    private serialize(trade: SignatureTracker) : string {
        return JSON.stringify(trade)
    }

    private deserialize(tradeStr: string) : SignatureTracker {
        let d = JSON.parse(tradeStr)
        return d
    }
}
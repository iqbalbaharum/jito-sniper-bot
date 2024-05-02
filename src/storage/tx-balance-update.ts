import { PublicKey } from "@solana/web3.js";
import { BaseStorage } from "./base-storage";
import { StorageKeys } from "../types/storage-keys";

export class TransactionSignatureBalanceUpdateStorage extends BaseStorage {
    client: any
    constructor(client: any) {
        
        super(StorageKeys.KEY_TXSIG_BALUPDATE)

        this.client = client
    }

    async set(signature: string) {
        await this.client.hSet(signature, this.key, 'ok', {
            EX: 60
        })
    }

    async exist(signature: string) : Promise<Boolean> {
        return await this.client.hExists(signature, this.key)
    }
}

import { connection } from "../adapter/rpc";
import { StorageKeys } from "../types/storage-keys";
import { BaseStorage } from "./base-storage";

export type BlockhashV2Data = {
    recentBlockhash: string
}

export class BlockHashV2Storage extends BaseStorage {
	recentBlockhash: string;
    client: any

    constructor(client: any) {
        
        super(StorageKeys.KEY_BLOCKHASHV2)

        this.recentBlockhash = ''

        this.client = client
    }

    async set(data: BlockhashV2Data) {
        this.recentBlockhash = data.recentBlockhash
        await this.client.hSet(`recent`, this.key, this.serialize(data))
    }

    async get() : Promise<BlockhashV2Data> {
        let data = await this.client.hGet('recent', this.key)
        return this.deserialize(data)
    }

    private serialize = (data: BlockhashV2Data) => {
        return JSON.stringify(data)
    }

    private deserialize = (data: string) : BlockhashV2Data => {
        return JSON.parse(data) as BlockhashV2Data
    }
}
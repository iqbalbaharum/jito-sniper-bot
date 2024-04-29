import { connection } from "../adapter/rpc";
import { StorageKeys } from "../types/storage-keys";
import { BaseStorage } from "./base-storage";

export type BlockhashData = {
    recentBlockhash: string
    latestSlot: number
    latestBlockHeight: number
}

export class BlockHashStorage extends BaseStorage {
	recentBlockhash: string;
    latestSlot: number
    latestBlockHeight: number

    // Redis client
    client: any

    constructor(client: any) {
        
        super(StorageKeys.KEY_L_BLOCKHASH)

        this.latestSlot = 0
        this.latestBlockHeight = 0
        this.recentBlockhash = ''

        this.client = client
    }

    async set(data: BlockhashData) {
        if(data.latestSlot - this.latestSlot > 2) {
            this.recentBlockhash = data.recentBlockhash
            this.latestSlot = data.latestSlot
            this.latestBlockHeight = data.latestBlockHeight
            await this.client.hSet(`recent`, this.key, this.serialize(data))
        }
    }

    async get() : Promise<BlockhashData> {
        // let data = await this.client.hGet('recent', this.key)
        // return this.deserialize(data)
        let block = await connection.getLatestBlockhashAndContext('confirmed')
        return {
            recentBlockhash: block.value.blockhash,
            latestBlockHeight: block.value.lastValidBlockHeight,
            latestSlot: block.context.slot
        }
    }

    private serialize = (data: BlockhashData) => {
        return JSON.stringify(data)
    }

    private deserialize = (data: string) : BlockhashData => {
        return JSON.parse(data) as BlockhashData
    }
}
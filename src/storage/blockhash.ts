import { defaultGrpc } from "../adapter/grpcs";
import { connection } from "../adapter/rpc";
import { StorageKeys } from "../types/storage-keys";
import { config } from "../utils";
import { logger } from "../utils/logger";
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

        const method = config.get('blockhash_method')
        
        let d
        switch(method) {
            case 'service':
                let data = await this.client.hGet('recent', this.key)
                d = this.deserialize(data)
                break;
            case 'rpc':
                let currSlot = await connection.getSlot('confirmed')
                if(currSlot - this.latestSlot > 20) {
                    let block = await connection.getLatestBlockhashAndContext('confirmed')
                    
                    this.recentBlockhash = block.value.blockhash
                    this.latestBlockHeight = block.value.lastValidBlockHeight
                    this.latestSlot = block.context.slot
                }

                d = {
                    recentBlockhash: this.recentBlockhash,
                    latestBlockHeight: this.latestBlockHeight,
                    latestSlot: this.latestSlot
                }
                break
            case 'grpc':
            default:
                const block = await defaultGrpc.getLatestBlockhash('confirmed')

                this.recentBlockhash = block.blockhash
                this.latestBlockHeight = parseInt(block.lastValidBlockHeight)
                this.latestSlot = parseInt(block.slot)
                
                d = {
                    recentBlockhash: this.recentBlockhash,
                    latestBlockHeight: this.latestBlockHeight,
                    latestSlot: this.latestSlot
                }
                break
        }
        
        return d
    }

    private serialize = (data: BlockhashData) => {
        return JSON.stringify(data)
    }

    private deserialize = (data: string) : BlockhashData => {
        return JSON.parse(data) as BlockhashData
    }
}
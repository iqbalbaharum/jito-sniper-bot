import { TxPool } from "../types";
import { logger } from "../utils/logger";
import { BaseStream } from "./base-stream";
import { BotTritonGrpcStream } from "./stream-grpc";
import { ConcurrentSet } from "../utils/concurrent-set";
import { grpcs } from "../adapter/grpcs";
import { BotOnLogStream } from "./onlog-stream";
import { connection } from "../adapter/rpc";

export class BotMempoolManager {
    private bots: Map<string, BaseStream>;
    private pools: ConcurrentSet<string> = new ConcurrentSet<string>(50 * 60000)
    private callbacks: Array<(txPool: TxPool) => void>

    constructor() {
        this.bots = new Map();
		this.callbacks = []
    }

    private handleData(txPool: TxPool): void {
        const signature = txPool.mempoolTxns.signature;

        if (!this.pools.has(signature)) {
            this.pools.add(signature);

			for(const cb of this.callbacks) {
				
				cb(txPool)
			}
        }
    }

	listen(callback: (txPool: TxPool) => void) {
		this.callbacks.push(callback)
	}

    async addStream(key: string, bot: BaseStream, addresses: string[]) {
		bot.addCallback((txPool: TxPool) => {
            this.handleData(txPool);
        })

		this.bots.set(key, bot)
    }

	addGrpcStream(key: string, addresses: string[]) {	
		for(let i = 0; i < grpcs.length; i++) {
			const env = grpcs[i]
			const name = `geyser_rpc_${i}_${key}`
			let bot = new BotTritonGrpcStream(name, env.url, env.token)
			bot.listen(addresses)

			this.addStream(name, bot, addresses)
		}
	}

	removeGrpcStream(key: string) {
		for(const [name, bot] of this.bots) {
			if(name.includes(key)) {
				bot.stop()
				this.bots.delete(name)
			}
		}
	}

	addLogStream(programId: string) {
		const name = `onLog_${programId}`
		let bot = new BotOnLogStream(name, connection)
		bot.listen([programId])

		this.addStream(name, bot, [programId])
	}
}
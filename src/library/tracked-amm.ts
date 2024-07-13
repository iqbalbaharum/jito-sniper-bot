import { PublicKey } from "@solana/web3.js";
import { trackedAmm } from "../adapter/storage";
import { subscribeAmmIdToMempool, unsubscribeAmmIdToMempool } from "../generators";
import { logger } from "../utils/logger";
import { MempoolManager } from "../adapter/mempool";
import { config } from "../utils";

export class BotTrackedAmm {
    static async init() {
        let ammIds = await trackedAmm.getAll()

		let groupsInclude: string[] = []

		for(const ammId of ammIds) {
			const isTracked = await trackedAmm.get(new PublicKey(ammId))
			if(isTracked === undefined || !isTracked) { continue }

			groupsInclude.push(ammId)

			if(groupsInclude.length > 9) {
				this.addStreams(groupsInclude)
				groupsInclude = []
			}
		}

		if(groupsInclude.length > 0) {
			this.addStreams(groupsInclude)
			groupsInclude = []
		}
    }

    static async register(ammId: PublicKey) {
        trackedAmm.set(ammId, true)
		this.addStreams([ammId.toBase58()])
	}

    static async unregister(ammId: PublicKey) {
        trackedAmm.set(ammId, false)
		this.removeStreams(ammId.toBase58())
	}

	private static async addStreams(ammIds: string[]) {
		if(config.get('mempool_type') === 'callback') {
			MempoolManager.addGrpcStream(ammIds[0], ammIds)
			logger.info(`Tracked: ${ammIds.join(',')}`)
		} else if(config.get('mempool_type') === 'generator') {
			await subscribeAmmIdToMempool(ammIds)
		}
	}

	private static removeStreams(ammId: string) {
		MempoolManager.removeGrpcStream(ammId)
		logger.info(`Untracked: ${ammId}`)
	}
}
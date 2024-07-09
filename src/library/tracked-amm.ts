import { PublicKey } from "@solana/web3.js";
import { trackedAmm } from "../adapter/storage";
import { subscribeAmmIdToMempool, unsubscribeAmmIdToMempool } from "../generators";
import { logger } from "../utils/logger";
import { MempoolManager } from "../adapter/mempool";

export class BotTrackedAmm {
    static async init() {
        let ammIds = await trackedAmm.getAll()
        let groupsInclude: string[] = []

		for(const ammId of ammIds) {
			const isTracked = await trackedAmm.get(new PublicKey(ammId))
			if(isTracked === undefined || !isTracked) { continue }

			MempoolManager.addGrpcStream(ammId, [ammId])
			logger.info(`Tracked: ${ammId}`)
		}
    }

    static async register(ammId: PublicKey) {
        trackedAmm.set(ammId, true)
		MempoolManager.addGrpcStream(ammId.toBase58(), [ammId.toBase58()])

		logger.info(`Tracked: ${ammId}`)
	}

    static async unregister(ammId: PublicKey) {
        trackedAmm.set(ammId, false)
		MempoolManager.removeGrpcStream(ammId.toBase58())

		logger.info(`Untracked: ${ammId}`)
	}
}
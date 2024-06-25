import { PublicKey } from "@solana/web3.js";
import { trackedAmm } from "../adapter/storage";
import { subscribeAmmIdToMempool, unsubscribeAmmIdToMempool } from "../generators";
import { logger } from "../utils/logger";

export class BotTrackedAmm {
    static async init() {
        let ammIds = await trackedAmm.getAll()
        let groupsInclude: string[] = []

		for(const ammId of ammIds) {
			const isTracked = await trackedAmm.get(new PublicKey(ammId))
			if(isTracked === undefined || !isTracked) { continue }

			await subscribeAmmIdToMempool([ammId])
		}
    }

    static async register(ammId: PublicKey) {
        trackedAmm.set(ammId, true)
		logger.info(`Tracked: ${ammId}`)
		await subscribeAmmIdToMempool([ammId.toBase58()])
	}

    static async unregister(ammId: PublicKey) {
        trackedAmm.set(ammId, true)
		logger.info(`Untracked: ${ammId}`)
		await unsubscribeAmmIdToMempool(ammId)
	}
}
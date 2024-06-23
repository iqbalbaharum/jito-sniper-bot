import { signatureTracker } from "../adapter/storage";
import { logger } from "../utils/logger";

export class BotSignatureTracker {
    static async sendRequest(signature: string) {
        let tracker = await signatureTracker.get(signature)
        if(!tracker) {
            await signatureTracker.set(signature, {
                requestAt: new Date().getTime(),
                onChainAt: 0
            })
        }
    }

    static async finalized(signature: string, timestamp: number) {
        let tracker = await signatureTracker.get(signature)
        if(tracker) {
            tracker.onChainAt = timestamp
            await signatureTracker.set(signature, tracker)
        }
    }
}
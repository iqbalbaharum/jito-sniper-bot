import { connection } from "../adapter/rpc";
import { TxPool } from "../types";
import { logger } from "../utils/logger";

// Since Jito mempool have a lot of invalid transaction
// Do check the signature status before decide to proceed
async function* preSimulationFilter(poolIterator: AsyncGenerator<TxPool>): AsyncGenerator<TxPool> {
	for await(const item of poolIterator) {
		try {
			const status = await connection.getSignatureStatus(item.mempoolTxns.signature)
			if(status.value && !status.value.err) {
				yield {
					mempoolTxns: item.mempoolTxns,
					timing: {
						listened: item.timing.listened,
						preprocessed: new Date().getTime(),
						processed: 0,
						send: 0
					}
				}
			}
		} catch(e) {
			logger.warn(`Invalid signature status: ${item.mempoolTxns.signature}`)
		}
	}
}

export { preSimulationFilter }
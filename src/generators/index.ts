
import { PublicKey } from "@solana/web3.js";
import { payer } from "../adapter/payer";
import { TxPool } from "../types";
import { JUPITER_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";
import { ConcurrentSet } from "../utils/concurrent-set";
import { GrpcGenerator } from "./grpc";
import { Web3JSOnLog } from "./log";
import { connection, connectionAlt1 } from "../adapter/rpc";
import { logger } from "../utils/logger";
import { HeliusWebSocketGenerator } from "./helius-websocket";
import { geysers } from "../adapter/geysers";

async function* mempool(accounts: string[]): AsyncGenerator<TxPool> {
	const generators: AsyncGenerator<TxPool>[] = [];
	const pools: ConcurrentSet<string> = new ConcurrentSet<string>(50 * 60000)

	try {
		// load geysers
		for(let i=0; i < geysers.length; i++) {
			let env = geysers[i]

			const geyserPool: GrpcGenerator = new GrpcGenerator(`geyser_${i}`, env.url, env.token)
			geyserPool.addTransaction(`raydium_tx_${i}`, {
				vote: false,
				failed: false,
				accountInclude: accounts,
				accountExclude: [],
				accountRequired: [],
			})
			generators.push(geyserPool.listen())
		}

		const onLogPool = new Web3JSOnLog('onLog_1', connection, accounts[0])
		const heliusWS = new HeliusWebSocketGenerator('helius_ws_1', config.get('helius_api_key'), accounts)

		generators.push(onLogPool.listen())
		generators.push(heliusWS.listen())
	} catch(e: any) {
		console.log(e.toString())
	}

	const updates = fuseGenerators(generators)

	for await (const update of updates) {
		if(update && !pools.has(update.mempoolTxns.signature)) {
			pools.add(update.mempoolTxns.signature)
			yield update
		}
	}
}

async function* fuseGenerators<T>(
	gens: AsyncGenerator<T>[],
): AsyncGenerator<T> {
	const generatorPromises: Array<
		Promise<{ result: IteratorResult<T>; generatorIndex: number }>
	> = gens.map((gen, index) =>
		gen.next().then((result) => ({ result, generatorIndex: index })),
	);

	while (true) {
		const { result, generatorIndex } = await Promise.race(generatorPromises);
		yield result.value;
		generatorPromises[generatorIndex] = gens[generatorIndex]
			.next()
			.then((result) => ({ result, generatorIndex }));
	}
}

export { mempool, fuseGenerators }
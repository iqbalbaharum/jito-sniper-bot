
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

async function* mempool(accounts: string[]): AsyncGenerator<TxPool> {
	const generators: AsyncGenerator<TxPool>[] = [];
	const pools: ConcurrentSet<string> = new ConcurrentSet<string>(50 * 60000)
	
	// geyser
	const geyser1Pool: GrpcGenerator = new GrpcGenerator('geyser_1', config.get('grpc_1_url'), config.get('grpc_1_token'))
	geyser1Pool.addTransaction('raydium_tx_1', {
		vote: false,
		failed: false,
		accountInclude: accounts,
		accountExclude: [],
		accountRequired: [],
	})

	const geyser2Pool: GrpcGenerator = new GrpcGenerator('geyser_2', config.get('grpc_2_url'), config.get('grpc_2_token'))
	geyser2Pool.addTransaction('raydium_tx_2', {
		vote: false,
		failed: false,
		accountInclude: accounts,
		accountExclude: [],
		accountRequired: [],
	})

	const geyser3Pool: GrpcGenerator = new GrpcGenerator('geyser_3', config.get('grpc_3_url'), config.get('grpc_3_token'))
	geyser2Pool.addTransaction('raydium_tx_3', {
		vote: false,
		failed: false,
		accountInclude: accounts,
		accountExclude: [],
		accountRequired: [],
	})

	const onLogPool = new Web3JSOnLog('onLog_1', connection, accounts[0])
	const heliusWS = new HeliusWebSocketGenerator('helius_ws_1', config.get('helius_api_key'), accounts)

	try {
		generators.push(geyser1Pool.listen())
		generators.push(geyser2Pool.listen())
		generators.push(geyser3Pool.listen())
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
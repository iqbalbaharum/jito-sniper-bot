
import { PublicKey } from "@solana/web3.js";
import { payer } from "../adapter/payer";
import { TxPool } from "../types";
import { JUPITER_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";
import { ConcurrentSet } from "../utils/concurrent-set";
import { GrpcGenerator } from "./grpc";
import { Web3JSOnLog } from "./log";
import { connectionAlt1 } from "../adapter/rpc";

async function* mempool(accounts: string[]): AsyncGenerator<TxPool> {
	const generators: AsyncGenerator<TxPool>[] = [];
	const pools: ConcurrentSet<string> = new ConcurrentSet<string>(50 * 60000)
	
	// geyser
	const geyser1Pool: GrpcGenerator = new GrpcGenerator('geyser_1', config.get('grpc_1_url'), config.get('grpc_1_token'))
	geyser1Pool.addTransaction('raydium_tx', {
		vote: false,
		failed: false,
		accountInclude: accounts,
		accountExclude: [],
		accountRequired: [],
	})

	const geyser2Pool: GrpcGenerator = new GrpcGenerator('geyser_2', config.get('grpc_2_url'), config.get('grpc_2_token'))
	geyser1Pool.addTransaction('raydium_tx', {
		vote: false,
		failed: false,
		accountInclude: accounts,
		accountExclude: [],
		accountRequired: [],
	})

	// const logsPool: Web3JSOnLog = new Web3JSOnLog('onLog', connectionAlt1, new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS))
	
	try {
		generators.push(geyser1Pool.listen())
		generators.push(geyser2Pool.listen())
		// generators.push(logsPool.listen())
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
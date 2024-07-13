
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
import { grpcs } from "../adapter/grpcs";
import sleep from "atomic-sleep";

const generators: AsyncGenerator<TxPool>[] = [];
const generatorMap: Map<string, GrpcGenerator> = new Map();
let updates: AsyncGenerator<TxPool> | null;
const pools: ConcurrentSet<string> = new ConcurrentSet<string>(50 * 60000)

async function mempool() {
	const geyserPool: GrpcGenerator = new GrpcGenerator(`geyser_rpc_1`, grpcs[0].url, grpcs[0].token)
	geyserPool.addTransaction(`geyser_rpc_1`, {
		vote: false,
		failed: false,
		accountInclude: [RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, '7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5'],
		accountExclude: [],
		accountRequired: [],
	})
	generators.push(geyserPool.listen())

	if(config.get('lp_detection_onlog_enabled')) {
		const onLogPool = new Web3JSOnLog('onLog_1', connection, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)
		generators.push(onLogPool.listen())
	}
	
	updates = null
	updates = await fuseGenerators(generators)
}

async function* getTxs(): AsyncGenerator<TxPool>{
	if(!updates) { return }

	for await (const update of updates) {
		if(update && !pools.has(update.mempoolTxns.signature)) {
			pools.add(update.mempoolTxns.signature)
			yield update
		}
	}
}

async function subscribeAmmIdToMempool(account: string[]) {
	for(let i=0; i < grpcs.length; i++) {
		const env = grpcs[i]
		const geyserPool: GrpcGenerator = new GrpcGenerator(`geyser_${i}_${account[0]}`, env.url, env.token)
		geyserPool.addTransaction(`geyser_${account[0]}`, {
			vote: false,
			failed: false,
			accountInclude: account,
			accountExclude: [],
			accountRequired: [],
		})

		generators.push(geyserPool.listen())
		generatorMap.set(account[0], geyserPool)

		logger.info(`geyser_${i}_${account[0]} | SUBSCRIBE to ${account}`)
		
		updates = null
		updates = await fuseGenerators(generators)
	}
}

async function unsubscribeAmmIdToMempool(ammId: PublicKey) {
	const generator = generatorMap.get(ammId.toBase58())
	if(generator) {
		generator.unsubscribe()
		generatorMap.delete(ammId.toBase58())
	}

	logger.info(`Unsubscribe to ${ammId}`)

	updates = await fuseGenerators(generators)
}

async function subscribeSignatureToMempool(signature: string) {
	for(let i=0; i < grpcs.length; i++) {
		const env = grpcs[i]
		const geyserPool: GrpcGenerator = new GrpcGenerator(`geyser_${i}_${signature}`, env.url, env.token)
		geyserPool.addSignature(signature)

		generators.push(geyserPool.listen())

		logger.info(`Subscribe to ${signature}`)

		updates = null
		updates = await fuseGenerators(generators)
	}
}

async function* fuseGenerators<T>(
	gens: AsyncGenerator<T>[]
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

export { 
	mempool,
	fuseGenerators,
	getTxs,
	subscribeAmmIdToMempool,
	unsubscribeAmmIdToMempool,
	subscribeSignatureToMempool 
}
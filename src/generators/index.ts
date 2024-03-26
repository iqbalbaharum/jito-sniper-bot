
import { PublicKey } from "@solana/web3.js";
import { payer } from "../adapter/payer";
import { TxPool } from "../types";
import { JUPITER_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";
import { ConcurrentSet } from "../utils/concurrent-set";
import { GeyserPool } from "./geyser";
import { Web3JSOnLog } from "./log";
import { connectionAlt1 } from "../adapter/rpc";

async function* mempool(accounts: string[]): AsyncGenerator<TxPool> {
	const generators: AsyncGenerator<TxPool>[] = [];
	const pools: ConcurrentSet<string> = new ConcurrentSet<string>(50 * 60000)
	
	// geyser
	const geyserPool: GeyserPool = new GeyserPool('geyser', config.get('triton_one_url'), config.get('triton_one_api_key'))
	geyserPool.addTransaction('raydium_tx', {
		vote: false,
		failed: false,
		accountInclude: accounts,
		accountExclude: [JUPITER_ADDRESS, 'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS'],
		accountRequired: [],
	})
	
	geyserPool.addTransaction('wallet_tx', {
		vote: false,
		failed: false,
		accountInclude: [payer.publicKey.toBase58()],
		accountExclude: [],
		accountRequired: [],
	})

	const logsPool: Web3JSOnLog = new Web3JSOnLog('onLog', connectionAlt1, new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS))
	
	try {
		generators.push(geyserPool.listen())
		generators.push(logsPool.listen())
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
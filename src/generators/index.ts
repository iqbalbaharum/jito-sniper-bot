
import { TxPool } from "../types";
import { JUPITER_ADDRESS, config } from "../utils";
import { GeyserPool } from "./geyser";

async function* mempool(accounts: string[]): AsyncGenerator<TxPool> {
	const generators: AsyncGenerator<TxPool>[] = [];
	
	const geyserPool: GeyserPool = new GeyserPool(config.get('triton_one_url'), config.get('triton_one_api_key'))
	geyserPool.addTransaction('raydium_tx', {
    vote: false,
    failed: false,
    accountInclude: accounts,
    accountExclude: [JUPITER_ADDRESS, 'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS'],
    accountRequired: [],
  })
	
	generators.push(geyserPool.listen())

	const updates = fuseGenerators(generators)

	for await (const update of updates) {
		yield update
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

export { mempool }
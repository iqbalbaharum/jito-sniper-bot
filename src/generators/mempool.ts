import { SearcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { mainSearcherClient, searcherClients } from "../adapter/jito";
import { TxPool } from "../types";
import { BaseGenerator } from "./base-generator";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { logger } from "../utils/logger";
import { fuseGenerators } from ".";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

export class JitoMempoolPool extends BaseGenerator {

	private programs: PublicKey[] = []

	constructor(programs: string[]) {
		super('mempool')
		this.registerProgram(programs)
	}

	public registerProgram(programs: string[]) {
		this.programs = programs.map(program => new PublicKey(program))
	}

  public async* listen(): AsyncGenerator<TxPool> {
		if(this.programs.length < 0) { return }

		const generators: AsyncGenerator<VersionedTransaction[]>[] = [];

		for (const searcherClient of searcherClients) {
			generators.push(this.getProgramUpdates(searcherClient));
		}
		
		const updates = fuseGenerators(generators)

		for await (const update of updates) {
			for(const tx of update) {
				const message = tx.message
				yield {
					mempoolTxns: {
						source: 'Jito mempool',
						signature: bs58.encode(tx.signatures[0]),
						accountKeys: message.staticAccountKeys.map((e: any) => e.toBase58()),
						recentBlockhash: message.recentBlockhash,
						instructions: message.compiledInstructions.map((e: any) => {
							return {
								programIdIndex: e.programIdIndex,
								accounts: e.accountKeyIndexes,
								data: e.data
							}
						}),
						innerInstructions: [],
						addressTableLookups: message.addressTableLookups.map((e: any) => {
							return {
								accountKey: e.accountKey.toBase58(),
								writableIndexes: e.writableIndexes,
								readonlyIndexes: e.readonlyIndexes
							}
						}),
						preTokenBalances: [],
						postTokenBalances: [],
						computeUnitsConsumed: 0
					},
					timing: {
						listened: new Date().getTime(),
						preprocessed: 0,
						processed: 0,
						send: 0
					}
				}
			}
		}
  }
  
  private getProgramUpdates(searcherClient: SearcherClient) {
		return searcherClient.programUpdates(this.programs, [], (error) => {
			logger.error(error);
			throw error;
		})
	}
}
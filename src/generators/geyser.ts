import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { TxPool } from "../types";
import { BaseGenerator } from "./base-generator";
import { ClientDuplexStream } from "@grpc/grpc-js";
import { BotError } from "../types/error";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { logger } from "../utils/logger";
import { BN } from "bn.js";

export type RequestAccounts = {
	name: string,
	owner: string[],
	account: string[],
	filters: any[]
}

export class GeyserPool extends BaseGenerator {

	private gRequest: SubscribeRequest = {
		slots: {
			slots: {}
		},
		accounts: {},
		transactions: {},
		blocks: {},
		blocksMeta: {},
		accountsDataSlice: [],
		entry: {},
		commitment: CommitmentLevel.PROCESSED
	};

	private client: Client
	private stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate> | undefined

	constructor(url: string, apiKey: string) {
		super()
		this.client = new Client(url, apiKey)
		this.connect()
	}

	private async connect() {
		try {
			this.stream = await this.client.subscribe();
		} catch(e) {
			this.connect()
		}
	}

	addProgram = (request: RequestAccounts) => {
		this.gRequest.accounts[request.name] = {
			owner: request.owner,
			filters: request.filters,
			account: request.account
		}
		this.write()
	}

	addTransaction = (key: string, request: SubscribeRequestFilterTransactions) => {
		this.gRequest.transactions[key] = {
			vote: request.vote,
			failed: request.failed,
			accountInclude: request.accountInclude,
			accountExclude: request.accountExclude,
			accountRequired: request.accountRequired
		}
		this.write()
	}

	removeProgram = (name: string) => {
		delete this.gRequest.accounts[name]
		this.write()
	}

	getLatestBlockhash = (commitment: CommitmentLevel) => {
		return this.client.getLatestBlockhash(commitment)
	}

	private async write() {
		await this.connect(); 
		await new Promise<void>((resolve, reject) => {
			if(!this.stream) { reject(BotError.GRPC_STREAM_NOT_INITIALISED) }
			
			this.stream?.write(this.gRequest, (err: any) => {
				if (err === null || err === undefined) {
					resolve();
				} else {
					reject(err);
				}
			});
		});
	}

  public async* listen(): AsyncGenerator<TxPool> {
		await this.connect()
		try {
      while (true) {
        const data = await this.waitForData(this.stream)
				const message = data.transaction.transaction.message
				yield {
					mempoolTxns: {
						signature: bs58.encode(data.transaction.signature),
						accountKeys: message.accountKeys.map((e: any) => bs58.encode(e)),
						recentBlockhash: bs58.encode(message.recentBlockhash),
						instructions: message.instructions.map((e: any) => {
							return {
								programIdIndex: e.programIdIndex,
								accounts: Array.from(e.accounts),
								data: e.data
							}
						}),
						addressTableLookups: message.addressTableLookups.map((e: any) => {
							return {
								accountKey: bs58.encode(e.accountKey),
								writableIndexes: Array.from(e.writableIndexes),
								readonlyIndexes: Array.from(e.readonlyIndexes)
							}
						}),
						preTokenBalances: data.transaction.meta.preTokenBalances.map((token: any) => {
							return {
								mint: token.mint,
								owner: token.owner,
								amount: new BN(token.uiTokenAmount.amount),
								decimal: token.uiTokenAmount.decimals
							}
						}),
						postTokenBalances: data.transaction.meta.postTokenBalances.map((token: any) => {
							return {
								mint: token.mint,
								owner: token.owner,
								amount: new BN(token.uiTokenAmount.amount),
								decimal: token.uiTokenAmount.decimals
							}
						})
					},
					timing: {
						listened: new Date().getTime(),
						preprocessed: 0,
						processed: 0,
						send: 0
					}
				}
      }
    } finally {
      // this.grpcStream.cancel();
    }
		
	}

	private waitForData(stream: any): Promise<any> {
    return new Promise((resolve, reject) => {
      stream.on('data', (d: any) => {
				if(d && d.transaction) {
					resolve(d.transaction)
				}
			});
      stream.on('error', (error: Error) => reject(error));
    });
  }
}
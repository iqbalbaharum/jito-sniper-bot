import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { ChannelOptions, ClientDuplexStream } from "@grpc/grpc-js";
import { BotError } from "../types/error";
import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { TxPool } from "../types";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { BN } from "bn.js";

export type RequestAccounts = {
	name: string,
	owner: string[],
	account: string[],
	filters: any[]
}

export class BotgRPC {
	
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

	constructor(endpoint: string, token: string) {
		this.client = new Client(endpoint, token, {
			'grpc.keepalive_time_ms': 10_000,
			'grpc.keepalive_timeout_ms': 1000,
			'grpc.keepalive_permit_without_calls': 1
		} as ChannelOptions)
		this.connect()
	}

	private async connect() {
		try {
			this.stream = await this.client.subscribe();
		} catch(e) {
			this.connect()
		}
	}

	addAccount = (request: RequestAccounts) => {
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

	public async listen(callbackAcc: (arg0: any) => void, cbTransaction: (arg0: TxPool) => void) {
		await this.connect(); 
		this.stream?.on("data", (data) => {
			if(data && data.account) {
        		callbackAcc(data)
			}

			if(data && data.transaction) {
				const message = data.transaction.transaction.transaction.message
				cbTransaction({
					mempoolTxns: {
						source: 'geyser',
						filter: data.filters,
						signature: bs58.encode(data.transaction.transaction.signature),
						accountKeys: message.accountKeys.map((e: any) => bs58.encode(e)),
						recentBlockhash: bs58.encode(message.recentBlockhash),
						instructions: message.instructions.map((e: any) => {
							return {
								programIdIndex: e.programIdIndex,
								accounts: Array.from(e.accounts),
								data: e.data
							}
						}),
						innerInstructions: data.transaction.transaction.meta.innerInstructions,
						addressTableLookups: message.addressTableLookups.map((e: any) => {
							return {
								accountKey: bs58.encode(e.accountKey),
								writableIndexes: Array.from(e.writableIndexes),
								readonlyIndexes: Array.from(e.readonlyIndexes)
							}
						}),
						preTokenBalances: data.transaction.transaction.meta.preTokenBalances.map((token: any) => {
							return {
								mint: token.mint,
								owner: token.owner,
								amount: new BN(token.uiTokenAmount.amount),
								decimal: token.uiTokenAmount.decimals
							}
						}),
						postTokenBalances: data.transaction.transaction.meta.postTokenBalances.map((token: any) => {
							return {
								mint: token.mint,
								owner: token.owner,
								amount: new BN(token.uiTokenAmount.amount),
								decimal: token.uiTokenAmount.decimals
							}
						}),
						computeUnitsConsumed: data.transaction.transaction.meta.computeUnitsConsumed
					},
					timing: {
						listened: new Date().getTime(),
						preprocessed: 0,
						processed: 0,
						send: 0
					}
				})
			}
		});

		const streamClosed = new Promise<void>((resolve, reject) => {
			this.stream?.on("error", (error) => {
				reject(error);
				this.stream?.end();
			});
			this.stream?.on("end", () => {
				resolve();
			});
			this.stream?.on("close", () => {
				resolve();
			});
			this.stream?.on("status", () => {
				resolve();
			});
		});

		await streamClosed;
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

	private async* generate(): AsyncGenerator<TxPool> {

	}
}
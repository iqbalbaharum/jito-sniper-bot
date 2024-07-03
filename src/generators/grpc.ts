import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { TxPool } from "../types";
import { BaseGenerator } from "./base-generator";
import { ChannelOptions, ClientDuplexStream } from "@grpc/grpc-js";
import { BotError } from "../types/error";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { logger } from "../utils/logger";
import { BN } from "bn.js";
import { Status } from "@grpc/grpc-js/build/src/constants";
import { CompressionAlgorithms } from "@grpc/grpc-js/build/src/compression-algorithms";

export type RequestAccounts = {
	name: string,
	owner: string[],
	account: string[],
	filters: any[]
}

export class GrpcGenerator extends BaseGenerator {

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

	private _client: Client
	private stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate> | undefined

	get client() : Client {
		return this._client
	}

	constructor(streamName: string, geyserUrl: string, geyserApiKey: string) {
		super(streamName)
		this._client = new Client(geyserUrl, geyserApiKey, {
			'grpc.keepalive_time_ms': 3300000,
			'grpc.keepalive_timeout_ms': 20000,
			'grpc.keepalive_permit_without_calls': 1,
			'grpc.max_concurrent_streams': 100,
			'grpc.max_connection_idle_ms': 3660000,
			'grpc.max_connection_age_ms': 3600000,
			'grpc.max_connection_age_grace_ms': 60000, 
			'grpc.initial_reconnect_backoff_ms': 1000,
			'grpc.max_reconnect_backoff_ms': 120000,
			'grpc.enable_retries': 1,
			'grpc.per_rpc_retry_buffer_size': 1048576,
			'grpc.retry_buffer_size': 4194304,
			'grpc.max_send_message_length': 10485760,
			'grpc.max_receive_message_length': 10485760,
			'grpc.enable_http_proxy': 0,
			'grpc.dns_min_time_between_resolutions_ms': 30000,
			'grpc.default_compression_algorithm': CompressionAlgorithms.gzip,
			'grpc.enable_channelz': 0,
			'grpc.client_idle_timeout_ms': 300000
		} as ChannelOptions)
	}

	private async connect() {
		try {
			this.stream = await this._client.subscribe()
			this.stream.on('status', async status => {
				switch(status.code) {
					case Status.CANCELLED:
					case Status.UNAVAILABLE:
						logger.warn(`Stream status: ${status.details}`)
						this.stream?.resume()
				}
			});
	
			this.stream.on('error', async error => {
				console.log(error)
			});

			setInterval(async() => {
				await this.client.ping(10)
			}, 6000)
		} catch(e:any) {
			console.log(e.toString())
			this.connect()
		}
	}

	addProgram = (request: RequestAccounts) => {
		this.gRequest.accounts[request.name] = {
			owner: request.owner,
			filters: request.filters,
			account: request.account
		}
		// this.write()
	}

	addTransaction = (key: string, request: SubscribeRequestFilterTransactions) => {
		this.gRequest.transactions[key] = {
			vote: request.vote,
			failed: request.failed,
			accountInclude: request.accountInclude,
			accountExclude: request.accountExclude,
			accountRequired: request.accountRequired
		}
		// this.write()
	}

	addSignature = (signature: string) => {
		this.gRequest.transactions[signature] = {
			vote: false,
			failed: false,
			signature,
			accountInclude: [],
			accountExclude: [],
			accountRequired: []
		} as SubscribeRequestFilterTransactions
		// this.write()
	}

	removeProgram = (name: string) => {
		delete this.gRequest.accounts[name]
		// this.write()
	}

	getLatestBlockhash = (commitment: CommitmentLevel) => {
		return this._client.getLatestBlockhash(commitment)
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
		await this.write()

		if(!this.stream) { return }

		for await(const data of this.stream) {
			if(data && data.transaction) {
				const message = data.transaction.transaction.transaction.message
				yield {
					mempoolTxns: {
						source: this.streamName,
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
				}
			}
		}
	}

	public async unsubscribe() {
		if (this.stream) {
			this.stream.cancel();
			this.stream.end();
			this.stream = undefined;
		}
		
		logger.info(`Unsubscribed from stream: ${this.streamName}`);
	}
}
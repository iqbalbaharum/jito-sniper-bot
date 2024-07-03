import { ChannelOptions, ClientDuplexStream } from "@grpc/grpc-js";
import { GrpcEnv } from "../adapter/grpcs";
import { ConcurrentSet } from "../utils/concurrent-set";
import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { CompressionAlgorithms } from "@grpc/grpc-js/build/src/compression-algorithms";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { BN } from "bn.js";
import { TxAddressLookupTable, TxBalance, TxInnerInstruction, TxInstruction, TxPool } from "../types";
import { BotError } from "../types/error";

type MempoolStream = {
	name: string,
	stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>
}

export class BotMempool {

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

  pools: ConcurrentSet<string>
	sources: GrpcEnv[] = []
	private streams: MempoolStream[]
	private callbacks: Array<(data: TxPool) => void>
	

	constructor(sources: GrpcEnv[]) {
		this.pools = new ConcurrentSet<string>(50 * 60000)
		this.sources = sources
		this.streams = []
		this.callbacks = []
	}

	async start() {
		return new Promise(async (resolve, reject) => {
			for(let i = 0; i < this.sources.length; i++) {
				const env = this.sources[i]
				const client = new Client(env.url, env.token, {
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
	
				let stream = await client.subscribe()
				let name = `${i}`
				stream.on('data', (data) => {
					let tx = this.process(name, data)
					if(tx) {
						this.listen(tx)
					}
				})
				
				this.streams.push({
					name: `${i}`,
					stream
				})
			}

			resolve(this.streams)
		})
	}

	addCallback(callback: (data: TxPool) => void): void {
		this.callbacks.push(callback);
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

	async listen(txPool: TxPool) {
		if(txPool && !this.pools.has(txPool.mempoolTxns.signature)) {
			this.pools.add(txPool.mempoolTxns.signature)

			for(const callback of this.callbacks) {
				callback(txPool)
			}
		}
	}

	private async write() {
		await new Promise<void>((resolve, reject) => {
			for(const stream of this.streams) {
				stream?.stream.write(this.gRequest, (err: any) => {
					if (err === null || err === undefined) {
						resolve();
					} else {
						reject(err);
					}
				});
			}
		});
	}

	private process(name: string, data: SubscribeUpdate) : TxPool | undefined {
		if(data && 
			data.transaction && 
			data.transaction.transaction && 
			data.transaction.transaction.transaction && 
			data.transaction.transaction.transaction.message && 
			data.transaction.transaction.meta) {
			const message = data.transaction.transaction.transaction.message
			const txPool = {
				mempoolTxns: {
					source: name,
					filter: data.filters,
					signature: bs58.encode(data.transaction.transaction.signature),
					accountKeys: message.accountKeys.map((e: any) => bs58.encode(e)),
					recentBlockhash: bs58.encode(message.recentBlockhash),
					instructions: message.instructions.map((e: any) => {
						return {
							programIdIndex: e.programIdIndex,
							accounts: Array.from(e.accounts) as number[],
							data: e.data
						}
					}),
					innerInstructions: data.transaction.transaction.meta.innerInstructions.map((i) => {
						return {
							instructions: i.instructions.map(ei => {
								return {
									accounts: ei.accounts,
									programIdIndex: ei.programIdIndex,
									data: ei.data
								};
							})
						} as unknown as TxInnerInstruction
					}) ?? [],
					addressTableLookups: message.addressTableLookups.map((e: any) => {
						return {
							accountKey: bs58.encode(e.accountKey),
							writableIndexes: Array.from(e.writableIndexes),
							readonlyIndexes: Array.from(e.readonlyIndexes)
						} as TxAddressLookupTable
					}),
					preTokenBalances: data.transaction.transaction.meta.preTokenBalances.map((token: any) => {
						return {
							mint: token.mint,
							owner: token.owner,
							amount: new BN(token.uiTokenAmount.amount),
							decimals: token.uiTokenAmount.decimals
						} as TxBalance
					}),
					postTokenBalances: data.transaction.transaction.meta.postTokenBalances.map((token: any) => {
						return {
							mint: token.mint,
							owner: token.owner,
							amount: new BN(token.uiTokenAmount.amount),
							decimals: token.uiTokenAmount.decimals
						} as TxBalance
					}),
					computeUnitsConsumed: parseInt(data.transaction.transaction.meta.computeUnitsConsumed!)
				},
				timing: {
					listened: new Date().getTime(),
					preprocessed: 0,
					processed: 0,
					send: 0
				},
				blockTime: 0
			}
			

			return txPool
		}

		return undefined
	}
}
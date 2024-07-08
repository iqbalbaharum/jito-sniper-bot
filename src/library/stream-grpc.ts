import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { ChannelOptions, ClientDuplexStream } from "@grpc/grpc-js";
import { BotError } from "../types/error";
import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { TxAddressLookupTable, TxBalance, TxInnerInstruction, TxPool } from "../types";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { BN } from "bn.js";
import { Status } from "@grpc/grpc-js/build/src/constants";
import { logger } from "../utils/logger";
import { CompressionAlgorithms } from "@grpc/grpc-js/build/src/compression-algorithms";
import { BaseStream } from "./base-stream";

export type RequestAccounts = {
	name: string,
	owner: string[],
	account: string[],
	filters: any[]
}

export type RequestBlock = {
	accounts: string[]
}

export class BotTritonGrpcStream extends BaseStream {
	
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
	private name: string
	callback: (txPool: TxPool) => void

	constructor(name: string, endpoint: string, token: string) {

		super();

		this.name = name
		
		this.client = new Client(endpoint, token, {
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

		this.callback = () => {}
	}

	addCallback(cb: (tx: TxPool) => void) {
		this.callback = cb
	}

	async listen(addresses: string[]) {
		try {
			this.stream = await this.client.subscribe();
			this.addTransaction(addresses[0], addresses)

			this.stream.on('status', async status => {
				switch(status.code) {
					case Status.CANCELLED:
					case Status.UNAVAILABLE:
						logger.warn(`Stream status: ${status.details}`)
						this.stream?.resume()
				}
			})

			this.stream.on('data', (data) => {
				const tx = this.process(data)
				if(tx && this.callback) {
					this.callback(tx)
				}
			})
		} catch(e) {
			console.log(e)
		}
	}

	async stop() {
		if(this.stream) {
			this.stream?.end()
			this.stream = undefined
		}
	}

	private addTransaction = async (key: string, address: string[]) => {
		this.gRequest.transactions[key] = {
			vote: false,
			failed: false,
			accountInclude: address,
			accountExclude: [],
			accountRequired: []
		}

		await this.write()
	}

	private async write() {
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

	private process(data: SubscribeUpdate) : TxPool | undefined {
		if(data && 
			data.transaction && 
			data.transaction.transaction && 
			data.transaction.transaction.transaction && 
			data.transaction.transaction.transaction.message && 
			data.transaction.transaction.meta) {
			const message = data.transaction.transaction.transaction.message
			const txPool = {
				mempoolTxns: {
					source: this.name,
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
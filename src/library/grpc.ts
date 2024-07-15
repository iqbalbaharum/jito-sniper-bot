import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { ChannelOptions, ClientDuplexStream } from "@grpc/grpc-js";
import { BotError } from "../types/error";
import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { TxPool } from "../types";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { BN } from "bn.js";
import { Status } from "@grpc/grpc-js/build/src/constants";
import { logger } from "../utils/logger";
import { CompressionAlgorithms } from "@grpc/grpc-js/build/src/compression-algorithms";

export type RequestAccounts = {
	name: string,
	owner: string[],
	account: string[],
	filters: any[]
}

export type RequestBlock = {
	accounts: string[]
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
			'grpc.keepalive_time_ms': 30000,
			'grpc.keepalive_timeout_ms': 20000,
			'grpc.keepalive_permit_without_calls': 1,
			'grpc.max_concurrent_streams': 100,
			'grpc.max_connection_idle_ms': 600000,
			'grpc.max_connection_age_ms': 1200000,
			'grpc.max_connection_age_grace_ms': 300000,
			'grpc.initial_reconnect_backoff_ms': 500,
			'grpc.max_reconnect_backoff_ms': 60000,
			'grpc.enable_retries': 1,
			'grpc.per_rpc_retry_buffer_size': 2097152,
			'grpc.retry_buffer_size': 8388608,
			'grpc.max_send_message_length': 16777216,
			'grpc.max_receive_message_length': 16777216,
			'grpc.enable_http_proxy': 0,
			'grpc.dns_min_time_between_resolutions_ms': 10000,
			'grpc.default_compression_algorithm': CompressionAlgorithms.gzip,
			'grpc.enable_channelz': 0,
			'grpc.client_idle_timeout_ms': 600000
		} as ChannelOptions)
		this.connect()

		setInterval(async() => {
			await this.client.ping(10)
		}, 6000)
	}

	private async connect() {
		try {
			this.stream = await this.client.subscribe();
			this.stream.on('status', async status => {
				switch(status.code) {
					case Status.CANCELLED:
					case Status.UNAVAILABLE:
						logger.warn(`Stream status: ${status.details}`)
						this.stream?.resume()
				}
			})
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
			signature: request.signature,
			accountInclude: request.accountInclude,
			accountExclude: request.accountExclude,
			accountRequired: request.accountRequired
		}
		
		this.write()
	}

	setCommitment (commitment: CommitmentLevel) {
		this.gRequest.commitment = commitment

		this.write()
	}

	addBlock = (request: RequestBlock) => {
		this.gRequest.blocks['blocks'] = {
			includeTransactions: false,
      		includeAccounts: false,
			accountInclude: request.accounts
		}

		this.write()
	}
	
	// addSlot = () => {
	// 	this.gRequest.slots['incoming_slots'] = {}

	// 	this.write()
	// }

	removeProgram = (name: string) => {
		delete this.gRequest.accounts[name]
		this.write()
	}

	async getLatestBlockhash (commitment: string) {
		let c

		switch(commitment) {
			case 'processed':
				c = CommitmentLevel.PROCESSED
				break
			case 'confirmed':
				c = CommitmentLevel.CONFIRMED
				break
			default:
				c =CommitmentLevel.FINALIZED
		}

		return await this.client.getLatestBlockhash(c)
	}

	public async listen(
		callbackAcc: (arg0: any) => void, 
		cbTransaction: (arg0: TxPool) => void, 
		cbBlock: (arg0: any) => void) {
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

			if(data && data.block) {
				cbBlock(data)
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
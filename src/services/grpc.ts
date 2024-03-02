import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { config } from "../utils";
import { ClientDuplexStream } from "@grpc/grpc-js";
import { BotError } from "../types/error";
import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";

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

	constructor() {
		this.client = new Client(config.get('triton_one_url'), config.get('triton_one_api_key'))
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

	public async listen(callbackAcc: (arg0: any) => void, cbTransaction: (arg0: any) => void) {
		await this.connect(); 
		this.stream?.on("data", (d) => {
			if(d && d.account) {
        callbackAcc(d)
			}

			if(d && d.transaction) {
				cbTransaction(d.transaction)
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
}
import { Commitment, ConfirmedTransactionMeta, Connection, Context, Logs, PublicKey, VersionedTransaction, VersionedTransactionResponse } from "@solana/web3.js";
import { confirmedConnection } from "../adapter/rpc";
import { TxInnerInstruction, TxInstruction, TxPool } from "../types";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";
import { BaseGenerator } from "./base-generator";
import { BN } from "bn.js";
import { logger } from "../utils/logger";
import { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import WebSocket from 'ws'
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

export class HeliusWebSocketGenerator extends BaseGenerator {
  private apiKey: string
  private isListening: boolean = false;
	private accounts: string[] = []

  constructor(streamName: string, apiKey: string, accounts: string[]) {
    super(streamName);
		this.apiKey = apiKey
		this.accounts = accounts
  }

	private sendRequest(ws: WebSocket) {
		let request = {
			jsonrpc: "2.0",
			id: 420,
			method: "transactionSubscribe",
			params: [
					{
						vote: false,
						failed: false,
						accountInclude: this.accounts,
						accountRequired: this.accounts
					},
					{
							commitment: "processed",
							encoding: "base64",
							transactionDetails: "full",
							showRewards: true,
							maxSupportedTransactionVersion: 0
					}
			]
		}

		ws.send(JSON.stringify(request))
	}

  private formatTransaction(tx: VersionedTransaction, meta: ConfirmedTransactionMeta): TxPool {

    const message = tx.message as any;

    const preTokenBalances = meta?.preTokenBalances?.map((token: any) => ({
      mint: token.mint,
      owner: token.owner,
      amount: new BN(token.uiTokenAmount.amount),
      decimals: token.uiTokenAmount.decimals,
    })) || [];

    const postTokenBalances = meta?.postTokenBalances?.map((token: any) => ({
      mint: token.mint,
      owner: token.owner,
      amount: new BN(token.uiTokenAmount.amount),
      decimals: token.uiTokenAmount.decimals,
    })) || [];

		let formattedTx = {
			mempoolTxns: {
        source: this.streamName,
        signature: bs58.encode(tx.signatures[0]),
        accountKeys: message.staticAccountKeys.map((e: any) => e.toBase58()),
        recentBlockhash: message.recentBlockhash,
        instructions: message.compiledInstructions.map((e: any) => {
          return {
            programIdIndex: e.programIdIndex,
            accounts: e.accountKeyIndexes || [],
            data: e.data
          };
        }),
        innerInstructions: [] as TxInnerInstruction[],
        addressTableLookups: message.addressTableLookups.map((e: any) => {
          return {
            accountKey: e.accountKey.toBase58(),
            writableIndexes: e.writableIndexes || [],
            readonlyIndexes: e.readonlyIndexes || []
          };
        }),
        preTokenBalances,
        postTokenBalances,
        computeUnitsConsumed: meta?.computeUnitsConsumed || 0
      },
      timing: {
        listened: new Date().getTime(),
        preprocessed: 0,
        processed: 0,
        send: 0
      }
    };

    return formattedTx
  }

  public async* listen(): AsyncGenerator<TxPool> {
    if (this.isListening) {
      throw new Error('Already listening');
    }

    this.isListening = true;

    try {
      while (true) {
        const tx = await this.waitForData();
				const decodedTx = Buffer.from(tx.transaction.transaction[0], 'base64');
				const vTx = VersionedTransaction.deserialize(decodedTx);
        yield this.formatTransaction(vTx, tx.transaction.meta);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isListening = false;
    }
  }

  private waitForData(): Promise<{signature: string, transaction: any}> {
    return new Promise((resolve, reject) => {
			try {
				const ws = new WebSocket(`wss://atlas-mainnet.helius-rpc.com?api-key=${this.apiKey}`);
	
				ws.on('open', () => {
					this.sendRequest(ws);
				});
	
				ws.on('message', (data) => {
					const messageStr = data.toString('utf8');
					try {
						const response = JSON.parse(messageStr);
						if(response.params) {
							resolve(response.params.result)
						}
					} catch (e) {
						logger.error('Failed to parse JSON:', e);
						reject(e);
					}
				});
	
				ws.on('error', (err) => {
					logger.error('WebSocket error:', err);
				});
	
				ws.on('close', () => {
					logger.info('WebSocket is closed');
					this.isListening = false;
				});
			} catch (e) {
				logger.error(e);
			}
    });
  }
}

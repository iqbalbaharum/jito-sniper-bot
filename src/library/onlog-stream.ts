import Client, { CommitmentLevel, SubscribeRequest, SubscribeRequestFilterTransactions, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { ChannelOptions, ClientDuplexStream } from "@grpc/grpc-js";
import { BotError } from "../types/error";
import { LIQUIDITY_STATE_LAYOUT_V4, MAINNET_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import { TxAddressLookupTable, TxBalance, TxInnerInstruction, TxPool } from "../types";
import { BN } from "bn.js";
import { BaseStream } from "./base-stream";
import { Commitment, Connection, Logs, PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { confirmedConnection } from "../adapter/rpc";
import { config } from "../utils";

export class BotOnLogStream extends BaseStream {
    connection: Connection;
    listenerId: number
	private name: string
	callback: (txPool: TxPool) => void

	constructor(name: string, connection: Connection) {

		super();

		this.name = name
        this.listenerId = -1
		this.connection = connection;

		this.callback = () => {}
	}

	addCallback(cb: (tx: TxPool) => void) {
		this.callback = cb
	}

	async listen(addresses: string[]) {
		try {
			this.listenerId = this.connection.onLogs(
                new PublicKey(addresses[0]),
                async (logs: Logs,) => {
                  if (logs.err) {
                    return;
                  }
        
                  let logSequence = [];
                  for (const l of logs.logs) {
                    if (l.includes('InitializeInstruction2')) {
                      try {
                        const tx = await confirmedConnection.getTransaction(logs.signature, {
                          maxSupportedTransactionVersion: 0,
                        });

                        if(tx && this.callback) {
                            const txPool = this.process(tx)
                            this.callback(txPool)
                        }

                      } catch (e) {
                        console.error(e);
                      }
                    }
        
                    if (l.includes('Transfer')) {
                      logSequence.push('T');
                    } else if (l.includes('Burn')) {
                      logSequence.push('B');
                    }
                  }
        
                  if (logSequence.join(',') === 'T,T,B') {
                    try {
                      const tx = await confirmedConnection.getTransaction(logs.signature, {
                        maxSupportedTransactionVersion: 0,
                      });
                      
                      if(tx && this.callback) {
                        const txPool = this.process(tx)
                        this.callback(txPool)
                      }

                    } catch (e) {
                      console.error(e);
                    }
                  }
                },
                config.get('default_commitment') as Commitment
              );
		} catch(e) {
			console.log(e)
		}
	}

	async stop() {
		if(this.listenerId > -1) {
			this.connection.removeOnLogsListener(this.listenerId)
			this.listenerId = -1
		}
	}

	private process(tx: VersionedTransactionResponse): TxPool {
        const message = tx.transaction.message;
    
        const preTokenBalances = tx.meta?.preTokenBalances?.map((token: any) => ({
          mint: token.mint,
          owner: token.owner,
          amount: new BN(token.uiTokenAmount.amount),
          decimals: token.uiTokenAmount.decimals,
        })) || [];
    
        const postTokenBalances = tx.meta?.postTokenBalances?.map((token: any) => ({
          mint: token.mint,
          owner: token.owner,
          amount: new BN(token.uiTokenAmount.amount),
          decimals: token.uiTokenAmount.decimals,
        })) || [];
    
        return {
          mempoolTxns: {
            source: this.name,
            signature: tx.transaction.signatures[0],
            accountKeys: message.staticAccountKeys.map((e: any) => e.toBase58()),
            recentBlockhash: message.recentBlockhash,
            instructions: message.compiledInstructions.map((e: any) => {
              return {
                programIdIndex: e.programIdIndex,
                accounts: e.accountKeyIndexes || [],
                data: e.data
              };
            }),
            innerInstructions: [],
            addressTableLookups: message.addressTableLookups.map((e: any) => {
              return {
                accountKey: e.accountKey.toBase58(),
                writableIndexes: e.writableIndexes || [],
                readonlyIndexes: e.readonlyIndexes || []
              };
            }),
            preTokenBalances,
            postTokenBalances,
            computeUnitsConsumed: tx.meta?.computeUnitsConsumed || 0
          },
          timing: {
            listened: new Date().getTime(),
            preprocessed: 0,
            processed: 0,
            send: 0
          }
        };
      }
}
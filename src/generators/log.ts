import { Commitment, Connection, Context, Logs, PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { confirmedConnection } from "../adapter/rpc";
import { TxPool } from "../types";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";
import { BaseGenerator } from "./base-generator";
import { BN } from "bn.js";
import { logger } from "../utils/logger";

export class Web3JSOnLog extends BaseGenerator {
  programId: PublicKey;
  connection: Connection;
  private isListening: boolean = false;

  constructor(streamName: string, connection: Connection, programId: string) {
    super(streamName);
    this.connection = connection;
    this.programId = new PublicKey(programId);
  }

  private formatTransaction(tx: VersionedTransactionResponse): TxPool {
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
        source: this.streamName,
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

  public async* listen(): AsyncGenerator<TxPool> {
    if (this.isListening) {
      throw new Error('Already listening');
    }

    this.isListening = true;

    try {
      while (true) {
        const tx = await this.waitForData();
        yield this.formatTransaction(tx);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isListening = false;
    }
  }

  private waitForData(): Promise<VersionedTransactionResponse> {
    return new Promise((resolve, reject) => {
      const listenerId = this.connection.onLogs(
        this.programId,
        async (logs: Logs, context: Context) => {
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
                if (tx) {
                  resolve(tx);
                  this.connection.removeOnLogsListener(listenerId);
                  return;
                }
              } catch (e) {
                console.error(e);
                reject(e);
                this.connection.removeOnLogsListener(listenerId);
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
              if (tx) {
                resolve(tx);
                this.connection.removeOnLogsListener(listenerId);
                return;
              }
            } catch (e) {
              console.error(e);
              reject(e);
              this.connection.removeOnLogsListener(listenerId);
            }
          }
        },
        config.get('default_commitment') as Commitment
      );
    });
  }
}

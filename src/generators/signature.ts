import { Commitment, Connection, Context, Logs, PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { confirmedConnection } from "../adapter/rpc";
import { TxInnerInstruction, TxInstruction, TxPool } from "../types";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, config } from "../utils";
import { BaseGenerator } from "./base-generator";
import { BN } from "bn.js";
import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";

export class SignatureGenerator extends BaseGenerator {
  programId: string
  connection: Connection

  constructor(streamName: string, connection: Connection, programId: string) {
		super(streamName)
    this.connection = connection
		this.programId = programId
	}

  private formatTransaction(tx: VersionedTransactionResponse): TxPool {
    const message = tx.transaction.message

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
          }
        }),
        innerInstructions: tx.meta?.innerInstructions?.map((i) => {
          return {
            instructions: i.instructions.map(ei => {
              return {
                accounts: ei.accounts,
                programIdIndex: ei.programIdIndex,
                data: bs58.decode(ei.data).toString('hex')
              };
            })
          } as unknown as TxInnerInstruction
        }) ?? [],
        addressTableLookups: message.addressTableLookups.map((e: any) => {
          return {
            accountKey: e.accountKey.toBase58(),
            writableIndexes: e.writableIndexes || [],
            readonlyIndexes: e.readonlyIndexes || []
          }
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
    }
  }

  public async* listen(): AsyncGenerator<TxPool> {
    try {
      while (true) {
        const tx = await this.waitForData(this.programId)
        yield this.formatTransaction(tx)
      }
    } catch(e) {
      console.log(e)
    }
  } 

  private waitForData(signature: string): Promise<VersionedTransactionResponse> {
    return new Promise((resolve) => {
			this.connection.getTransaction(signature, {
				maxSupportedTransactionVersion: 0,
			}).then((tx) => {
				if(tx) {
					resolve(tx)
				}
			})
    })
	}
}
import { Commitment, Connection, Context, KeyedAccountInfo, Logs, PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { confirmedConnection } from "../adapter/rpc";
import { TxPool } from "../types";
import { RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS, config } from "../utils";
import { BN } from "bn.js";
import { LIQUIDITY_STATE_LAYOUT_V4, LiquidityStateLayoutV4, LiquidityStateV4 } from "@raydium-io/raydium-sdk";
import { BaseStateGenerator } from "./base-state-generator";

export class RaydiumLiquidityGenerator extends BaseStateGenerator {
  programId: PublicKey
  connection: Connection

  constructor(streamName: string, connection: Connection, programId: PublicKey) {
		super(streamName)
    this.connection = connection
		this.programId = programId
  }

  public async* listen(): AsyncGenerator<KeyedAccountInfo> {
    try {
      while (true) {
        const tx = await this.waitForData()
        yield tx
      }
    } catch(e) {
      console.log(e)
    }
  } 

  private waitForData() : Promise<KeyedAccountInfo> {
    return new Promise((resolve, reject) => {
      this.connection.onProgramAccountChange(
        this.programId,
        (updatedAccountInfo: KeyedAccountInfo) => {
            resolve(updatedAccountInfo)
        },
        config.get('default_commitment') as Commitment,
        [
            { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
            {
              memcmp: {
                offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
                bytes: WSOL_ADDRESS,
              },
            },
            {
              memcmp: {
                offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
                bytes: 'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX',
              },
            },
          ]
      )
    });
  }
}
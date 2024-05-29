/**
 * This tools is to speed up the process
 * listen to newly created pool state and store it in redis, that any user able to retrieve it
 */
import { Commitment, KeyedAccountInfo, PublicKey } from "@solana/web3.js";
import { redisClient } from "../adapter/redis";
import { connection, connectionAlt1 } from "../adapter/rpc";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS, config as SystemConfig, RAYDIUM_AUTHORITY_V4_ADDRESS } from "../utils";
import { GrpcGenerator } from "../generators/grpc";
import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { BotgRPC } from "../library/grpc";
import { blockhasherv2 } from "../adapter/storage";

const GRPC_URL = SystemConfig.get('grpc_1_url')
const GRPC_TOKEN = SystemConfig.get('grpc_1_token')

async function main() {
    let botGrpc = new BotgRPC(GRPC_URL, GRPC_TOKEN)

    botGrpc.addTransaction('raydium_tx', {
      vote: false,
      failed: false,
      accountInclude: [RAYDIUM_AUTHORITY_V4_ADDRESS],
      accountExclude: [],
      accountRequired: [],
    })
    botGrpc.setCommitment(CommitmentLevel.CONFIRMED)

    botGrpc.listen(
      () => {},
      (txPool) => {
        blockhasherv2.set({
          recentBlockhash: txPool.mempoolTxns.recentBlockhash
        })
      },
      () => {},
    )
}



main()
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
import { blockhasher, blockhasherv2 } from "../adapter/storage";
import { grpcs } from "../adapter/grpcs";

let env = grpcs[0]

async function main() {
    let botGrpc = new BotgRPC(env.url, env.token)

    botGrpc.addBlock({accounts: []})
    botGrpc.setCommitment(CommitmentLevel.CONFIRMED)

    botGrpc.listen(
      () => {},
      () => {},
      (transaction) => {
        if(transaction.block.slot) {
          blockhasher.set({
            recentBlockhash: transaction.block.blockhash,
            latestSlot: parseInt(transaction.block.slot),
            latestBlockHeight: parseInt(transaction.block.blockHeight.blockHeight)
          })
        }
      }
    )
}



main()
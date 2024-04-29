/**
 * This tools is to speed up the process
 * listen to newly created pool state and store it in redis, that any user able to retrieve it
 */
import { Commitment, KeyedAccountInfo, PublicKey } from "@solana/web3.js";
import { redisClient } from "../adapter/redis";
import { connection, connectionAlt1 } from "../adapter/rpc";
import { OPENBOOK_V1_ADDRESS, RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS, WSOL_ADDRESS, config as SystemConfig } from "../utils";
import { GrpcGenerator } from "../generators/grpc";
import Client, { CommitmentLevel } from "@triton-one/yellowstone-grpc";
import { BotgRPC } from "../services/grpc";
import { BlockHashStorage } from "../storage";

const GRPC_URL = SystemConfig.get('grpc_1_url')
const GRPC_TOKEN = SystemConfig.get('grpc_1_token')

async function main() {
    let botGrpc = new BotgRPC(GRPC_URL, GRPC_TOKEN)
    let blockhashStorage = new BlockHashStorage(redisClient)

    botGrpc.addBlock({accounts: []})
    botGrpc.setCommitment(CommitmentLevel.FINALIZED)

    botGrpc.listen(
      () => {},
      () => {},
      (transaction) => {
        if(transaction.block.slot) {
          blockhashStorage.set({
            recentBlockhash: transaction.block.blockhash,
            latestSlot: parseInt(transaction.block.slot),
            latestBlockHeight: parseInt(transaction.block.blockHeight.blockHeight)
          })
        }
      }
    )
}



main()
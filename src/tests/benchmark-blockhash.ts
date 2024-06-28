import { grpcs } from "../adapter/grpcs"
import { connection } from "../adapter/rpc"
import { BotgRPC } from "../library/grpc"
import { logger } from "../utils/logger"

async function main() {
    logger.info(`Benchmark getBlockhash`)

    let start
    let end
    let block

    logger.info(`Start getLatestBlockhash from RPC`)
    start = new Date().getTime()
    block = await connection.getLatestBlockhash('processed')
    end = new Date().getTime()
    logger.info(`Duration: ${end - start} ms`)

    logger.info(`Start getLatestBlockhash from RPC`)
    let grpc = new BotgRPC(grpcs[0].url, grpcs[0].token)

    start = new Date().getTime()
    block = await grpc.getLatestBlockhash('processed')
    end = new Date().getTime()
    
    logger.info(`Duration: ${end - start} ms`)

    logger.info(`End Benchmark`)
    process.exit(0)
}

main()
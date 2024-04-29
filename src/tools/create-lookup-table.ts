import { BotLookupTable, setupWSOLTokenAccount } from "../services";
import { blockhasher } from "../adapter/storage";
import { logger } from "../utils/logger";
import { connection } from "../adapter/rpc";

async function main() {
    const {ata} = await setupWSOLTokenAccount(false, 0)
    logger.info(`ATA: ${ata.toBase58()}`)

    const block = await connection.getLatestBlockhash('finalized')

    let {signature, lookupTableAddress} = await BotLookupTable.initializeRaydiumLookupTable(ata, block.blockhash)
    logger.info(`ALT: ${lookupTableAddress.toBase58()} | Signature: ${signature}`)
}

main()
import { payer } from "../adapter/payer"
import { logger } from "../utils/logger"

async function main() {
    logger.info(`Payer public Key: ${payer.publicKey}`)
}

main()
import { Keypair } from "@solana/web3.js";
import { config } from "../utils/config";
import bs58 from 'bs58'

const PAYER_KEYPAIR_SECRET = config.get('payer_keypair_secret')

const decodedKey = bs58.decode(PAYER_KEYPAIR_SECRET)
const payer = Keypair.fromSecretKey(decodedKey)

export { payer }
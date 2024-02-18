import { Keypair } from "@solana/web3.js";
import { config } from "../utils/config";
import bs58 from 'bs58'
import { SearcherClient, searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";

const BLOCK_ENGINE_URLS = config.get('block_engine_urls')
const AUTH_KEYPAIR_SECRET = config.get('auth_keypair_secret')

const decodedKey = bs58.decode(AUTH_KEYPAIR_SECRET)
const keypair = Keypair.fromSecretKey(decodedKey)

const searcherClients: SearcherClient[] = []

for (const url of BLOCK_ENGINE_URLS) {
    const client = searcherClient(url, keypair, {
      'grpc.keepalive_timeout_ms': 4000,
    });
    searcherClients.push(client);
}
  
// all bundles sent get automatically forwarded to the other regions.
// assuming the first block engine in the array is the closest one
const fastTrackSearcherClient = searcherClients[0]

export { fastTrackSearcherClient, searcherClients }
import { Keypair } from "@solana/web3.js";
import { config } from "../utils/config";
import bs58 from 'bs58'
import { SearcherClient, searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { logger } from "../utils/logger";

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
const mainSearcherClient = searcherClients[0]

export { mainSearcherClient, searcherClients }

// Send Transaction

export type JitoRegion = 'mainnet' | 'amsterdam' | 'frankfurt' | 'ny' | 'tokyo';

export const JitoEndpoints = {
    mainnet: 'https://mainnet.block-engine.jito.wtf',
    amsterdam: 'https://amsterdam.mainnet.block-engine.jito.wtf',
    frankfurt: 'https://frankfurt.mainnet.block-engine.jito.wtf',
    ny: 'https://ny.mainnet.block-engine.jito.wtf',
    tokyo: 'https://tokyo.mainnet.block-engine.jito.wtf',
};

export function getJitoEndpoint(region: JitoRegion | 'random') {
    let r = region as string
    if(region === 'random') {
        const regions = Object.keys(JitoEndpoints);
        const randomIndex = Math.floor(Math.random() * (regions.length - 1));
        r = regions[randomIndex];
        return JitoEndpoints[r as JitoRegion];
    } else {
        return JitoEndpoints[region];
    }
}

export async function sendTxUsingJito({
    serializedTx,
    region = 'mainnet'
}: {
    serializedTx: Uint8Array | Buffer | number[];
    region: JitoRegion | 'random';
}) {
    let rpcEndpoint = getJitoEndpoint(region);

    logger.info(`endpoint: ${rpcEndpoint}`)

    let encodedTx = bs58.encode(serializedTx);
    let payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "sendTransaction",
        params: [encodedTx]
    };

    let res = await fetch(`${rpcEndpoint}/api/v1/transactions`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }
    });

    let json = await res.json();

    if (json.error) {
        throw new Error(json.error.message);
    }
    
    return json;
}
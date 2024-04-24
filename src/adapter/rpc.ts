import { Connection } from "@solana/web3.js";
import { config } from "../utils/config";
import { RetryConnection } from "../utils/connection-retry";

// Non rate limiter (primary)
const HTTP_RPC_URL = config.get('http_rpc_url')
const WEBSOCKET_RPC_URL = config.get('websocket_rpc_url')

// Secondary
const HTTP_RPC_URL_2 = config.get('http_rpc_url_2')
const WEBSOCKET_RPC_URL_2 = config.get('websocket_rpc_url_2')

// Lite RPC
const LITE_RPC_URL = config.get('lite_rpc_url')
const LITE_RPC_WS_URL = config.get('lite_rpc_ws_url')

let connection = new RetryConnection(HTTP_RPC_URL, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
    wsEndpoint: WEBSOCKET_RPC_URL
})

let confirmedConnection: Connection = new Connection(HTTP_RPC_URL, {
    commitment: 'confirmed',
    disableRetryOnRateLimit: true,
    wsEndpoint: WEBSOCKET_RPC_URL
})

let connectionAlt1: Connection = new Connection(HTTP_RPC_URL_2, {
    commitment: 'processed',
    disableRetryOnRateLimit: true,
    wsEndpoint: WEBSOCKET_RPC_URL_2
})

let lite_rpc: Connection

if(LITE_RPC_URL) {
    lite_rpc = new Connection(LITE_RPC_URL, {
        commitment: 'processed',
        wsEndpoint: LITE_RPC_WS_URL
    })
}

// Bundle all rpcs
let httpOnlyRpcs: Connection[] = []

for(const urls of config.get('http_rpc_urls')) {
    let c = new Connection(urls, {
        commitment: 'processed'
    })

    httpOnlyRpcs.push(c)
}

export { connection, lite_rpc, confirmedConnection, connectionAlt1, httpOnlyRpcs }
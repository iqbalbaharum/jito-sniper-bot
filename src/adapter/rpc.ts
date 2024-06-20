import { Connection } from "@solana/web3.js";
import { config } from "../utils/config";
import { RetryConnection } from "../utils/connection-retry";

// Non rate limiter (primary)
const HTTP_RPC_URL = config.get('http_rpc_url')
const WEBSOCKET_RPC_URL = config.get('websocket_rpc_url')

// Secondary
const HTTP_RPC_URL_2 = config.get('http_rpc_url_2')
const WEBSOCKET_RPC_URL_2 = config.get('websocket_rpc_url_2')

// Send Tx only RPC
const SEND_TX_RPC_URL = config.get('send_tx_rpc_url')

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

let send_tx_rpcs: Connection[] = []

if(SEND_TX_RPC_URL) {
    for(const rpc of SEND_TX_RPC_URL) {
        send_tx_rpcs.push(new Connection(rpc))
    }
}

export { connection, send_tx_rpcs, confirmedConnection, connectionAlt1 }
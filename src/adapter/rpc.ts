import { Connection } from "@solana/web3.js";
import { config } from "../utils/config";

// Non rate limiter (primary)
const HTTP_RPC_URL = config.get('http_rpc_url')
const WEBSOCKET_RPC_URL = config.get('websocket_rpc_url')

// Secondary
const HTTP_RPC_URL_2 = config.get('http_rpc_url_2')
const WEBSOCKET_RPC_URL_2 = config.get('websocket_rpc_url_2')

let connection: Connection = new Connection(HTTP_RPC_URL, {
    commitment: 'processed',
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

export { connection, confirmedConnection, connectionAlt1 }
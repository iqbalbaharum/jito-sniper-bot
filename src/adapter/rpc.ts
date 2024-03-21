import { Connection } from "@solana/web3.js";
import { config } from "../utils/config";


const HTTP_RPC_URL = config.get('http_rpc_url')
const WEBSOCKET_RPC_URL = config.get('websocket_rpc_url')

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

export { connection, confirmedConnection }
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connection = void 0;
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("../utils/config");
const HTTP_RPC_URL = config_1.config.get('http_rpc_url');
const WEBSOCKET_RPC_URL = config_1.config.get('websocket_rpc_url');
let connection = new web3_js_1.Connection(HTTP_RPC_URL, {
    commitment: 'processed',
    disableRetryOnRateLimit: true,
    wsEndpoint: WEBSOCKET_RPC_URL
});
exports.connection = connection;
//# sourceMappingURL=rpc.js.map
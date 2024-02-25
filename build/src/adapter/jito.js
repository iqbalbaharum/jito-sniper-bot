"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searcherClients = exports.fastTrackSearcherClient = void 0;
const tslib_1 = require("tslib");
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("../utils/config");
const bs58_1 = tslib_1.__importDefault(require("bs58"));
const searcher_1 = require("jito-ts/dist/sdk/block-engine/searcher");
const BLOCK_ENGINE_URLS = config_1.config.get('block_engine_urls');
const AUTH_KEYPAIR_SECRET = config_1.config.get('auth_keypair_secret');
const decodedKey = bs58_1.default.decode(AUTH_KEYPAIR_SECRET);
const keypair = web3_js_1.Keypair.fromSecretKey(decodedKey);
const searcherClients = [];
exports.searcherClients = searcherClients;
for (const url of BLOCK_ENGINE_URLS) {
    const client = (0, searcher_1.searcherClient)(url, keypair, {
        'grpc.keepalive_timeout_ms': 4000,
    });
    searcherClients.push(client);
}
// all bundles sent get automatically forwarded to the other regions.
// assuming the first block engine in the array is the closest one
const fastTrackSearcherClient = searcherClients[0];
exports.fastTrackSearcherClient = fastTrackSearcherClient;
//# sourceMappingURL=jito.js.map
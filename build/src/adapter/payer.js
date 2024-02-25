"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.payer = void 0;
const tslib_1 = require("tslib");
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("../utils/config");
const bs58_1 = tslib_1.__importDefault(require("bs58"));
const PAYER_KEYPAIR_SECRET = config_1.config.get('payer_keypair_secret');
const decodedKey = bs58_1.default.decode(PAYER_KEYPAIR_SECRET);
const payer = web3_js_1.Keypair.fromSecretKey(decodedKey);
exports.payer = payer;
//# sourceMappingURL=payer.js.map
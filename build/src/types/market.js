"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MINIMAL_MARKET_STATE_LAYOUT_V3 = void 0;
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
exports.MINIMAL_MARKET_STATE_LAYOUT_V3 = (0, raydium_sdk_1.struct)([
    (0, raydium_sdk_1.publicKey)('eventQueue'),
    (0, raydium_sdk_1.publicKey)('bids'),
    (0, raydium_sdk_1.publicKey)('asks'),
]);
//# sourceMappingURL=market.js.map
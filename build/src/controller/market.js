"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMinimalMarketV3 = void 0;
const tslib_1 = require("tslib");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const market_1 = require("../types/market");
function getMinimalMarketV3(connection, marketId, commitment) {
    return tslib_1.__awaiter(this, void 0, void 0, function* () {
        const marketInfo = yield connection.getAccountInfo(marketId, {
            commitment,
            dataSlice: {
                offset: raydium_sdk_1.MARKET_STATE_LAYOUT_V3.offsetOf('eventQueue'),
                length: 32 * 3,
            },
        });
        return market_1.MINIMAL_MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);
    });
}
exports.getMinimalMarketV3 = getMinimalMarketV3;
//# sourceMappingURL=market.js.map
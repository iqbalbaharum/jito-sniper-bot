"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenMintFromSignature = void 0;
const tslib_1 = require("tslib");
const utils_1 = require("../utils");
const getTokenMintFromSignature = (signature) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let tx;
    let timer = new Date().getTime();
    while (true) {
        let res = yield fetch(`https://api.helius.xyz/v0/transactions/?api-key=${utils_1.config.get('helius_api_key')}&commitment=confirmed`, {
            method: 'POST',
            body: JSON.stringify({
                transactions: [`${signature}`],
            }),
        });
        const json = yield res.json();
        tx = json[0];
        if (tx) {
            break;
        }
        if (new Date().getTime() - timer > 30000) {
            return undefined;
        }
    }
    const token = tx.tokenTransfers.find((token) => token.mint !== utils_1.WSOL_ADDRESS &&
        token.fromUserAccount === utils_1.RAYDIUM_AUTHORITY_V4_ADDRESS);
    if (!token) {
        return undefined;
    }
    if (token.mint === utils_1.USDC_ADDRESS) {
        return undefined;
    }
    return token.mint;
});
exports.getTokenMintFromSignature = getTokenMintFromSignature;
//# sourceMappingURL=transaction.js.map
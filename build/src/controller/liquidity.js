"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAccountPoolKeysFromAccountDataV4 = exports.getLiquidityMintState = void 0;
const tslib_1 = require("tslib");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const rpc_1 = require("../adapter/rpc");
const market_1 = require("../types/market");
const config_1 = require("../utils/config");
const web3_js_1 = require("@solana/web3.js");
const const_1 = require("../utils/const");
const bn_js_1 = require("bn.js");
const getAccountPoolKeysFromAccountDataV4 = (id, accountData) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const marketInfo = yield rpc_1.connection.getAccountInfo(accountData.marketId, {
        commitment: config_1.config.get('default_commitment'),
        dataSlice: {
            offset: 253, // eventQueue
            length: 32 * 3,
        },
    });
    if (!marketInfo) {
        throw new Error('Error fetching market info');
    }
    const minimalMarketData = market_1.MINIMAL_MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);
    return {
        id,
        baseMint: accountData.baseMint,
        quoteMint: accountData.quoteMint,
        lpMint: accountData.lpMint,
        baseDecimals: accountData.baseDecimal.toNumber(),
        quoteDecimals: accountData.quoteDecimal.toNumber(),
        lpDecimals: 5,
        version: 4,
        programId: raydium_sdk_1.MAINNET_PROGRAM_ID.AmmV4,
        authority: raydium_sdk_1.Liquidity.getAssociatedAuthority({
            programId: raydium_sdk_1.MAINNET_PROGRAM_ID.AmmV4,
        }).publicKey,
        openOrders: accountData.openOrders,
        targetOrders: accountData.targetOrders,
        baseVault: accountData.baseVault,
        quoteVault: accountData.quoteVault,
        marketVersion: 3,
        marketProgramId: accountData.marketProgramId,
        marketId: accountData.marketId,
        marketAuthority: raydium_sdk_1.Market.getAssociatedAuthority({
            programId: accountData.marketProgramId,
            marketId: accountData.marketId,
        }).publicKey,
        marketBaseVault: accountData.baseVault,
        marketQuoteVault: accountData.quoteVault,
        marketBids: minimalMarketData.bids,
        marketAsks: minimalMarketData.asks,
        marketEventQueue: minimalMarketData.eventQueue,
        withdrawQueue: accountData.withdrawQueue,
        lpVault: accountData.lpVault,
        lookupTableAccount: web3_js_1.PublicKey.default,
    };
});
exports.getAccountPoolKeysFromAccountDataV4 = getAccountPoolKeysFromAccountDataV4;
const getLiquidityMintState = (accountData) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let mint;
    let decimal;
    let isMintBase = true;
    if (accountData.baseMint.toString() === const_1.WSOL_ADDRESS) {
        mint = accountData.quoteMint;
        decimal = accountData.quoteDecimal.toNumber();
        isMintBase = false;
    }
    else if (accountData.quoteMint.toString() === const_1.WSOL_ADDRESS) {
        mint = accountData.baseMint;
        decimal = accountData.baseDecimal.toNumber();
        isMintBase = true;
    }
    else {
        throw new Error('Pool doesnt have SOL');
    }
    return {
        mint,
        isMintBase,
        mintDecimal: decimal,
        lastWSOLInAmount: new bn_js_1.BN(0),
        lastWSOLOutAmount: new bn_js_1.BN(0),
        lastTokenInAmount: new bn_js_1.BN(0),
        lastTokenOutAmount: new bn_js_1.BN(0)
    };
});
exports.getLiquidityMintState = getLiquidityMintState;
//# sourceMappingURL=liquidity.js.map
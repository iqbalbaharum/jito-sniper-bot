"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const web3_js_1 = require("@solana/web3.js");
const rpc_1 = require("./adapter/rpc");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const bn_js_1 = tslib_1.__importDefault(require("bn.js"));
const const_1 = require("./utils/const");
const config_1 = require("./utils/config");
const tokenaccount_1 = require("./controller/tokenaccount");
const controller_1 = require("./controller");
const atomic_sleep_1 = tslib_1.__importDefault(require("atomic-sleep"));
const bundle_1 = require("./controller/bundle");
const jito_1 = require("./adapter/jito");
const transaction_1 = require("./controller/transaction");
const logger_1 = require("./utils/logger");
let trackedLiquidityPool = new Set();
let removedLiquidityPool = new Set();
let trackedPoolKeys = new Map();
let mints = new Map();
let tokenBalances = new Map();
let bundleInTransit = new Map();
const getBalance = (mint, poolKeys) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let balance = tokenBalances.get(mint.toBase58());
    if (!balance) {
        const taBalance = yield (0, controller_1.getTokenInWallet)(poolKeys);
        if (taBalance && taBalance.length > 0) {
            if (taBalance[0].balance > 0) {
                balance = new bn_js_1.default(taBalance[0].balance);
                tokenBalances.set(mint.toBase58(), balance);
            }
        }
        (0, atomic_sleep_1.default)(1000);
    }
    return balance;
});
const onBundleResult = () => {
    jito_1.fastTrackSearcherClient.onBundleResult((bundleResult) => {
        const bundleId = bundleResult.bundleId;
        const isAccepted = bundleResult.accepted;
        const isRejected = bundleResult.rejected;
        if (isAccepted) {
            if (bundleInTransit.has(bundleId)) {
                const bundle = bundleInTransit.get(bundleId);
                logger_1.logger.info(`Listening for token ${bundle.mint.toBase58()} activities`);
                trackedPoolKeys.set(bundle.mint.toBase58(), bundle.poolKeys);
                mints.set(bundle.mint.toBase58(), bundle.state);
            }
        }
    }, (error) => {
        logger_1.logger.error(error);
    });
};
const listenToLPRemoved = () => {
    const subscriptionId = rpc_1.connection.onLogs(new web3_js_1.PublicKey(const_1.RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS), (logs, context) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        if (logs.err) {
            return;
        }
        let logSequence = [];
        for (const l of logs.logs) {
            // Remove LP
            if (l.includes('Transfer')) {
                logSequence.push('T');
            }
            else if (l.includes('Burn')) {
                logSequence.push('B');
            }
        }
        if (logSequence.join(',') === 'T,T,B') {
            const tokenMint = yield (0, transaction_1.getTokenMintFromSignature)(logs.signature);
            if (tokenMint) {
                removedLiquidityPool.add(tokenMint);
            }
        }
    }), config_1.config.get('default_commitment'));
};
const buyToken = (keys, ata, amount, expectedProfit) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { transaction } = yield (0, controller_1.swap)(keys, 'in', ata, amount);
    let expected = new bn_js_1.default(0);
    if (expectedProfit) {
        expected = expectedProfit;
    }
    const arb = {
        vtransaction: transaction,
        expectedProfit: expected
    };
    return yield (0, bundle_1.submitBundle)(arb);
});
const sellToken = (keys, ata, amount, expectedProfit) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { transaction } = yield (0, controller_1.swap)(keys, 'out', ata, amount);
    let expected = new bn_js_1.default(0);
    if (expectedProfit) {
        expected = expectedProfit;
    }
    const arb = {
        vtransaction: transaction,
        expectedProfit: expected
    };
    return yield (0, bundle_1.submitBundle)(arb);
});
const runListener = () => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { ata } = yield (0, tokenaccount_1.setupWSOLTokenAccount)(true, 0.1);
    const subscriptionId = rpc_1.connection.onProgramAccountChange(new web3_js_1.PublicKey(const_1.RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS), (updatedAccountInfo) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        let accountData = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
        // 
        try {
            let state = yield (0, controller_1.getLiquidityMintState)(accountData);
            let SOLIn;
            let SOLOut;
            let tokenIn;
            let tokenOut;
            let SOLDenominator;
            let tokenDenominator;
            if (!state.isMintBase) {
                SOLIn = accountData.swapBaseInAmount;
                SOLOut = accountData.swapBaseOutAmount;
                tokenIn = accountData.swapQuoteInAmount;
                tokenOut = accountData.swapQuoteOutAmount;
                SOLDenominator = new bn_js_1.default(10).pow(accountData.baseDecimal);
                tokenDenominator = new bn_js_1.default(10).pow(accountData.quoteDecimal);
            }
            else {
                SOLIn = accountData.swapQuoteInAmount;
                SOLOut = accountData.swapQuoteOutAmount;
                tokenIn = accountData.swapBaseInAmount;
                tokenOut = accountData.swapBaseOutAmount;
                SOLDenominator = new bn_js_1.default(10).pow(accountData.quoteDecimal);
                tokenDenominator = new bn_js_1.default(10).pow(accountData.baseDecimal);
            }
            const poolOpenTime = accountData.poolOpenTime.toNumber();
            if (new Date().getTime() / 1000 < poolOpenTime) {
                return;
            }
            if (SOLIn.isZero() || SOLOut.isZero()) {
                if (!trackedLiquidityPool.has(state.mint.toBase58())) {
                    trackedLiquidityPool.add(state.mint.toBase58());
                    const poolKeys = yield (0, controller_1.getAccountPoolKeysFromAccountDataV4)(updatedAccountInfo.accountId, accountData);
                    logger_1.logger.info(new Date(), `BUY ${state.mint.toBase58()}`);
                    trackedPoolKeys.set(state.mint.toBase58(), poolKeys);
                    mints.set(state.mint.toBase58(), state);
                    let bundleId = yield buyToken(poolKeys, ata, config_1.config.get('token_purchase_in_sol') * web3_js_1.LAMPORTS_PER_SOL, new bn_js_1.default(0));
                    bundleInTransit.set(bundleId, {
                        mint: state.mint,
                        timestamp: new Date().getTime(),
                        poolKeys,
                        state
                    });
                }
            }
            else {
                let tokenMint = state.isMintBase ? accountData.baseMint : accountData.quoteMint;
                if (removedLiquidityPool.has(tokenMint.toBase58())) {
                    let botState = mints.get(tokenMint.toBase58());
                    if (botState === null || botState === void 0 ? void 0 : botState.mint) {
                        let solInDiff = parseFloat(SOLIn.sub(botState.lastWSOLInAmount).toString()) /
                            parseFloat(SOLDenominator.toString());
                        const key = trackedPoolKeys.get(tokenMint.toBase58());
                        const balance = yield getBalance(tokenMint, key);
                        if (!botState.lastWSOLInAmount.isZero() &&
                            !SOLIn.sub(botState.lastWSOLInAmount).isZero() &&
                            solInDiff > config_1.config.get('min_sol_trigger')) {
                            logger_1.logger.info(`Someone purchase ${state.mint.toBase58()} with ${solInDiff} | min: ${config_1.config.get('min_sol_trigger')}`);
                            logger_1.logger.info(new Date(), `SELL ${state.mint.toBase58()}`);
                            yield sellToken(key, ata, balance.mul(new bn_js_1.default(10 ** state.mintDecimal)), new bn_js_1.default(solInDiff * web3_js_1.LAMPORTS_PER_SOL));
                        }
                        botState.lastWSOLInAmount = SOLIn;
                        botState.lastWSOLOutAmount = new bn_js_1.default(SOLOut.toString());
                        botState.lastTokenInAmount = new bn_js_1.default(tokenIn.toString());
                        botState.lastTokenOutAmount = new bn_js_1.default(tokenOut.toString());
                    }
                }
            }
        }
        catch (e) {
            // console.log(e.toString())
        }
    }), config_1.config.get('default_commitment'), [
        { dataSize: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.span },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
                bytes: const_1.OPENBOOK_V1_ADDRESS,
            },
        }
    ]);
    console.log('Starting web socket, subscription ID: ', subscriptionId);
});
(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    runListener();
    listenToLPRemoved();
    onBundleResult();
}))();
//# sourceMappingURL=v2a.js.map
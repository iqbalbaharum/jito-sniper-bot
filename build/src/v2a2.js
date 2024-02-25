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
const bs58_1 = tslib_1.__importDefault(require("bs58"));
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
        var _a;
        const bundleId = bundleResult.bundleId;
        const isAccepted = bundleResult.accepted;
        const isRejected = bundleResult.rejected;
        if (isAccepted) {
            logger_1.logger.info(`Bundle ${bundleId} accepted in slot ${(_a = bundleResult.accepted) === null || _a === void 0 ? void 0 : _a.slot}`);
            if (bundleInTransit.has(bundleId)) {
                const bundle = bundleInTransit.get(bundleId);
                trackedPoolKeys.set(bundle.mint.toBase58(), bundle.poolKeys);
                mints.set(bundle.mint.toBase58(), bundle.state);
            }
        }
        if (isRejected) {
            logger_1.logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
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
const checkNewLP = (tx, ins) => {
    if (ins.data[0] == 1 && ins.data[1] == 254) {
        const now = new Date().toISOString();
        logger_1.logger.info(`tx sig: ${bs58_1.default.encode(tx.signatures[0])}`);
        logger_1.logger.info("tx ins new lp: ", ins, ins.data);
    }
};
const checkRemoveLP = (tx, ins) => {
    const accKeyIdx = ins.accountKeyIndexes[0];
    const foundAcc = tx.message.staticAccountKeys[accKeyIdx];
    if (ins.data[0] == 4 && foundAcc != undefined && foundAcc.toString() == raydium_sdk_1.TOKEN_PROGRAM_ID.toBase58()) {
        const now = new Date().toISOString();
        logger_1.logger.info(`tx sig: ${bs58_1.default.encode(tx.signatures[0])}`);
        logger_1.logger.info("tx ins remove lp: ", tx.message.staticAccountKeys, ins, ins.data);
        logger_1.logger.info("tx ins found: ", accKeyIdx, foundAcc);
    }
};
const runListener = () => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const { ata } = yield (0, tokenaccount_1.setupWSOLTokenAccount)(true, 0.1);
    jito_1.fastTrackSearcherClient.onProgramUpdate([new web3_js_1.PublicKey(const_1.RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS)], [], (transactions) => {
        transactions.map(tx => {
            for (let ins of tx.message.compiledInstructions) {
                checkNewLP(tx, ins);
                checkRemoveLP(tx, ins);
            }
        });
    }, (e) => {
        console.log(e);
    });
    // const subscriptionId = connection.onProgramAccountChange(
    //   new PublicKey(RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS),
    //   async (updatedAccountInfo: KeyedAccountInfo) => {
    //     let accountData = LIQUIDITY_STATE_LAYOUT_V4.decode(
    //       updatedAccountInfo.accountInfo.data
    //     );
    //     // 
    //     try {
    //       let state = await getLiquidityMintState(accountData)
    //       let SOLIn: BN
    //       let SOLOut: BN
    //       let tokenIn: BN
    //       let tokenOut: BN
    //       let SOLDenominator: BN
    //       let tokenDenominator: BN
    //       if(!state.isMintBase) {
    //         SOLIn = accountData.swapBaseInAmount
    //         SOLOut = accountData.swapBaseOutAmount
    //         tokenIn = accountData.swapQuoteInAmount
    //         tokenOut = accountData.swapQuoteOutAmount
    //         SOLDenominator = new BN(10).pow(accountData.baseDecimal);
    //         tokenDenominator = new BN(10).pow(accountData.quoteDecimal);
    //       } else {
    //         SOLIn = accountData.swapQuoteInAmount
    //         SOLOut = accountData.swapQuoteOutAmount
    //         tokenIn = accountData.swapBaseInAmount
    //         tokenOut = accountData.swapBaseOutAmount
    //         SOLDenominator = new BN(10).pow(accountData.quoteDecimal);
    //         tokenDenominator = new BN(10).pow(accountData.baseDecimal);
    //       }
    //       const poolOpenTime = accountData.poolOpenTime.toNumber();
    //       if(new Date().getTime() / 1000 < poolOpenTime) {
    //         return
    //       }
    //       if(SOLIn.isZero() || SOLOut.isZero()) {
    //         if(!trackedLiquidityPool.has(state.mint.toBase58())) {
    //           trackedLiquidityPool.add(state.mint.toBase58())
    //           const poolKeys = await getAccountPoolKeysFromAccountDataV4(
    //             updatedAccountInfo.accountId,
    //             accountData
    //           )
    //           logger.info(new Date(), `BUY ${state.mint.toBase58()}`)
    //           trackedPoolKeys.set(state.mint.toBase58(), poolKeys)
    //           mints.set(state.mint.toBase58(), state)
    //           let bundleId = await buyToken(poolKeys, ata, config.get('token_purchase_in_sol') * LAMPORTS_PER_SOL, new BN(0))
    //           bundleInTransit.set(bundleId, {
    //             mint: state.mint,
    //             timestamp: new Date().getTime(),
    //             poolKeys,
    //             state
    //           })
    //         }
    //       } else {
    //         let tokenMint = state.isMintBase ? accountData.baseMint : accountData.quoteMint
    //         if(removedLiquidityPool.has(tokenMint.toBase58())) {
    //           let botState = mints.get(tokenMint.toBase58())
    //           if(botState?.mint) {
    //             let solInDiff =
    //               parseFloat(SOLIn.sub(botState.lastWSOLInAmount).toString()) /
    //               parseFloat(SOLDenominator.toString());
    //             const key = trackedPoolKeys.get(tokenMint.toBase58())
    //             const balance = await getBalance(tokenMint, key!)
    //             if(
    //                 !botState.lastWSOLInAmount.isZero() && 
    //                 !SOLIn.sub(botState.lastWSOLInAmount).isZero() && 
    //                 solInDiff > config.get('min_sol_trigger')
    //               ) {
    //               logger.info(`Someone purchase ${state.mint.toBase58()} with ${solInDiff} | min: ${config.get('min_sol_trigger')}`)
    //               logger.info(new Date(), `SELL ${state.mint.toBase58()}`)
    //               // await sellToken(key as LiquidityPoolKeysV4, ata, balance.mul(new BN(10 ** state.mintDecimal)), new BN(solInDiff * LAMPORTS_PER_SOL)) 
    //             }
    //             botState.lastWSOLInAmount = SOLIn;
    //             botState.lastWSOLOutAmount = new BN(SOLOut.toString());
    //             botState.lastTokenInAmount = new BN(tokenIn.toString());
    //             botState.lastTokenOutAmount = new BN(tokenOut.toString());
    //           }
    //         }
    //       }
    //     } catch(e: any) {
    //       // console.log(e.toString())
    //     }
    //   },
    //   config.get('default_commitment') as Commitment,
    //   [
    //     { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
    //     {
    //       memcmp: {
    //         offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
    //         bytes: OPENBOOK_V1_ADDRESS,
    //       },
    //     }
    //   ]
    // );
    // console.log('Starting web socket, subscription ID: ', subscriptionId);
});
(() => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    runListener();
    // listenToLPRemoved()
    // onBundleResult()
}))();
//# sourceMappingURL=v2a2.js.map
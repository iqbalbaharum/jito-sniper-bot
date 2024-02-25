"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swapExactIn = exports.swap = void 0;
const tslib_1 = require("tslib");
const web3_js_1 = require("@solana/web3.js");
const rpc_1 = require("../adapter/rpc");
const config_1 = require("../utils/config");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const const_1 = require("../utils/const");
const tokenaccount_1 = require("./tokenaccount");
const payer_1 = require("../adapter/payer");
const swap = (poolKeys, direction, wsolTokenAccount, amount, latestBlockHash) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let tokenAccountIn;
    let tokenAccountOut;
    let accountInDecimal;
    let blockhash = latestBlockHash;
    let startInstructions = [];
    if (!blockhash) {
        const block = yield rpc_1.connection.getLatestBlockhash({
            commitment: config_1.config.get('default_commitment')
        });
        blockhash = block.blockhash;
    }
    if (direction === 'in') {
        let accountOut;
        if (poolKeys.baseMint.toString() === const_1.WSOL_ADDRESS) {
            accountOut = poolKeys.quoteMint;
        }
        else {
            accountOut = poolKeys.baseMint;
        }
        const { ata, instructions } = yield (0, tokenaccount_1.getOrCreateTokenAccount)(accountOut, true);
        tokenAccountIn = wsolTokenAccount;
        tokenAccountOut = ata;
        startInstructions = instructions;
    }
    else {
        let accountIn;
        if (poolKeys.baseMint.toString() === const_1.WSOL_ADDRESS) {
            accountIn = poolKeys.quoteMint;
            accountInDecimal = poolKeys.quoteDecimals;
        }
        else {
            accountIn = poolKeys.baseMint;
            accountInDecimal = poolKeys.baseDecimals;
        }
        const { ata } = yield (0, tokenaccount_1.getOrCreateTokenAccount)(accountIn, false);
        tokenAccountIn = ata;
        tokenAccountOut = wsolTokenAccount;
    }
    const { innerTransaction } = raydium_sdk_1.Liquidity.makeSwapFixedInInstruction({
        poolKeys,
        userKeys: {
            tokenAccountIn,
            tokenAccountOut,
            owner: payer_1.payer.publicKey,
        },
        amountIn: amount,
        minAmountOut: 0,
    }, poolKeys.version);
    const messageV0 = new web3_js_1.TransactionMessage({
        payerKey: payer_1.payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [
            web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
            web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }),
            ...startInstructions,
            ...innerTransaction.instructions,
        ],
    }).compileToV0Message();
    const transaction = new web3_js_1.VersionedTransaction(messageV0);
    transaction.sign([payer_1.payer, ...innerTransaction.signers]);
    return {
        transaction
    };
});
exports.swap = swap;
/**
 * Swap in SOL to fetch any token with exact in
 * @param poolKeys
 * @param wsolTokenAccount
 * @param amount
 * @param latestBlockHash
 * @returns
 */
const swapExactIn = (poolKeys, wsolTokenAccount, amount, latestBlockHash) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let accountIn;
    let accountOut;
    let tokenAccountIn;
    let tokenAccountOut;
    let accountInDecimal;
    let accountOutDecimal;
    let blockhash = latestBlockHash;
    let startInstructions = [];
    if (!blockhash) {
        const block = yield rpc_1.connection.getLatestBlockhash({
            commitment: config_1.config.get('default_commitment')
        });
        blockhash = block.blockhash;
    }
    if (poolKeys.baseMint.toString() === const_1.WSOL_ADDRESS) {
        accountIn = poolKeys.baseMint;
        accountInDecimal = poolKeys.baseDecimals;
        accountOut = poolKeys.quoteMint;
        accountOutDecimal = poolKeys.quoteDecimals;
    }
    else {
        accountIn = poolKeys.quoteMint;
        accountInDecimal = poolKeys.quoteDecimals;
        accountOut = poolKeys.baseMint;
        accountOutDecimal = poolKeys.baseDecimals;
    }
    const { ata, instructions } = yield (0, tokenaccount_1.getOrCreateTokenAccount)(accountOut, true);
    tokenAccountIn = wsolTokenAccount;
    tokenAccountOut = ata;
    startInstructions = instructions;
    const currencyIn = new raydium_sdk_1.Token(raydium_sdk_1.TOKEN_PROGRAM_ID, accountIn, accountInDecimal);
    const currencyOut = new raydium_sdk_1.Token(raydium_sdk_1.TOKEN_PROGRAM_ID, accountOut, accountOutDecimal);
    const poolInfo = yield raydium_sdk_1.Liquidity.fetchInfo({ connection: rpc_1.connection, poolKeys });
    const { minAmountOut, amountOut } = raydium_sdk_1.Liquidity.computeAmountOut({
        poolKeys,
        poolInfo,
        amountIn: new raydium_sdk_1.TokenAmount(currencyIn, amount, false),
        currencyOut,
        slippage: new raydium_sdk_1.Percent(0, 100)
    });
    const { innerTransaction } = raydium_sdk_1.Liquidity.makeSwapFixedInInstruction({
        poolKeys,
        userKeys: {
            tokenAccountIn,
            tokenAccountOut,
            owner: payer_1.payer.publicKey,
        },
        amountIn: amount,
        minAmountOut: minAmountOut.raw,
    }, poolKeys.version);
    const messageV0 = new web3_js_1.TransactionMessage({
        payerKey: payer_1.payer.publicKey,
        recentBlockhash: blockhash,
        instructions: [
            web3_js_1.ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
            web3_js_1.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }),
            ...startInstructions,
            ...innerTransaction.instructions,
        ],
    }).compileToV0Message();
    const transaction = new web3_js_1.VersionedTransaction(messageV0);
    transaction.sign([payer_1.payer, ...innerTransaction.signers]);
    return {
        transaction,
        minAmountOut: minAmountOut.raw,
        amountOut: amountOut.raw
    };
});
exports.swapExactIn = swapExactIn;
//# sourceMappingURL=swap.js.map
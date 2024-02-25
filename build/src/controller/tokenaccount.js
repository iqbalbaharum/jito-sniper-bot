"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenAccountsByOwner = exports.setupWSOLTokenAccount = exports.getOrCreateTokenAccount = void 0;
const tslib_1 = require("tslib");
const spl_token_1 = require("@solana/spl-token");
const rpc_1 = require("../adapter/rpc");
const web3_js_1 = require("@solana/web3.js");
const payer_1 = require("../adapter/payer");
const raydium_sdk_1 = require("@raydium-io/raydium-sdk");
const config_1 = require("../utils/config");
const getOrCreateTokenAccount = (mint, create = false) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let instructions = [];
    let ata = yield (0, spl_token_1.getAssociatedTokenAddress)(mint, payer_1.payer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
    const ataInfo = yield rpc_1.connection.getAccountInfo(ata);
    if (create && !ataInfo) {
        instructions.push((0, spl_token_1.createAssociatedTokenAccountInstruction)(payer_1.payer.publicKey, ata, payer_1.payer.publicKey, mint, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
    }
    return {
        ata,
        instructions,
        error: '',
    };
});
exports.getOrCreateTokenAccount = getOrCreateTokenAccount;
const setupWSOLTokenAccount = (check = true, amount) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let ata = yield (0, spl_token_1.getAssociatedTokenAddress)(spl_token_1.NATIVE_MINT, payer_1.payer.publicKey, false, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID);
    if (check) {
        const ataInfo = yield rpc_1.connection.getAccountInfo(ata);
        if (ataInfo === null) {
            let ataTx = new web3_js_1.Transaction();
            ataTx.add((0, spl_token_1.createAssociatedTokenAccountInstruction)(payer_1.payer.publicKey, ata, payer_1.payer.publicKey, spl_token_1.NATIVE_MINT, spl_token_1.TOKEN_PROGRAM_ID, spl_token_1.ASSOCIATED_TOKEN_PROGRAM_ID));
            ataTx.feePayer = payer_1.payer.publicKey;
            yield (0, web3_js_1.sendAndConfirmTransaction)(rpc_1.connection, ataTx, [payer_1.payer]);
        }
    }
    let balance = yield rpc_1.connection.getBalance(ata);
    if (balance < amount * web3_js_1.LAMPORTS_PER_SOL) {
        let solTx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
            fromPubkey: payer_1.payer.publicKey,
            toPubkey: ata,
            lamports: (amount - balance / web3_js_1.LAMPORTS_PER_SOL) * web3_js_1.LAMPORTS_PER_SOL,
        }), (0, spl_token_1.createSyncNativeInstruction)(ata));
        yield (0, web3_js_1.sendAndConfirmTransaction)(rpc_1.connection, solTx, [payer_1.payer]);
    }
    return { ata };
});
exports.setupWSOLTokenAccount = setupWSOLTokenAccount;
const getTokenAccountsByOwner = () => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const tokenResp = yield rpc_1.connection.getTokenAccountsByOwner(payer_1.payer.publicKey, {
        programId: spl_token_1.TOKEN_PROGRAM_ID,
    }, config_1.config.get('default_commitment'));
    const accounts = [];
    for (const { pubkey, account } of tokenResp.value) {
        accounts.push({
            pubkey,
            accountInfo: raydium_sdk_1.SPL_ACCOUNT_LAYOUT.decode(account.data),
        });
    }
    return accounts;
});
exports.getTokenAccountsByOwner = getTokenAccountsByOwner;
//# sourceMappingURL=tokenaccount.js.map
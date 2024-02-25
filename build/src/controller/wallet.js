"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenInWallet = void 0;
const tslib_1 = require("tslib");
const rpc_1 = require("../adapter/rpc");
const tokenaccount_1 = require("./tokenaccount");
const const_1 = require("../utils/const");
const getTokenInWallet = (poolKeys) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    let mint;
    if (poolKeys.baseMint.toString() === const_1.WSOL_ADDRESS) {
        mint = poolKeys.quoteMint;
    }
    else {
        mint = poolKeys.baseMint;
    }
    const accs = yield (0, tokenaccount_1.getTokenAccountsByOwner)();
    const balanceArray = yield accs
        .filter((acc) => acc.accountInfo.mint.toBase58() === mint.toBase58())
        .map((acc) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        console.log(acc.pubkey);
        const accBalance = yield rpc_1.connection.getTokenAccountBalance(acc.pubkey);
        console.log(accBalance);
        const balance = accBalance.value.uiAmount || 0;
        return { mint: acc.accountInfo.mint, balance };
    }));
    const resolvedBalances = yield Promise.all(balanceArray);
    console.log(resolvedBalances);
    return resolvedBalances;
});
exports.getTokenInWallet = getTokenInWallet;
//# sourceMappingURL=wallet.js.map
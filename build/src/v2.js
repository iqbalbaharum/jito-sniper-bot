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
const onExecute = (accountId, accountData) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    try {
        let { ata } = yield (0, tokenaccount_1.setupWSOLTokenAccount)(true, 0.1);
        const [poolKeys, latestBlockhash] = yield Promise.all([
            (0, controller_1.getAccountPoolKeysFromAccountDataV4)(accountId, accountData),
            rpc_1.connection.getLatestBlockhash({ commitment: config_1.config.get('default_commitment') }),
        ]);
        const poolInfo = yield raydium_sdk_1.Liquidity.fetchInfo({ connection: rpc_1.connection, poolKeys });
        let different = poolInfo.startTime.toNumber() * 1000 - new Date().getTime();
        if (different > 0) {
            return;
        }
        // Buy
        // TODO
        const { transaction: inTx, minAmountOut, amountOut } = yield (0, controller_1.swapExactIn)(poolKeys, ata, 0.001 * web3_js_1.LAMPORTS_PER_SOL, latestBlockhash.blockhash);
        yield (0, bundle_1.submitBundle)({
            vtransaction: inTx,
            expectedProfit: new bn_js_1.default(0)
        });
        // await sleep(5000);
        let mintBalance = -1;
        while (mintBalance < 0) {
            const taBalance = yield (0, controller_1.getTokenInWallet)(poolKeys);
            if (taBalance && taBalance.length > 0) {
                if (taBalance[0].balance > 0) {
                    mintBalance = taBalance[0].balance;
                }
            }
            (0, atomic_sleep_1.default)(1000);
        }
        // sell
        const amount = (0, raydium_sdk_1.parseBigNumberish)(mintBalance * 10 ** poolKeys.baseDecimals);
        const { transaction: outTx } = yield (0, controller_1.swap)(poolKeys, 'out', ata, amount);
        yield (0, bundle_1.submitBundle)({
            vtransaction: outTx,
            expectedProfit: new bn_js_1.default(0)
        });
    }
    catch (e) {
        console.log(e);
    }
});
const runListener = () => {
    let mints = [];
    const subscriptionId = rpc_1.connection.onProgramAccountChange(new web3_js_1.PublicKey(const_1.RAYDIUM_LIQUIDITY_POOL_V4_ADDRESS), (updatedAccountInfo) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        let accountData = raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
        if (new bn_js_1.default(accountData.swapBaseInAmount.toString()).isZero() &&
            !mints.includes(accountData.baseMint.toString())) {
            mints.push(accountData.baseMint.toString());
            onExecute(updatedAccountInfo.accountId, accountData);
        }
    }), config_1.config.get('default_commitment'), [
        { dataSize: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.span },
        {
            memcmp: {
                offset: raydium_sdk_1.LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
                bytes: const_1.OPENBOOK_V1_ADDRESS,
            },
        },
    ]);
    console.log('Starting web socket, subscription ID: ', subscriptionId);
};
runListener();
(0, bundle_1.onDefaultBundleResult)();
//# sourceMappingURL=v2.js.map
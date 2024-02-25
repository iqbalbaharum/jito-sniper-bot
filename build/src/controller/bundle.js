"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDefaultBundleResult = exports.submitBundle = void 0;
const tslib_1 = require("tslib");
const web3_js_1 = require("@solana/web3.js");
const jito_1 = require("./jito");
const types_1 = require("jito-ts/dist/sdk/block-engine/types");
const payer_1 = require("../adapter/payer");
const rpc_1 = require("../adapter/rpc");
const config_1 = require("../utils/config");
const jito_2 = require("../adapter/jito");
const logger_1 = require("../utils/logger");
const bn_js_1 = require("bn.js");
const submitBundle = (arb) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const tipAddress = yield (0, jito_1.getJitoTipAccount)();
    const tipAccount = new web3_js_1.PublicKey(tipAddress);
    const resp = yield rpc_1.connection.getLatestBlockhash(config_1.config.get('default_commitment'));
    const bundle = new types_1.Bundle([arb.vtransaction], 5);
    const TIP_PERCENT = config_1.config.get('tip_percent');
    let expectedProfitLamport = config_1.config.get('default_tip_in_sol') * web3_js_1.LAMPORTS_PER_SOL;
    if (!arb.expectedProfit.isZero() && arb.expectedProfit.toNumber() > config_1.config.get('min_sol_trigger')) {
        expectedProfitLamport = arb.expectedProfit.mul(new bn_js_1.BN(TIP_PERCENT)).div(new bn_js_1.BN(100)).toNumber();
    }
    console.log(expectedProfitLamport);
    bundle.addTipTx(payer_1.payer, config_1.config.get('default_tip_in_sol') * web3_js_1.LAMPORTS_PER_SOL, tipAccount, resp.blockhash);
    const bundleId = yield jito_2.fastTrackSearcherClient.sendBundle(bundle);
    logger_1.logger.info(`Sending bundle ${bundleId}`);
    return bundleId;
});
exports.submitBundle = submitBundle;
const onDefaultBundleResult = () => {
    jito_2.fastTrackSearcherClient.onBundleResult((bundleResult) => {
        var _a;
        const bundleId = bundleResult.bundleId;
        const isAccepted = bundleResult.accepted;
        const isRejected = bundleResult.rejected;
        if (isAccepted) {
            logger_1.logger.info(`Bundle ${bundleId} accepted in slot ${(_a = bundleResult.accepted) === null || _a === void 0 ? void 0 : _a.slot}`);
        }
        if (isRejected) {
            logger_1.logger.info(bundleResult.rejected, `Bundle ${bundleId} rejected:`);
        }
    }, (error) => {
        logger_1.logger.error(error);
    });
};
exports.onDefaultBundleResult = onDefaultBundleResult;
//# sourceMappingURL=bundle.js.map
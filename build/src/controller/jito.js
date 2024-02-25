"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJitoTipAccount = void 0;
const tslib_1 = require("tslib");
const jito_1 = require("../adapter/jito");
const getJitoTipAccount = () => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const acc = yield jito_1.fastTrackSearcherClient.getTipAccounts();
    const randomIndex = Math.floor(Math.random() * acc.length);
    return acc[0];
});
exports.getJitoTipAccount = getJitoTipAccount;
//# sourceMappingURL=jito.js.map
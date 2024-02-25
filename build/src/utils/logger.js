"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const tslib_1 = require("tslib");
const pino_1 = require("pino");
const dotenv = tslib_1.__importStar(require("dotenv"));
const config_1 = require("./config");
dotenv.config();
const transport = pino_1.pino.transport({
    target: 'pino-pretty',
    options: { destination: 1 },
});
const baseLogger = (0, pino_1.pino)({
    level: config_1.config.get('log_level'),
}, transport);
exports.logger = baseLogger.child({ name: config_1.config.get('bot_name') });
//# sourceMappingURL=logger.js.map
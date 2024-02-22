import { pino } from 'pino';
import * as dotenv from 'dotenv';
import { config } from './config';
dotenv.config();

const transport = pino.transport({
  target: 'pino-pretty',
  options: { destination: 1 },
});

const baseLogger = pino(
  {
    level: config.get('log_level'),
  },
  transport,
);

export const logger = baseLogger.child({ name: config.get('bot_name') });

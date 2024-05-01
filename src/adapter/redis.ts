import * as redis from 'redis'
import { config } from '../utils'
import { logger } from '../utils/logger';

const REDIS_URL = config.get('redis_url')

// Key - ammId
const redisClient = redis.createClient({
    url: REDIS_URL,
    database: 0
});

// Key - tradeId
const redisClient1 = redis.createClient({
    url: REDIS_URL,
    database: 1
});


(async () => {
    await redisClient.connect()
    await redisClient1.connect()
})();

redisClient.on('error', err => logger.error(`Redis Client Error ${err}`));
redisClient1.on('error', err => logger.error(`Redis Client Error ${err}`));

export { redisClient, redisClient1 }
import * as redis from 'redis'
import { config } from '../utils'
import { logger } from '../utils/logger';

const REDIS_URL = config.get('redis_url')

const redisClient = redis.createClient({
    url: REDIS_URL
});

(async () => {
    await redisClient.connect()
})();

redisClient.on('error', err => logger.error(`Redis Client Error ${err}`));

export { redisClient }
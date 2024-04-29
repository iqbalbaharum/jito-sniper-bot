import * as redis from 'redis'
import { config } from '../utils'
import { logger } from '../utils/logger';
import { Queue } from 'bullmq';

const REDIS_URL = config.get('redis_url')

const redisClient = redis.createClient({
    url: REDIS_URL
});

// const delayedRedis = new Queue('delayed-market', {
//     connection: {
//         host: 
//     }
// }})

(async () => {
    await redisClient.connect()
})();

redisClient.on('error', err => logger.error(`Redis Client Error ${err}`));

export { redisClient }
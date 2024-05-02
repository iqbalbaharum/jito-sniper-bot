import * as redis from 'redis'
import { config } from '../utils'
import { logger } from '../utils/logger';

const REDIS_URL = config.get('redis_url')

// Key - config
const redisClient = redis.createClient({
    url: REDIS_URL,
    database: 0
});

// Key - tradeId
const redisClient1 = redis.createClient({
    url: REDIS_URL,
    database: 1
});

// key - signature
const redisClient2 = redis.createClient({
    url: REDIS_URL,
    database: 2
});

// key - lookup
const redisClient3 = redis.createClient({
    url: REDIS_URL,
    database: 3
});

// key - amm
const redisClient4 = redis.createClient({
    url: REDIS_URL,
    database: 4
});

// key - token account
const redisClient5 = redis.createClient({
    url: REDIS_URL,
    database: 4
});

const clients = [redisClient, redisClient1, redisClient2, redisClient3, redisClient4, redisClient5];

(async () => {
    for(let client of clients) {
        client.connect()
        client.on('error', err => logger.error(`Redis Client Error ${client.clientGetName} | ${err}`))
    }
})();

export { redisClient, redisClient1, redisClient2, redisClient3, redisClient4, redisClient5 }
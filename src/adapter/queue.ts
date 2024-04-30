import { Queue, Worker } from "bullmq";
import { config } from "../utils";
import { QueueKey } from "../types/queue-key";

const delayedQueue = new Queue(QueueKey.Q_DELAYED, {
    connection: {
        host: config.get('redis_host'),
        port: config.get('redis_port')
    }
});

const txQueue = new Queue(QueueKey.Q_TX, {
    connection: {
        host: config.get('redis_host'),
        port: config.get('redis_port')
    }
});

export { txQueue, delayedQueue }
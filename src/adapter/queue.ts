import { Queue, Worker } from "bullmq";
import { config } from "../utils";

const NAME = config.get('queue_name')

const delayedQueue = new Queue(NAME, {
    connection: {
        host: config.get('redis_host'),
        port: config.get('redis_port')
    }
});

export { delayedQueue }
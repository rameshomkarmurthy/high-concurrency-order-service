import Redis from 'ioredis';
import { env } from './config.js';

export const redis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => Math.min(attempt * 100, 1_000)
});

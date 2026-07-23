/**
 * Redis client.
 *
 * One shared connection for commands (rate-limit script, later pub/sub uses its
 * own dedicated connections). Returns null when REDIS_URL is unset so the app
 * still runs — the rate limiter then fails open.
 */

import Redis from 'ioredis';
import { config } from '../config/env.js';

let client = null;

export function getRedis() {
  if (!config.redisUrl) return null;
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false, // fail fast instead of queuing when down
    });
    client.on('error', (err) => console.error(`[redis] ${err.message}`));
  }
  return client;
}

export async function closeRedis() {
  if (client) {
    await client.quit().catch(() => {});
    client = null;
  }
}

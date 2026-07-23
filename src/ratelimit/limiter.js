/**
 * The rate limiter.
 *
 * Backed by Redis so limits are correct across multiple proxy instances. The
 * atomic Lua token-bucket runs entirely on Redis, so concurrent requests can't
 * race. If Redis is unset we fall back to the in-memory bucket; if a Redis call
 * fails at runtime we FAIL OPEN — availability matters more than a perfectly
 * enforced limit, and a limiter outage must not take down traffic.
 *
 * The public interface (configureLimiter, take) is unchanged, so the stage that
 * calls it doesn't know or care which backend is in use.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getRedis } from '../redis/client.js';
import { createBucket, consume } from './tokenBucket.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const LUA = readFileSync(path.join(here, 'tokenBucket.lua'), 'utf8');

let cfg = { capacity: 100, refillPerSec: 50 };
let redis = null;

// in-memory fallback buckets (used when Redis is unavailable)
const localBuckets = new Map();

export function configureLimiter(options) {
  cfg = { capacity: options.capacity, refillPerSec: options.refillPerSec };
  redis = getRedis();
  if (redis) {
    redis.defineCommand('tokenBucket', { numberOfKeys: 1, lua: LUA });
  }
}

function localTake(key, now) {
  let bucket = localBuckets.get(key);
  if (!bucket) {
    bucket = createBucket(cfg.capacity);
    localBuckets.set(key, bucket);
  }
  const result = consume(bucket, now, cfg.capacity, cfg.refillPerSec);
  return { ...result, limit: cfg.capacity };
}

export async function take(key, now = Date.now()) {
  if (!redis) {
    return localTake(key, now);
  }

  try {
    const [allowed, remaining, retryAfterSec] = await redis.tokenBucket(
      `sentinel:rl:tb:${key}`,
      cfg.capacity,
      cfg.refillPerSec,
      now,
    );
    return {
      allowed: allowed === 1,
      remaining,
      retryAfterSec,
      limit: cfg.capacity,
    };
  } catch (err) {
    // Fail open — never block traffic because the limiter is unhealthy.
    console.error(`[ratelimit] redis error, failing open: ${err.message}`);
    return { allowed: true, remaining: cfg.capacity, retryAfterSec: 0, limit: cfg.capacity };
  }
}

/**
 * The rate limiter.
 *
 * Keeps one token bucket per key (client IP for now) in memory and applies the
 * token-bucket algorithm on each request. This is single-process; a later step
 * swaps the storage for Redis so limits hold across multiple instances.
 */

import { createBucket, consume } from './tokenBucket.js';

const buckets = new Map();

let cfg = { capacity: 100, refillPerSec: 50 };

export function configureLimiter(options) {
  cfg = { capacity: options.capacity, refillPerSec: options.refillPerSec };
}

export function take(key, now = Date.now()) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = createBucket(cfg.capacity);
    buckets.set(key, bucket);
  }

  const result = consume(bucket, now, cfg.capacity, cfg.refillPerSec);
  return { ...result, limit: cfg.capacity };
}

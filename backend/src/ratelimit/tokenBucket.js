/**
 * Token bucket — the rate-limit algorithm.
 *
 * A bucket holds up to `capacity` tokens and refills at `refillPerSec`. Each
 * request spends one token; an empty bucket is rejected. This tolerates bursts
 * up to the capacity while holding the long-run average to the refill rate.
 *
 * Pure and stateless apart from the bucket object it mutates — the limiter owns
 * where buckets live (in-memory now, Redis later).
 */

export function createBucket(capacity) {
  return { tokens: capacity, last: null };
}

export function consume(bucket, now, capacity, refillPerSec) {
  if (bucket.last === null) {
    bucket.last = now;
  }

  const elapsedSec = Math.max(0, now - bucket.last) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
  bucket.last = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterSec: 0 };
  }

  const deficit = 1 - bucket.tokens;
  const retryAfterSec = refillPerSec > 0 ? Math.ceil(deficit / refillPerSec) : 1;
  return { allowed: false, remaining: 0, retryAfterSec };
}

/**
 * Retry policy.
 *
 * We only retry safe, bodyless, idempotent methods. Retrying a POST could
 * double-write, and retrying a request with a body would mean replaying a
 * stream we've already consumed (that needs buffering — a later step).
 *
 * A retry is also only allowed while nothing has been sent to the client yet:
 * once response bytes are on the wire we can't take them back.
 */

export const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function canRetry(method, attempt, maxRetries, headersSent) {
  return RETRYABLE_METHODS.has(method) && attempt <= maxRetries && !headersSent;
}

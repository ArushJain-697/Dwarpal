/**
 * Builds a structured record from a finished request context.
 *
 * This is the canonical per-request shape — the same fields the dashboard feed
 * and the (later) Postgres log table are built around. Keeping it in one place
 * means all three stay in sync.
 */

export function buildRecord(ctx) {
  const durationMs = Number(process.hrtime.bigint() - ctx.startedAt) / 1e6;

  let decision = 'allow';
  if (ctx.waf?.blocked) decision = 'block';
  else if (ctx.rateLimit?.limited) decision = 'ratelimit';

  return {
    msg: 'request',
    id: ctx.id,
    ts: Date.now(),
    method: ctx.method,
    path: ctx.path,
    status: ctx.res.statusCode,
    durationMs: Number(durationMs.toFixed(2)),
    decision,
    category: ctx.waf?.category ?? null,
    ruleId: ctx.waf?.ruleId ?? null,
    anomaly: ctx.waf?.anomaly ?? 0,
    clientIp: ctx.clientIp,
    upstream: ctx.upstream ?? null,
  };
}

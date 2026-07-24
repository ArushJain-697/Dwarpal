/**
 * Short-circuit verdict helper.
 *
 * Every stage that stops a request returns the same shape: a plain-text status
 * with a leak-free body that carries only the request id. This centralizes that
 * so the response contract lives in one place.
 */

export function shortCircuit(ctx, status, message, extraHeaders = {}) {
  return {
    type: 'short_circuit',
    response: {
      status,
      headers: { 'content-type': 'text/plain', ...extraHeaders },
      body: `dwarpal: ${message} (id ${ctx.id})\n`,
    },
  };
}

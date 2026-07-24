/**
 * Collects the parts of a request the WAF should inspect.
 *
 * Payloads don't only live in the query string — they turn up in the path and
 * in headers like User-Agent, Referer, and Cookie. This gathers each
 * inspectable surface as { source, value } so the stage can check them all.
 */

// Headers worth inspecting. Most headers are noise; these are the ones
// attackers actually abuse.
const INSPECTED_HEADERS = ['user-agent', 'referer', 'cookie'];

export function collectFields(ctx) {
  const fields = [{ source: 'path', value: ctx.path }];

  if (ctx.rawQuery) {
    fields.push({ source: 'query', value: ctx.rawQuery });
  }

  for (const name of INSPECTED_HEADERS) {
    const value = ctx.headers[name];
    if (typeof value === 'string' && value.length > 0) {
      fields.push({ source: `header:${name}`, value });
    }
  }

  return fields;
}

/**
 * Collects the parts of a request the WAF should inspect.
 *
 * Payloads don't only live in the query string — they turn up in the path and
 * in headers like User-Agent, Referer, and Cookie. This gathers each
 * inspectable surface as { source, value } so the stage can check them all.
 */

export function collectFields(ctx) {
  const fields = [{ source: 'path', value: ctx.path }];

  if (ctx.rawQuery) {
    fields.push({ source: 'query', value: ctx.rawQuery });
  }

  for (const name of ['user-agent', 'referer']) {
    const value = ctx.headers[name];
    if (typeof value === 'string' && value.length > 0) {
      fields.push({ source: `header:${name}`, value });
    }
  }

  // Cookie: inspect each pair's value, not the ';'-joined header — the ';'
  // pair-separators are legitimate and would otherwise score as shell metachars
  // and falsely block ordinary multi-cookie browser traffic.
  const cookie = ctx.headers['cookie'];
  if (typeof cookie === 'string') {
    for (const pair of cookie.split(';')) {
      const value = pair.trim();
      if (value) fields.push({ source: 'header:cookie', value });
    }
  }

  // Request body (buffered + capped by the ingest stage) — the biggest real
  // attack surface: login forms, JSON APIs, GraphQL.
  if (ctx.bodyText) {
    fields.push({ source: 'body', value: ctx.bodyText });
  }

  return fields;
}

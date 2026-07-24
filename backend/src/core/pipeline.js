/**
 * The pipeline kernel.
 *
 * Runs an ordered list of stages against a request context. Each stage
 * returns a verdict:
 *
 *   - undefined / { type: 'continue' }  -> keep going to the next stage
 *   - { type: 'short_circuit', response } -> stop now, write this response
 *
 * `finalize` always runs at the end (even on a short-circuit) so things like
 * logging a blocked request never get skipped.
 */

function writeVerdict(ctx, verdict) {
  if (verdict.type === 'short_circuit') {
    const { status, headers, body } = verdict.response;
    if (!ctx.res.headersSent) {
      ctx.res.writeHead(status, headers ?? { 'content-type': 'text/plain' });
    }
    ctx.res.end(body ?? '');
  }
}

export function createPipeline(stages, finalize) {
  return {
    async run(ctx) {
      try {
        for (const stage of stages) {
          const verdict = await stage.handle(ctx);
          if (verdict && verdict.type !== 'continue') {
            ctx.verdict = verdict;
            writeVerdict(ctx, verdict);
            break;
          }
        }
      } catch (err) {
        console.error(`[pipeline] error on ${ctx.id}: ${err.message}`);
        if (!ctx.res.headersSent) {
          ctx.res.writeHead(500, { 'content-type': 'text/plain' });
        }
        ctx.res.end('dwarpal: internal error\n');
      } finally {
        finalize(ctx);
      }
    },
  };
}

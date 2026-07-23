/**
 * The terminal stage: forward to the upstream.
 *
 * Wraps the streaming forwarder as a pipeline stage. It resolves only once the
 * response has finished, so the pipeline's finalize step sees accurate timing.
 */

import { forward } from '../forwarder.js';

export const forwardStage = {
  name: 'forward',
  handle(ctx) {
    return new Promise((resolve) => {
      ctx.res.on('finish', resolve);
      ctx.res.on('close', resolve);
      forward(ctx.req, ctx.res);
    });
  },
};

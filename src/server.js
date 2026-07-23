/**
 * The proxy HTTP server.
 *
 * Each request is turned into a context and run through the stage pipeline.
 * The terminal `forward` stage streams the response back from the upstream.
 */

import http from 'node:http';
import { config } from './config.js';
import { createContext } from './context.js';
import { createPipeline } from './pipeline.js';
import { wafStage } from './stages/waf.js';
import { forwardStage } from './stages/forward.js';

// The ordered list of stages a request flows through. New behaviour (rate
// limiting, routing) slots in here as additional stages.
const stages = [wafStage, forwardStage];

function finalize(ctx) {
  const durationMs = Number(process.hrtime.bigint() - ctx.startedAt) / 1e6;
  const status = ctx.res.statusCode;
  console.log(
    `[proxy] ${ctx.method} ${ctx.path} -> ${status} ${durationMs.toFixed(1)}ms id=${ctx.id}`,
  );
}

const pipeline = createPipeline(stages, finalize);

function handleRequest(req, res) {
  const ctx = createContext(req, res);
  res.setHeader('x-request-id', ctx.id);
  pipeline.run(ctx);
}

export function createServer() {
  return http.createServer(handleRequest);
}

export function startServer() {
  const server = createServer();
  server.listen(config.proxyPort, () => {
    console.log(`[proxy] listening on http://localhost:${config.proxyPort}`);
  });
  return server;
}

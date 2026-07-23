/**
 * The proxy HTTP server.
 *
 * Each request is turned into a context and run through the stage pipeline.
 * The terminal `forward` stage streams the response back from the upstream.
 */

import http from 'node:http';
import { config } from '../config/env.js';
import { createContext } from '../core/context.js';
import { createPipeline } from '../core/pipeline.js';
import { logger } from '../obs/logger.js';
import { buildRecord } from '../obs/record.js';
import { recordRequest } from '../obs/metrics.js';
import { emitRequestEvent } from '../obs/eventBus.js';
import { addRecord } from '../obs/recentLog.js';
import { ratelimitStage } from '../stages/ratelimit.js';
import { wafStage } from '../stages/waf.js';
import { routeStage } from '../stages/route.js';
import { loadbalanceStage } from '../stages/loadbalance.js';
import { forwardStage } from '../stages/forward.js';

// The ordered list of stages a request flows through. New behaviour slots in
// here as additional stages.
const stages = [ratelimitStage, wafStage, routeStage, loadbalanceStage, forwardStage];

function finalize(ctx) {
  const record = buildRecord(ctx);
  logger.info(record);
  recordRequest(record);
  emitRequestEvent(record);
  addRecord(record);
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

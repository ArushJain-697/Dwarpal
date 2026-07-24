/**
 * WebSocket gateway for the live dashboard.
 *
 * Subscribes to the request event bus, buffers events, and every 250ms pushes a
 * single coalesced frame to every connected client:
 *
 *   { type: 'tick', stats: <metrics snapshot>, attacks: [...], omitted: n }
 *
 * Coalescing keeps us from flooding the browser one-message-per-request under
 * load. A client whose send buffer is backed up is skipped for that frame so a
 * slow consumer can't stall the gateway.
 */

import { WebSocketServer } from 'ws';
import { onRequestEvent } from '../obs/eventBus.js';
import { snapshot } from '../obs/metrics.js';

const COALESCE_MS = 250;
const MAX_ATTACKS_PER_FRAME = 50;
const BACKPRESSURE_LIMIT = 1024 * 1024; // 1 MiB

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  let pending = [];

  const unsubscribe = onRequestEvent((record) => {
    // The live feed cares about attacks (blocks + rate-limits).
    if (record.decision === 'block' || record.decision === 'ratelimit') {
      pending.push({
        id: record.id,
        ts: Date.now(),
        method: record.method,
        path: record.path,
        status: record.status,
        decision: record.decision,
        category: record.category,
        clientIp: record.clientIp,
      });
    }
  });

  const timer = setInterval(() => {
    if (wss.clients.size === 0) {
      pending = [];
      return;
    }

    const attacks = pending.slice(-MAX_ATTACKS_PER_FRAME);
    const omitted = pending.length - attacks.length;
    pending = [];

    const frame = JSON.stringify({ type: 'tick', stats: snapshot(), attacks, omitted });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN && client.bufferedAmount < BACKPRESSURE_LIMIT) {
        client.send(frame);
      }
    }
  }, COALESCE_MS);
  timer.unref();

  wss.on('close', unsubscribe);
  return wss;
}

/**
 * In-process event bus.
 *
 * The finalizer emits one event per finished request; the WebSocket gateway
 * subscribes and fans them out to dashboard clients. Keeping this behind a tiny
 * interface means we can swap the transport for Redis pub/sub later (so events
 * survive across multiple proxy instances) without touching the callers.
 */

import { EventEmitter } from 'node:events';

const bus = new EventEmitter();
bus.setMaxListeners(0); // many dashboard clients may subscribe

export function emitRequestEvent(record) {
  bus.emit('request', record);
}

export function onRequestEvent(handler) {
  bus.on('request', handler);
  return () => bus.off('request', handler);
}

/**
 * Config hot-reload over Redis pub/sub.
 *
 * The admin API publishes a small reload message when a runtime setting changes
 * (the WAF toggle today). Every proxy instance subscribes and applies it, so a
 * change on one node reaches all of them. A subscriber connection can't run
 * normal commands, so we use a dedicated duplicate connection for it.
 */

import { getRedis } from './client.js';

const CHANNEL = 'sentinel:config:reload';

let subscriber = null;

export function publishConfig(payload) {
  const redis = getRedis();
  if (!redis) return;
  redis
    .publish(CHANNEL, JSON.stringify(payload))
    .catch((err) => console.error(`[pubsub] publish failed: ${err.message}`));
}

export function subscribeConfig(handler) {
  const redis = getRedis();
  if (!redis) return;

  subscriber = redis.duplicate(); // dedicated connection for SUBSCRIBE
  subscriber.on('error', (err) => console.error(`[pubsub] ${err.message}`));

  // Subscribe once the connection is ready, and re-subscribe after any
  // reconnect. Subscribing before 'ready' fails when the offline queue is off.
  const doSubscribe = () =>
    subscriber
      .subscribe(CHANNEL)
      .catch((err) => console.error(`[pubsub] subscribe failed: ${err.message}`));

  if (subscriber.status === 'ready') doSubscribe();
  subscriber.on('ready', doSubscribe);

  subscriber.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      handler(JSON.parse(message));
    } catch (err) {
      console.error(`[pubsub] bad message: ${err.message}`);
    }
  });
}

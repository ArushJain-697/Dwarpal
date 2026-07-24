/**
 * Runtime-mutable settings.
 *
 * Some config can change while the proxy is running (the WAF on/off toggle is
 * the headline one). Those values live here, seeded from the frozen boot config
 * but writable through the admin API. The hot path reads the current value on
 * every request, so a change takes effect immediately — no restart.
 */

import { config, WAF_MODES } from './env.js';

const state = {
  wafMode: config.wafMode,
};

export function getWafMode() {
  return state.wafMode;
}

// The setter owns the invariant, so every writer (admin PUT, pubsub reload) is
// safe by construction and an invalid mode is simply ignored.
export function setWafMode(mode) {
  if (WAF_MODES.includes(mode)) {
    state.wafMode = mode;
  }
}

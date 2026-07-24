/**
 * A tiny structured logger.
 *
 * Emits one JSON object per line to stdout, filtered by the configured level.
 * Structured logs are easy to grep, ship, and — later — feed into the metrics
 * and dashboard pipeline. (A heavier logger like pino can slot in behind this
 * same interface if we need worker-thread serialization.)
 */

import { config } from '../config/env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, fields) {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), ...fields });
  process.stdout.write(line + '\n');
}

export const logger = {
  debug: (fields) => emit('debug', fields),
  info: (fields) => emit('info', fields),
  warn: (fields) => emit('warn', fields),
  error: (fields) => emit('error', fields),
};

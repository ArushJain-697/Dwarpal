import { describe, it, expect } from 'vitest';
import { evaluate } from '../../src/waf/engine.js';
import { CORPUS } from './corpus.js';

const THRESHOLD = 5;

// Run the full scoring engine (which includes normalization) over a query field.
function isBlocked(value) {
  return evaluate([{ source: 'query', value }], THRESHOLD).blocked;
}

describe('WAF corpus', () => {
  for (const [category, { malicious, benign }] of Object.entries(CORPUS)) {
    describe(category, () => {
      it.each(malicious)('blocks: %s', (payload) => {
        expect(isBlocked(payload)).toBe(true);
      });
      it.each(benign)('allows: %s', (payload) => {
        expect(isBlocked(payload)).toBe(false);
      });
    });
  }
});

describe('false-positive rate', () => {
  it('is exactly 0 across the whole benign corpus', () => {
    const benign = Object.values(CORPUS).flatMap((c) => c.benign);
    const falsePositives = benign.filter(isBlocked);
    expect(falsePositives).toEqual([]);
  });
});

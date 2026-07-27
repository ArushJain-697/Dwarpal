import { describe, it, expect } from 'vitest';
import { createContext } from '../../src/core/context.js';

const res = {};
const req = (url) => ({ url, method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } });

describe('createContext', () => {
  // regression: a malformed absolute-form target used to throw Invalid URL and
  // crash the whole process before the pipeline ran.
  it('does not throw on a malformed request target', () => {
    expect(() => createContext(req('http://foo:999999/'), res)).not.toThrow();
    expect(createContext(req('http://foo:999999/'), res).path).toBeTruthy();
  });

  it('parses a normal origin-form request', () => {
    const ctx = createContext(req('/api/a/x?id=1'), res);
    expect(ctx.path).toBe('/api/a/x');
    expect(ctx.rawQuery).toBe('?id=1');
  });
});

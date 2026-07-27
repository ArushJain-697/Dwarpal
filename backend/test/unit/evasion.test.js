import { describe, it, expect } from 'vitest';
import { evaluate } from '../../src/waf/engine.js';

// battle-test regressions: each of these used to bypass the WAF or falsely block.
const blocks = (value, source = 'query') => evaluate([{ source, value }], 5).blocked;

describe('WAF evasion regressions (battle-test findings)', () => {
  it('blocks MySQL executable comment /*!SELECT*/', () => {
    expect(blocks('1 UNION/*!50000SELECT*/pw FROM users')).toBe(true);
  });
  it('blocks triple-url-encoded traversal', () => {
    expect(blocks('%25252e%25252e%25252fetc%25252fpasswd')).toBe(true);
  });
  it('blocks ..; path-parameter traversal', () => {
    expect(blocks('..;/config')).toBe(true);
  });
  it('blocks <svg/onload= (slash before handler)', () => {
    expect(blocks('<svg/onload=alert(1)>')).toBe(true);
    expect(blocks('<img/onerror=alert(1)>')).toBe(true);
  });
  it('blocks command substitution $() and backticks', () => {
    expect(blocks('ping=$(id)')).toBe(true);
    expect(blocks('x=`whoami`')).toBe(true);
  });
  it('blocks quote-less tautology and time-based sqli', () => {
    expect(blocks('id=1 OR 1=1')).toBe(true);
    expect(blocks('id=1 AND SLEEP(5)')).toBe(true);
  });
  it('blocks SSRF via shorthand / hex-dotted / ipv4-mapped ipv6', () => {
    expect(blocks('url=http://127.1/')).toBe(true);
    expect(blocks('url=http://0x7f.0.0.1/')).toBe(true);
    expect(blocks('url=http://[::ffff:127.0.0.1]/')).toBe(true);
  });
  it('inspects the request body (all categories bypassed via POST before)', () => {
    expect(blocks("u=admin' OR '1'='1", 'body')).toBe(true);
    expect(blocks('<script>alert(1)</script>', 'body')).toBe(true);
  });
});

describe('WAF false-positive regressions', () => {
  it('allows a benign cookie pair value', () => {
    expect(blocks('theme=dark', 'header:cookie')).toBe(false);
  });
  it('allows UNION SELECT in prose', () => {
    expect(blocks('the UNION SELECT clause explained')).toBe(false);
  });
  it('still allows the benign lookalikes', () => {
    expect(blocks('q=I love the union of jazz')).toBe(false);
    expect(blocks('name=OBrien and the select best option')).toBe(false);
  });
});

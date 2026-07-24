import { describe, it, expect } from 'vitest';
import { canonicalize } from '../../src/waf/normalize.js';

describe('canonicalize', () => {
  it('strips inline comments (UNION/**/SELECT)', () => {
    expect(canonicalize('UNION/**/SELECT')).toContain('UNION SELECT');
  });

  it('double-url-decodes (%252e%252e%252f -> ../)', () => {
    expect(canonicalize('%252e%252e%252f')).toBe('../');
  });

  it('treats + as a space (form-encoding)', () => {
    expect(canonicalize('1%27+OR+%271')).toContain("1' OR '1");
  });

  it('folds fullwidth to ASCII via NFKC (＜script -> <script)', () => {
    expect(canonicalize('%EF%BC%9Cscript')).toContain('<script');
  });

  it('does not throw on malformed encoding', () => {
    expect(() => canonicalize('%zz%')).not.toThrow();
  });
});

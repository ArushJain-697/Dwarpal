import { useEffect, useState } from 'react';
import { ADMIN_BASE } from '../config.js';

/**
 * Settings — the WAF enforcement mode, live. This is the demo's kill switch:
 * flip to "off" and the same payloads that were 403ing sail through to the
 * backend; flip back to "block" and the wall is up again. The PUT propagates to
 * every proxy instance via Redis pub/sub.
 */

const MODES = [
  { key: 'block', label: 'Block', blurb: 'Inspect every request and 403 anything over the threshold. Production posture.' },
  { key: 'detect', label: 'Detect', blurb: 'Score and log attacks but let them through — for tuning without breaking traffic.' },
  { key: 'off', label: 'Off', blurb: 'No inspection at all. The wall is down — everything reaches the backends.' },
];

export function Settings() {
  const [mode, setMode] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${ADMIN_BASE}/api/settings/waf`)
      .then((r) => r.json())
      .then((d) => { if (alive) setMode(d.mode); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function choose(next) {
    if (next === mode || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${ADMIN_BASE}/api/settings/waf`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      const d = await res.json();
      if (res.ok) setMode(d.mode);
    } catch {
      // leave the current mode; the toggle just won't move
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card enter">
        <div className="card-core">
          <div className="card-head">
            <h2>WAF enforcement mode</h2>
            <span className="meta">{mode ? `now: ${mode}` : 'loading…'}</span>
          </div>
          <div className="modes">
            {MODES.map(({ key, label, blurb }) => (
              <button
                key={key}
                className={`mode m-${key} ${mode === key ? 'on' : ''}`}
                disabled={saving}
                onClick={() => choose(key)}
              >
                <span className="mode-top">
                  <span className="mode-name">{label}</span>
                  {mode === key && <span className="mode-live">active</span>}
                </span>
                <span className="mode-blurb">{blurb}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {mode === 'off' && (
        <div className="warn enter" style={{ animationDelay: '40ms' }}>
          The WAF is <strong>off</strong> — requests are no longer inspected. Set it back to
          <strong> Block</strong> before leaving the demo.
        </div>
      )}
    </>
  );
}

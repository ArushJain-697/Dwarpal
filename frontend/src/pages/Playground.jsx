import { useEffect, useRef, useState } from 'react';
import { navigate } from '../App.jsx';
import { ADMIN_BASE } from '../config.js';

/**
 * Playground — the terminal-free way to test the WAF. Each button fires a real
 * request through the proxy (server-side, via GET /api/playground), so the whole
 * pipeline runs, it gets logged, and it shows up in the live feed.
 *
 * Everything you need is on this one page: the WAF on/off switch, a payload per
 * attack class, a "fire all" barrage, and a box to type your own — no jumping to
 * other pages to run the demo.
 */

const ATTACKS = [
  { key: 'sqli', label: 'SQL injection', sends: "?q=1' OR '1'='1" },
  { key: 'xss', label: 'Cross-site scripting', sends: '?q=<script>alert(1)</script>' },
  { key: 'traversal', label: 'Path traversal', sends: '?file=../../etc/passwd' },
  { key: 'cmdi', label: 'Command injection', sends: '?cmd=; cat /etc/passwd' },
  { key: 'ssrf', label: 'SSRF', sends: '?url=http://127.0.0.1/' },
  { key: 'flood', label: 'Rapid-fire flood', sends: '150× /api/a/', tone: 'flood' },
  { key: 'benign', label: 'Benign request', sends: '?q=hello world', tone: 'benign' },
];

const VERDICT = {
  blocked: { cls: 'v-blocked', text: 'Blocked · 403' },
  detected: { cls: 'v-detected', text: 'Detected · 200 (logged, passed through)' },
  ratelimited: { cls: 'v-ratelimited', text: 'Rate limited · 429' },
  passed: { cls: 'v-passed', text: 'Passed · 200' },
  error: { cls: 'v-error', text: 'Error' },
};

const MODES = [
  { key: 'block', label: 'Block', note: 'Attacks are inspected and blocked with a 403. Production posture.' },
  { key: 'detect', label: 'Detect', note: 'Attacks are scored and logged, but let through (200) — for tuning.' },
  { key: 'off', label: 'Off', note: 'No inspection. The wall is down — attacks reach the backend.' },
];

const COUNTS = [
  { key: 'blocked', label: 'Blocked' },
  { key: 'detected', label: 'Detected' },
  { key: 'ratelimited', label: 'Rate limited' },
  { key: 'passed', label: 'Passed' },
];

export function Playground() {
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(null);
  const [mode, setMode] = useState(null);
  const [custom, setCustom] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    fetch(`${ADMIN_BASE}/api/settings/waf`)
      .then((r) => r.json())
      .then((d) => { if (alive) setMode(d.mode); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  async function setWaf(next) {
    if (next === mode) return;
    const prev = mode;
    setMode(next); // optimistic
    try {
      const r = await fetch(`${ADMIN_BASE}/api/settings/waf`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (!r.ok) setMode(prev);
    } catch {
      setMode(prev);
    }
  }

  async function run(key, value) {
    const qs = key === 'custom' ? `attack=custom&value=${encodeURIComponent(value || '')}` : `attack=${key}`;
    try {
      const res = await fetch(`${ADMIN_BASE}/api/playground?${qs}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setResults((prev) => [{ ...d, _id: seq.current++ }, ...prev].slice(0, 60));
    } catch {
      setResults((prev) => [{ _id: seq.current++, label: key === 'custom' ? 'Custom' : key, verdict: 'error', body: 'could not reach the proxy — is the stack up?' }, ...prev].slice(0, 60));
    }
  }

  async function fire(key, value) {
    if (busy) return;
    setBusy(key);
    await run(key, value);
    setBusy(null);
  }

  async function fireAll() {
    if (busy) return;
    setBusy('all');
    for (const a of ATTACKS) if (a.key !== 'flood' && a.key !== 'benign') await run(a.key);
    setBusy(null);
  }

  function fireCustom() {
    const v = custom.trim();
    if (v && !busy) fire('custom', v);
  }

  const counts = results.reduce((acc, r) => { acc[r.verdict] = (acc[r.verdict] || 0) + 1; return acc; }, {});
  const modeNote = MODES.find((m) => m.key === mode)?.note;

  return (
    <>
      <div className="pg-note enter">
        <h3>Attack it yourself — no terminal, no tools</h3>
        <p>
          Each button fires a <strong>real</strong> request through the proxy. Flip the WAF switch
          below and fire again to feel the difference — it all streams into the{' '}
          <a href="/dashboard/feed" onClick={(e) => { e.preventDefault(); navigate('/dashboard/feed'); }}>Live feed</a>.
        </p>
      </div>

      {/* WAF switch — right here, so there's no jumping to Settings */}
      <div className="pg-switch enter" style={{ animationDelay: '30ms' }}>
        <span className="pg-switch-k">WAF</span>
        <div className="pg-seg">
          {MODES.map((m) => (
            <button
              key={m.key}
              className={`pg-seg-btn m-${m.key} ${mode === m.key ? 'on' : ''}`}
              onClick={() => setWaf(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="pg-effect">{mode ? modeNote : 'loading…'}</span>
      </div>

      <div className="card enter" style={{ animationDelay: '60ms' }}>
        <div className="card-core">
          <div className="card-head">
            <h2>Send an attack</h2>
            <button className="pg-mini" disabled={busy !== null} onClick={fireAll}>
              {busy === 'all' ? 'firing all…' : 'Fire all ✳'}
            </button>
          </div>
          <div className="pg-buttons">
            {ATTACKS.map((a) => (
              <button key={a.key} className={`pg-btn ${a.tone || ''}`} disabled={busy !== null} onClick={() => fire(a.key)}>
                <span className="pg-btn-label">{busy === a.key ? 'firing…' : a.label}</span>
                <span className="pg-sends">{a.sends}</span>
              </button>
            ))}
          </div>
          <div className="pg-custom">
            <input
              type="text"
              placeholder="…or type your own payload, e.g.  1 UNION SELECT password FROM users"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') fireCustom(); }}
              disabled={busy !== null}
            />
            <button className="pg-btn" disabled={busy !== null || !custom.trim()} onClick={fireCustom}>Send</button>
          </div>
        </div>
      </div>

      <div className="card enter" style={{ animationDelay: '110ms', marginTop: 20 }}>
        <div className="card-core">
          <div className="card-head">
            <h2>Results</h2>
            <div className="pg-head-right">
              {results.length > 0 && <button className="pg-mini ghost" onClick={() => setResults([])}>Clear</button>}
              <span className="meta">{results.length}</span>
            </div>
          </div>

          {results.length > 0 && (
            <div className="pg-counts">
              {COUNTS.map((c) => (
                <div className={`pg-count v-${c.key}`} key={c.key}>
                  <b>{counts[c.key] || 0}</b>
                  <small>{c.label}</small>
                </div>
              ))}
            </div>
          )}

          {results.length === 0 ? (
            <div className="empty">Click an attack above and watch how the proxy responds</div>
          ) : (
            <div className="pg-results">
              {results.map((r) => {
                const v = VERDICT[r.verdict] || { cls: 'v-error', text: r.verdict };
                return (
                  <div className="pg-result" key={r._id}>
                    <div className="pg-r-top">
                      <span className="pg-r-label">{r.label}</span>
                      <span className={`pg-verdict ${v.cls}`}>{v.text}</span>
                    </div>
                    {r.request && <code className="pg-r-req">{r.request.method} {r.request.path}</code>}
                    {r.body && <div className="pg-r-body">{r.body}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

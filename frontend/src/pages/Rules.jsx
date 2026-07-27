import { useEffect, useState } from 'react';
import { ADMIN_BASE } from '../config.js';

/**
 * WAF rules — the active ruleset (GET /api/rules), read-only. Each rule shows
 * its category, score, and whether it blocks on its own or only contributes to
 * the anomaly total. This is the "not a single brittle regex" story, made visible.
 */

const CAT_LABEL = {
  sqli: 'SQL injection',
  xss: 'Cross-site scripting',
  traversal: 'Path traversal',
  cmdi: 'Command injection',
  ssrf: 'SSRF',
};

export function Rules() {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(`${ADMIN_BASE}/api/rules`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const rules = data?.rules || [];

  return (
    <>
      <div className="rule-note enter">
        <div>
          <span className="rn-k">Mode</span>
          <span className={`rn-mode m-${data?.mode || 'block'}`}>{data?.mode || '—'}</span>
        </div>
        <div>
          <span className="rn-k">Block threshold</span>
          <span className="rn-v">{data?.threshold ?? '—'}</span>
        </div>
        <p className="rn-explain">
          A request is scored against every rule; it's blocked once the total crosses the threshold.
          Strong signatures score at or above it and block alone — weak heuristics only add up, so a
          stray <code>--</code> or the word “union” never trips the wall by itself.
        </p>
      </div>

      <div className="card enter" style={{ animationDelay: '40ms' }}>
        <div className="card-core">
          <div className="card-head">
            <h2>Ruleset</h2>
            <span className="meta">{rules.length} rules</span>
          </div>
          <div className="thead rules-grid">
            <span>Rule</span>
            <span>Category</span>
            <span className="r">Score</span>
            <span className="r">Blocks alone</span>
          </div>
          <div className="tbody tall">
            {rules.map((r) => (
              <div className="trow rules-grid" key={r.id}>
                <span className="rule-id">{r.id}</span>
                <span className={`badge b-${r.category}`}>{CAT_LABEL[r.category] || r.category}</span>
                <span className="r rule-score">{r.score}</span>
                <span className="r">
                  {r.blocksAlone
                    ? <span className="yn yes">yes</span>
                    : <span className="yn no">contributes</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

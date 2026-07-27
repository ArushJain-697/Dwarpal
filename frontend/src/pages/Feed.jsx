import { useState } from 'react';
import { AttackFeed } from '../AttackFeed.jsx';

/**
 * Live feed — the full attack table with category / decision filters, applied
 * client-side over the live buffer the stream keeps (newest 500 events).
 *
 * ponytail: client-side filter over the in-memory buffer covers the demo; the
 * admin API already does keyset pagination (/api/logs) if deeper history is
 * ever needed here.
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sqli', label: 'SQLi' },
  { key: 'xss', label: 'XSS' },
  { key: 'traversal', label: 'Traversal' },
  { key: 'cmdi', label: 'Cmd inj' },
  { key: 'ssrf', label: 'SSRF' },
  { key: 'ratelimit', label: 'Rate limited' },
];

function matches(e, key) {
  if (key === 'all') return true;
  if (key === 'ratelimit') return e.decision === 'ratelimit';
  return e.category === key;
}

export function Feed({ attacks }) {
  const [filter, setFilter] = useState('all');
  const shown = attacks.filter((e) => matches(e, filter));

  return (
    <>
      <div className="chips enter">
        {FILTERS.map(({ key, label }) => {
          const count = key === 'all' ? attacks.length : attacks.filter((e) => matches(e, key)).length;
          return (
            <button
              key={key}
              className={`chip ${filter === key ? 'on' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className="chip-n">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="enter" style={{ animationDelay: '60ms', marginTop: 18 }}>
        <AttackFeed attacks={shown} title="Attack feed" tall />
      </div>
    </>
  );
}

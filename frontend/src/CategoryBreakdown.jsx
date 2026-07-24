/**
 * CategoryBreakdown — blocks by attack category.
 *
 * Total blocked plus a bar per category (sqli, xss, traversal, cmdi, ssrf),
 * each in its own jewel tone matching the feed badges.
 */

const CATEGORIES = [
  { key: 'sqli', label: 'SQL injection', color: 'var(--sqli)' },
  { key: 'xss', label: 'Cross-site scripting', color: 'var(--xss)' },
  { key: 'traversal', label: 'Path traversal', color: 'var(--traversal)' },
  { key: 'cmdi', label: 'Command injection', color: 'var(--cmdi)' },
  { key: 'ssrf', label: 'SSRF', color: 'var(--ssrf)' },
];

export function CategoryBreakdown({ stats }) {
  const byCategory = stats?.byCategory || {};
  const total = Object.values(byCategory).reduce((a, b) => a + b, 0);

  return (
    <div className="card">
      <div className="card-core">
        <div className="card-head">
          <h2>Block breakdown</h2>
          <span className="meta">{total} total</span>
        </div>

        <div className="cats">
          {CATEGORIES.map(({ key, label, color }) => {
            const count = byCategory[key] || 0;
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div className="cat" key={key}>
                <div className="cat-top">
                  <span className="cat-name" style={{ color }}>
                    {label}
                  </span>
                  <span className="cat-count">{count}</span>
                </div>
                <div className="cat-track">
                  <div
                    className="cat-fill"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * CategoryBreakdown — block counter + per-category breakdown.
 *
 * Shows total blocked requests as a big number plus a mini bar chart of
 * attack categories (sqli, xss, traversal, cmdi, ssrf).
 */

const CATEGORIES = [
  { key: 'sqli', label: 'SQLi', color: 'var(--cat-sqli)', bg: 'var(--cat-sqli-bg)' },
  { key: 'xss', label: 'XSS', color: 'var(--cat-xss)', bg: 'var(--cat-xss-bg)' },
  { key: 'traversal', label: 'Traversal', color: 'var(--cat-traversal)', bg: 'var(--cat-traversal-bg)' },
  { key: 'cmdi', label: 'CMDi', color: 'var(--cat-cmdi)', bg: 'var(--cat-cmdi-bg)' },
  { key: 'ssrf', label: 'SSRF', color: 'var(--cat-ssrf)', bg: 'var(--cat-ssrf-bg)' },
];

export function CategoryBreakdown({ stats }) {
  const byCategory = stats?.byCategory || {};
  const total = Object.values(byCategory).reduce((a, b) => a + b, 0) || 0;

  return (
    <div className="card">
      <div className="card-header">
        <span>Block Breakdown</span>
        <span className="count">{total} total</span>
      </div>

      <div style={{ padding: '18px' }}>
        {CATEGORIES.map(({ key, label, color, bg }) => {
          const count = byCategory[key] || 0;
          const pct = total > 0 ? (count / total) * 100 : 0;

          return (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                marginBottom: 4,
              }}>
                <span style={{ color, fontWeight: 600 }}>{label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                }}>
                  {count}
                </span>
              </div>
              <div style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--bg-surface)',
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: color,
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          );
        })}

        {total === 0 && (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            No blocks recorded yet
          </div>
        )}
      </div>
    </div>
  );
}

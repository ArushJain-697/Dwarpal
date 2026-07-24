/**
 * StatsBar — four KPI tiles: total requests, blocked, rate-limited, current rps.
 * Each tile carries its own accent bar. Numbers are Cabinet Grotesk, big.
 */

const CARDS = [
  { key: 'requestsTotal', label: 'Requests', tone: 'violet', color: 'var(--charcoal)' },
  { key: 'blocksTotal', label: 'Blocked', tone: 'rose', color: 'var(--sqli)' },
  { key: 'rateLimitedTotal', label: 'Rate limited', tone: 'amber', color: 'var(--amber)' },
  { key: 'rps', label: 'Req / sec', tone: 'emerald', color: 'var(--ok)' },
];

function format(value) {
  if (value === undefined || value === null) return '—';
  return typeof value === 'number' && Number.isInteger(value)
    ? value.toLocaleString()
    : String(value);
}

export function StatsBar({ stats }) {
  return (
    <div className="stats">
      {CARDS.map(({ key, label, tone, color }) => (
        <div className="stat" key={key} style={{ '--tone': color }}>
          <div className="stat-core">
            <div className="stat-label">{label}</div>
            <div className={`stat-num ${tone}`}>{format(stats?.[key])}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

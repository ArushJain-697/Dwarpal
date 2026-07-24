/**
 * StatsBar — four double-bezel glass stat cards.
 *
 * Total requests, blocked, rate-limited, and current rps. Numbers are tabular
 * monospace so they don't jitter as they tick.
 */

const CARDS = [
  { key: 'requestsTotal', label: 'Requests', tone: 'violet', dot: 'var(--accent)' },
  { key: 'blocksTotal', label: 'Blocked', tone: 'rose', dot: 'var(--sqli)' },
  { key: 'rateLimitedTotal', label: 'Rate limited', tone: 'amber', dot: 'var(--xss)' },
  { key: 'rps', label: 'Req / sec', tone: 'emerald', dot: 'var(--ok)' },
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
      {CARDS.map(({ key, label, tone, dot }) => (
        <div className="stat" key={key}>
          <span className="stat-spark" style={{ background: dot }} />
          <div className="stat-core">
            <div className="stat-label">{label}</div>
            <div className={`stat-num ${tone}`}>{format(stats?.[key])}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * StatsBar — the summary counters at the top of the dashboard.
 *
 * Shows total requests, blocked attacks, rate-limited, and current rps.
 * Each counter is a colored card. Numbers use monospace for alignment.
 */

export function StatsBar({ stats }) {
  if (!stats) {
    return (
      <div className="stats-bar">
        {['Requests', 'Blocked', 'Rate limited', 'RPS'].map((label) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color: 'var(--text-muted)' }}>—</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="stats-bar">
      <div className="stat-card">
        <div className="stat-label">Requests</div>
        <div className="stat-value blue">{stats.requestsTotal.toLocaleString()}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Blocked</div>
        <div className="stat-value red">{stats.blocksTotal.toLocaleString()}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Rate limited</div>
        <div className="stat-value amber">{stats.rateLimitedTotal.toLocaleString()}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">RPS</div>
        <div className="stat-value green">{stats.rps}</div>
      </div>
    </div>
  );
}

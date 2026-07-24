/**
 * AttackFeed — the live attack event feed.
 *
 * Renders each blocked/rate-limited request as a row with a timestamp, method,
 * path, category badge, and status code. Newest events appear at the top.
 *
 * All attacker-controlled strings (paths, user-agents) are rendered through
 * React's auto-escaping — never dangerouslySetInnerHTML — to prevent
 * stored-XSS-via-our-own-logs from reaching the admin session.
 */

function formatTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function Badge({ decision, category }) {
  if (decision === 'ratelimit') {
    return <span className="badge badge-ratelimit">429</span>;
  }
  if (!category) {
    return <span className="badge badge-sqli">block</span>;
  }
  const cls = `badge badge-${category}`;
  return <span className={cls}>{category}</span>;
}

export function AttackFeed({ attacks }) {
  return (
    <div className="card">
      <div className="card-header">
        <span>Live Attack Feed</span>
        <span className="count">{attacks.length} events</span>
      </div>

      {attacks.length === 0 ? (
        <div className="empty-state">
          No attacks detected yet — run <code>make curl-suite</code> to fire test payloads
        </div>
      ) : (
        <div className="feed-list">
          {attacks.map((event, i) => (
            <div className="feed-row" key={event.id || i}>
              <span className="feed-time">{formatTime(event.ts)}</span>
              <Badge decision={event.decision} category={event.category} />
              <span className="feed-path" title={event.path}>
                {event.method} {event.path}
              </span>
              <span className="feed-path" style={{ textAlign: 'right' }}>
                {event.clientIp}
              </span>
              <span className={`feed-status s${event.status}`}>
                {event.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

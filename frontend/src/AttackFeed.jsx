/**
 * AttackFeed — the live attack feed as a data table.
 *
 * Columns: time, threat category, request, source IP, status. Newest on top.
 * Attacker-controlled strings (paths, IPs) render through React's auto-escaping
 * — never dangerouslySetInnerHTML.
 */

function time(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function Badge({ decision, category }) {
  if (decision === 'ratelimit') return <span className="badge b-ratelimit">429</span>;
  const cat = category || 'sqli';
  return <span className={`badge b-${cat}`}>{category || 'block'}</span>;
}

export function AttackFeed({ attacks }) {
  return (
    <div className="card">
      <div className="card-core">
        <div className="card-head">
          <h2>Live attack feed</h2>
          <span className="meta">{attacks.length} events</span>
        </div>

        {attacks.length === 0 ? (
          <div className="empty">
            No attacks yet — run <code>make curl-suite</code> to fire test payloads
          </div>
        ) : (
          <>
            <div className="thead">
              <span>Time</span>
              <span>Threat</span>
              <span>Request</span>
              <span className="r ip-h">Source</span>
              <span className="r">Status</span>
            </div>
            <div className="tbody">
              {attacks.map((e, i) => (
                <div className="trow" key={e.id || i}>
                  <span className="t">{time(e.ts)}</span>
                  <Badge decision={e.decision} category={e.category} />
                  <span className="path" title={`${e.method} ${e.path}`}>
                    {e.method} {e.path}
                  </span>
                  <span className="ip">{e.clientIp}</span>
                  <span className={`code c${e.status}`}>{e.status}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

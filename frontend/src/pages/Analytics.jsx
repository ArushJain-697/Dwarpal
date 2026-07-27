import { useEffect, useState } from 'react';
import { ADMIN_BASE } from '../config.js';
import { CategoryBreakdown } from '../CategoryBreakdown.jsx';

/**
 * Analytics — traffic and threats over a chosen window, aggregated server-side
 * from the partitioned request_logs (GET /api/analytics). Requests-vs-blocked
 * trend, top attacking IPs, block breakdown, and the status-code mix.
 */

const RANGES = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
];

const STATUS_TONES = { '2xx': 'var(--ok)', '3xx': 'var(--sage)', '4xx': 'var(--amber)', '5xx': 'var(--sqli)' };

// ── time-series area chart (requests vs blocked) ─────────────────────────────
const W = 680;
const H = 200;
const PAD = 14;

function line(points, key, maxY) {
  const step = (W - 2 * PAD) / Math.max(1, points.length - 1);
  return points
    .map((p, i) => {
      const x = PAD + i * step;
      const y = H - PAD - (p[key] / maxY) * (H - 2 * PAD);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function tickLabel(t, bucket) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return bucket === 'hour' ? `${p(d.getHours())}:00` : `${d.getMonth() + 1}/${d.getDate()}`;
}

function TrendChart({ series, bucket }) {
  if (series.length < 2) {
    return <div className="empty" style={{ padding: '64px 0' }}>Not enough history — run <code>make seed</code> for 24h of traffic</div>;
  }
  const maxY = Math.max(1, ...series.map((p) => p.requests));
  const req = line(series, 'requests', maxY);
  const blk = line(series, 'blocked', maxY);
  const area = `${req} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z`;
  const labels = [0, Math.floor(series.length / 2), series.length - 1];

  return (
    <>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 200 }}>
        {[0.25, 0.5, 0.75].map((f) => {
          const y = PAD + f * (H - 2 * PAD);
          return <line key={f} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeDasharray="3 4" />;
        })}
        <path d={area} fill="var(--sage)" fillOpacity="0.6" />
        <path d={req} fill="none" stroke="var(--charcoal)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={blk} fill="none" stroke="var(--sqli)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="axis">
        {labels.map((i) => <span key={i}>{tickLabel(series[i].t, bucket)}</span>)}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--charcoal)' }} />requests</span>
        <span><i style={{ background: 'var(--sqli)' }} />blocked</span>
      </div>
    </>
  );
}

export function Analytics() {
  const [range, setRange] = useState('24h');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${ADMIN_BASE}/api/analytics?range=${range}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) { setData(null); setLoading(false); } });
    return () => { alive = false; };
  }, [range]);

  const series = data?.series || [];
  const topIps = data?.topIps || [];
  const maxIp = Math.max(1, ...topIps.map((r) => r.count));
  const statusEntries = Object.entries(data?.byStatus || {});
  const statusTotal = statusEntries.reduce((a, [, n]) => a + n, 0);

  return (
    <>
      <div className="an-head enter">
        <div className="chips">
          {RANGES.map(({ key, label }) => (
            <button key={key} className={`chip ${range === key ? 'on' : ''}`} onClick={() => setRange(key)}>
              {label}
            </button>
          ))}
        </div>
        <span className="an-note">
          {loading ? 'loading…' : data?.source === 'memory' ? 'no database — connect Postgres for history' : `aggregated from request_logs`}
        </span>
      </div>

      <div className="card enter" style={{ animationDelay: '40ms' }}>
        <div className="card-core">
          <div className="card-head">
            <h2>Requests vs blocked</h2>
            <span className="meta">{series.reduce((a, p) => a + p.requests, 0).toLocaleString()} requests</span>
          </div>
          <div className="chart-wrap">
            <TrendChart series={series} bucket={data?.bucket || 'hour'} />
          </div>
        </div>
      </div>

      <div className="panels enter" style={{ animationDelay: '90ms', marginTop: 20 }}>
        <div className="card">
          <div className="card-core">
            <div className="card-head">
              <h2>Top attacking IPs</h2>
              <span className="meta">{topIps.length}</span>
            </div>
            <div className="iplist">
              {topIps.length === 0 ? (
                <div className="empty" style={{ padding: '32px 0' }}>No blocked sources in this window</div>
              ) : (
                topIps.map((r) => (
                  <div className="iprow" key={r.ip}>
                    <span className="ip-addr">{r.ip}</span>
                    <span className="ip-bar"><i style={{ width: `${(r.count / maxIp) * 100}%` }} /></span>
                    <span className="ip-count">{r.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <CategoryBreakdown stats={{ byCategory: data?.byCategory || {} }} />
      </div>

      <div className="card enter" style={{ animationDelay: '140ms', marginTop: 20 }}>
        <div className="card-core">
          <div className="card-head">
            <h2>Status codes</h2>
            <span className="meta">{statusTotal.toLocaleString()} total</span>
          </div>
          <div className="statusmix">
            {statusEntries.length === 0 ? (
              <div className="empty" style={{ padding: '24px 0' }}>No traffic in this window</div>
            ) : (
              statusEntries.map(([cls, n]) => (
                <div className="smrow" key={cls}>
                  <span className="sm-lab" style={{ color: STATUS_TONES[cls] || 'var(--charcoal)' }}>{cls}</span>
                  <span className="sm-track"><i style={{ width: `${(n / statusTotal) * 100}%`, background: STATUS_TONES[cls] || 'var(--charcoal)' }} /></span>
                  <span className="sm-n">{n.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * RpsChart — requests/sec over time, total vs blocked.
 *
 * A lightweight hand-rolled SVG line chart (no chart library). The green line
 * is total throughput, the red line is blocked-per-second; the gap between them
 * reads as "still serving traffic while under attack". Points are capped by the
 * hook, and there's no animation, so it stays cheap under load.
 */

const W = 600;
const H = 150;
const PAD = 10;

function buildPath(points, accessor, maxY) {
  if (points.length === 0) return '';
  const stepX = (W - 2 * PAD) / Math.max(1, points.length - 1);
  return points
    .map((p, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (accessor(p) / maxY) * (H - 2 * PAD);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function RpsChart({ series }) {
  const current = series.length ? series[series.length - 1] : null;
  const maxY = Math.max(1, ...series.map((p) => p.rps));

  const totalPath = buildPath(series, (p) => p.rps, maxY);
  const blockedPath = buildPath(series, (p) => p.blockedRps, maxY);
  const areaPath = totalPath
    ? `${totalPath} L${(W - PAD).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`
    : '';

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span>Requests / sec</span>
        <span className="count">
          <span style={{ color: 'var(--green)' }}>{current ? current.rps.toFixed(1) : '0'}</span>
          {' rps · '}
          <span style={{ color: 'var(--red)' }}>
            {current ? current.blockedRps.toFixed(1) : '0'}
          </span>
          {' blocked'}
        </span>
      </div>

      <div style={{ padding: 16 }}>
        {series.length < 2 ? (
          <div className="empty-state" style={{ padding: '40px 0' }}>
            collecting live traffic…
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: 150, display: 'block' }}
          >
            <path d={areaPath} fill="var(--green-dim)" />
            <path d={totalPath} fill="none" stroke="var(--green)" strokeWidth="2" />
            <path d={blockedPath} fill="none" stroke="var(--red)" strokeWidth="2" />
          </svg>
        )}

        <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 12 }}>
          <Legend color="var(--green)" label="total" />
          <Legend color="var(--red)" label="blocked" />
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
      <span style={{ width: 12, height: 3, borderRadius: 2, background: color }} />
      {label}
    </span>
  );
}

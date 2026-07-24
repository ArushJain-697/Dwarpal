/**
 * RpsChart — requests/sec over time, total vs blocked.
 *
 * A hand-rolled SVG line chart (no chart library): a gradient-stroked total line
 * with a soft area fill, and a blocked line beneath. The gap between them reads
 * as "still serving traffic while under attack". Points are capped by the hook
 * and there's no animation, so it stays cheap under load.
 */

const W = 640;
const H = 168;
const PAD = 12;

function path(points, accessor, maxY) {
  if (points.length === 0) return '';
  const step = (W - 2 * PAD) / Math.max(1, points.length - 1);
  return points
    .map((p, i) => {
      const x = PAD + i * step;
      const y = H - PAD - (accessor(p) / maxY) * (H - 2 * PAD);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

export function RpsChart({ series }) {
  const current = series.length ? series[series.length - 1] : null;
  const maxY = Math.max(1, ...series.map((p) => p.rps));

  const total = path(series, (p) => p.rps, maxY);
  const blocked = path(series, (p) => p.blockedRps, maxY);
  const area = total ? `${total} L${W - PAD},${H - PAD} L${PAD},${H - PAD} Z` : '';

  return (
    <div className="card">
      <div className="card-core">
        <div className="card-head">
          <h2>Requests / sec</h2>
          <span className="meta">
            <span style={{ color: 'var(--ok)' }}>{current ? current.rps.toFixed(1) : '0.0'}</span>
            {' total · '}
            <span style={{ color: 'var(--sqli)' }}>
              {current ? current.blockedRps.toFixed(1) : '0.0'}
            </span>
            {' blocked'}
          </span>
        </div>

        <div className="chart-wrap">
          {series.length < 2 ? (
            <div className="empty" style={{ padding: '52px 0' }}>
              collecting live traffic…
            </div>
          ) : (
            <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <path d={area} fill="var(--sage)" fillOpacity="0.55" />
              <path
                d={total}
                fill="none"
                stroke="var(--charcoal)"
                strokeWidth="2.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={blocked}
                fill="none"
                stroke="var(--sqli)"
                strokeWidth="2.25"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
          )}

          <div className="legend">
            <span>
              <i style={{ background: 'var(--charcoal)' }} />
              total
            </span>
            <span>
              <i style={{ background: 'var(--sqli)' }} />
              blocked
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

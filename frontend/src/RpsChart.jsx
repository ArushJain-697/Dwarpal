/**
 * RpsChart — requests/sec over time, total vs blocked.
 *
 * Hand-rolled SVG (no chart library): subtle gridlines, a charcoal total line
 * with a sage area fill and a live end-point dot, and a red blocked line
 * beneath. Points are capped by the hook, no animation.
 */

const W = 640;
const H = 176;
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

  const lastX = PAD + (series.length - 1) * ((W - 2 * PAD) / Math.max(1, series.length - 1));
  const lastY = current ? H - PAD - (current.rps / maxY) * (H - 2 * PAD) : 0;

  return (
    <div className="card">
      <div className="card-core">
        <div className="card-head">
          <h2>Requests / sec</h2>
          <span className="meta">
            <span style={{ color: 'var(--charcoal)' }}>{current ? current.rps.toFixed(1) : '0.0'}</span>
            {' total · '}
            <span style={{ color: 'var(--sqli)' }}>{current ? current.blockedRps.toFixed(1) : '0.0'}</span>
            {' blocked'}
          </span>
        </div>

        <div className="chart-wrap">
          {series.length < 2 ? (
            <div className="empty" style={{ padding: '54px 0' }}>
              collecting live traffic…
            </div>
          ) : (
            <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              {[0.25, 0.5, 0.75].map((f) => {
                const y = PAD + f * (H - 2 * PAD);
                return (
                  <line key={f} x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeDasharray="3 4" />
                );
              })}
              <path d={area} fill="var(--sage)" fillOpacity="0.6" />
              <path d={total} fill="none" stroke="var(--charcoal)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              <path d={blocked} fill="none" stroke="var(--sqli)" strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={lastX} cy={lastY} r="3.5" fill="var(--charcoal)" stroke="var(--paper)" strokeWidth="2" />
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

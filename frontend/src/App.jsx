import './index.css';
import { useLiveStream } from './useLiveStream.js';
import { StatsBar } from './StatsBar.jsx';
import { RpsChart } from './RpsChart.jsx';
import { AttackFeed } from './AttackFeed.jsx';
import { CategoryBreakdown } from './CategoryBreakdown.jsx';

export function App() {
  const { connected, stats, attacks, series } = useLiveStream();

  return (
    <>
      <div className="aurora" />
      <div className="grain" />

      <div className="dashboard">
        <header className="head rise" style={{ animationDelay: '0ms' }}>
          <div>
            <span className="eyebrow">
              <span
                className="dot"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: connected ? 'var(--ok)' : 'var(--sqli)',
                  display: 'inline-block',
                }}
              />
              live threat monitor
            </span>
            <div className="wordmark">Dwarpal</div>
            <p className="tagline">reverse proxy &amp; web application firewall</p>
          </div>

          <div className={`status ${connected ? 'live' : 'offline'}`}>
            <span className="dot" />
            {connected ? 'connected' : 'reconnecting'}
          </div>
        </header>

        <div className="rise" style={{ animationDelay: '80ms' }}>
          <StatsBar stats={stats} />
        </div>

        <div className="rise" style={{ animationDelay: '160ms' }}>
          <RpsChart series={series} />
        </div>

        <div className="panels">
          <div className="rise" style={{ animationDelay: '240ms' }}>
            <AttackFeed attacks={attacks} />
          </div>
          <div className="rise" style={{ animationDelay: '320ms' }}>
            <CategoryBreakdown stats={stats} />
          </div>
        </div>
      </div>
    </>
  );
}

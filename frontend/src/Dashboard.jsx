import { navigate } from './App.jsx';
import { useLiveStream } from './useLiveStream.js';
import { StatsBar } from './StatsBar.jsx';
import { RpsChart } from './RpsChart.jsx';
import { AttackFeed } from './AttackFeed.jsx';
import { CategoryBreakdown } from './CategoryBreakdown.jsx';

export function Dashboard() {
  const { connected, stats, attacks, series } = useLiveStream();

  return (
    <div className="app">
      <div className="aurora" />
      <div className="grain" />

      <header className="topbar">
        <a
          className="tb-brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          <span className="tb-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffe17c" stroke="#ffe17c" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-3Z" />
            </svg>
          </span>
          Dwarpal
          <span className="tb-sub">Threat Monitor</span>
        </a>
        <div className="tb-right">
          <span className={`live ${connected ? 'on' : 'off'}`}>
            <span className="live-dot" />
            {connected ? 'Live' : 'Reconnecting'}
          </span>
        </div>
      </header>

      <main className="main">
        <div className="main-head">
          <h1>Overview</h1>
          <div className="sub">Real-time traffic across the proxy edge</div>
        </div>

        <div className="enter">
          <StatsBar stats={stats} />
        </div>
        <div className="enter" style={{ animationDelay: '60ms', marginTop: 20 }}>
          <RpsChart series={series} />
        </div>
        <div className="panels enter" style={{ animationDelay: '120ms', marginTop: 20 }}>
          <AttackFeed attacks={attacks} />
          <CategoryBreakdown stats={stats} />
        </div>
      </main>
    </div>
  );
}

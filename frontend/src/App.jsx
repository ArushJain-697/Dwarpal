import './index.css';
import { useLiveStream } from './useLiveStream.js';
import { StatsBar } from './StatsBar.jsx';
import { RpsChart } from './RpsChart.jsx';
import { AttackFeed } from './AttackFeed.jsx';
import { CategoryBreakdown } from './CategoryBreakdown.jsx';

export function App() {
  const { connected, stats, attacks, series } = useLiveStream();

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>
          Dwarpal
          <span className={`connection-dot ${connected ? 'live' : 'offline'}`} />
        </h1>
        <span className="tagline">reverse proxy + web application firewall</span>
      </div>

      <StatsBar stats={stats} />

      <RpsChart series={series} />

      <div className="panels" style={{ gridTemplateColumns: '1fr 320px' }}>
        <AttackFeed attacks={attacks} />
        <CategoryBreakdown stats={stats} />
      </div>
    </div>
  );
}

import { StatsBar } from '../StatsBar.jsx';
import { RpsChart } from '../RpsChart.jsx';
import { AttackFeed } from '../AttackFeed.jsx';
import { CategoryBreakdown } from '../CategoryBreakdown.jsx';

/**
 * Overview — the at-a-glance page: KPI tiles, the live RPS chart, the most
 * recent events and the block breakdown. Reads the shared live stream.
 */
export function Overview({ stats, attacks, series }) {
  return (
    <>
      <div className="enter">
        <StatsBar stats={stats} />
      </div>
      <div className="enter" style={{ animationDelay: '60ms', marginTop: 20 }}>
        <RpsChart series={series} />
      </div>
      <div className="panels enter" style={{ animationDelay: '120ms', marginTop: 20 }}>
        <AttackFeed attacks={attacks.slice(0, 8)} title="Recent events" />
        <CategoryBreakdown stats={stats} />
      </div>
    </>
  );
}

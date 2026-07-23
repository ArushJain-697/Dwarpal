import { useLiveStream } from './useLiveStream.js';

export function App() {
  const { connected, stats, attacks } = useLiveStream();

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ margin: 0 }}>Dwarpal</h1>
      <p style={{ color: '#888', marginTop: 4 }}>reverse proxy + web application firewall</p>

      <p>
        status:{' '}
        <strong style={{ color: connected ? '#2e7d32' : '#c62828' }}>
          {connected ? 'connected' : 'disconnected'}
        </strong>
      </p>

      {stats ? (
        <ul>
          <li>requests: {stats.requestsTotal}</li>
          <li>blocked: {stats.blocksTotal}</li>
          <li>rate-limited: {stats.rateLimitedTotal}</li>
          <li>rps: {stats.rps}</li>
        </ul>
      ) : (
        <p>waiting for first stats frame…</p>
      )}

      <p>attack feed: {attacks.length} events buffered</p>
    </div>
  );
}

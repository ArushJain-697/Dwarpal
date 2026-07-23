import { useEffect, useRef, useState } from 'react';
import { ADMIN_BASE, WS_URL } from './config.js';

const MAX_ATTACKS = 500; // cap the client-side feed so it never grows unbounded

/**
 * Connects to the proxy's live feed:
 *   1. backfills recent history from /api/logs so the UI isn't empty,
 *   2. opens the WebSocket for live coalesced frames,
 *   3. reconnects with exponential backoff if the socket drops.
 *
 * Returns { connected, stats, attacks }.
 */
export function useLiveStream() {
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState(null);
  const [attacks, setAttacks] = useState([]);

  const wsRef = useRef(null);
  const backoffRef = useRef(250);
  const closedRef = useRef(false);

  function pushAttacks(items) {
    if (!items || items.length === 0) return;
    setAttacks((prev) => [...items, ...prev].slice(0, MAX_ATTACKS));
  }

  async function backfill() {
    try {
      const res = await fetch(`${ADMIN_BASE}/api/logs?limit=100`);
      const data = await res.json();
      const recent = (data.logs || []).filter(
        (r) => r.decision === 'block' || r.decision === 'ratelimit',
      );
      pushAttacks(recent);
    } catch {
      // ignore — the live stream will fill in
    }
  }

  useEffect(() => {
    closedRef.current = false;
    backfill();

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        backoffRef.current = 250; // reset backoff on a good connection
      };

      ws.onmessage = (event) => {
        const frame = JSON.parse(event.data);
        if (frame.type === 'tick') {
          setStats(frame.stats);
          pushAttacks(frame.attacks);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (closedRef.current) return;
        const delay = Math.min(backoffRef.current, 8000);
        backoffRef.current = delay * 2;
        setTimeout(connect, delay);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      closedRef.current = true;
      wsRef.current?.close();
    };
  }, []);

  return { connected, stats, attacks };
}

import { useEffect, useRef, useState } from 'react';
import { ADMIN_BASE, WS_URL } from './config.js';

const MAX_ATTACKS = 500; // cap the client-side feed so it never grows unbounded
const MAX_POINTS = 120; // rolling window for the rps chart

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
  const [series, setSeries] = useState([]);

  const wsRef = useRef(null);
  const backoffRef = useRef(250);
  const closedRef = useRef(false);
  const prevRef = useRef({ blocks: null, t: null }); // for deriving blocked-per-second

  function pushAttacks(items) {
    if (!items || items.length === 0) return;
    setAttacks((prev) => {
      // The backfill and the live feed overlap, so dedupe by id across the whole
      // merged list (newest first) — otherwise duplicate keys make React omit rows.
      const seen = new Set();
      const out = [];
      for (const a of [...items, ...prev]) {
        if (a.id && seen.has(a.id)) continue;
        if (a.id) seen.add(a.id);
        out.push(a);
        if (out.length >= MAX_ATTACKS) break;
      }
      return out;
    });
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

          // Derive blocked-per-second by diffing the cumulative block counter.
          const now = Date.now();
          const prev = prevRef.current;
          let blockedRps = 0;
          if (prev.blocks !== null) {
            const dt = (now - prev.t) / 1000;
            if (dt > 0) blockedRps = Math.max(0, (frame.stats.blocksTotal - prev.blocks) / dt);
          }
          prevRef.current = { blocks: frame.stats.blocksTotal, t: now };

          setSeries((prevSeries) =>
            [...prevSeries, { t: now, rps: frame.stats.rps, blockedRps }].slice(-MAX_POINTS),
          );
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

  return { connected, stats, attacks, series };
}

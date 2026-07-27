# Dwarpal

> A self-hosted reverse proxy + Web Application Firewall — a "build-your-own mini-Cloudflare".

Dwarpal sits in front of your backends and mediates **all** web traffic through an ordered
pipeline of async **stages**. Any stage can short-circuit a request (block, rate-limit, 404);
a terminal stage streams it to a healthy upstream and streams the response back — no full-body
buffering. It inspects every request for SQLi / XSS / path-traversal / command-injection / SSRF,
rate-limits abusers, logs everything to partitioned Postgres, and pushes a live attack dashboard
over WebSocket.

*Dwarpal* (द्वारपाल) is Sanskrit for the guardian who stands at the door — nothing reaches the
backends except through it.

---

## The demo

```bash
make demo         # clean boot + 24h of seeded history (never demo from empty)
# open http://localhost:5173 — point at the attack spike ~2h ago

make curl-suite   # one crafted request per class → 403; a benign lookalike stays 200
make attack       # sqlmap hammers the proxy → blocks stream, rate-limits kick in
make loadtest     # autocannon → still serving thousands of rps under attack
```

**The kill shot:** flip `WAF_MODE=off` (via the admin API or dashboard), rerun `make attack`,
and watch sqlmap dump the users table. Turn it back on. *"That's what's behind the wall."*

---

## Architecture

```
                         host: 8080 (proxy)   3000 (admin)   5173 (dashboard)
   ┌───────────────── edge-net (bridge) ──────────────────┐
   │   attacker →  proxy  ·  admin  ·  dashboard (nginx)   │
   └──────────────────┬───────────────────────────────────┘
   ┌───────── app-net (internal: true — no host route) ────┐
   │   backend-a1 · backend-a2 · backend-b · postgres · redis │
   └───────────────────────────────────────────────────────┘
```

The backends, Postgres, and Redis have **no host-published port** — the only path to them is
*through* the proxy. That is the threat model: the proxy is the sole ingress.

### Request pipeline

```
ingest → ratelimit → waf → route → loadbalance → forward
```

Each stage reads and writes a fixed-shape `RequestContext` and returns a `Verdict`
(continue / short-circuit). New behaviour is a new stage — no rewrites. Logging is a kernel
*finalizer*, not a stage, so blocked attacks are still logged.

---

## What it does

- **Reverse proxy** — raw `node:http`, streaming both directions with backpressure, hop-by-hop
  header stripping, XFF handling, request-smuggling (CL+TE) guard.
- **Load balancing** — round-robin over healthy targets, per-upstream keep-alive agents.
- **Resilience** — active health checks with hysteresis, per-target circuit breaker, idempotent
  bounded retries, layered timeouts, graceful drain on SIGTERM.
- **WAF** — input normalization (decode-until-stable, NFKC, comment-unwrap, `+`→space) defeats
  encoding evasion; weighted anomaly scoring over a threshold (not brittle single-regex);
  inspects query, path, headers **and the request body** (incl. gzip/deflate, bounded-decompressed);
  off/detect/block modes toggled live; SSRF address guard across decimal/hex/octal/shorthand/
  IPv4-mapped forms.
- **Rate limiting** — atomic Redis Lua token bucket, correct across instances, **fails open**.
- **Observability** — structured logs, in-memory metrics + rolling RPS, batched non-blocking
  writes to partitioned Postgres (drops under overload, never stalls the hot path).
- **Control plane** — admin API on a separate port; live WAF toggle propagated to all instances
  via Redis pub/sub.
- **Dashboard** — live attack feed, stat row, category breakdown, RPS chart (React + Vite).

---

## Layout

```
backend/     the proxy + admin (Node.js, plain JS)
  src/       core · config · proxy · stages · waf · ratelimit · obs · admin · db · redis
  test/      unit (WAF corpus + FP gate) · integration (gate-not-bystander)
  migrations/
frontend/    the dashboard (React + Vite + nginx)
attacker/    curl-suite · sqlmap · autocannon
compose.yaml · compose.prod.yaml · Makefile
```

---

## Quick start

```bash
make init     # create backend/.env from the example
make up       # build + start the whole stack (health-gated)
make migrate  # create the request_logs schema
make seed     # 24h of history + an attack spike
# open http://localhost:5173
```

Ports: **8080** proxy · **3000** admin · **5173** dashboard.

## Make targets

| Target | Does |
|---|---|
| `up` / `down` / `nuke` | start / stop / wipe the stack |
| `demo` | clean boot + migrate + seed |
| `curl-suite` / `attack` / `loadtest` | drive the demo |
| `migrate` / `seed` | database setup |
| `restart` | reload the proxy after backend edits |
| `test` | run the backend test suite |
| `dev` / `web` | run proxy / dashboard locally (no containers) |

---

## Tech stack

Node.js 22 (raw `http`) · PostgreSQL 16 (RANGE-partitioned by day) · Redis 7 (ioredis) ·
`ws` · React 18 + Vite 5 · Docker Compose · vitest.

## Testing

```bash
make test    # or: cd backend && npm test
```

- **Unit** — table-driven WAF corpus: every malicious payload blocks, every benign lookalike
  passes, **false-positive rate === 0**; plus normalization/evasion coverage.
- **Integration** — the proxy in-process against a recording stub: a blocked SQLi returns 403
  **and never reaches the upstream** (proves the WAF is a gate, not a bystander).

## On the WAF ruleset

The ~15 hand-written rules exist to **demonstrate the engine** — normalization, weighted
anomaly scoring, per-field inspection, block/detect/off. They are illustrative, not exhaustive:
hand-maintaining coverage against every encoding trick is a treadmill, which is exactly why
production WAFs load a maintained ruleset. The clean upgrade path is to feed the engine the
**OWASP Core Rule Set** and swap V8 `RegExp` for **re2** (linear-time, ReDoS-immune) — the rule
shape (`{id, category, score, pattern|match}`) is already compatible.

The system has been **battle-tested** with a multi-agent workflow (WAF penetration + sqlmap +
protocol abuse + load storm + chaos): it survives dependency outages (fail-open rate limiter,
non-blocking logging, health-check failover, graceful drain), holds ~14k rps at p99 14ms through
the full pipeline, and no malformed packet crashes it.

## Security notes

Client IP resolved via trusted-proxy depth (XFF appended, never trusted) · server-generated
request IDs · SSRF egress allowlist + post-decode address checks · WAF fails **closed**, rate
limiter fails **open** (deliberate opposite defaults) · block pages leak nothing · backend
headers stripped, security headers added · admin plane isolated on its own port · non-root
container user.

## Configuration

All config is env vars, validated at boot (see `backend/.env.example`). Postgres and Redis are
optional — logging degrades to console-only and the rate limiter fails open if they're absent.

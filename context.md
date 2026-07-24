# Sentinel — Definitive 4-Day Master Build Plan

> A self-hosted reverse-proxy + Web Application Firewall ("build your own mini-Cloudflare"), engineered as one composable async pipeline so every future "epic" phase slots in as a new stage, never a rewrite.

This plan is written to be executed by one strong systems-minded developer in 4 intense days. It is deliberately deep — but the **critical path is a self-sufficient spine**: if you build only the tasks marked **[CRITICAL]**, you finish Day 4 with a working, demoable proxy + WAF + live dashboard. Everything marked **[STRETCH]** adds genuine backend surface without threatening the demo.

Read the whole thing once before you touch a keyboard. Then live in Section 7.

---

## Table of contents

1. [What you're building](#1-what-youre-building)
2. [System architecture](#2-system-architecture)
3. [The core abstraction](#3-the-core-abstraction)
4. [Tech stack](#4-tech-stack)
5. [Repo / file structure](#5-repo--file-structure)
6. [Data model](#6-data-model)
7. [The 4-day plan](#7-the-4-day-plan)
8. [Testing & demo playbook](#8-testing--demo-playbook)
9. [Security hardening checklist](#9-security-hardening-checklist)
10. [Epic roadmap](#10-epic-roadmap)
11. [Concept glossary](#11-concept-glossary)

---

## 1. What you're building

**Sentinel** is a single Node.js/TypeScript service that sits in front of your backend containers and mediates *all* web traffic. Every request flows through an ordered pipeline of async **stages**. Any stage can short-circuit the request with a typed **verdict** (block, rate-limit, 404, future cache-hit). If none does, a terminal `forward` stage streams the request to a healthy upstream and streams the response back — with no full-body buffering.

Concretely, Sentinel:

- **Routes / load-balances** requests to Docker-hosted backends (host + longest-prefix match, round-robin over healthy targets).
- **Inspects** every request for SQLi, XSS, path traversal, command injection, and SSRF — using input normalization to defeat encoding evasion and a weighted anomaly score, not brittle single-regex matching.
- **Rate-limits** abusers with an atomic Redis token bucket.
- **Logs everything** to a day-partitioned Postgres table through a batched async writer that *never* blocks the hot path.
- **Pushes a live attack dashboard** over WebSocket.

### The money shot (the demo you're building toward)

Split terminal + browser on one screen:

1. `make demo` — clean boot with 24h of seeded history; point at yesterday's attack spike on the dashboard.
2. `make curl-suite` — one crafted request per attack class lights up a dashboard category as **403 blocked**; a benign lookalike request stays **green** ("real WAF, not a brick wall").
3. `make attack` — **sqlmap** hammers the proxy; the "blocked" counter climbs into the hundreds live; per-IP rate-limiting starts returning **429**.
4. `make loadtest` — autocannon shows the proxy still serving thousands of rps with single-digit-ms WAF overhead **while under attack**.
5. **Kill shot:** flip `WAF_MODE=off`, rerun sqlmap → it **dumps the users table**. Turn it back on. "That's what's behind the wall."

The product is relatable on the surface. The substance is backend-heavy: concurrency, streaming/backpressure, connection pooling, health checks, circuit breaking, batched logging, partitioning, rate-limiting algorithms, config hot-reload, WebSocket backpressure, and a real WAF test suite.

---

## 2. System architecture

Sentinel is **one codebase** that runs in one of three **roles** (`SENTINEL_ROLE=proxy|admin|all`), so the control plane and data plane are separable from day one:

- **Data plane** (raw `node:http`, `role=proxy`): the hot path. Reads only an in-memory, frozen config snapshot. Never touches Postgres directly.
- **Control plane** (Express, `role=admin`, separate port): does all writes. Rule/route/config CRUD → Postgres → publishes `config:reload` on Redis pub/sub.

Three data streams with intentionally different guarantees, tied together by a ULID `ctx.id`:

| Stream | Guarantee | Mechanism |
|---|---|---|
| **Metrics** | Lossy, in-memory | prom-client histograms, scraped at `/metrics` |
| **Logs** | Durable, source of truth | Batched ring buffer → partitioned Postgres |
| **Realtime events** | Ephemeral, sampled, droppable | Redis pub/sub → WebSocket gateway |

### Request pipeline (per request)

```
   INTERNET / attacker container
            │  HTTP :8080   (HTTP-only, all 4 days — TLS :8443 is a Phase-1 seam, DO NOT build)
            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  DATA PLANE  (node:http, role=proxy)                                       │
│                                                                            │
│  http.Server → createContext(req,res,deps) → pipeline.run(ctx)             │
│                                                                            │
│   ingest → [auth*] → normalize → ratelimit → wafInspect → [bot*]           │
│              → [cache*] → route → loadbalance → forward ────────────────────┼──► upstream pool
│                                                    │                       │    (keep-alive Agent,
│         (any stage may return a short-circuit Verdict)                     │     round-robin over
│                                                    │                       │     HEALTHY targets,
│         kernel  finally { finalize(ctx) } ─────────┼───────────┐           │     circuit breaker,
│            reads ConfigStore.current() (frozen snapshot)        │          │     bounded retry)
│            reads RuntimeRegistry (mutable: inflight/breaker/health)         │
└───────────────┬────────────────────────┬──────────────────────┼───────────┘
                │ enqueue (non-blocking)  │ metrics.observe()     │ events.emit() (fire-and-forget)
                ▼                         ▼                        ▼
         ┌────────────┐          ┌──────────────┐        ┌──────────────┐
         │ BatchLog   │ multirow │ prom-client  │        │ Redis pub/sub│
         │ Writer     │ INSERT   │ /metrics     │        │ sentinel:    │
         │ (ring buf, │────────► │ (admin port) │        │  events      │
         │  own pool) │          └──────────────┘        └──────┬───────┘
         └─────┬──────┘                                         │ subscribe (dedicated conn)
               ▼                                                ▼
      ┌───────────────────────────────────────┐        ┌──────────────┐
      │ POSTGRES  request_logs (RANGE by day)  │        │ WS gateway   │
      │  + waf_rules / routes / pools / config │        │ (ws, coalesce│
      └───────────▲───────────────────────────┘        │  250ms,      │
                  │ writes + config_version bump         │  bufferedAmt │
  ┌───────────────┴───────────────────┐  publish         │  backpressure│
  │ CONTROL PLANE (Express, role=admin)│  config:reload   └──────┬───────┘
  │  :3000  read rules / read logs      ├──────────────────────►│ broadcast
  │  WAF on/off toggle / /metrics / /ws │  REDIS ◄──────────────┘
  └─────────────────────────────────────┘                       ▼
                                                    React + Vite + Chart.js  :5173
   * = reserved epic slots (auth / bot / cache): declared in the ORDER array now, populated later
```

### Docker topology

Two networks isolate the blast radius. Only the proxy and dashboard are reachable from the host; the vulnerable backends, Postgres, and Redis are unreachable except *through* the proxy.

```
                        HOST (your laptop)
   published ports:  8080 (proxy)   3000 (admin)   5173 (dashboard)
        │                 │              │              │
        ▼                 ▼              ▼              ▼
  ┌─────────────────────── edge-net (bridge) ────────────────────────┐
  │   ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌────────────┐   │
  │   │ attacker │   │  proxy   │   │   admin    │   │ dashboard  │   │
  │   │ sqlmap/  │──►│ :8080    │   │  :3000     │   │ nginx:5173 │   │
  │   │ autocannon│  │          │   │            │   │            │   │
  │   └──────────┘   └────┬─────┘   └─────┬──────┘   └────────────┘   │
  └────────────────────────┼───────────────┼────────────────────────┘
                           │               │
  ┌──────────────── app-net (internal: true — NO host route) ─────────┐
  │        ▼               ▼               ▼               ▼           │
  │  ┌───────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐       │
  │  │ backend-a │   │ backend-b │   │ postgres │   │  redis   │       │
  │  │ (SQLi tgt)│   │ (SQLi tgt)│   │  :5432   │   │  :6379   │       │
  │  └───────────┘   └───────────┘   └──────────┘   └──────────┘       │
  └───────────────────────────────────────────────────────────────────┘
```

> **Why `internal: true` matters:** the deliberately-vulnerable backends have no host-published port. The *only* path to them is through Sentinel. This makes the threat model honest — "the proxy is the sole ingress" — and is exactly the Phase-6 control/data-plane isolation story in miniature.

---

## 3. The core abstraction

Everything hangs off one contract: **`Stage` / `RequestContext` / `Verdict`**. Own it centrally, change it rarely. The whole reason Sentinel can grow "epic" without rewrites is that new phases are new *stages* reading/writing *reserved fields* on a context object whose shape never changes.

> **CRITICAL correctness fix baked in from hour one (red-team finding):** mutable per-target runtime state (`inflight`, `breaker`, `activeHealthy`) must **NOT** live inside the frozen, RCU-swapped `ConfigSnapshot`. If it did, either (a) `Object.freeze` would break the health prober's writes, or (b) every benign config edit would rebuild the pools and **reset every circuit breaker and health status** — a silent, demo-breaking bug. The fix: split **immutable config** (routes, pool membership, weights, algorithm — frozen, swappable) from a long-lived **`RuntimeRegistry`** (keyed by stable target id) that survives reloads. `target.healthy()` reads the registry.

### `src/core/stage.ts` — the published contract

```ts
export type Verdict =
  | { type: 'continue' }                                   // === returning void
  | { type: 'short_circuit'; response: ProxyResponse }     // stop now: 403 / 429 / 404 / cache hit
  | { type: 'error'; error: PipelineError };

export interface ProxyResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Buffer | string;
}

export class PipelineError extends Error {
  constructor(public status: number, message: string, public cause?: unknown) {
    super(message);
  }
}

export interface Stage {
  readonly name: string;                                   // stable id: used for timings, metrics, tests
  init?(deps: StageDeps): Promise<void> | void;            // boot: compile regex, warm pools
  onConfigChange?(snap: ConfigSnapshot): void;             // hot-reload reaction — ONLY implement where a
                                                           //   long-lived resource must react (prober, agents).
                                                           //   Most stages call config.current() per request
                                                           //   and need this NOT AT ALL.
  handle(ctx: RequestContext): Promise<Verdict | void>;    // the hot path. Always `await` it (see kernel note).
}

export interface StageDeps {                               // singletons injected ONCE at boot
  config: ConfigStore;                                     // config.current() → frozen snapshot (O(1) ref read)
  runtime: RuntimeRegistry;                                // mutable per-target state, survives reloads
  redis: Redis;
  pg: Pool;                                                // control-plane + log writer ONLY (never hot path)
  agents: UpstreamAgents;
  metrics: Metrics;
  events: EventBus;
  logWriter: BatchLogWriter;
  log: Logger;
}
```

### `src/core/context.ts` — the one shared per-request object

```ts
export interface RequestContext {
  readonly id: string;                                     // ULID; emitted as X-Request-Id (server-generated)
  readonly startHr: bigint;                                // process.hrtime.bigint()
  readonly timings: Record<string, number>;                // per-stage ns, filled by kernel

  readonly req: IncomingMessage;
  readonly res: ServerResponse;                            // streaming preserved end-to-end

  method: string; host: string; path: string; rawPath: string;
  query: URLSearchParams; headers: IncomingHttpHeaders;
  clientIp: string;                                        // resolved via trustedProxyDepth (demo = 0)
  bodyPreview?: Buffer;                                    // capped 64KB tap for WAF; stream still flows

  route?: MatchedRoute; upstream?: UpstreamTarget; attempt: number;
  scores: Record<string, number>;                          // waf | bot | anomaly — generalized bag
  waf: { hits: RuleHit[]; blocked: boolean; anomaly: number };
  rateLimit?: { remaining: number; limited: boolean; policy: string };

  // ── EPIC HOOKS: declared now so the object shape is FINAL; populated in later phases ──
  principal?: Principal;                                    // Phase 1 — auth / API key
  tls?: { sni?: string; alpn?: string; clientCert?: PeerCertificate; ja3?: string }; // Phase 1/3
  geo?: { country?: string; asn?: number };                // Phase 3 — GeoIP
  cache?: { key: string; hit: boolean };                   // Phase 2 — edge cache
  tenantId?: string;                                        // Phase 5 — multi-tenant
  trace?: { traceId: string; spanId: string };             // Phase 4 — W3C tracing

  verdict?: Verdict;
  responseMeta: { status?: number; bytesOut?: number; upstreamMs?: number };
  readonly ext: Map<string, unknown>;                      // sanctioned untyped escape hatch
  readonly deps: StageDeps;
  readonly log: Logger;                                    // child logger bound to ctx.id
}

export function createContext(req, res, deps): RequestContext {
  // one allocation per request. NO object pooling (premature; GC handles this fine).
}
```

### `src/core/pipeline.ts` — the kernel (~50 lines)

```ts
export class Pipeline {
  constructor(private stages: Stage[], private finalize: (ctx: RequestContext) => void) {}

  async run(ctx: RequestContext): Promise<void> {
    try {
      for (const stage of this.stages) {
        const t0 = process.hrtime.bigint();
        let verdict: Verdict | void;
        try {
          verdict = await stage.handle(ctx);              // ALWAYS await. No "sync fast-path" — see note.
        } catch (err) {
          verdict = { type: 'error', error: toPipelineError(err) };
        }
        ctx.timings[stage.name] = Number(process.hrtime.bigint() - t0);

        if (verdict && verdict.type !== 'continue') {
          ctx.verdict = verdict;
          await writeVerdict(ctx, verdict);               // 403 / 429 / etc, OR terminal forward already wrote
          break;                                          // short-circuit stops the chain
        }
      }
    } finally {
      this.finalize(ctx);                                 // ALWAYS runs — even on short-circuit / error.
    }                                                     // This is why logging is a FINALIZER, not a stage:
  }                                                       // blocked attacks MUST still be logged.
}
```

> **Two deliberate simplifications (red-team):**
> 1. **Drop the "sync fast-path"** (`(r && r.then) ? await r : r`). Returning sometimes-a-promise-sometimes-a-value is a footgun and buys nothing next to network I/O. Just `await` every stage.
> 2. **Logging is a kernel finalizer, not a stage.** If it were a stage, a short-circuited (blocked) attack would exit the chain *before* logging — and vanish from your dashboard. The whole demo depends on blocked attacks being logged.

### Built-in stage order

```ts
// src/stages/index.ts — buildPipeline()
export const ORDER: StageName[] = [
  'ingest',        // parse, resolve client IP, mint ULID, tap ≤64KB bodyPreview
  // 'auth',       // ← Phase 1 slot (reserved, not built)
  'normalize',     // URL-decode ×2, NFKC, strip comments — on an INSPECT COPY only
  'ratelimit',     // Redis Lua token bucket; fail-OPEN
  'wafInspect',    // weighted anomaly score over canonical views of query/headers/cookies
  // 'bot',        // ← Phase 3 slot (reserved)
  // 'cache',      // ← Phase 2 slot (reserved)
  'route',         // host + longest-prefix match against frozen snapshot
  'loadbalance',   // round-robin over HEALTHY targets (reads RuntimeRegistry)
  'forward',       // terminal: stream up + down, retries, breaker, timeouts
];
```

**Why this is what makes it epic-ready:** the pipeline is an *array* and the context is a *fixed-shape bag with reserved fields*. Adding auth is: write `AuthStage`, insert `'auth'` into `ORDER`, populate `ctx.principal`. Zero kernel change, zero context reshape, zero rewrite of any other stage. That is the entire architectural bet, and it's cheap to make on Day 1.

---

## 4. Tech stack

| Layer | Pick | Why |
|---|---|---|
| **Proxy hot path** | raw `node:http` / `net` + `.pipe()` | `node-http-proxy` is unmaintained and *hides* the streams/backpressure/upgrade control this project exists to teach. Raw `http.request` + pipe is ~150 extra lines and matches your raw-socket C background. **This is the http-proxy-vs-raw ruling: raw wins.** |
| **Connection pooling** | built-in `http.Agent` (`keepAlive`, `lifo`, `maxSockets:128`) | Amortizes TCP handshakes to upstreams; a per-upstream Agent isolates pools. `undici` noted as a Phase-2 throughput swap behind the `Forwarder` interface. |
| **Pipeline / breaker / LB** | hand-rolled | ~50-line kernel, ~50-line breaker, tiny LB — these *are* the concepts to learn and own. `opossum` noted as the mature breaker alternative. |
| **Admin API** | Express 4 (admin port only) | Router + body-parser overhead is fine *off* the hot path. Reserved strictly for control-plane reads + WAF toggle + `/metrics` + `/ws`. |
| **Hot-path DB access** | raw **`pg` 8** Pool | The batch log writer needs multi-row `INSERT` and hand-managed partitioning that an ORM fights you on. Its own small pool (2–4 conns), isolated from admin. |
| **Admin DB access** | **Knex 3** (migrations + CRUD) | Migrations + safe parameterized queries without a codegen step. *(Prisma was considered for the admin side per the "raw pg / knex hot-path vs prisma admin" split — **dropped**: two query layers is more surface than one dev needs in 4 days, and Knex covers admin CRUD fine. One query layer, full SQL control. If you *want* the Prisma experience on the admin plane later, it slots behind the admin routes with no hot-path impact.)* |
| **Datastore** | PostgreSQL 16 | `request_logs` RANGE-partitioned by day; partial index on blocks; `percentile_cont` for ad-hoc p95; retention = `DROP` partition (instant, no VACUUM bloat). |
| **Redis** | Redis 7 + **ioredis 5** | Atomic rate-limit counters (Lua via `defineCommand`), pub/sub for config-reload + dashboard fan-out. **Two connections**: one for publish/commands, one dedicated `subscribe`. |
| **Rate limiting** | Redis Lua **token bucket** (critical) | Atomic read-modify-write, correct across instances, burst-tolerant. Sliding-window-log → stretch. |
| **WAF regex** | native V8 `RegExp` (demo) → **re2** (stretch) | Native is fast enough for the demo with write-time length caps + ReDoS linting. re2 (linear-time) is the #1 hardening upgrade for user-supplied patterns. |
| **Config validation** | **zod 4** | Parse-don't-validate at the env boundary (`z.coerce` for string env vars); fail-fast boot; also validates `RawConfig` before compiling a snapshot. |
| **Logging** | **pino 9** + AsyncLocalStorage | Worker-thread transport keeps JSON serialization off the event loop; ALS threads `reqId` without param-drilling; `redact` strips secrets. |
| **Metrics** | **prom-client 15** | Counter/Gauge/Histogram + `/metrics` for free. Histograms are the *only* correct way to compute p50/p95/p99. **Custom ms buckets required** (see Day 3). |
| **Realtime** | **ws 8** + Redis pub/sub | Lean; `bufferedAmount` backpressure control; Redis fan-in so multi-node still feeds one browser. |
| **Dashboard** | React 18 + Vite 5 + **Chart.js 4** | Fast dev loop; capped point windows + `update('none')`; virtualized attack feed. |
| **Admin auth** | jsonwebtoken 9 + **argon2** + httpOnly cookie | argon2id hash; short-lived JWT in httpOnly/Secure/SameSite cookie; login rate-limited. |
| **Containers** | Docker Compose + node:22-alpine | Dev: bind-mount + `tsx watch` (fast loop). Prod 4-stage Dockerfile deferred to Day 4. |
| **Dev / tests** | tsx 4, Makefile, **vitest 2** + supertest 7 + **autocannon 7** | `tsx watch` hot-restart; self-documenting Makefile as demo teleprompter; fixture-driven WAF corpus + integration + perf. |
| **Vuln target** | Express + better-sqlite3 (in-memory) | Zero-dep intentionally-SQLi backend; toggle `WAF_MODE` to show sqlmap succeed then fail. |

---

## 5. Repo / file structure

Start with files **collapsed** where the red-team flagged over-splitting (LB/health/breaker/retry can begin as fewer files; admin routes need not be 7 files on Day 1). This tree is the *destination*, not a Day-1 checklist.

```
sentinel/
├─ compose.yaml                     # dev: bind-mount + tsx watch; edge-net / app-net(internal)
├─ compose.prod.yaml                # Day 4: 4-stage image, healthchecks, stop_grace_period
├─ Dockerfile                       # Day 4: 4-stage deps→build→prod-deps→runtime (non-root)
├─ Dockerfile.dev                   # Day 1: node:22-alpine + tsx (bind-mounted src)
├─ .dockerignore  .env.example  .env(gitignored)
├─ Makefile                         # init up down nuke migrate seed logs attack curl-suite loadtest test demo
├─ package.json  tsconfig.json  vitest.config.ts
│
├─ src/
│  ├─ core/                         # THE CONTRACT (owned centrally, changes rarely)
│  │  ├─ stage.ts                   # Stage, Verdict, ProxyResponse, StageDeps, PipelineError
│  │  ├─ context.ts                 # RequestContext + createContext()
│  │  └─ pipeline.ts                # kernel: run loop + always-run finalize
│  │
│  ├─ config/
│  │  ├─ env.ts                     # zod-validated process.env → frozen Config (fail-fast)
│  │  ├─ configStore.ts             # ConfigStore.current() + atomic snapshot swap (RCU)
│  │  ├─ runtimeRegistry.ts         # ★ mutable per-target {inflight, breaker, activeHealthy}; survives reload
│  │  ├─ configSource.ts            # ConfigSource iface: HardcodedSource (Day1) → PgConfigSource (Day3)
│  │  └─ snapshotBuilder.ts         # zod-validate → compile regex → RouteMatcher → bind LB → freeze
│  │
│  ├─ proxy/                        # DATA PLANE
│  │  ├─ main.ts                    # role bootstrap (proxy|all)
│  │  ├─ server.ts                  # createProxyServer (TLS-seam factory), request/clientError, timeouts
│  │  ├─ forwarder.ts               # streaming forward: pipe up/down, header sanitize, timeouts
│  │  ├─ agents.ts                  # per-upstream http.Agent keep-alive pool
│  │  ├─ balancer.ts                # RoundRobin (critical); LeastConn/WeightedRR (stretch) live here too
│  │  ├─ health.ts                  # active prober (hysteresis) + passive counting → RuntimeRegistry
│  │  ├─ circuitBreaker.ts          # closed/open/half-open; single half-open probe
│  │  ├─ retry.ts                   # idempotency-aware bounded retry + jittered backoff
│  │  ├─ lifecycle.ts               # SIGTERM drain / flush / closeIdleConnections
│  │  └─ wsProxy.ts                 # STRETCH: Upgrade/WebSocket passthrough
│  │
│  ├─ stages/
│  │  ├─ ingest.ts  normalize.ts  ratelimit.ts  wafInspect.ts
│  │  ├─ route.ts  loadbalance.ts  forward.ts
│  │  └─ index.ts                   # buildPipeline(): ORDER[] with reserved auth/bot/cache slots
│  │
│  ├─ waf/
│  │  ├─ engine.ts                  # evaluate(): weighted scoring vs threshold; detect mode
│  │  ├─ normalize.ts               # transform chain + canonicalViews()
│  │  ├─ ruleStore.ts               # compile rows → immutable ruleset; hot-reload
│  │  ├─ fields.ts                  # extract URL/query/headers/cookies (+ body: stretch)
│  │  ├─ ip.ts                      # STRETCH: CIDR allow/deny + reputation/auto-ban
│  │  └─ ssrf.ts                    # isBlockedAddress() shared egress guard
│  │
│  ├─ ratelimit/
│  │  ├─ tokenBucket.lua            # critical
│  │  ├─ slidingWindow.lua          # STRETCH
│  │  └─ limiter.ts                 # defineCommand + EVALSHA/EVAL fallback
│  │
│  ├─ obs/
│  │  ├─ logger.ts                  # pino singleton + redact
│  │  ├─ als.ts                     # AsyncLocalStorage reqId
│  │  ├─ metrics.ts                 # prom-client registry; ms histogram buckets; recordRequest()
│  │  ├─ batchLogWriter.ts          # bounded ring buffer → multi-row INSERT (own small pg Pool)
│  │  ├─ eventBus.ts                # emitEvent() → Redis pub/sub (Phase-4 swap seam)
│  │  └─ rps.ts                     # 60-slot ring rps + block-rate
│  │
│  ├─ admin/                        # CONTROL PLANE
│  │  ├─ main.ts                    # role bootstrap (admin|all)
│  │  ├─ app.ts                     # Express, requireAuth, zod validators, CORS(credentials)
│  │  ├─ routes/
│  │  │  ├─ auth.ts                 # login → JWT httpOnly cookie
│  │  │  ├─ rules.ts                # read rules (critical) + CRUD (stretch)
│  │  │  ├─ logs.ts                 # GET /api/logs keyset-paginated read
│  │  │  └─ settings.ts             # PUT WAF on/off toggle (critical — proves hot-reload)
│  │  ├─ ws.ts                      # ws server: JWT upgrade, 250ms coalesce, bufferedAmount skip
│  │  └─ analyticsSql.ts            # dashboard queries (gap-filled, parameterized)
│  │
│  ├─ bootstrap/composeRoot.ts      # manual DI: pg, redis(+sub), config, runtime, agents, metrics, events, log
│  └─ scripts/
│     ├─ seed.ts                    # routes, rules, admin user, 24h of historical logs w/ attack spike
│     └─ ensurePartitions.ts        # ★ daily interval: guarantee today+N partitions exist
│
├─ migrations/                      # knex: request_logs(partitioned) + config tables
│
├─ services/
│  ├─ vuln-backend/{Dockerfile,server.js}   # Express + better-sqlite3, intentional SQLi, /healthz, /stream-1mb
│  ├─ dashboard/                            # React + Vite + Chart.js
│  │  ├─ Dockerfile(nginx)
│  │  └─ src/{App.tsx,useLiveStream.ts,components/*}
│  └─ attacker/{Dockerfile,attacks/{sqlmap.sh,curl-suite.sh,loadtest.sh}}
│
└─ test/
   ├─ unit/{corpus.ts,waf-rules.test.ts,normalize.test.ts,circuitBreaker.test.ts,kernel.test.ts}
   ├─ integration/{pipeline.test.ts,helpers/stub-upstream.ts}
   ├─ e2e/smoke.test.ts             # sqli → 403 → log row via admin API
   └─ perf/waf-overhead.ts          # autocannon A/B (correctness-gated, not rps-gated)
```

---

## 6. Data model

### `request_logs` — high-volume, RANGE-partitioned by day

```sql
CREATE TABLE request_logs (
  req_id      uuid        NOT NULL,          -- == ctx.id
  ts          timestamptz NOT NULL,
  client_ip   inet        NOT NULL,
  method      text        NOT NULL,
  path        text        NOT NULL,          -- concrete path (for the live feed)
  route       text        NOT NULL,          -- matched pattern e.g. /api/a (LOW cardinality — for GROUP BY)
  upstream    text,                          -- null if blocked
  status      smallint    NOT NULL,
  duration_ms integer     NOT NULL,
  decision    text        NOT NULL,          -- allow | block | ratelimit
  rule_id     text,                          -- null unless WAF matched
  category    text,                          -- sqli | xss | traversal | cmdi | ssrf
  anomaly     smallint    NOT NULL DEFAULT 0,
  bytes_out   integer     NOT NULL DEFAULT 0,
  user_agent  text,
  tenant_id   uuid,                          -- Phase-5 hook, always NULL now
  PRIMARY KEY (req_id, ts)                   -- ts must be in the PK (it's the partition key)
) PARTITION BY RANGE (ts);

-- Pre-create partitions. An INSERT with no matching partition FAILS — the #1 midnight outage.
CREATE TABLE request_logs_2026_07_21 PARTITION OF request_logs
  FOR VALUES FROM ('2026-07-21') TO ('2026-07-22');

CREATE INDEX ON request_logs (ts DESC);
CREATE INDEX ON request_logs (category, ts DESC) WHERE decision = 'block';  -- partial: tiny + hot
CREATE INDEX ON request_logs (client_ip, ts DESC);
CREATE INDEX ON request_logs (upstream, ts DESC);
```

**Retention** = `DROP TABLE request_logs_2026_06_21;` — instant, no VACUUM bloat, versus a slow `DELETE`.

**Ongoing partition maintenance (red-team gap):** pre-creating 7 days is not enough. A demo that crosses midnight — or any run 8+ days after boot — hits the "no matching partition → INSERT fails" outage the schema itself warns about. `src/scripts/ensurePartitions.ts` runs a **daily `setInterval`** (and once at boot) that idempotently creates `today .. today+7` partitions. Small, but it's the difference between a demo that works at 11:58pm and one that dies at midnight.

### Control-plane config tables (hot path NEVER reads these — only the compiled snapshot)

```sql
CREATE TABLE upstream_pools (
  name text PRIMARY KEY, tenant_id uuid,
  algorithm text NOT NULL DEFAULT 'round_robin',
  health_path text NOT NULL DEFAULT '/healthz',
  health_interval_ms int NOT NULL DEFAULT 5000,
  healthy_after int NOT NULL DEFAULT 2, unhealthy_after int NOT NULL DEFAULT 3,
  breaker_threshold int NOT NULL DEFAULT 5, breaker_cooldown_ms int NOT NULL DEFAULT 10000,
  connect_ms int NOT NULL DEFAULT 3000, response_ms int NOT NULL DEFAULT 30000,
  max_retries int NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE upstream_targets (
  id bigserial PRIMARY KEY,
  pool_name text NOT NULL REFERENCES upstream_pools(name) ON DELETE CASCADE,
  url text NOT NULL, weight int NOT NULL DEFAULT 1, enabled boolean NOT NULL DEFAULT true);

CREATE TABLE routes (
  id text PRIMARY KEY, tenant_id uuid,
  match_host text, match_path_prefix text, match_path_regex text, methods text[],
  upstream_pool text NOT NULL REFERENCES upstream_pools(name),
  priority int NOT NULL DEFAULT 100,
  auth_policy text, cache_policy text, waf_profile text,   -- Phase 1/2 hooks, nullable
  rate_limit_policy text, enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE waf_rules (
  id text PRIMARY KEY, category text NOT NULL, description text NOT NULL,
  targets text[] NOT NULL, pattern text NOT NULL, flags text NOT NULL DEFAULT 'i',
  score int NOT NULL CHECK (score BETWEEN 0 AND 100),
  mode text NOT NULL DEFAULT 'block' CHECK (mode IN ('block','detect')),
  paranoia int NOT NULL DEFAULT 1, enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE waf_config (                    -- singleton engine config; drives the WAF on/off toggle
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  inbound_threshold int NOT NULL DEFAULT 5, paranoia_level int NOT NULL DEFAULT 1,
  global_mode text NOT NULL DEFAULT 'block');            -- off | detect | block

CREATE TABLE config_version (id int PRIMARY KEY DEFAULT 1, version bigint NOT NULL DEFAULT 1);
CREATE TABLE config_audit (
  id bigserial PRIMARY KEY, actor text, action text, entity text,
  before jsonb, after jsonb, at timestamptz DEFAULT now());
CREATE TABLE admin_users (
  id serial PRIMARY KEY, username text UNIQUE NOT NULL, pw_hash text NOT NULL);  -- argon2id
```

> Every table carries a nullable `tenant_id` — a **zero-cost Phase-5 multi-tenant seam**.

### Redis key & channel map (`sentinel:<domain>:<path>`)

| Key / channel | Type | Purpose | TTL |
|---|---|---|---|
| `sentinel:rl:tb:{dim}` | hash | token-bucket state (tokens, ts) | ~cap/rate |
| `sentinel:rl:sw:{dim}` | zset | sliding-window-log (STRETCH) | window |
| `sentinel:rep:{ip}` | int | decaying reputation (STRETCH) | 3600s |
| `sentinel:autoban:{ip}` | str | active temp ban (STRETCH) | 900s |
| `sentinel:cache:analytics:{name}` | str | dashboard query cache | 5–15s |
| `sentinel:cache:{tenant}:{route}:{hash}` | str | edge cache (Phase-2 reserved) | — |
| `sentinel:config:version` | str | current config version (boot-sync) | — |
| pub/sub `sentinel:config:reload` | channel | CP→DP hot-reload fan-out | — |
| pub/sub `sentinel:events` | channel | finalizer → WS gateway | — |

`dim` = `key:{apiKey}` then `ip:{clientIp}` (most specific wins). **Two ioredis connections required** — a subscriber connection can't run normal commands.

### The batched async log-writer design

This is the "logging never slows the hot path" mechanism. Study it — it's a core piece of backend surface.

```
finalize(ctx) ──enqueue(row)──►  ┌─ RING BUFFER (bounded, MAX=5000) ─┐
  (non-blocking, O(1),           │  drop-OLDEST on overflow          │
   never awaits)                 │  + dropped counter (a metric!)    │
                                 └──────────────┬────────────────────┘
                                                │ flush trigger:
                                                │   FLUSH_N=500 rows  OR
                                                │   FLUSH_MS=1000ms tick  OR
                                                │   SIGTERM (final flush)
                                                ▼
                         ┌──────────────────────────────────────────┐
                         │  multi-row parameterized INSERT           │
                         │  on a DEDICATED small pg Pool (2–4 conns) │  ← isolated from admin pool
                         │  `flushing` guard prevents overlap        │
                         │  NEVER rethrows into the hot path         │
                         └──────────────────────────────────────────┘
```

Design rules (each is a lesson):

- **Bounded buffer + drop-oldest** = load shedding. Under a log flood you drop old rows and keep serving traffic; you never OOM. The `dropped` count is itself a metric — surfacing "we're dropping logs" is the point.
- **Own small pg Pool (2–4 conns)**, fully separate from the admin pool. A slow admin query must not starve log writes, and vice versa.
- **Bind-param ceiling:** Postgres caps a statement at 65,535 bind params. At ~20 columns × 500 rows = 10,000 params you're safe — but *say it out loud* so nobody bumps `FLUSH_N` to 5,000 blindly and hits `bind message has N parameter formats`.
- **Never rethrow into the hot path.** If Postgres is down, the writer logs loudly, drops, and the proxy keeps serving. (Test this: kill the DB under load; traffic must keep flowing and `dropped` must climb.)
- **Persist 100% of block/ratelimit rows; sample allows** (e.g. keep 1-in-N `allow` rows under heavy load) so a benign flood can't bury the attack signal.
- **Flush on SIGTERM** so the last batch isn't lost on shutdown.

---

## 7. The 4-day plan

**How to read the split:** **[CRITICAL]** tasks form a self-sufficient spine — build only these and you have a demoable proxy + WAF + dashboard. **[STRETCH]** tasks add depth and are safe to drop. The red-team recalibrated this line hard: several things that *feel* critical (3 LB strategies, sliding-window, full CRUD, debounced hot-reload, WS seq/heartbeat, the perf harness thresholds) are **stretch**. Respect that or you will arrive at Day 4 with no dashboard.

Global rulings that apply all four days:

- **HTTP `:8080` only. No TLS, no `:8443`, no certificates — for all 4 days.** TLS is a documented Phase-1 seam (`createProxyServer` factory + `ConfigSnapshot.tls`). A self-signed cert + SNICallback is a full day by itself. Do not touch it.
- **Dev loop = bind-mounted dev container + `tsx watch`.** The optimized 4-stage prod Dockerfile and network hardening are Day-4-morning work. Do not fight Docker healthcheck timing on Day 1.
- **`await` every stage.** No sync fast-path.

---

### Day 1 — The spine: pipeline kernel + streaming proxy end-to-end

**Theme:** Stand up the skeleton and get a raw-HTTP request to flow through the composable stage pipeline and stream to a real upstream with backpressure. Everything else attaches to this.

**Objective:** `curl localhost:8080/api/a/users?id=42` streams a 200 from backend-a *through* the pipeline, with a ULID `X-Request-Id` on the response and correct hop-by-hop / XFF handling. Bodies are never fully buffered.

| Window | Task | Track |
|---|---|---|
| **Morning (~3h)** | Repo + toolchain + config boundary + **dev** Docker skeleton | **[CRITICAL]** |
| **Midday (~3h)** | Core contract + pipeline kernel + context factory + **RuntimeRegistry** | **[CRITICAL]** |
| **Afternoon (~3h)** | Streaming Forwarder + ingest/route/loadbalance/forward + per-upstream Agent + **ConfigStore.current()** | **[CRITICAL]** |
| **Evening (~2h)** | Server bootstrap + vuln-backend + end-to-end smoke | **[CRITICAL]** |

**Morning — repo, config boundary, dev containers.** Init TS repo (`tsconfig`, `tsx`, `vitest`, eslint `no-process-env`). Write `src/config/env.ts`: a zod schema over `process.env` with `z.coerce` for numeric vars, required `JWT_SECRET.min(32)`, fail-fast `process.exit(1)` with a pretty error, then `Object.freeze`. Write `.env.example` documenting every key (`PROXY_PORT=8080`, `ADMIN_PORT=3000`, `DATABASE_URL`, `REDIS_URL`, `BACKEND_A_URL`, `WAF_MODE`, `RL_*`, `LOG_*`). Scaffold **`compose.yaml` for dev**: postgres:16-alpine + redis:7-alpine + one vuln-backend + a proxy service that **bind-mounts `src/` and runs `tsx watch`** (fast inner loop — no image rebuild per change). `edge-net` (bridge) / `app-net` (`internal: true`). Real healthchecks (`pg_isready`, `redis-cli ping`) with `depends_on: condition: service_healthy`. `Dockerfile.dev` = node:22-alpine + tsx. Makefile: `init` (generates `JWT_SECRET` via `openssl rand -hex 32`), `up`, `down`, `nuke`, `logs`.
→ **Milestone:** `make up` brings postgres+redis+backend-a to healthy; `make logs` tails.

**Midday — the contract + kernel + runtime registry.** Write `src/core/stage.ts` and `src/core/context.ts` (full `RequestContext` with all reserved epic-hook fields; `createContext` = one alloc/request, no pooling). Write `src/core/pipeline.ts` — the ~50-line kernel: for-loop, `await` every stage, record `ctx.timings[name]` via `hrtime.bigint()`, honor short-circuit/error, per-stage try/catch, **always-run `finalize(ctx)` in `finally`**. **Write `src/config/runtimeRegistry.ts` NOW** (this is the red-team correctness fix — do it while the types are fresh): a `Map<targetId, { inflight, breaker, activeHealthy }>` owned outside any snapshot, with a `carryForward(oldRegistry, newTargetIds)` method for reload. Unit-test the kernel with dummy stages: order preserved, short-circuit stops the chain, error routes correctly, **finalizer always runs even on short-circuit**. Set up pino singleton + `AsyncLocalStorage` reqId in `src/obs/`.
→ **Milestone:** vitest green on kernel — short-circuit + finalizer semantics proven with fakes.

**Afternoon — streaming forward + stages + ConfigStore from day one.** Write `src/proxy/agents.ts` (per-upstream `http.Agent`: `keepAlive:true, maxSockets:128, maxFreeSockets:32, scheduling:'lifo'`). Write `src/proxy/forwarder.ts`: raw `http.request` with `req.pipe(proxyReq)` upstream and `upRes.pipe(res)` downstream; `sanitizeRequestHeaders` strips the hop-by-hop set (`connection`, `keep-alive`, `te`, `trailer`, `transfer-encoding`, `upgrade`, plus any header named in the `Connection` token list) and appends `X-Forwarded-For` / `X-Forwarded-Proto` / `Host` / `X-Request-Id`; **never set `Content-Length` manually** (let Node derive framing from the stream); on client `aborted` → `proxyReq.destroy()`. **Introduce `src/config/configStore.ts` NOW** with `current()` returning a *hardcoded-but-real* frozen snapshot (red-team sequencing fix — this avoids a Day-3 rewrite of every stage). Implement `ingest` (parse method/host/path/query, resolve `clientIp` via `trustedProxyDepth=0` → `socket.remoteAddress`, mint ULID, tap ≤64KB `bodyPreview`), `route` (reads `config.current().matcher` — single real route), `loadbalance` (round-robin over healthy targets from `RuntimeRegistry`), `forward` (terminal → forwarder). Wire `buildPipeline()` with the `ORDER` array + reserved slots.
→ **Milestone:** pipeline array assembled; forward stage streams to backend in isolation; stages read `config.current()` from hour one.

**Evening — server bootstrap + vuln-backend + smoke.** Write `src/proxy/server.ts`: `createProxyServer` **factory** (this is the TLS seam — returns `http.createServer` today, `https.createServer` in Phase 1). Request handler: `createContext` → `setHeader('X-Request-Id', ...)` → `pipeline.run().catch(hardFail)`; wire `'clientError'` → 400 + destroy; set `server.requestTimeout=30s`, `headersTimeout=10s`, `keepAliveTimeout=65s`, `maxHeadersCount=100`. `src/bootstrap/composeRoot.ts` (manual DI: redis + pg + config + runtime + agents + metrics-stub + events-stub + logger). Build `services/vuln-backend/server.js` (Express + better-sqlite3 in-memory `users` table; **intentional string-concat SQLi** at `/users?id=`; `/healthz`; `/stream-1mb`). `make up`, curl end-to-end.
→ **Milestone:** curl through proxy returns backend JSON; streaming + headers + `X-Request-Id` correct; malformed request → 400, not a crash.

**Definition of Done (Day 1):** `make up` boots proxy + backend-a + postgres + redis health-gated; a benign request streams through the full pipeline (ingest→route→loadbalance→forward); ULID `X-Request-Id` present; hop-by-hop headers + XFF correct; bodies never fully buffered; kernel unit tests green.

**Backend concepts exercised:** composable middleware/pipeline pattern · short-circuit verdict without exceptions · streaming with `.pipe()` backpressure · hop-by-hop vs end-to-end headers (RFC 7230) · X-Forwarded-For trust model · ULID correlation IDs · parse-don't-validate config boundary (zod) · immutable-config-vs-mutable-runtime split · Docker health-gated startup · container network isolation · AsyncLocalStorage async context · connection pooling (keep-alive Agent).

---

### Day 2 — Proxy resilience + the WAF security engine

**Theme:** Make the proxy production-grade (pool tuning, active health, circuit breaker, retries, graceful drain) and build the anomaly-scoring WAF with normalization, seed rules, and token-bucket rate limiting so attacks get blocked.

**Objective:** two backends round-robin'd with active health checks; killing backend-b trips its breaker OPEN then recovers via a half-open probe; a SIGTERM mid-flight drains in-flight requests to completion; each attack class returns 403 with a category while a benign request returns 200; exceeding the rate limit returns 429 with `Retry-After`.

| Window | Task | Track |
|---|---|---|
| **Morning (~3h)** | Round-robin LB + active/passive health + circuit breaker | **[CRITICAL]** |
| **Midday (~3h)** | Timeouts + idempotency-aware retries + SIGTERM drain | **[CRITICAL]** |
| **Afternoon (~3h)** | WAF normalization + rule engine + ~15–20 seed rules (query/headers/cookies) | **[CRITICAL]** |
| **Evening (~2h)** | Token-bucket rate limiter (Redis Lua) + protocol validation | **[CRITICAL]** |
| **Stretch** | Weighted/least-conn LB · sliding-window Lua · IP reputation/auto-ban · WS-proxy passthrough · body-inspection (buffer-and-replay) | **[STRETCH]** |

**Morning — round-robin, health, breaker.** Write `src/proxy/balancer.ts` with **RoundRobin only** for the critical path (weighted/least-conn are stretch functions in the same file — the epic roadmap fills them later). Write `src/proxy/health.ts`: a `setInterval` prober hitting each target's `/healthz` with **hysteresis** (`healthy_after` / `unhealthy_after` consecutive results) flipping `activeHealthy` **in the RuntimeRegistry**, maintaining a healthy set. Write `src/proxy/circuitBreaker.ts` (hand-rolled `closed`/`open`/`half_open`; `failureThreshold`, `cooldownMs`; `allow()` lets **exactly one** half-open probe through; emit state transitions as events). `target.healthy()` = `registry.activeHealthy && breaker.allow()`. Wire forwarder success/error → `breaker.onSuccess/onFailure` + `inflight` inc/dec. Unit-test breaker transitions.
→ **Milestone:** LB picks only healthy targets; breaker unit test green; transitions emit events.

**Midday — timeouts, retries, graceful drain.** Write `src/proxy/retry.ts`: IDEMPOTENT set `{GET, HEAD, OPTIONS, PUT, DELETE}`; retry **only** on connection-level errors (`ECONNRESET`/`ECONNREFUSED`/`ETIMEDOUT`) and **only before any response bytes have streamed**; re-run LB onto a *different* healthy upstream; jittered backoff; `maxRetries=2` (POST forced to 0). Failure mapping: all-unhealthy → 503, connect-exhausted → 502, response-timeout → 504; never leak stacks. Add a connect timeout on the proxy socket + a response-killer `setTimeout` in the forwarder. Write `src/proxy/lifecycle.ts`: SIGTERM → `server.close()` (stop accepting) → set `Connection: close` on in-flight responses → drain to a 25s deadline → `server.closeIdleConnections()` → destroy Agents → **flush the log buffer** → exit. Set `stop_grace_period: 30s` in compose.
→ **Milestone (reframed per red-team):** send **SIGTERM mid-flight** and assert in-flight requests **drain to completion** with `Connection: close`. *(Do NOT chase "docker restart proxy = 0 failures" — that's impossible with a single instance, since there's no listener during the restart window. True zero-downtime needs 2 instances behind an L4 LB, which is Phase 2. Drain-to-completion is the real, demonstrable property.)*

**Afternoon — the WAF engine (query/headers/cookies, NOT body).** Write `src/waf/normalize.ts`: transform primitives (`urlDecode ×2` in try/catch, `NFKC`, `removeComments`, `compressWhitespace`, `removeNulls`, `posix.normalize` for paths) → `canonicalViews(raw)` bag; cap field length at 64KB; treat a `decodeURIComponent` throw as *suspicious*, not a crash. Write `src/waf/fields.ts` extracting URL / query / headers / cookies. Write `src/waf/engine.ts`: `evaluate()` iterates precompiled rules × targets × views, accumulates a **weighted anomaly score** for `mode='block'` rules, records hits for `mode='detect'`, and blocks when `ctx.waf.anomaly >= inbound_threshold`; global mode `off|detect|block` drives the toggle. Write `src/stages/wafInspect.ts` + `normalize.ts`. Seed **~15–20 high-signal rules** (not 30–40 — rule tuning is itself a day; weight toward the SQLi/traversal patterns sqlmap actually emits) into `waf_rules`. `src/waf/ruleStore.ts` compiles rows → an immutable frozen ruleset with compile-time regex validation + length caps. Export `isBlockedAddress()` (the SSRF egress guard — blocks `169.254.169.254`, private ranges, decimal/hex IP tricks; re-checks *after* DNS resolution).
→ **Milestone:** curl-suite — each attack class → 403 + category; benign `id=42` → 200. (Body inspection deliberately out of scope — sqlmap lives in the query string.)

> **Why query-first, body-later (red-team sequencing):** `wafInspect` is ordered *before* `forward`, but forwarding is a stream. Inspecting the body means either buffering it (fights the no-buffer streaming story) or a buffer-and-replay dance. sqlmap's payloads are in the URL/query anyway. So on Days 1–2 the WAF inspects everything *available without touching the body stream*. Body inspection is a Day-2 **stretch** with an explicit mechanism (below).

**Evening — token-bucket rate limiter + protocol validation.** Write `src/ratelimit/tokenBucket.lua` (refill-by-elapsed, `HSET` + `PEXPIRE` self-eviction). Load it via ioredis `defineCommand` with **EVALSHA + EVAL fallback** (handle `NOSCRIPT`). **Pass `Date.now()` as an ARGV — never call `redis.call('TIME')` inside the script** (it's non-deterministic and triggers "Write commands not allowed after a non-deterministic command" replication errors — a classic multi-hour newcomer stall). Write `src/ratelimit/limiter.ts` + `src/stages/ratelimit.ts`: key dims `[key:{apiKey}?, ip:{clientIp}]`, per-route policy from the snapshot, **FAIL-OPEN if Redis is down** (log loudly — traffic keeps flowing), emit `RateLimit-Limit/Remaining/Reset` + `Retry-After` on 429. Add protocol validation in `ingest`: method allow-list, `maxBodyBytes` (413), header count (431), and a **CL+TE request-smuggling guard** (reject conflicting Content-Length + Transfer-Encoding → 400).
→ **Milestone:** 105 rapid requests → 429 with `Retry-After`; Redis down → fail-open (traffic flows).

**Stretch (only if ahead):**
- **Body inspection via buffer-and-replay** — explicit mechanism: pipe the client request through a `PassThrough`; in a `data` handler accumulate ≤64KB into `ctx.bodyPreview`, then stop copying but keep flowing; for block-capable inspection, prepend the buffered chunks to the upstream write then stream the remainder. **Never attempt on bodyless methods.** Also flag: a **gzip'd request body** (`Content-Encoding`) is un-inspectable without decompression — treat compressed bodies as un-inspectable and score/deny per policy; bounded decompress-to-inspect is a further stretch.
- Weighted (smooth nginx-algorithm) + least-conn LB (needs correct inflight accounting).
- Sliding-window-log Lua.
- IP reputation (`sentinel:rep:{ip}` INCR + expire) → temp `sentinel:autoban:{ip}`, checked O(1) at stage 1.
- WebSocket proxy passthrough (`'upgrade'` handler cross-piping sockets).

**Definition of Done (Day 2):** two backends round-robin'd with active health; killing backend-b trips its breaker OPEN then half-open recovers; SIGTERM mid-flight drains in-flight requests to completion; each of SQLi/XSS/traversal/cmdi/SSRF → 403 + category, benign → 200; over-limit → 429 + `Retry-After`; Redis-down → fail-open.

**Backend concepts exercised:** keep-alive pool tuning · round-robin balancing · active health probes with hysteresis · passive outlier ejection · circuit-breaker state machine + single half-open probe · layered timeouts (connect/response) · idempotency-aware bounded retries + jittered backoff · graceful shutdown / connection draining · input canonicalization (double-decode, NFKC, comment strip) · weighted anomaly scoring vs threshold · detection/shadow mode · token bucket via Redis Lua atomicity · fail-open vs fail-closed defaults · CIDR matching · request-smuggling (CL+TE) guard · ReDoS awareness.

---

### Day 3 — Persistence, observability, admin API, realtime + dashboard start

**Theme:** Make the system durable and observable — partitioned Postgres logging via a non-blocking batch writer, prom-client percentiles, minimal config hot-reload, a lean admin API, the WebSocket event stream — then **start the dashboard tonight** so Day 4 has slack.

**Objective:** every request produces a row in partitioned `request_logs` via the batched writer (proxy never awaits a DB write); `/metrics` shows real p50/p95/p99 in ms; flipping the WAF on/off toggle hot-reloads the proxy with no restart; a JWT-authenticated WS client receives coalesced stats + attack frames when curl-suite runs; `/api/logs` is keyset-paginated.

| Window | Task | Track |
|---|---|---|
| **Morning (~3h)** | Partitioned log schema + BatchLogWriter + finalizer wiring + partition maintenance | **[CRITICAL]** |
| **Midday (~3h)** | Metrics (ms buckets) + **minimal** hot-reload + **WS gateway** | **[CRITICAL]** |
| **Afternoon (~3h)** | **Lean** admin API (read rules + read logs + WAF toggle) + seed script | **[CRITICAL]** |
| **Evening (~2h)** | **Dashboard start**: Vite app + live-stream hook + first panel | **[CRITICAL]** |
| **Stretch** | Full CRUD (routes/pools/targets) · debounce/version-reconciliation/30s poll · WS seq + heartbeat | **[STRETCH]** |

**Morning — durable logging.** Knex migrations for `request_logs` (RANGE by `ts`) + the 4 indexes (incl. the partial `WHERE decision='block'`) + all config tables. Write `src/scripts/ensurePartitions.ts` (boot + **daily `setInterval`** creating `today .. today+7`; seed adds yesterday). Write `src/obs/batchLogWriter.ts` exactly as specified in Section 6: bounded ring buffer (MAX 5000, drop-oldest + `dropped` counter), `FLUSH_N=500` / `FLUSH_MS=1000`, `flushing` guard, multi-row parameterized INSERT on a **dedicated small pg Pool** (respect the 65,535 bind-param ceiling), never rethrow into the hot path, flush on SIGTERM. Wire `finalize(ctx)` in the kernel to build the `LogRow` and call `logWriter.enqueue()` (non-blocking) — **logging is a finalizer so short-circuited attacks are still logged.**
→ **Milestone:** traffic writes rows; **kill the DB → proxy keeps serving, `dropped` climbs, no hot-path stall.**

**Midday — metrics, minimal hot-reload, WS gateway.** Write `src/obs/metrics.ts`: prom-client Registry; `sentinel_requests_total` (labels route/status_class/decision); `request_duration` **Histogram with explicit ms buckets** — `[0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000]` — because prom-client's *default* buckets are tuned for **seconds**, so proxy latencies (single-digit ms) would all collapse into one bucket and your percentiles would be meaningless (red-team gap); `waf_blocks_total`; `upstream_healthy` Gauge; `config_version` Gauge; `collectDefaultMetrics` for event-loop lag. `recordRequest()` façade called from the finalizer. 60-slot ring rps + block-rate in `src/obs/rps.ts`.

**Minimal hot-reload (red-team: cut the machinery).** `src/config/configStore.ts`: `current()` = O(1) ref read; `reload()` builds a *new* snapshot via `snapshotBuilder` (zod-validate `RawConfig` → precompile route regex → build host-grouped `RouteMatcher` → bind LB fns → compile WAF profiles → `Object.freeze`), **carries RuntimeRegistry state forward for surviving targets**, then does a single atomic ref swap; on bad config (e.g. a bad regex) it **aborts and keeps the last-good snapshot**. Swap the source from `HardcodedSource` to `PgConfigSource` (no stage rewrite — stages already call `config.current()`). Subscribe `sentinel:config:reload` on the **dedicated subscriber connection** → rebuild → swap. That's it. *(Debounce, stale-version reconciliation, and the 30s version-poll are STRETCH.)* Most stages need **no `onConfigChange`** because they read `current()` per request; reserve that hook for the **health prober and Agent pools** only.

**WS gateway (moved earlier per red-team — it's small once trimmed).** Write `src/obs/eventBus.ts`: `emitEvent()` → publish `sentinel:events` (fire-and-forget from the finalizer). Write `src/admin/ws.ts`: ws server, **JWT-gated upgrade** (reject invalid — an unauthenticated live feed tells an attacker in real time which payloads got through), subscribe `sentinel:events` on the subscriber connection, aggregate into a **250ms coalescing window** → one `stats` frame (rps, blockRate, p50/p95/p99, per-upstream health, byCategory) + a capped `attacks` frame (≤50 items + omitted count); **`bufferedAmount > 1MiB` → SKIP the frame for that slow client** (a `droppedFrames` metric); stringify each frame once. *(Monotonic `seq` + ping/pong heartbeat are STRETCH.)*
→ **Milestone:** `/metrics` exposes real ms percentiles; flipping WAF on/off swaps the snapshot live; a bad regex aborts reload and the old snapshot stays; `wscat` with a JWT receives stats + attack frames when curl-suite fires.

**Afternoon — lean admin API + seed.** Write `src/admin/app.ts` (Express on `ADMIN_PORT=3000`, separate from the data plane; CORS with credentials for `:5173`; zod-validate every body). Auth: `POST /api/auth/login` (argon2id verify → JWT in httpOnly/Secure/SameSite cookie; login rate-limited) + `requireAuth`. **Critical endpoints only:** `GET /api/rules` (read), `GET /api/logs` (keyset cursor `(ts, req_id) < (?, ?)` with category/decision/clientIp/status/from/to filters, limit capped 200, fully parameterized), `PUT /api/settings/waf` (the **on/off toggle** — this is what proves hot-reload live; each write = knex transaction + `config_version` bump + `config_audit` row + `publish sentinel:config:reload`). `/healthz` (liveness), `/readyz` (**has a snapshot AND Redis reachable AND log writer not in permanent drop state** — red-team gap), `/metrics`. Write `src/scripts/seed.ts`: routes (`r-a → backend-a`, `r-b → backend-b`), the 15–20 WAF rules, one argon2 admin user, and **~5000 historical `request_logs` spread over 24h with a concentrated attack spike ~2h ago** (multi-row insert, idempotent TRUNCATE guard).
→ **Milestone (reframed per red-team):** login → flip the WAF toggle → proxy hot-reloads with no restart; `make seed` fills 24h of history; `/api/logs` paginates. *(Full CRUD for routes/pools/targets is STRETCH — routes/pools come from the seed, not the UI, for the demo.)*

**Evening — dashboard START (pulled forward per red-team).** Vite React TS app in `services/dashboard`. Write `useLiveStream(token)`: connect WS with `?token=`, exponential-backoff reconnect (250ms→8s), and on (re)connect fetch a backfill from `/api/logs` then resume live; apply `stats` frames to state; push `attacks` items into a **capped 500-item ring buffer** (NOT unbounded state). Build the **first panel** tonight (the Live Attack Feed, virtualized, React auto-escape — never `dangerouslySetInnerHTML` on attacker-controlled paths/UAs). Nginx Dockerfile serving the built static on `:5173` (edge-net only).
→ **Milestone:** dashboard connects to the live WS, renders the attack feed on seeded history, and survives a reconnect.

**Definition of Done (Day 3):** every request → a partitioned log row via the batched writer (proxy never awaits a DB write); killing the DB doesn't stall the hot path; `/metrics` shows real ms percentiles; WAF toggle hot-reloads with no restart; JWT'd WS client receives coalesced frames; `/api/logs` keyset-paginates; the dashboard shell + live feed render.

**Backend concepts exercised:** buffered/batched async writes + load shedding (drop-oldest) · multi-row INSERT + bind-param ceiling · connection-pool isolation · RANGE partitioning + partial/composite indexes + partition pre-creation + ongoing maintenance · latency percentiles from histogram buckets (and *why the bucket boundaries matter*) · cardinality control (route pattern not concrete path) · RCU / copy-on-write atomic snapshot swap · carry-forward of runtime state across reload · config hot-reload via pub/sub · WebSocket backpressure via `bufferedAmount` · event coalescing · JWT + argon2 + httpOnly cookie · keyset vs offset pagination · readiness vs liveness.

---

### Day 4 — Dashboard finish, tests, load benchmark, and TWO rehearsals

**Theme:** Finish the dashboard, prove the WAF with a false-positive-aware test suite, quantify WAF overhead, harden the deploy, and rehearse the demo twice. **This is the non-negotiable demo day** — the plan front-loaded everything else precisely so today has slack.

**Objective:** `make demo` clean-boots with 24h of history; `make curl-suite` lights the dashboard live (benign stays green); `make attack` (sqlmap) drives sustained blocks; `make loadtest` reports rps + p99 overhead; the WAF test suite (positive + benign corpus) and the integration test ("blocked request never reaches upstream") pass; the full demo has been rehearsed twice.

| Window | Task | Track |
|---|---|---|
| **Morning (~3h)** | Dashboard finish (3 panels) + prod Dockerfile + network hardening | **[CRITICAL]** |
| **Midday (~3h)** | WAF test suite (malicious + benign corpus) + integration test | **[CRITICAL]** |
| **Afternoon (~3h)** | Attack scripts + e2e smoke + Makefile demo targets | **[CRITICAL]** |
| **Evening (~2h)** | Two full rehearsals + panic-reset verification | **[CRITICAL]** |
| **Stretch** | Perf harness (`waf-overhead.ts`) · re2 migration · body-WAF · chaos test · Grafana | **[STRETCH]** |

**Morning — dashboard finish + deploy hardening.** Finish **3 panels total** (red-team cut from 6 — 6 panels + reconnect/backfill + the full test suite + perf + scripts + 2 rehearsals is ~2 days): **(1)** Live Attack Feed (already started — react-window virtualized, category badges, React auto-escape); **(2)** RPS chart (Chart.js line, allowed vs blocked, cap 120 points, `animation:false` / `update('none')`); **(3)** Block counter + category breakdown. Then do the deferred deploy hardening: write the **4-stage prod `Dockerfile`** (deps → build → prod-deps → runtime, non-root `USER app`), `compose.prod.yaml` with healthchecks + `stop_grace_period: 30s`, and confirm the `edge-net`/`app-net` split (backends/postgres/redis have **no host-published port**; only 8080/3000/5173 are published — 5432/6379 stay internal to avoid clashing with a local Postgres/Redis).
→ **Milestone:** dashboard opens on seeded 24h history; all 3 panels render; prod image boots clean.

**Midday — the WAF test suite (the argument that the WAF is real, not a prop).** `test/unit/corpus.ts`: MALICIOUS + BENIGN payloads per category, where the BENIGN set is the false-positive guard — `q=I love the union of jazz`, `name=O'Brien`, `search=select the best option`, `msg=3 < 5`. `test/unit/waf-rules.test.ts`: `describe.each`/`it.each` running the **full inspect pipeline** (so normalization is exercised, not just the raw regex), asserting blocks fire with the right category AND benign lookalikes pass; **assert false-positive-rate === 0 as a CI gate**. `test/unit/normalize.test.ts`: evasion corpus `[encoded → canonical]` for `%2e%2e%2f`, `UNION/**/SELECT`, fullwidth `＜script＞`. `test/integration/pipeline.test.ts` (supertest, in-process, stub upstream recording `lastRequest`): benign forwards + echoes; **a blocked SQLi returns 403 AND `stub.lastRequest === null`** — the load-bearing assertion that proves the WAF is a **gate**, not a logger-after-the-fact; rate-limit headers + 429; `/stream-1mb` returns the full body (backpressure preserved). Namespace Redis keys per test run and flush in `afterAll`.
→ **Milestone:** vitest green — attacks blocked, **0 false positives**, and a blocked request never reaches the upstream.

**Afternoon — attack scripts, e2e smoke, Makefile.** Build the attacker image (alpine + sqlmap + autocannon + curl). `attacks/curl-suite.sh` (one request per category + a final benign 200), `attacks/sqlmap.sh` (targets `proxy:8080`, `--batch`; toggle `WAF_MODE` to show succeed-then-fail; note `--random-agent` for honesty — see demo playbook), `attacks/loadtest.sh` (`autocannon -c50 -d20`). `test/e2e/smoke.test.ts`: fire SQLi at live `:8080`, `sleep(1200)` (> `LOG_FLUSH_MS=1000` — logging is batched off the hot path, and forgetting this is *the* classic flake), then assert the block appears via `/api/logs?decision=block` — one test exercising the entire async pipeline. Makefile: `attack` / `curl-suite` / `loadtest` / `demo` (= `up seed`) / `nuke` targets. Write the 6-step demo script (Section 8).
→ **Milestone:** `make attack` drives visible blocks on the dashboard; e2e smoke passes; Makefile targets all work.

**Evening — rehearse TWICE + panic reset.** Run the entire demo end-to-end **twice** (not first on stage): (1) `make demo` → point at the historical spike; (2) split-pane `make curl-suite` → counters tick live, benign green; (3) `make attack` → sustained red + rate-limit 429s; (4) `make loadtest` → rps + p99 on screen; (5) `WAF_MODE=off` → rerun sqlmap → table dumped → turn back on. Confirm `make nuke && make demo` is a clean one-command reset. Fix any environmental flake (stale volume, port bind, Docker memory).
→ **Milestone:** full demo runs twice clean; panic reset verified.

**Stretch (only if the demo is locked):**
- **Perf harness** `test/perf/waf-overhead.ts` (autocannon): four cells `{WAF off, on} × {benign, attack}` against the **same warm process** (a `/raw` bypass route for the off baseline — controlled A/B, never across restarts). Report p99 overhead in ms + %; **gate on correctness, not absolute rps** — assert the attack run's `non2xx === total` (a silently-broken WAF passing attacks as 200 FAILS the test) and that WAF p99 overhead is `< ~3ms` relative to `/raw`. **Do NOT hard-assert absolute rps** — Docker Desktop for Mac's VM network boundary can cap you at 2–4k rps and pollute p99, so an absolute-rps gate risks a red bar on the demo laptop. Run from *inside* the attacker container (container→container), not the host. Watch `perf_hooks.monitorEventLoopDelay()`.
- re2 migration (ReDoS immunity for config-supplied patterns).
- Streaming body-WAF via a size-capped Transform tap.
- Chaos test: kill a backend mid-loadtest, assert the breaker trips and traffic reroutes (great demo if the breaker landed).
- `profiles: [observability]` Grafana + Prometheus scraping `/metrics`.

**Definition of Done (Day 4):** `make demo` clean-boots with visible history; `make curl-suite` lights the dashboard (benign green); `make attack` drives sustained blocks; the WAF suite (positive + benign, FP-rate 0) and the integration test ("blocked never reaches upstream") pass; e2e smoke passes; the full 6-step demo has been rehearsed **twice** and `make nuke && make demo` is a verified one-command reset.

**Backend concepts exercised:** WebSocket client backoff-reconnect + REST backfill · bounded client-side ring buffers · Chart.js perf (no-animation, capped windows) · stored-XSS-safe rendering (React auto-escape) · table-driven testing / false-positive corpus (precision vs recall) · middleware-ordering verification (gate-not-bystander) · testing async/batched side-effects (flush timing) · controlled A/B perf measurement · percentiles vs averages · event-loop lag · proxy-as-sole-ingress threat model · reproducible environment reset.

---

## 8. Testing & demo playbook

### Test strategy — the four layers

**Layer 1 — WAF unit + false-positive corpus (`test/unit/`).** Table-driven `describe.each`/`it.each` running the **full inspect pipeline** (normalization included). Two corpora per category: MALICIOUS (must block, right category) and BENIGN lookalikes (must pass). Headline gate: **false-positive-rate === 0** in CI. `normalize.test.ts` asserts the evasion corpus folds `%2e%2e%2f`, `UNION/**/SELECT`, fullwidth `＜script＞`. Breaker + kernel have their own unit tests.

**Layer 2 — integration through the live pipeline (`test/integration/`, supertest, in-process, stub upstream).** Load-bearing assertion: `stub.lastRequest === null` on a blocked SQLi — proves the WAF is a **gate**. Also: benign forwards + echoes; rate-limit headers + 429; `/stream-1mb` full body. Redis keys namespaced per run.

**Layer 3 — e2e smoke (`test/e2e/`, against live compose).** Fire SQLi at `:8080`, `sleep(1200)` (> `LOG_FLUSH_MS`), assert the block appears via `/api/logs?decision=block`. One test exercising the whole async batch pipeline — the best single pre-demo confidence check.

**Layer 4 — perf / WAF overhead (STRETCH, `test/perf/`).** Four cells against the same warm process; **gate on correctness** (attack run `non2xx === total`; overhead `< ~3ms` vs `/raw`), **never on absolute rps**. Run container→container.

### The demo — exact commands (the Makefile is the teleprompter)

```bash
make demo        # = make up seed : clean boot + 24h seeded history (NEVER demo from empty)
# → open http://localhost:5173 ; point at the seeded attack spike ~2h ago:
#   "that's yesterday's attack traffic"

# pane 2 — fast, categorical, guaranteed (~5s):
make curl-suite  # SQLi/XSS/traversal/cmdi/SSRF each → 403 lights a dashboard category;
                 # the final benign request stays GREEN → "real WAF, not a brick wall"

# pane 2 — the crescendo:
make attack      # sqlmap against proxy:8080 → sustained red, "blocked" counter climbs into
                 # the hundreds; per-IP rate-limit kicks in → attacker starts getting 429'd

# pane 3 — under attack, still fast:
make loadtest    # autocannon → "still serving N rps, WAF p99 overhead X ms" on screen

# the kill shot:
docker compose exec proxy sh -c 'export WAF_MODE=off && kill -HUP 1'  # or the dashboard toggle
make attack      # → sqlmap DUMPS the users table → "that's what's behind the wall when it's off"
# turn it back on.

# panic reset if anything is stale:
make nuke && make demo
```

The individual attack shapes (each a one-liner in `curl-suite.sh`):

```bash
# SQLi
curl "http://localhost:8080/api/a/users?id=1' OR '1'='1"
# XSS
curl "http://localhost:8080/api/a/search?q=<script>alert(1)</script>"
# path traversal
curl "http://localhost:8080/api/a/file?path=../../../../etc/passwd"
# command injection
curl "http://localhost:8080/api/a/ping?host=127.0.0.1;cat /etc/passwd"
# SSRF
curl "http://localhost:8080/api/a/fetch?url=http://169.254.169.254/latest/meta-data/"
# benign (MUST stay 200 — the false-positive proof)
curl "http://localhost:8080/api/a/search?q=I love the union of jazz"

# sqlmap
sqlmap -u "http://proxy:8080/api/a/users?id=1" --batch --random-agent

# autocannon
autocannon -c 50 -d 20 http://proxy:8080/api/a/users?id=42
```

**Rehearsal rule:** run all 6 steps end-to-end **twice** on Day 4 evening, not first on stage. Failure modes are environmental — stale volume (`make nuke`), port bind (only 8080/3000/5173 are host-published; 5432/6379 stay internal precisely to avoid clashing with a local Postgres/Redis), or Docker Desktop low on memory.

**Honesty note for the demo:** sqlmap's default User-Agent is a giveaway, but `--random-agent` removes it. Demo **both**, so the story rests on the payload/normalization rules (the real test), not a UA heuristic. And with ~15–20 rules, expect that a few sqlmap payloads *will* return 200 — the narrative is **"watch blocks stream and the table stays safe,"** not "100% block rate." Don't rabbit-hole trying to block everything; that's rule-tuning, which is its own project.

---

## 9. Security hardening checklist

- **Client IP** resolved only via configured `trustedProxyDepth` (demo = 0 → `socket.remoteAddress`); `X-Forwarded-For` is **appended, never trusted** — a spoofed XFF must not evade rate limits or poison attack logs.
- **Server-generate the ULID** correlation id and **overwrite** any inbound `X-Request-Id` to prevent log poisoning.
- **Strip hop-by-hop headers** (`Connection`/`Keep-Alive`/`TE`/`Trailer`/`Transfer-Encoding`/`Upgrade`/`Proxy-*` + connection-token-listed) both directions; keep `insecureHTTPParser` **off**; reject conflicting `Content-Length` + `Transfer-Encoding` (request-smuggling guard).
- **Never self-compute `Content-Length`** when forwarding (a mismatch is a smuggling vector); let Node derive framing from the stream.
- **SSRF containment:** the upstream pool is a fixed config allowlist — never forward to a host derived from a request header/param; `isBlockedAddress()` re-checks **after DNS resolution** (defeats decimal/hex IP + DNS-rebinding).
- **Resource limits:** enforce max body size *while streaming* (don't trust `Content-Length`), max header count/size, `requestTimeout` + `headersTimeout` (slow-loris), per-upstream `maxSockets`.
- **WAF:** normalize a **copy** for inspection, forward **original** bytes; cap canonicalized field length; treat malformed-encoding (a `decodeURIComponent` throw) as suspicious, not a crash.
- **ReDoS defense:** length-cap and lint all admin-supplied regex at write time AND compile time; a bad regex aborts reload keeping the last-good snapshot; re2 is the top hardening upgrade — one catastrophic pattern freezes the single-threaded event loop for *all* requests.
- **Opposite fail defaults, both deliberate:** WAF fails **closed** on an internal inspector error; rate-limiting fails **open** on a Redis outage.
- **Block pages leak nothing:** never echo the attacker payload or the matched rule id (info-leak + reflected-XSS in your own error page); show only `ctx.id`, log full detail server-side.
- **Strip backend-identifying response headers** (`Server`, `X-Powered-By`); inject security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`; HSTS/CSP reserved for the TLS phase).
- **Control plane isolated:** admin API + `/metrics` + `/ws` bind to a separate port; backends + postgres + redis sit on `app-net` (`internal: true`) with no host route — unreachable except through the proxy.
- **Admin auth is real:** argon2id password hashes (never plaintext/weak); short-lived JWT in httpOnly+Secure+SameSite cookie (never localStorage); login endpoint hard rate-limited against credential stuffing.
- **WebSocket `/ws` upgrade verifies the same JWT** — an unauthenticated live feed hands an attacker real-time confirmation of which payloads got through.
- **Dashboard renders attacker-controlled strings** (paths/UAs) via **React auto-escaping only**; `dangerouslySetInnerHTML` is forbidden in feed/log components (stored-XSS-via-your-own-logs aimed at the admin session).
- **pino `redact`** strips `Authorization`/`Cookie`/`x-api-key`/`token`/`password` before anything reaches stdout or Postgres — the log table must never become a credential dump.
- **All admin log/analytics queries parameterized** (knex bindings) — a SQL-injectable WAF admin API would be the ultimate irony.
- **Every control-plane mutation writes a `config_audit` row** (actor/action/before/after); only authenticated admin routes may `publish config:reload`.
- **Secrets from env/secret store**, never the rules DB or code; the zod boot-loader refuses to start if `JWT_SECRET < 32` chars (no insecure-by-omission boot); generate via `openssl rand -hex 32` in `make init`.
- **Runtime containers run as non-root `USER app`** so a container-escape via the deliberately-vulnerable backend can't trivially root the container.
- **The kernel isolates each stage in try/catch** so one stage's crash can't skip the WAF or the finalizer; process-level `unhandledRejection`/`uncaughtException` handlers log + graceful-exit, never silently swallow.

---

## 10. Epic roadmap

Every future phase maps to an extension point **deliberately left in the 4-day build**. None is a rewrite — each is a *populate* or *insert*.

| Epic phase | Extension point left in the 4-day build | How the code already enables it |
|---|---|---|
| **Phase 1 — API-key / bearer auth** | Reserved `auth` slot at index 1 in `ORDER`; `ctx.principal?`; nullable `routes.auth_policy` | Write `AuthStage`: validate the key header against config/Redis, set `ctx.principal` or return `{short_circuit, {status:401}}`. Zero kernel/context change. |
| **Phase 1 — TLS / mTLS termination** | `createProxyServer` **factory**; `ConfigSnapshot.tls`; `ctx.tls` | Factory returns `https.createServer(snap.tls, handler)` with SNICallback for multi-cert; populate `ctx.tls` (sni/alpn/clientCert) from the TLS socket. |
| **Phase 1 — weighted / least-conn LB** | `algorithm`-keyed strategy map in `balancer.ts`; `weight` on the target + `inflight` in `RuntimeRegistry` | The `weighted` and `least_conn` branches already exist as stub functions; fill two functions — the LB stage just calls the bound `selectTarget`. |
| **Phase 2 — CDN / edge caching** | Reserved `cache` slot before `route`; `ctx.cache?`; nullable `routes.cache_policy`; `sentinel:cache:*` key convention; short-circuit verdict carries a synthesized response | `CacheStage` builds the key, checks Redis, returns `{short_circuit, cached}` on hit; cache-write in the finalizer. Redis already in `deps`. |
| **Phase 2 — multi-node horizontal scale** | Stateless data plane; all shared state in Redis; config rebuilt per-process from `ConfigSource`; `SENTINEL_ROLE`/`NODE_ID` env | Run N proxy processes behind an L4 LB; rate-limit counters + config signal already in Redis; the invariant already held — **no request-authoritative state in process-local vars**. `undici` swap behind the `Forwarder` interface for throughput. *(This is also what finally makes "zero-downtime restart" achievable.)* |
| **Phase 3 — GeoIP** | Reserved `geoip` slot after ingest; `ctx.geo?` | Load a MaxMind mmdb into `deps`; a stage sets `ctx.geo` from `ctx.clientIp`; downstream WAF/rate-limit/routing can read it. |
| **Phase 3 — bot detection + challenge pages** | Generalized `ctx.scores` bag; reserved `bot` slot after WAF; short-circuit verdict + HMAC clearance-cookie seam | Bot stage writes `scores.bot`, short-circuits with a challenge `ProxyResponse` above threshold; an ingest clearance-cookie check lets solved clients through. No new verdict type. |
| **Phase 3 — JA3/JA4 fingerprinting** | `ctx.tls.ja3?` + documented seam at the TLS `secureConnection` event | On Node-terminated TLS, capture the ClientHello and set `ctx.tls.ja3`; if TLS terminates upstream, arrive as a trusted header. |
| **Phase 3 — DDoS mitigation** | Reserved `admissionControl(socket)` call-site in the connection handler + the existing `ratelimit` stage | L4 admission control (`net.Server` maxConnections + per-IP concurrency) *before* context creation; L7 throttling already in the pipeline. |
| **Phase 4 — observability platform** | Kernel per-stage `ctx.timings`; prom histograms; `EventBus` interface (Redis pub/sub v1); `ctx.trace?`; `LogSink` interface on `BatchLogWriter` | `/metrics` already exposes per-stage percentiles; swap `EventBus` for Redis Streams/OTLP; forward stage injects W3C `traceparent` from `ctx.trace`; add `SinkClickHouse`/`SinkS3`; rollup tables replace ad-hoc GROUP BY. |
| **Phase 5 — multi-tenant SaaS** | Nullable `tenant_id` on every table; `ctx.tenantId?`; host-keyed router; `sentinel:*:{tenant}:*` key convention | Resolve `ctx.tenantId` in ingest/route; `ConfigStore` becomes `Map<tenant, snapshot>` (the builder already groups by host); the Redis prefix is already reserved — a prefix, not a migration. |
| **Phase 6 — control/data-plane split** | `ConfigSource` interface (`PgConfigSource` today); `SENTINEL_ROLE=proxy\|admin\|all`; `sentinel:config:reload` channel; data plane is already read-only over the snapshot | Replace `PgConfigSource` with an `xdsConfigSource`/`HttpConfigSource` pulling snapshots from a standalone control plane; the role split already runs the two planes as separate processes; a compromised data-plane process has **no config write path**. Data plane changes zero stage code. |

---

## 11. Concept glossary

One-liners worth looking up in depth — these are the load-bearing backend ideas this project teaches.

- **Reverse proxy** — a server that receives client requests and forwards them to backend servers, then relays the response back; the client only ever talks to the proxy.
- **WAF (Web Application Firewall)** — an inspection layer that examines HTTP requests for attack patterns and blocks malicious ones before they reach the app.
- **Keep-alive (HTTP persistent connection)** — reusing one TCP connection for many HTTP requests instead of opening a new one each time, amortizing the handshake cost. Managed here by `http.Agent`.
- **Connection pool** — a maintained set of reusable open connections (to upstreams, or to Postgres) so you don't pay setup cost per request; sized by `maxSockets` / pool size.
- **Backpressure** — when a fast producer outpaces a slow consumer, the mechanism that makes the producer *wait* rather than buffering unboundedly. Node streams (`.pipe()`) handle it automatically; ignoring it means OOM.
- **Streaming (vs buffering)** — processing/forwarding data chunk-by-chunk as it arrives, instead of loading the whole body into memory first. Essential for large uploads/downloads and for a proxy under load.
- **Hop-by-hop vs end-to-end headers** — hop-by-hop headers (`Connection`, `TE`, `Transfer-Encoding`, `Upgrade`…) apply to a single connection leg and must be stripped by a proxy; end-to-end headers travel to the origin. (RFC 7230.)
- **X-Forwarded-For** — a header recording the chain of client/proxy IPs; only trustworthy up to the depth of proxies you control, so a proxy must *append*, not blindly trust.
- **Request smuggling** — desyncing a proxy and backend on where one request ends and the next begins (usually via conflicting `Content-Length` + `Transfer-Encoding`), letting an attacker inject a hidden request. Guarded by rejecting the conflict.
- **SSRF (Server-Side Request Forgery)** — tricking the server into making requests to internal/forbidden addresses (e.g. cloud metadata `169.254.169.254`). Guarded by an egress allowlist + post-DNS address check.
- **Circuit breaker** — a state machine (closed → open → half-open) that stops sending traffic to a failing upstream after N failures, then lets exactly one probe through after a cooldown to test recovery. Prevents cascading failure.
- **Health check (active vs passive)** — *active*: periodically probe `/healthz`; *passive*: infer health from real request success/failure. Hysteresis (N consecutive results) prevents flapping.
- **Idempotency** — an operation that produces the same result whether applied once or many times (`GET`, `PUT`, `DELETE`). Only idempotent methods are safe to auto-retry — retrying a `POST` might double-charge someone.
- **Graceful shutdown / draining** — on SIGTERM, stop accepting new connections but let in-flight requests finish (with `Connection: close`) before exiting, so a deploy doesn't kill live requests.
- **Token bucket** — a rate-limit algorithm: a bucket refills at a steady rate up to a capacity; each request spends a token; empty bucket → reject. Tolerates bursts up to the capacity.
- **Sliding-window log** — a rate-limit algorithm storing each request's timestamp and counting how many fall inside the trailing window; exact but more memory than a token bucket.
- **Lua atomicity (in Redis)** — a Lua script runs as a single atomic unit on Redis (no other command interleaves), which is how a read-modify-write rate-limit stays correct across many concurrent clients. (Never call non-deterministic ops like `TIME` inside — pass the clock in as an argument.)
- **Fail-open vs fail-closed** — on a dependency failure, fail-open keeps serving (rate limiter: prefer availability), fail-closed blocks (WAF: prefer safety). Choosing per-component is a deliberate design act.
- **Partitioning (RANGE)** — splitting one logical table into physical child tables by a key (here, by day). Queries hit only relevant partitions; retention is an instant `DROP` of an old partition instead of a slow `DELETE`.
- **Partial / composite index** — a partial index covers only rows matching a predicate (e.g. `WHERE decision='block'`) so it's tiny and hot; a composite index orders multiple columns for range + sort queries.
- **Keyset (cursor) pagination** — paging with `WHERE (ts, id) < (?, ?)` instead of `OFFSET N`; stays fast at deep pages because it doesn't scan-and-discard the skipped rows.
- **p50 / p95 / p99 (percentiles)** — the latency below which 50% / 95% / 99% of requests fall. Percentiles expose tail latency that an *average* hides; computed correctly only from histogram buckets, and only if the bucket boundaries match your latency scale (ms, not seconds).
- **Histogram buckets** — the pre-defined boundaries a latency histogram counts into; percentiles are interpolated from bucket counts, so mis-sized buckets (seconds for a ms workload) give meaningless numbers.
- **RCU / copy-on-write snapshot swap** — readers always see a complete, immutable config snapshot; an update builds a *new* frozen snapshot and swaps a single reference atomically. Readers never lock and never see a half-updated config.
- **WAL (Write-Ahead Log)** — the durability mechanism in Postgres (and many databases): changes are appended to a log *before* the data files are updated, so a crash can be replayed to a consistent state. (Context for why Postgres writes are durable but not free.)
- **Batched / buffered async writes** — accumulating rows in memory and flushing them in periodic multi-row batches, so the hot path enqueues in O(1) and never awaits a database round-trip.
- **Load shedding** — under overload, deliberately dropping some work (here: oldest log rows past a bounded buffer) to protect overall availability, rather than queueing unboundedly until you OOM.
- **AsyncLocalStorage** — a Node primitive that carries per-request context (like a request id) implicitly through async call chains, so you don't thread it through every function argument.
- **ULID** — a lexicographically-sortable, timestamp-prefixed unique id; used here as the request correlation id tying logs, metrics, and realtime events together.
- **ReDoS (Regular-expression Denial of Service)** — a pathological regex + input that takes exponential time to match, freezing the single-threaded event loop for *all* requests. Defended by length caps, write-time linting, and (ultimately) the linear-time re2 engine.
- **Anomaly scoring (WAF)** — instead of one regex = one block, each matched rule adds a weighted score; the request is blocked only when the total crosses a threshold. Reduces false positives and resists single-rule evasion.
- **Normalization / canonicalization** — decoding and standardizing input (URL-decode twice, Unicode NFKC, strip inline comments, normalize paths) *before* inspection, so `%2e%2e%2f` and `UNION/**/SELECT` can't slip past the rules.

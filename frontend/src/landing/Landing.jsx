import { useEffect } from 'react';
import './landing.css';
import { navigate } from '../App.jsx';

function Arw() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12 12 4M6 4h6v6" />
    </svg>
  );
}

function OpenBtn({ size = 'lg', variant = 'black' }) {
  return (
    <button className={`btn btn-${variant} btn-${size}`} onClick={() => navigate('/dashboard')}>
      Open the dashboard
      <span className="arw">
        <Arw />
      </span>
    </button>
  );
}

function Nav() {
  return (
    <nav className="bnav">
      <div className="bnav-in">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>
          <span className="brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffe17c" stroke="#ffe17c" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-3Z" />
            </svg>
          </span>
          Dwarpal
        </a>
        <div className="bnav-links">
          <a href="#pipeline">Pipeline</a>
          <a href="#features">Features</a>
          <a href="#demo">Demo</a>
        </div>
        <button className="btn btn-black btn-sm" onClick={() => navigate('/dashboard')}>
          Open the dashboard
        </button>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <header className="hero dots">
      <div className="wrap hero-in">
        <div>
          <span className="hbadge">
            <span className="sq" />
            <span>Self-hosted edge security</span>
          </span>
          <h1>
            Every request
            <br />
            meets the <span className="stroke">gatekeeper</span>.
          </h1>
          <p>A self-hosted reverse proxy and web application firewall — a mini-Cloudflare you fully own, end to end.</p>
          <div className="hero-cta">
            <OpenBtn size="lg" variant="black" />
            <a className="btn btn-white btn-sm" href="#demo">
              See the demo
            </a>
          </div>
        </div>

        <div className="mock">
          <div className="sticker">
            not on
            <br />
            my watch
          </div>
          <div className="mock-bar">
            <i className="r" />
            <i className="y" />
            <i className="g" />
            <span>dwarpal · live</span>
          </div>
          <div className="mock-body">
            <div className="mock-chips">
              <div className="mock-chip yell">
                <small>Requests</small>
                <b>12,481</b>
              </div>
              <div className="mock-chip dark">
                <small>Blocked</small>
                <b>979</b>
              </div>
              <div className="mock-chip sage">
                <small>Rps</small>
                <b>14</b>
              </div>
            </div>
            {[
              ['SQLI', '/api/a/users'],
              ['XSS', '/api/a/search'],
              ['SSRF', '/api/a/fetch'],
              ['CMDI', '/api/a/ping'],
            ].map(([cat, path]) => (
              <div className="mock-row" key={cat}>
                <span className="cat">{cat}</span>
                <span>{path}</span>
                <span className="code">403</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

const MARQUEE = ['SQL INJECTION', 'XSS', 'PATH TRAVERSAL', 'COMMAND INJECTION', 'SSRF', 'RATE LIMITED', 'SMUGGLING'];

function Marquee() {
  const items = [...MARQUEE, ...MARQUEE];
  return (
    <div className="marquee">
      <div className="marquee-track">
        {items.map((m, i) => (
          <span key={i}>{m} ✳</span>
        ))}
      </div>
    </div>
  );
}

const PROBLEM = [
  'Buffering whole request bodies into memory',
  'One brittle regex per rule, trivial to evade',
  'Logging that blocks the request hot path',
  'No health checks, breakers, or retries',
  'Backends left exposed to the internet',
];
const SOLUTION = [
  'Streams both directions — never buffers',
  'Normalization + weighted anomaly scoring',
  'Batched logging, fully off the hot path',
  'Health checks, circuit breaker, retries, drain',
  'Backends on an internal-only network',
];

function ProblemSolution() {
  return (
    <section className="sec sec-pad ps">
      <div className="wrap">
        <h2 className="sec-title">Rolling your own edge is easy to get wrong.</h2>
        <p className="sec-sub">Most hand-built proxies cut the corners that matter. Dwarpal does them properly.</p>
        <div className="ps-grid">
          <div className="ps-card problem">
            <h3>The usual way</h3>
            <ul className="ps-list">
              {PROBLEM.map((t) => (
                <li key={t}>
                  <span className="ps-ic">✕</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="ps-card solution">
            <h3>The Dwarpal way</h3>
            <ul className="ps-list">
              {SOLUTION.map((t) => (
                <li key={t}>
                  <span className="ps-ic">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { h: 'Weighted WAF', p: 'Input normalization defeats encoding evasion; every rule adds a score and a request blocks only past a threshold.' },
  { h: 'Atomic rate limiting', p: 'A Redis Lua token bucket, correct across instances and burst tolerant. Fails open on outage.' },
  { h: 'Self-healing upstreams', p: 'Active health checks, a per-target circuit breaker, idempotent retries, graceful drain.' },
  { h: 'Durable & live', p: 'Batched into day-partitioned Postgres off the hot path, streamed to the dashboard over WebSocket.' },
  { h: 'Routing & balancing', p: 'Longest-prefix routing, round-robin over healthy targets, keep-alive upstream pools.' },
  { h: 'The sole ingress', p: 'Backends, Postgres and Redis sit on an internal network. The only path in is through Dwarpal.' },
];

function Features() {
  return (
    <section className="sec sec-pad features dots" id="features">
      <div className="wrap">
        <h2 className="sec-title">Built like the real thing.</h2>
        <p className="sec-sub">Not a demo of regexes — a proper edge with the concerns a production proxy actually has.</p>
        <div className="feat-grid">
          {FEATURES.map((f) => (
            <div className="feat" key={f.h}>
              <h3>{f.h}</h3>
              <p>{f.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { n: '01', h: 'Inspect', p: 'Normalize the request, then score it against the ruleset across path, query and headers.' },
  { n: '02', h: 'Decide', p: 'Block past the threshold, rate-limit the abusers, or let it continue — logging every outcome.' },
  { n: '03', h: 'Forward', p: 'Stream to a healthy backend and stream the response back, with retries and a circuit breaker.' },
];

function HowItWorks() {
  return (
    <section className="sec sec-pad how" id="pipeline">
      <div className="wrap">
        <h2 className="sec-title">One request, three moves.</h2>
        <p className="sec-sub">Every request flows through an ordered pipeline. Any stage can stop it; the last one forwards it.</p>
        <div className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="step-num">{s.n}</div>
              <h3>{s.h}</h3>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Personas() {
  return (
    <section className="sec sec-pad who">
      <div className="wrap">
        <h2 className="sec-title">Built to be understood.</h2>
        <p className="sec-sub">Every line is hand-rolled and owned — no framework hiding the interesting parts.</p>
        <div className="who-grid">
          <div className="persona sage">
            <span className="pill">Learn</span>
            <h3>The concepts, for real</h3>
            <p>Streaming, backpressure, circuit breakers, token buckets, partitioning — implemented, not imported.</p>
          </div>
          <div className="persona yell">
            <span className="pill">Show</span>
            <h3>A standout portfolio</h3>
            <p>&ldquo;I built a mini-Cloudflare&rdquo; lands harder than another CRUD app — and it runs live.</p>
          </div>
          <div className="persona dark">
            <span className="pill">Demo</span>
            <h3>A live kill-shot</h3>
            <p>Flip the WAF off, run sqlmap, watch it dump the table. Flip it back on. That&apos;s the wall.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

const DEMOS = [
  { h: 'Concurrency', items: ['streaming & backpressure', 'keep-alive pooling', 'WebSocket backpressure'] },
  { h: 'Resilience', items: ['circuit breaker', 'idempotent retries', 'health + graceful drain'] },
  { h: 'Data', items: ['RANGE partitioning', 'batched load shedding', 'keyset pagination'] },
];

function Demonstrates() {
  return (
    <section className="sec sec-pad demo-sec">
      <div className="wrap">
        <h2 className="sec-title">What it demonstrates.</h2>
        <p className="sec-sub">The systems ideas under the surface, grouped by the muscle they build.</p>
        <div className="demo-grid">
          {DEMOS.map((d) => (
            <div className="demo-card" key={d.h}>
              <h3>{d.h}</h3>
              <ul>
                {d.items.map((i) => (
                  <li key={i}>
                    <span className="dot2" />
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Command() {
  return (
    <section className="sec sec-pad cmd-sec" id="demo">
      <div className="wrap">
        <h2 className="sec-title">See it in one command.</h2>
        <p className="sec-sub">Boot the stack with a day of seeded history, then watch it block a live sqlmap run.</p>
        <div className="cmd">
          <div className="cmd-bar">
            <i style={{ background: '#ff5f57' }} />
            <i style={{ background: '#febc2e' }} />
            <i style={{ background: '#28c840' }} />
          </div>
          <div className="cmd-body">
            <div>
              <span className="p">$ </span>make demo<span className="c"> # boot + 24h of seeded history</span>
            </div>
            <div>
              <span className="p">$ </span>make curl-suite<span className="c"> # one payload per attack class</span>
            </div>
            <div className="c">
              {'  '}sqli 1&apos; OR &apos;1&apos;=&apos;1 → <span className="blk">403 blocked</span>
            </div>
            <div className="c">
              {'  '}benign union of jazz → <span className="ok">200 ok</span>
            </div>
            <div>
              <span className="p">$ </span>make attack<span className="c"> # sqlmap hammers :8080 → blocks stream</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="sec sec-pad final dots">
      <div className="wrap">
        <h2>Watch it block a live attack.</h2>
        <p>The dashboard streams every request the moment it happens.</p>
        <div className="hero-cta">
          <OpenBtn size="lg" variant="black" />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot2">
      <div className="wrap">
        <div className="foot2-grid">
          <div>
            <h4>Dwarpal</h4>
            <p style={{ maxWidth: '30ch', lineHeight: 1.5 }}>
              A self-hosted reverse proxy and web application firewall, built from scratch as a
              systems portfolio project.
            </p>
          </div>
          <div className="cols">
            <h5>Product</h5>
            <a href="#pipeline">Pipeline</a>
            <a href="#features">Features</a>
            <a href="#demo">Demo</a>
            <a href="/dashboard" onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }}>
              Dashboard
            </a>
          </div>
          <div className="cols">
            <h5>Stack</h5>
            <span>Node.js · raw http</span>
            <span>PostgreSQL 16</span>
            <span>Redis 7</span>
            <span>Docker Compose</span>
          </div>
        </div>
        <div className="foot2-bottom">Dwarpal — the gatekeeper at the door.</div>
      </div>
    </footer>
  );
}

export function Landing() {
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#ffe17c';
    return () => {
      document.body.style.background = prev;
    };
  }, []);

  return (
    <div className="brut">
      <Nav />
      <Hero />
      <Marquee />
      <ProblemSolution />
      <Features />
      <HowItWorks />
      <Personas />
      <Demonstrates />
      <Command />
      <FinalCta />
      <Footer />
    </div>
  );
}

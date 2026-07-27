import { navigate } from './App.jsx';

/**
 * The console's left rail. Text-forward, no icons (per the brutalist system);
 * the active item is a filled charcoal block with a hard offset shadow.
 */

const NAV = [
  { to: '/dashboard', label: 'Overview' },
  { to: '/dashboard/playground', label: 'Playground' },
  { to: '/dashboard/feed', label: 'Live feed' },
  { to: '/dashboard/analytics', label: 'Analytics' },
  { to: '/dashboard/rules', label: 'WAF rules' },
  { to: '/dashboard/settings', label: 'Settings' },
];

function isActive(to, path) {
  return to === '/dashboard' ? path === '/dashboard' : path.startsWith(to);
}

export function Sidebar({ path, connected }) {
  return (
    <aside className="sidebar">
      <a
        className="sb-brand"
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate('/');
        }}
      >
        <span className="sb-mark">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffe17c" stroke="#ffe17c" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6l-8-3Z" />
          </svg>
        </span>
        <span className="sb-word">
          Dwarpal
          <span className="sb-sub">Console</span>
        </span>
      </a>

      <nav className="sb-nav">
        {NAV.map(({ to, label }) => (
          <a
            key={to}
            href={to}
            className={`sb-link ${isActive(to, path) ? 'on' : ''}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(to);
            }}
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="sb-foot">
        <span className={`live ${connected ? 'on' : 'off'}`}>
          <span className="live-dot" />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
        <a
          className="sb-back"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate('/');
          }}
        >
          ← Back to site
        </a>
      </div>
    </aside>
  );
}

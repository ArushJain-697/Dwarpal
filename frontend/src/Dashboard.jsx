import { useLiveStream } from './useLiveStream.js';
import { Sidebar } from './Sidebar.jsx';
import { Overview } from './pages/Overview.jsx';
import { Playground } from './pages/Playground.jsx';
import { Feed } from './pages/Feed.jsx';
import { Analytics } from './pages/Analytics.jsx';
import { Rules } from './pages/Rules.jsx';
import { Settings } from './pages/Settings.jsx';

// Each console route: a page title, a one-line subtitle, and its component.
// Overview and Feed read the shared live stream; the rest fetch their own data.
const PAGES = {
  '/dashboard': { title: 'Overview', sub: 'Real-time traffic across the proxy edge', render: (live) => <Overview {...live} /> },
  '/dashboard/playground': { title: 'Playground', sub: 'Fire real attacks at the proxy — no terminal needed', render: () => <Playground /> },
  '/dashboard/feed': { title: 'Live feed', sub: 'Every blocked and rate-limited request', render: (live) => <Feed {...live} /> },
  '/dashboard/analytics': { title: 'Analytics', sub: 'Traffic and threats over time', render: () => <Analytics /> },
  '/dashboard/rules': { title: 'WAF rules', sub: 'The active ruleset and how it scores', render: () => <Rules /> },
  '/dashboard/settings': { title: 'Settings', sub: 'WAF enforcement mode — the kill switch', render: () => <Settings /> },
};

export function Dashboard({ path }) {
  const live = useLiveStream();
  const page = PAGES[path] || PAGES['/dashboard'];

  return (
    <div className="shell">
      <div className="aurora" />
      <Sidebar path={path} connected={live.connected} />

      <div className="content">
        <header className="pagebar">
          <h1>{page.title}</h1>
          <div className="sub">{page.sub}</div>
        </header>
        <main className="page" key={path}>
          {page.render(live)}
        </main>
      </div>
    </div>
  );
}

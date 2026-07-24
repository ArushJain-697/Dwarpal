import { useEffect, useState } from 'react';
import { Landing } from './landing/Landing.jsx';
import { Dashboard } from './Dashboard.jsx';

/**
 * Minimal client-side router — two routes, no dependency. `/dashboard` renders
 * the live monitor, everything else the marketing landing. The nginx config
 * already falls back to index.html so deep links work on refresh.
 */
export function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return path === '/dashboard' ? <Dashboard /> : <Landing />;
}

// Navigate without a full reload; dispatch popstate so <App> re-renders.
export function navigate(to) {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

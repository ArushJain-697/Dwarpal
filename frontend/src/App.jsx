import { useEffect, useState } from 'react';
import { Landing } from './landing/Landing.jsx';
import { Dashboard } from './Dashboard.jsx';

/**
 * Minimal client-side router — no dependency. Anything under `/dashboard`
 * renders the console (which sub-routes itself off the path); everything else
 * is the marketing landing. nginx falls back to index.html so deep links work
 * on refresh.
 */
export function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return path.startsWith('/dashboard') ? <Dashboard path={path} /> : <Landing />;
}

// Navigate without a full reload; dispatch popstate so <App> re-renders.
export function navigate(to) {
  if (to === window.location.pathname) return;
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

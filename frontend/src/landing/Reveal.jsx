import { useEffect, useRef, useState } from 'react';

/**
 * Reveal — fades + de-blurs its children up as they scroll into view.
 *
 * Uses a passive, rAF-throttled scroll check that unsubscribes the moment the
 * element reveals — so it's a one-shot trigger, not continuous scroll-driven
 * work (no reflow thrash). Respects prefers-reduced-motion by showing instantly.
 */
export function Reveal({ children, delay = 0, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }

    let done = false;
    let raf = 0;

    const cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };

    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.92 && r.bottom > 0) {
        done = true;
        setShown(true);
        cleanup();
      }
    };

    const onScroll = () => {
      if (done) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(check);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    check(); // reveal anything already in view on mount

    return cleanup;
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? 'in' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

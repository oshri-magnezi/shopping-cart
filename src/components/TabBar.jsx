import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation.js';
import * as haptics from '../utils/haptics.js';
import { TABS, activeTabIndex, useCrossFade, useNudge } from './tabs.js';
import './TabBar.css';

// Scrolling has to travel this far in one direction before the bar reacts, so
// a thumb resting on the glass, or a list settling after a fling, does not
// make it flicker between sizes.
const TRAVEL = 12;
// Near the top of the page the bar is always full size: there is nothing to
// make room for yet.
const TOP_ZONE = 64;

/**
 * Shrinks the bar while the page is scrolled down and brings it back on the
 * way up, as iOS 26 does with its own tab bars: reading down a list, the
 * content gets the room; reaching for another tab, the bar is already there.
 *
 * Written straight to the element, not to React state, so a scroll never
 * re-renders the app. A new page always starts with the bar at full size.
 */
function useMinimizeOnScroll(barRef, pathname) {
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;
    bar.dataset.compact = 'false';

    let anchor = window.scrollY;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      if (y <= TOP_ZONE) {
        bar.dataset.compact = 'false';
        anchor = y;
        return;
      }
      // Measured from where the last change of direction happened, so a slow
      // scroll adds up instead of being lost frame by frame.
      const travelled = y - anchor;
      if (Math.abs(travelled) < TRAVEL) return;
      bar.dataset.compact = String(travelled > 0);
      anchor = y;
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [barRef, pathname]);
}

/**
 * The phone's tab bar: a floating glass capsule at the bottom of the screen,
 * where the thumb already is.
 *
 * Only shown below the phone breakpoint — on a desktop the same three tabs live
 * in the top bar, as they always have. The selection is one capsule that
 * slides on a spring between tabs rather than three states that swap, and the
 * icon of the tab just chosen gives one small bounce: the acknowledgement iOS
 * gives a tapped tab, and nothing more than that.
 */
export function TabBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const crossFade = useCrossFade();
  const activeIndex = activeTabIndex(pathname);

  // Which tab was last *tapped*, with a counter so tapping the same one again
  // restarts the bounce. Nothing bounces on first paint — arriving at a page
  // is not something the shopper did.
  const [tapped, setTapped] = useState({ to: null, count: 0 });

  // A tab something was sent to answers with the same bounce as a tap: a
  // finished purchase makes the history icon move, so the list that just
  // left the screen visibly went somewhere.
  const nudge = useNudge();
  useEffect(() => {
    if (nudge.to) setTapped((previous) => ({ to: nudge.to, count: previous.count + 1 }));
  }, [nudge]);

  const barRef = useRef(null);
  useMinimizeOnScroll(barRef, pathname);

  return (
    <nav
      ref={barRef}
      className="tabbar glass"
      aria-label={t('app.name')}
      style={{ '--tab-index': activeIndex }}
    >
      <span className="tabbar-indicator" aria-hidden="true" />
      {TABS.map(({ to, end, icon: Icon, short }) => {
        const bouncing = tapped.to === to;
        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tabbar-item pressable${isActive ? ' tabbar-item-active' : ''}`
            }
            onClick={(event) => {
              haptics.tap();
              setTapped((previous) => ({ to, count: previous.count + 1 }));
              crossFade(event, to);
            }}
          >
            <span
              key={bouncing ? tapped.count : 'rest'}
              className={`tabbar-icon${bouncing ? ' tabbar-icon-bounce' : ''}`}
              aria-hidden="true"
            >
              <Icon size={22} strokeWidth={1.75} />
            </span>
            <span className="tabbar-label">{t(short)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

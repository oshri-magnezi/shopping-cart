import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { History, Scale, ShoppingCart } from 'lucide-react';

/**
 * The app's three places, shared by the top bar on a desktop and the tab bar
 * on a phone so the two can never disagree about what exists or in what order.
 *
 * `label` is the full name the desktop bar has room for; `short` is what fits
 * under an icon in a phone's tab bar, the way iOS labels its own tabs.
 */
export const TABS = [
  { to: '/', end: true, icon: ShoppingCart, label: 'nav.list', short: 'tab.list' },
  { to: '/compare', end: false, icon: Scale, label: 'nav.compare', short: 'tab.compare' },
  { to: '/history', end: false, icon: History, label: 'nav.history', short: 'tab.history' },
];

/** Which tab the current route belongs to. An unknown route is the first. */
export function activeTabIndex(pathname) {
  return Math.max(
    0,
    TABS.findIndex((tab) => (tab.end ? pathname === tab.to : pathname.startsWith(tab.to))),
  );
}

const canAnimate = () =>
  Boolean(document.startViewTransition) &&
  !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A click handler that moves between pages instead of swapping them.
 *
 * The browser takes a picture of the old page, lets React commit the new one,
 * then animates between the two — which is why the commit has to be flushed
 * synchronously inside the callback. The pages slide the way the tabs are
 * laid out: a tab further along comes in from that side, and going back
 * returns the other way, so the motion says where you went (global.css reads
 * `data-nav`). Where the API is missing, or motion is reduced, the link is
 * simply left alone and navigates normally.
 */
export function useCrossFade() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return function crossFade(event, to) {
    if (!canAnimate()) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (pathname === to) return;

    event.preventDefault();
    const root = document.documentElement;
    root.dataset.nav =
      activeTabIndex(to) > activeTabIndex(pathname) ? 'forward' : 'back';
    const transition = document.startViewTransition(() => flushSync(() => navigate(to)));
    transition.finished.finally(() => delete root.dataset.nav);
  };
}

/**
 * Applies a change that repaints the whole page — the theme, the language —
 * as a short cross-fade instead of a cut. For the language it also covers the
 * frame in which every row flips direction.
 */
export function withFade(update) {
  if (!canAnimate()) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}

const NUDGE = 'app:nudge';

/**
 * Points at a tab after something was sent there. Finishing a purchase moves
 * the whole list into history, and without a sign of where it went the list
 * simply vanishes; the history tab answering with one small bounce is that
 * sign.
 */
export function nudgeTab(to) {
  window.dispatchEvent(new CustomEvent(NUDGE, { detail: to }));
}

/** The latest nudge, with a counter so the same tab can be nudged twice. */
export function useNudge() {
  const [nudge, setNudge] = useState({ to: null, count: 0 });
  useEffect(() => {
    const onNudge = (event) =>
      setNudge((previous) => ({ to: event.detail, count: previous.count + 1 }));
    window.addEventListener(NUDGE, onNudge);
    return () => window.removeEventListener(NUDGE, onNudge);
  }, []);
  return nudge;
}

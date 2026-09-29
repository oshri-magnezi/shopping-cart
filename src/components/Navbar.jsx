import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Monitor, Moon, Sun } from 'lucide-react';
import { RowMenu } from './RowMenu.jsx';
import { Logo } from './Logo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { TABS, activeTabIndex, useCrossFade, useNudge, withFade } from './tabs.js';
import './Navbar.css';

// Past this much scroll the bar gets its glass. A few pixels, not zero, so a
// rubber-band bounce at the very top does not flicker it on and off.
const EDGE = 4;

/**
 * Two iOS behaviours, driven by one scroll listener that writes to the root
 * element and never to React state — so scrolling never re-renders the app.
 *
 * `data-scrolled` — content is passing under the bar, so the bar becomes
 * glass. At rest it is clear, and the page reads as one surface.
 *
 * `data-title-gone` — the page's large title has scrolled up behind the bar,
 * so the bar shows a small copy of it. Measured from the title itself rather
 * than a fixed offset: the list page's title is an editable field of varying
 * height, and a guessed number would be wrong on one page or the other.
 */
function useScrollEdge(pathname) {
  useEffect(() => {
    const root = document.documentElement;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const scrolled = window.scrollY > EDGE;
      const title = document.querySelector('[data-large-title]');
      const bar = document.querySelector('.navbar-inner');
      const titleGone =
        title && bar
          ? title.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom
          : window.scrollY > 56;

      // Written only when the state flips, so a steady scroll costs nothing
      // beyond the two rects read above.
      if (root.dataset.scrolled !== String(scrolled)) root.dataset.scrolled = String(scrolled);
      if (root.dataset.titleGone !== String(titleGone)) root.dataset.titleGone = String(titleGone);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
    // A new page has a new title to measure against.
  }, [pathname]);
}

export function Navbar() {
  const { t, language } = useTranslation();
  const { theme, resolvedTheme, setTheme, toggleLanguage } = useSettings();
  const { activeList } = useAppData();
  const { pathname } = useLocation();
  const crossFade = useCrossFade();
  const nudge = useNudge();
  const isDark = resolvedTheme === 'dark';

  useScrollEdge(pathname);

  // Three states, not a toggle. A two-way switch has no way back to "follow
  // the system", so once it was touched the app stopped tracking the device
  // for good — the icon still showed a theme, but nothing could return it.
  const appearance = [
    { key: 'light', label: t('theme.light'), icon: Sun },
    { key: 'dark', label: t('theme.dark'), icon: Moon },
    { key: 'auto', label: t('theme.auto'), icon: Monitor },
  ].map((option) => ({
    ...option,
    selected: theme === option.key,
    onSelect: () => withFade(() => setTheme(option.key)),
  }));

  // The selected pill is one element that slides, not three that fade. Its
  // position is the tab index; the tabs are equal width, so a whole-number
  // translate lands it exactly.
  const activeIndex = activeTabIndex(pathname);

  // What the bar shows once the page's own large title has scrolled away. The
  // list's title is the name the shopper gave it, so the bar uses that too.
  const compactTitle =
    activeIndex === 0 ? activeList.name || t('list.title') : t(TABS[activeIndex].label);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* The mark is a tag, the first tab is a cart — no longer the same
            icon twice in one bar. */}
        <NavLink to="/" className="navbar-brand" aria-label={t('nav.home')}>
          <Logo className="navbar-logo" size={24} />
          <span className="navbar-name">{t('app.name')}</span>
        </NavLink>

        {/* A visual echo of the page's h1, which is still on the page; a
            screen reader does not need to hear the title twice. */}
        <span className="navbar-title" aria-hidden="true">
          {compactTitle}
        </span>

        <nav
          className="navbar-tabs"
          aria-label={t('app.name')}
          style={{ '--tab-index': activeIndex }}
        >
          <span className="tab-indicator" aria-hidden="true" />
          {TABS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
              onClick={(event) => crossFade(event, to)}
            >
              {/* Keyed on the nudge, so each one restarts the bounce. */}
              <Icon
                key={nudge.to === to ? nudge.count : 'rest'}
                className={nudge.to === to ? 'tab-icon-nudge' : undefined}
                size={17}
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="navbar-actions">
          <button
            type="button"
            className="lang-toggle"
            onClick={() => withFade(toggleLanguage)}
            aria-label={t('nav.toggleLanguage')}
          >
            {language === 'he' ? 'EN' : 'עב'}
          </button>
          {/* Same button, same place — it opens the choice instead of
              flipping past it. */}
          <RowMenu
            label={t('nav.appearance')}
            triggerClassName="icon-btn"
            items={appearance}
            trigger={
              isDark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />
            }
          />
        </div>
      </div>
    </header>
  );
}

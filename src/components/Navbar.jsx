import { flushSync } from 'react-dom';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { History, Monitor, Moon, Scale, ShoppingCart, Sun } from 'lucide-react';
import { RowMenu } from './RowMenu.jsx';
import { Logo } from './Logo.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import './Navbar.css';

const TABS = [
  { to: '/', end: true, icon: ShoppingCart, label: 'nav.list' },
  { to: '/compare', end: false, icon: Scale, label: 'nav.compare' },
  { to: '/history', end: false, icon: History, label: 'nav.history' },
];

export function Navbar() {
  const { t, language } = useTranslation();
  const { theme, resolvedTheme, setTheme, toggleLanguage } = useSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isDark = resolvedTheme === 'dark';

  /**
   * Cross-fades the page instead of swapping it.
   *
   * The browser takes a picture of the old page, lets React commit the new one,
   * then animates between the two — which is why the commit has to be flushed
   * synchronously inside the callback. Where the API is missing, or motion is
   * reduced, the link is simply left alone and navigates normally.
   */
  function crossFade(event, to) {
    if (!document.startViewTransition) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    if (pathname === to) return;

    event.preventDefault();
    document.startViewTransition(() => flushSync(() => navigate(to)));
  }

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
    onSelect: () => setTheme(option.key),
  }));

  // The selected pill is one element that slides, not three that fade. Its
  // position is the tab index; the tabs are equal width, so a whole-number
  // translate lands it exactly. An unknown route falls back to the first tab,
  // which is where the router sends it anyway.
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => (tab.end ? pathname === tab.to : pathname.startsWith(tab.to)))
  );

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* The mark is a tag, the first tab is a cart — no longer the same
            icon twice in one bar. */}
        <NavLink to="/" className="navbar-brand" aria-label={t('nav.home')}>
          <Logo className="navbar-logo" size={24} />
          <span className="navbar-name">{t('app.name')}</span>
        </NavLink>

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
              <Icon size={17} strokeWidth={1.5} aria-hidden="true" />
              <span>{t(label)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="navbar-actions">
          <button
            type="button"
            className="lang-toggle"
            onClick={toggleLanguage}
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

import { NavLink } from 'react-router-dom';
import { History, Moon, ShoppingCart, Sun } from 'lucide-react';
import { useSettings } from '../context/SettingsContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import './Navbar.css';

export function Navbar() {
  const { t, language } = useTranslation();
  const { theme, toggleTheme, toggleLanguage } = useSettings();
  const isDark = theme === 'dark';

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <div className="navbar-brand">
          <span className="navbar-logo" aria-hidden="true">
            <ShoppingCart size={20} strokeWidth={2} />
          </span>
          <span className="navbar-name">{t('app.name')}</span>
        </div>

        <nav className="navbar-tabs" aria-label={t('app.name')}>
          <NavLink to="/" end className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}>
            <ShoppingCart size={18} strokeWidth={2} aria-hidden="true" />
            <span>{t('nav.list')}</span>
          </NavLink>
          <NavLink
            to="/history"
            className={({ isActive }) => `tab${isActive ? ' tab-active' : ''}`}
          >
            <History size={18} strokeWidth={2} aria-hidden="true" />
            <span>{t('nav.history')}</span>
          </NavLink>
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
          <button
            type="button"
            className="icon-btn"
            onClick={toggleTheme}
            aria-label={isDark ? t('nav.themeToLight') : t('nav.themeToDark')}
          >
            {isDark ? <Sun size={20} strokeWidth={2} /> : <Moon size={20} strokeWidth={2} />}
          </button>
        </div>
      </div>
    </header>
  );
}

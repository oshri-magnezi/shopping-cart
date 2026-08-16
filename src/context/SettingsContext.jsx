import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SETTINGS_KEY = 'shopping-cart-settings';

const SettingsContext = createContext(null);

function preferredTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function loadSettings() {
  const fallback = { language: 'he', theme: preferredTheme() };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      language: parsed.language === 'en' ? 'en' : 'he',
      theme: parsed.theme === 'dark' ? 'dark' : parsed.theme === 'light' ? 'light' : fallback.theme,
    };
  } catch {
    return fallback;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.language;
    root.dir = settings.language === 'he' ? 'rtl' : 'ltr';
    root.dataset.theme = settings.theme;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable — the app still works for this session */
    }
  }, [settings]);

  const toggleTheme = useCallback(() => {
    setSettings((prev) => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const toggleLanguage = useCallback(() => {
    setSettings((prev) => ({ ...prev, language: prev.language === 'he' ? 'en' : 'he' }));
  }, []);

  const value = useMemo(
    () => ({
      language: settings.language,
      theme: settings.theme,
      locale: settings.language === 'he' ? 'he-IL' : 'en-US',
      toggleTheme,
      toggleLanguage,
    }),
    [settings, toggleTheme, toggleLanguage],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}

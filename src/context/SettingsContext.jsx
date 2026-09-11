import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const SETTINGS_KEY = 'shopping-cart-settings';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const SettingsContext = createContext(null);

const THEMES = ['light', 'dark', 'auto'];

function systemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function loadSettings() {
  // New installs follow the system until told otherwise, which is what every
  // other app on the device does.
  const fallback = { language: 'he', theme: 'auto' };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      language: parsed.language === 'en' ? 'en' : 'he',
      // A stored 'light' or 'dark' from before 'auto' existed is still an
      // explicit choice and is honoured exactly as it was.
      theme: THEMES.includes(parsed.theme) ? parsed.theme : fallback.theme,
    };
  } catch {
    return fallback;
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);
  const [system, setSystem] = useState(systemTheme);

  // Only meaningful while the preference is 'auto', but the listener is cheap
  // and keeping it unconditional means there is no window where a change is
  // missed because the preference flipped mid-flight.
  useEffect(() => {
    const media = window.matchMedia?.(DARK_QUERY);
    if (!media) return undefined;
    const onChange = (event) => setSystem(event.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = settings.theme === 'auto' ? system : settings.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.language;
    root.dir = settings.language === 'he' ? 'rtl' : 'ltr';
    // The document only ever carries a real theme; 'auto' is a preference,
    // not a value any stylesheet should have to understand.
    root.dataset.theme = resolvedTheme;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable — the app still works for this session */
    }
  }, [settings, resolvedTheme]);

  const setTheme = useCallback((theme) => {
    setSettings((prev) => ({ ...prev, theme }));
  }, []);

  const toggleLanguage = useCallback(() => {
    setSettings((prev) => ({ ...prev, language: prev.language === 'he' ? 'en' : 'he' }));
  }, []);

  const value = useMemo(
    () => ({
      language: settings.language,
      // The preference, for the picker's checkmark…
      theme: settings.theme,
      // …and what it currently resolves to, for anything that needs to know
      // which way the page actually looks right now.
      resolvedTheme,
      locale: settings.language === 'he' ? 'he-IL' : 'en-US',
      setTheme,
      toggleLanguage,
    }),
    [settings, resolvedTheme, setTheme, toggleLanguage],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}

import { useCallback } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import he from './he.json';
import en from './en.json';

const dictionaries = { he, en };

export function useTranslation() {
  const { language, locale } = useSettings();

  // t('list.progress', { done: 2, total: 5 }) -> fills {done} / {total} placeholders.
  const t = useCallback(
    (key, values) => {
      const template = dictionaries[language][key] ?? key;
      if (!values) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        values[name] === undefined ? match : String(values[name]),
      );
    },
    [language],
  );

  return { t, language, locale };
}

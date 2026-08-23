import { useCallback } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import he from './he.json';
import en from './en.json';

const dictionaries = { he, en };

// Cached because constructing a PluralRules per lookup is wasteful, and there
// are only two languages.
const pluralRules = {
  he: new Intl.PluralRules('he'),
  en: new Intl.PluralRules('en'),
};

/**
 * Picks the plural form of a key when the caller passed a count.
 *
 * Hebrew and English both take the singular at one — "1 פריטים" and "1 items"
 * are equally wrong. A key opts in by defining `key_one`; anything without one
 * is used as written, so most strings need no thought.
 */
function resolveKey(dictionary, key, language, values) {
  if (!values || typeof values.count !== 'number') return key;

  const form = pluralRules[language].select(values.count);
  const candidate = `${key}_${form}`;
  if (candidate in dictionary) return candidate;

  const other = `${key}_other`;
  return other in dictionary ? other : key;
}

export function useTranslation() {
  const { language, locale } = useSettings();

  // t('list.progress', { done: 2, total: 5 }) -> fills {done} / {total} placeholders.
  const t = useCallback(
    (key, values) => {
      const dictionary = dictionaries[language];
      const template = dictionary[resolveKey(dictionary, key, language, values)] ?? key;
      if (!values) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        values[name] === undefined ? match : String(values[name]),
      );
    },
    [language],
  );

  return { t, language, locale };
}

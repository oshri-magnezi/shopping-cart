import { useEffect, useMemo, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { useCatalog } from '../context/CatalogContext.jsx';
import { useTranslation } from '../i18n/useTranslation.js';
import { buildSuggestionPool, suggest } from '../utils/suggest.js';
import { formatCurrency } from '../utils/format.js';
import './ProductSuggest.css';

/**
 * Autocomplete over the real catalogue.
 *
 * Picking a suggestion stores the exact product name, which removes the
 * guesswork from the comparison entirely: "חלב" can mean 3% in a carton or
 * goat's milk, and no amount of scoring can tell which was meant.
 */
export function ProductSuggest({ value, onChange, onPick, inputProps, inputRef }) {
  const { t, locale } = useTranslation();
  const { catalog, status, request } = useCatalog();

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef(null);

  const pool = useMemo(() => (catalog ? buildSuggestionPool(catalog) : null), [catalog]);

  const options = useMemo(() => {
    if (!pool || value.trim().length < 2) return [];
    return suggest(pool, value);
  }, [pool, value]);

  useEffect(() => {
    setActive(0);
  }, [value]);

  // Typing is the reliable signal that products are needed — focus events are
  // easy to miss, and this is also the first moment the data is any use.
  useEffect(() => {
    if (value.trim().length >= 2) request();
  }, [value, request]);

  useEffect(() => {
    function onPointerDown(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const visible = open && options.length > 0;

  function choose(option) {
    onPick(option.name);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (!visible) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (current + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current - 1 + options.length) % options.length);
    } else if (event.key === 'Enter') {
      // Enter takes the highlighted suggestion; the raw text still submits
      // when the list is closed.
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="suggest" ref={containerRef}>
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        value={value}
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        aria-controls="suggest-list"
        autoComplete="off"
        onFocus={() => {
          request();
          setOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
      />

      {open && status === 'loading' && value.trim().length >= 2 ? (
        <div className="suggest-note">{t('suggest.loading')}</div>
      ) : null}

      {visible ? (
        <ul className="suggest-list" id="suggest-list" role="listbox">
          {options.map((option, position) => (
            <li key={option.name} role="option" aria-selected={position === active}>
              <button
                type="button"
                className={`suggest-option${position === active ? ' suggest-option-active' : ''}`}
                onMouseEnter={() => setActive(position)}
                onClick={() => choose(option)}
              >
                <span className="suggest-name">{option.name}</span>
                <span className="suggest-meta">
                  <span className="suggest-chains">
                    <Store size={13} strokeWidth={2} aria-hidden="true" />
                    {option.chains}
                  </span>
                  <span className="suggest-price tabular">
                    {option.min === option.max
                      ? formatCurrency(option.min, locale)
                      : `${formatCurrency(option.min, locale)}–${formatCurrency(option.max, locale)}`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

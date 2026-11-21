import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import './InstallHint.css';

const DISMISSED_KEY = 'shopping-cart-install-hint';

// Chrome on Android offers installation through an event that fires once,
// early — often before React has mounted anything — so it is caught here, at
// module load, and kept until the hint wants it.
let deferredPrompt = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

function wasDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * One quiet line suggesting the app be added to the home screen.
 *
 * Only once it has earned it — `ready` is the caller's judgement, two
 * completed purchases — and only where it can actually happen: Android with
 * an install prompt in hand, or Safari on an iPhone, which has no prompt and
 * gets the two steps in words instead. Never inside the installed app, and
 * never again once dismissed.
 */
export function InstallHint({ ready }) {
  const { t } = useTranslation();
  const [hidden, setHidden] = useState(() => wasDismissed() || isStandalone());
  const [canPrompt, setCanPrompt] = useState(() => Boolean(deferredPrompt));

  useEffect(() => {
    if (canPrompt) return undefined;
    const onPrompt = () => setCanPrompt(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, [canPrompt]);

  if (!ready || hidden || !(canPrompt || isIos())) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* not remembered; it simply shows again next time */
    }
    setHidden(true);
  }

  async function install() {
    const prompt = deferredPrompt;
    deferredPrompt = null;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (outcome === 'accepted') setHidden(true);
    else setCanPrompt(false);
  }

  return (
    <aside className="install-hint">
      <p className="install-hint-text">{canPrompt ? t('install.text') : t('install.iosText')}</p>
      {canPrompt ? (
        <button type="button" className="btn btn-secondary install-hint-action" onClick={install}>
          {t('install.button')}
        </button>
      ) : null}
      <button
        type="button"
        className="icon-btn install-hint-close"
        onClick={dismiss}
        aria-label={t('install.dismiss')}
      >
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </aside>
  );
}

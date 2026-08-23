import { Component } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from '../i18n/useTranslation.js';
import './ErrorBoundary.css';

/**
 * Catches render errors so a single broken component cannot blank the app.
 *
 * This exists because it already happened: changing the shape `tokenize`
 * returns broke `suggest.js`, and because the throw escaped every boundary,
 * typing one character replaced the whole page with white. The shopper's data
 * was never at risk — it lives in localStorage — but there was no way to
 * discover that from the screen.
 *
 * Class syntax is not a style choice: `componentDidCatch` and
 * `getDerivedStateFromError` have no hook equivalent.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Nothing here reports home; the console is the only place a developer
    // would look, and the shopper is served by the message below.
    console.error('Render failed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    const { t, children } = this.props;
    if (!error) return children;

    return (
      <main className="page">
        <div className="error-panel" role="alert">
          <span className="error-panel-icon" aria-hidden="true">
            <TriangleAlert size={26} strokeWidth={2} />
          </span>
          <h1 className="error-panel-title">{t('error.title')}</h1>
          <p className="error-panel-text">{t('error.text')}</p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            {t('error.reload')}
          </button>

          {/* Collapsed by default: the message is for whoever is debugging,
              and reads as noise to everyone else. */}
          <details className="error-panel-details">
            <summary>{t('error.details')}</summary>
            <pre dir="ltr">{String(error?.message ?? error)}</pre>
          </details>
        </div>
      </main>
    );
  }
}

/**
 * Supplies the boundary with translations.
 *
 * The class above cannot call hooks, and the settings provider sits higher in
 * the tree, so the lookup is done here and handed down as a prop.
 */
export function AppErrorBoundary({ children }) {
  const { t } = useTranslation();
  return <ErrorBoundary t={t}>{children}</ErrorBoundary>;
}

import { HashRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
import { TabBar } from './components/TabBar.jsx';
import { AppErrorBoundary } from './components/ErrorBoundary.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { AppDataProvider } from './context/AppDataContext.jsx';
import { CatalogProvider } from './context/CatalogContext.jsx';
import { ShoppingListPage } from './pages/ShoppingListPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { ComparePage } from './pages/ComparePage.jsx';

export default function App() {
  return (
    <SettingsProvider>
      <AppDataProvider>
        <CatalogProvider>
          {/* Opts in to React Router 7's behaviour now: it silences the
              warnings the router prints on every load, and the move to 7
              (which fixes an advisory that does not reach this app — no
              user-supplied links, no server rendering) becomes a version bump. */}
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <div className="app-shell">
              <Navbar />
              {/* Only the pages are guarded: keeping the navbar outside means a
                  failed page still leaves a way to reach the other two. */}
              <AppErrorBoundary>
                <Routes>
                  <Route path="/" element={<ShoppingListPage />} />
                  <Route path="/compare" element={<ComparePage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="*" element={<ShoppingListPage />} />
                </Routes>
              </AppErrorBoundary>
            </div>
            {/* Phones only — the CSS hides it on wider screens. Outside the
                shell on purpose: the shell is what recedes behind an open
                sheet, and a fixed bar inside a transformed parent stops being
                fixed to the screen. */}
            <TabBar />
          </HashRouter>
        </CatalogProvider>
      </AppDataProvider>
    </SettingsProvider>
  );
}

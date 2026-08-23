import { HashRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
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
          <HashRouter>
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
          </HashRouter>
        </CatalogProvider>
      </AppDataProvider>
    </SettingsProvider>
  );
}

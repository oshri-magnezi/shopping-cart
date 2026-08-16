import { HashRouter, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { AppDataProvider } from './context/AppDataContext.jsx';
import { ShoppingListPage } from './pages/ShoppingListPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';

export default function App() {
  return (
    <SettingsProvider>
      <AppDataProvider>
        <HashRouter>
          <div className="app-shell">
            <Navbar />
            <Routes>
              <Route path="/" element={<ShoppingListPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="*" element={<ShoppingListPage />} />
            </Routes>
          </div>
        </HashRouter>
      </AppDataProvider>
    </SettingsProvider>
  );
}

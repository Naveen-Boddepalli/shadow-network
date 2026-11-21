import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { P2PProvider } from './context/P2PContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar      from './components/Navbar';
import Browse      from './pages/Browse';
import Upload      from './pages/Upload';
import Search      from './pages/Search';
import NoteDetail  from './pages/NoteDetail';
import Peers       from './pages/Peers';
import Health      from './pages/Health';
import Login       from './pages/Login';
import './styles/global.css';

const RequireAuth = ({ children, allowP2P = false }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  // P2P-only uploads never touch the backend, so they must work without a
  // login (and without internet). Upload itself restricts the server option.
  const p2pEnabled = import.meta.env.VITE_P2P_MODE === 'true';
  if (!isAuthenticated && !(allowP2P && p2pEnabled)) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <P2PProvider>
        <div className="app-shell">
          <Navbar />
          <main style={{ flex: 1 }}>
            <Routes>
              <Route path="/"         element={<Browse />} />
              <Route path="/login"    element={<Login />} />
              <Route path="/upload"   element={<RequireAuth allowP2P><Upload /></RequireAuth>} />
              <Route path="/search"   element={<Search />} />
              <Route path="/note/:id" element={<NoteDetail />} />
              <Route path="/peers"    element={<Peers />} />
              <Route path="/health"   element={<Health />} />
              <Route path="*"         element={
                <div className="page-wrap empty-state" style={{ paddingTop: 80 }}>
                  <div className="empty-state-icon">404</div>
                  <h3>Page not found</h3>
                </div>
              } />
            </Routes>
          </main>
          <footer style={{ textAlign: 'center', padding: '16px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Shadow Network · Decentralized Academic Sharing
          </footer>
        </div>
      </P2PProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;

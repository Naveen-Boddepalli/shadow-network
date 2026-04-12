// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { P2PProvider } from './context/P2PContext';
import Navbar      from './components/Navbar';
import Browse      from './pages/Browse';
import Upload      from './pages/Upload';
import Search      from './pages/Search';
import NoteDetail  from './pages/NoteDetail';
import Peers       from './pages/Peers';
import Health      from './pages/Health';
import './styles/global.css';

const App = () => (
  <BrowserRouter>
    <P2PProvider>
      <div className="app-shell">
        <Navbar />
        <main style={{ flex: 1 }}>
          <Routes>
            <Route path="/"         element={<Browse />} />
            <Route path="/upload"   element={<Upload />} />
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
          Shadow Network · Decentralized Academic Sharing · Phases 1–5
        </footer>
      </div>
    </P2PProvider>
  </BrowserRouter>
);

export default App;

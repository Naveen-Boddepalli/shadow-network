// src/components/Navbar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useP2P } from '../context/P2PContext';

const Navbar = () => {
  const { p2pEnabled, peers, initialized } = useP2P();

  return (
    <nav style={{
      background: '#1e1b4b',
      borderBottom: '1px solid #312e81',
      padding: '0 24px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      height: 56, flexShrink: 0,
    }}>
      {/* Logo */}
      <NavLink to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 20 }}>🌑</span>
        <span style={{ color: '#c7d2fe', fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>
          Shadow Network
        </span>
      </NavLink>

      {/* Nav links */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {[
          { to: '/',        label: 'Browse' },
          { to: '/upload',  label: 'Upload'  },
          { to: '/search',  label: 'Search'  },
          { to: '/peers',   label: 'Peers'   },
          { to: '/health',  label: 'Status'  },
        ].map(({ to, label }) => (
          <NavLink
            key={to} to={to} end={to === '/'}
            style={({ isActive }) => ({
              color: isActive ? '#fff' : '#a5b4fc',
              background: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
              padding: '6px 14px', borderRadius: 6,
              textDecoration: 'none', fontSize: 14, fontWeight: 500,
              transition: 'all 0.15s',
            })}
          >{label}</NavLink>
        ))}
      </div>

      {/* P2P status pill */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,0.07)',
        padding: '4px 12px', borderRadius: 20,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: p2pEnabled && initialized ? '#10b981'
                    : p2pEnabled               ? '#f59e0b'
                    :                            '#6b7280',
        }} />
        <span style={{ fontSize: 12, color: '#c7d2fe' }}>
          {p2pEnabled
            ? initialized ? `P2P · ${peers} peer${peers !== 1 ? 's' : ''}` : 'P2P connecting…'
            : 'Server mode'}
        </span>
      </div>
    </nav>
  );
};

export default Navbar;

// src/context/P2PContext.jsx
// Global React context for P2P node state.
// Wraps the whole app so any component can read peer count, status etc.

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { initHelia, getP2PStatus, stopHelia } from '../services/p2p';

const P2PContext = createContext(null);

export const P2PProvider = ({ children }) => {
  const [status, setStatus]       = useState({
    initialized: false,
    peers: 0,
    peerId: null,
    started: false,
    loading: false,
    error: null,
  });

  const p2pEnabled = process.env.REACT_APP_P2P_MODE === 'true';

  // Poll peer count every 5 seconds when P2P is active
  useEffect(() => {
    if (!p2pEnabled) return;

    let interval;

    const start = async () => {
      setStatus((s) => ({ ...s, loading: true, error: null }));
      try {
        await initHelia();
        const info = await getP2PStatus();
        setStatus((s) => ({ ...s, ...info, loading: false }));

        interval = setInterval(async () => {
          const info = await getP2PStatus();
          setStatus((s) => ({ ...s, ...info }));
        }, 5000);
      } catch (err) {
        setStatus((s) => ({ ...s, loading: false, error: err.message }));
      }
    };

    start();
    return () => {
      clearInterval(interval);
      stopHelia();
    };
  }, [p2pEnabled]);

  const refresh = useCallback(async () => {
    const info = await getP2PStatus();
    setStatus((s) => ({ ...s, ...info }));
  }, []);

  return (
    <P2PContext.Provider value={{ ...status, p2pEnabled, refresh }}>
      {children}
    </P2PContext.Provider>
  );
};

export const useP2P = () => useContext(P2PContext);

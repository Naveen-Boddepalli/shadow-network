// src/context/P2PContext.jsx
// Global React context for P2P node state.
// Wraps the whole app so any component can read peer count, status etc.
//
// The Helia node is a singleton for the lifetime of the tab: it is not stopped
// on unmount (React StrictMode mounts effects twice in dev, and tearing the
// node down mid-start would leave a half-started node behind).

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
// The P2P stack (Helia + libp2p) is large, so it is only loaded when P2P mode is on.
const loadP2P = () => import('../services/p2p');

const P2PContext = createContext(null);

const POLL_MS = 5000;

export const P2PProvider = ({ children }) => {
  const [status, setStatus] = useState({
    initialized: false,
    peers: 0,
    peerId: null,
    peerIds: [],
    shadowPeerIds: [],
    multiaddrs: [],
    relayConfigured: false,
    relayConnected: false,
    started: false,
    loading: false,
    error: null,
  });

  const p2pEnabled = import.meta.env.VITE_P2P_MODE === 'true';

  const refresh = useCallback(async () => {
    if (!p2pEnabled) return;
    const { getP2PStatus } = await loadP2P();
    const info = await getP2PStatus();
    setStatus((s) => ({ ...s, ...info }));
  }, [p2pEnabled]);

  useEffect(() => {
    if (!p2pEnabled) return;

    let cancelled = false;
    let interval;
    let libp2p;
    const onChange = () => { if (!cancelled) refresh(); };

    setStatus((s) => ({ ...s, loading: true, error: null }));
    loadP2P()
      .then(({ initHelia }) => initHelia())
      .then(async (helia) => {
        if (cancelled) return;
        libp2p = helia.libp2p;
        libp2p.addEventListener('peer:connect', onChange);
        libp2p.addEventListener('peer:disconnect', onChange);
        libp2p.addEventListener('self:peer:update', onChange);
        await refresh();
        setStatus((s) => ({ ...s, loading: false }));
        interval = setInterval(onChange, POLL_MS);
      })
      .catch((err) => {
        if (!cancelled) setStatus((s) => ({ ...s, loading: false, error: err.message }));
      });

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (libp2p) {
        libp2p.removeEventListener('peer:connect', onChange);
        libp2p.removeEventListener('peer:disconnect', onChange);
        libp2p.removeEventListener('self:peer:update', onChange);
      }
    };
  }, [p2pEnabled, refresh]);

  return (
    <P2PContext.Provider value={{ ...status, p2pEnabled, refresh }}>
      {children}
    </P2PContext.Provider>
  );
};

export const useP2P = () => useContext(P2PContext);

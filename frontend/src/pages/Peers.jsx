// src/pages/Peers.jsx
// Phase 5: Shows live P2P network status, connected peers, and offline mode info.

import React, { useState, useEffect } from 'react';
import { useP2P } from '../context/P2PContext';
// Loaded on demand so the P2P stack stays out of the main bundle.
const loadP2P = () => import('../services/p2p');

const Peers = () => {
  const {
    p2pEnabled, initialized, peers, peerId, peerIds, shadowPeerIds, multiaddrs,
    relayConfigured, relayConnected, error, loading, refresh,
  } = useP2P();
  const [cidInput, setCidInput]   = useState('');
  const [downloading, setDownloading] = useState(false);
  const [dlResult, setDlResult]   = useState(null);
  const [dlError, setDlError]     = useState('');
  const [dialInput, setDialInput] = useState('');
  const [dialing, setDialing]     = useState(false);
  const [dialMsg, setDialMsg]     = useState(null);
  const [copied, setCopied]       = useState('');

  // Shareable addresses: the relayed WebRTC ones are what other browsers can dial.
  const shareable = (multiaddrs || []).filter((a) => a.includes('/webrtc'));

  const handleDial = async (e) => {
    e.preventDefault();
    if (!dialInput.trim()) return;
    setDialing(true); setDialMsg(null);
    try {
      const { dialPeer } = await loadP2P();
      await dialPeer(dialInput);
      setDialMsg({ ok: true, text: 'Connected.' });
      setDialInput('');
      refresh();
    } catch (err) {
      setDialMsg({ ok: false, text: err.message });
    } finally {
      setDialing(false);
    }
  };

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1500);
    } catch { /* clipboard blocked — user can select manually */ }
  };

  // Auto-refresh peer list every 5s
  useEffect(() => {
    if (!p2pEnabled) return;
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [p2pEnabled, refresh]);

  const handleP2PDownload = async (e) => {
    e.preventDefault();
    if (!cidInput.trim()) return;
    setDownloading(true); setDlError(''); setDlResult(null);
    try {
      const { downloadFromHelia } = await loadP2P();
      const bytes = await downloadFromHelia(cidInput.trim());
      const blob  = new Blob([bytes]);
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      a.href = url; a.download = `ipfs-${cidInput.trim().slice(0, 12)}`;
      a.click(); URL.revokeObjectURL(url);
      setDlResult({ bytes: bytes.length, cid: cidInput.trim() });
    } catch (err) {
      setDlError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="page-wrap" style={{ maxWidth: 720 }}>
      <h1 className="page-title">P2P Network</h1>

      {/* Enable banner */}
      {!p2pEnabled && (
        <div className="alert alert-info" style={{ marginBottom: 24 }}>
          <strong>P2P mode is disabled.</strong> To enable browser-native IPFS (Phase 5), set{' '}
          <code style={{ background: '#dbeafe', padding: '0 4px', borderRadius: 3, fontSize: 12 }}>
            VITE_P2P_MODE=true
          </code>{' '}
          in <code style={{ background: '#dbeafe', padding: '0 4px', borderRadius: 3, fontSize: 12 }}>
            frontend/.env
          </code>{' '}
          and restart the dev server.
        </div>
      )}

      {/* Node status card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Node Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
          {[
            {
              label: 'P2P Mode',
              value: p2pEnabled ? 'Enabled' : 'Disabled',
              badge: p2pEnabled ? 'badge-green' : 'badge-gray',
            },
            {
              label: 'Node Status',
              value: loading ? 'Starting…' : initialized ? 'Running' : p2pEnabled ? 'Stopped' : '—',
              badge: initialized ? 'badge-green' : loading ? 'badge-yellow' : 'badge-gray',
            },
            {
              label: 'Relay',
              value: !initialized ? '—' : !relayConfigured ? 'Not set' : relayConnected ? 'Connected' : 'Waking relay…',
              badge: relayConnected ? 'badge-green' : initialized ? 'badge-yellow' : 'badge-gray',
            },
            {
              label: 'Shadow Peers',
              value: initialized ? (shadowPeerIds?.length || 0) : '—',
              badge: shadowPeerIds?.length > 0 ? 'badge-green' : initialized ? 'badge-yellow' : 'badge-gray',
            },
          ].map(({ label, value, badge }) => (
            <div key={label} style={{
              background: 'var(--bg)', borderRadius: 'var(--radius)',
              padding: '16px', textAlign: 'center',
            }}>
              <div className="text-sm text-muted" style={{ marginBottom: 6 }}>{label}</div>
              <span className={`badge ${badge}`} style={{ fontSize: 13 }}>{value}</span>
            </div>
          ))}
        </div>

        {peerId && (
          <div className="mt-16">
            <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Your Peer ID</div>
            <div className="cid" style={{ wordBreak: 'break-all' }}>{peerId}</div>
          </div>
        )}

        {initialized && !relayConfigured && (
          <div className="alert alert-warning mt-16">
            No relay configured. Start one with <code>cd p2p-relay && npm start</code> and put the address it
            prints in <code>VITE_P2P_RELAYS</code> — without it, browsers can't discover each other.
          </div>
        )}

        {shareable.length > 0 && (
          <div className="mt-16">
            <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Your dialable address (share with a peer)</div>
            {shareable.slice(0, 2).map((a) => (
              <div key={a} className="flex items-center gap-8" style={{ marginBottom: 4 }}>
                <div className="cid" style={{ wordBreak: 'break-all', flex: 1, fontSize: 11 }}>{a}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => copy(a)}>
                  {copied === a ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
          </div>
        )}

        {error && <div className="alert alert-error mt-16">{error}</div>}

        <button className="btn btn-secondary btn-sm mt-16" onClick={refresh} disabled={!p2pEnabled}>
          🔄 Refresh
        </button>
      </div>

      {/* Connected peers list */}
      {initialized && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 className="section-title">
            Shadow Network Peers
            <span className="badge badge-blue" style={{ marginLeft: 8 }}>{shadowPeerIds?.length || 0}</span>
          </h2>
          {!shadowPeerIds?.length ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-state-icon" style={{ fontSize: 28 }}>🔍</div>
              <h3 style={{ fontSize: 14 }}>Searching for peers…</h3>
              <p style={{ fontSize: 13 }}>
                Other Shadow Network users connected to the same relay appear here automatically
                (they announce themselves every 10 seconds). You can also paste a peer's address below.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shadowPeerIds.map((pid) => (
                <div key={pid} className="flex items-center gap-8"
                  style={{ padding: '8px 12px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
                  <span className="peer-dot peer-dot-green" />
                  <span className="cid" style={{ flex: 1, fontSize: 12 }}>{pid}</span>
                  <span className="badge badge-green">Connected</span>
                </div>
              ))}
            </div>
          )}
          {peers > (shadowPeerIds?.length || 0) && (
            <p className="text-sm text-muted mt-16" style={{ marginBottom: 0 }}>
              + {peers - (shadowPeerIds?.length || 0)} other connection(s) (relay / public IPFS nodes)
            </p>
          )}

          <form onSubmit={handleDial} className="flex gap-8 mt-16">
            <input className="form-input" style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12 }}
              placeholder="Paste a peer address: /ip4/…/p2p-circuit/webrtc/p2p/12D3Koo…"
              value={dialInput} onChange={(e) => setDialInput(e.target.value)} />
            <button type="submit" className="btn btn-secondary" disabled={dialing || !dialInput.trim()}>
              {dialing ? <><div className="spinner" /> Connecting…</> : 'Connect'}
            </button>
          </form>
          {dialMsg && (
            <div className={`alert ${dialMsg.ok ? 'alert-success' : 'alert-error'} mt-16`} style={{ marginBottom: 0 }}>
              {dialMsg.text}
            </div>
          )}
        </div>
      )}

      {/* P2P Download by CID */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Download from Peer by CID</h2>
        <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
          If a peer on your network has a file, enter its CID to retrieve it directly — no server needed.
          Works without internet when you and the peer share a campus relay on the same LAN.
        </p>
        <form onSubmit={handleP2PDownload} className="flex gap-8">
          <input className="form-input" style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 13 }}
            placeholder="Qm... or bafy..."
            value={cidInput} onChange={(e) => setCidInput(e.target.value)}
            disabled={!p2pEnabled || !initialized} />
          <button type="submit" className="btn btn-primary"
            disabled={!p2pEnabled || !initialized || downloading || !cidInput.trim()}>
            {downloading ? <><div className="spinner" /> Fetching…</> : '⬇ Fetch'}
          </button>
        </form>
        {dlError  && <div className="alert alert-error mt-16">{dlError}</div>}
        {dlResult && (
          <div className="alert alert-success mt-16">
            ✅ Downloaded {(dlResult.bytes / 1024).toFixed(1)} KB from CID: <span className="cid">{dlResult.cid.slice(0,20)}…</span>
          </div>
        )}
        {!p2pEnabled && (
          <div className="alert alert-warning mt-16" style={{ marginBottom: 0 }}>
            Enable P2P mode to use peer-to-peer downloads.
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="card">
        <h2 className="section-title">How P2P Works</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: '🌐', title: 'Helia (browser IPFS)', desc: 'Runs IPFS directly in your browser tab — no app install needed.' },
            { icon: '🛰', title: 'Campus relay', desc: 'A tiny libp2p relay (p2p-relay/) running on any machine on the LAN lets browsers reach each other. Browsers cannot discover each other on their own.' },
            { icon: '📡', title: 'WebRTC transport', desc: 'The relay only carries the WebRTC handshake — file bytes flow browser-to-browser over a DataChannel.' },
            { icon: '🔍', title: 'Pubsub peer discovery', desc: 'Peers announce themselves on a shared gossipsub topic via the relay and connect automatically.' },
            { icon: '🔒', title: 'Content addressed', desc: 'Files are identified by their cryptographic hash (CID). Content cannot be tampered with.' },
            { icon: '📴', title: 'Offline capable', desc: 'Files you add are kept in your browser (IndexedDB) and can be served to peers even after a reload, with no internet.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="flex items-center gap-12"
              style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 'var(--radius)' }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{title}</div>
                <div className="text-sm text-muted">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Peers;

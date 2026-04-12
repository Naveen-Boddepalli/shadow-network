// src/pages/Health.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getHealth } from '../services/api';
import { useP2P } from '../context/P2PContext';

const StatusRow = ({ label, value, ok }) => (
  <div className="flex justify-between items-center"
    style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontWeight: 500 }}>{label}</span>
    <span className={`badge ${ok === true ? 'badge-green' : ok === false ? 'badge-red' : 'badge-gray'}`}>
      {value}
    </span>
  </div>
);

const Health = () => {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const { p2pEnabled, initialized, peers } = useP2P();

  const fetchHealth = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await getHealth();
      setHealth(res.health);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  return (
    <div className="page-wrap" style={{ maxWidth: 640 }}>
      <div className="flex justify-between items-center" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0 }}>System Status</h1>
        <button className="btn btn-secondary btn-sm" onClick={fetchHealth} disabled={loading}>
          {loading ? <><div className="spinner" /> Checking…</> : '🔄 Refresh'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Backend services */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title">Backend Services</h2>
        {health ? (
          <>
            <StatusRow label="API Server"   value={health.server   || '—'} ok={health.server   === 'ok'} />
            <StatusRow label="MongoDB"      value={health.mongodb  || '—'} ok={health.mongodb  === 'ok'} />
            <StatusRow label="IPFS (Kubo)"  value={health.ipfs     || '—'} ok={health.ipfs     === 'ok'} />
            <StatusRow label="AI Engine"    value={health.aiEngine || '—'} ok={health.aiEngine === 'ok'} />
            {health.aiModels && (
              <>
                <StatusRow label="  Summarizer" value={health.aiModels.summarizer} ok={health.aiModels.summarizer === 'loaded'} />
                <StatusRow label="  Q&A model"  value={health.aiModels.qa}         ok={health.aiModels.qa         === 'loaded'} />
              </>
            )}
            {health.ipfsNodeId && (
              <div style={{ paddingTop: 12 }}>
                <div className="text-sm text-muted" style={{ marginBottom: 4 }}>IPFS Node ID</div>
                <div className="cid">{health.ipfsNodeId}</div>
              </div>
            )}
            <div className="text-sm text-muted" style={{ marginTop: 12 }}>
              Checked at {new Date(health.timestamp).toLocaleTimeString()}
            </div>
          </>
        ) : loading ? (
          <div className="flex items-center gap-12" style={{ padding: '20px 0' }}>
            <div className="spinner" /><span className="text-secondary">Checking services…</span>
          </div>
        ) : null}
      </div>

      {/* P2P status */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2 className="section-title">P2P Node (Browser)</h2>
        <StatusRow label="P2P Mode"    value={p2pEnabled ? 'Enabled'   : 'Disabled'} ok={p2pEnabled} />
        <StatusRow label="Helia Node"  value={initialized ? 'Running'  : p2pEnabled ? 'Starting' : '—'} ok={initialized} />
        <StatusRow label="Peers"       value={p2pEnabled ? String(peers) : '—'}       ok={peers > 0} />
      </div>

      {/* Quick start guide */}
      <div className="card">
        <h2 className="section-title">Quick Start</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'var(--mono)', fontSize: 13 }}>
          {[
            ['Terminal 1', 'ipfs daemon'],
            ['Terminal 2', 'mongod'],
            ['Terminal 3', 'cd ai-engine && uvicorn main:app --port 8000'],
            ['Terminal 4', 'cd backend && npm run dev'],
            ['Terminal 5', 'cd frontend && npm start'],
          ].map(([term, cmd]) => (
            <div key={term} style={{
              display: 'flex', gap: 12, alignItems: 'center',
              background: 'var(--bg)', padding: '8px 12px', borderRadius: 'var(--radius)',
            }}>
              <span className="badge badge-gray" style={{ flexShrink: 0, fontFamily: 'var(--font)' }}>{term}</span>
              <code style={{ color: 'var(--primary)', flex: 1 }}>{cmd}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Health;

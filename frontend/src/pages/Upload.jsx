// src/pages/Upload.jsx
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadFile } from '../services/api';
import { uploadToHelia } from '../services/p2p';
import { useP2P } from '../context/P2PContext';

const ACCEPTED = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.zip';

const Upload = () => {
  const navigate  = useNavigate();
  const fileRef   = useRef(null);
  const { p2pEnabled, initialized: p2pReady } = useP2P();

  const [form, setForm]         = useState({ title: '', subject: '', tags: '', uploadedBy: '' });
  const [file, setFile]         = useState(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [result, setResult]     = useState(null);
  const [mode, setMode]         = useState('server');  // 'server' | 'p2p'

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleFileDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer?.files[0] || e.target.files[0];
    if (dropped) setFile(dropped);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file)           return setError('Please select a file.');
    if (!form.title)     return setError('Title is required.');
    if (!form.subject)   return setError('Subject is required.');
    setError(''); setLoading(true); setProgress(0); setResult(null);

    try {
      if (mode === 'p2p' && p2pEnabled && p2pReady) {
        // ── P2P mode: upload directly to Helia (no server) ──
        const cid = await uploadToHelia(file);
        setResult({ cid, p2p: true, title: form.title });
      } else {
        // ── Server mode: upload via Node.js backend ──────────
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title',      form.title);
        fd.append('subject',    form.subject);
        fd.append('tags',       form.tags);
        fd.append('uploadedBy', form.uploadedBy || 'anonymous');

        const res = await uploadFile(fd, setProgress);
        setResult(res.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────
  if (result) {
    return (
      <div className="page-wrap" style={{ maxWidth: 600 }}>
        <div className="card" style={{ textAlign: 'center', padding: '40px 32px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontWeight: 700, marginBottom: 8 }}>Upload successful!</h2>
          <p className="text-secondary" style={{ marginBottom: 24 }}>
            {result.p2p
              ? 'File added to your local Helia node. Peers on the same network can download it.'
              : 'File stored on IPFS. Metadata saved to database. Semantic indexing running in background.'}
          </p>
          <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 24, textAlign: 'left' }}>
            <div className="text-sm text-muted" style={{ marginBottom: 4 }}>Content ID (CID)</div>
            <div className="cid" style={{ wordBreak: 'break-all' }}>{result.cid}</div>
          </div>
          <div className="flex gap-12" style={{ justifyContent: 'center' }}>
            {result.id && (
              <button className="btn btn-primary" onClick={() => navigate(`/note/${result.id}`)}>
                View Note
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => {
              setResult(null); setFile(null); setForm({ title: '', subject: '', tags: '', uploadedBy: '' });
            }}>Upload Another</button>
            <button className="btn btn-ghost" onClick={() => navigate('/')}>Browse All</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap" style={{ maxWidth: 640 }}>
      <h1 className="page-title">Upload Document</h1>

      {/* Mode toggle */}
      <div className="card" style={{ padding: '14px 20px', marginBottom: 20 }}>
        <div className="flex items-center gap-16">
          <span className="text-sm" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>Storage mode:</span>
          <label className="flex items-center gap-8" style={{ cursor: 'pointer' }}>
            <input type="radio" name="mode" value="server" checked={mode === 'server'}
              onChange={() => setMode('server')} />
            <span className="text-sm">Server + IPFS</span>
          </label>
          <label className="flex items-center gap-8" style={{
            cursor: p2pEnabled ? 'pointer' : 'not-allowed',
            opacity: p2pEnabled ? 1 : 0.4,
          }}>
            <input type="radio" name="mode" value="p2p" checked={mode === 'p2p'}
              onChange={() => setMode('p2p')} disabled={!p2pEnabled} />
            <span className="text-sm">P2P only (Helia)</span>
            {!p2pEnabled && <span className="badge badge-gray" style={{ fontSize: 10 }}>Set REACT_APP_P2P_MODE=true</span>}
          </label>
        </div>
        {mode === 'p2p' && p2pEnabled && !p2pReady && (
          <div className="alert alert-warning" style={{ marginTop: 10, marginBottom: 0 }}>
            P2P node is still connecting. Metadata won't be saved to server.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        {/* File drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
          style={{
            border: `2px dashed ${file ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-lg)', padding: '32px 24px',
            textAlign: 'center', cursor: 'pointer', marginBottom: 20,
            background: file ? 'var(--primary-light)' : 'var(--surface)',
            transition: 'all 0.15s',
          }}
        >
          <input ref={fileRef} type="file" accept={ACCEPTED}
            onChange={handleFileDrop} style={{ display: 'none' }} />
          {file ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
              <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{file.name}</div>
              <div className="text-sm text-muted mt-8">
                {(file.size / 1024).toFixed(0)} KB · Click to change
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: 8 }}>☁️</div>
              <div style={{ fontWeight: 500 }}>Drop file here or click to browse</div>
              <div className="text-sm text-muted mt-8">PDF, DOCX, TXT, Images — max 50 MB</div>
            </>
          )}
        </div>

        <div className="card">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" placeholder="e.g. Thermodynamics Unit 3"
                value={form.title} onChange={set('title')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Subject *</label>
              <input className="form-input" placeholder="e.g. Physics"
                value={form.subject} onChange={set('subject')} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tags</label>
              <input className="form-input" placeholder="exam, unit3, heat (comma separated)"
                value={form.tags} onChange={set('tags')} />
              <span className="form-hint">Comma-separated keywords for easier search</span>
            </div>
            <div className="form-group">
              <label className="form-label">Your name</label>
              <input className="form-input" placeholder="e.g. alice (optional)"
                value={form.uploadedBy} onChange={set('uploadedBy')} />
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {/* Progress bar */}
          {loading && mode === 'server' && progress > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="flex justify-between text-sm text-muted" style={{ marginBottom: 4 }}>
                <span>Uploading…</span><span>{progress}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <><div className="spinner" /> Uploading…</> : '⬆️  Upload to Shadow Network'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Upload;

// src/pages/NoteDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNoteById, summarizeNote, askQuestion, clearSummaryCache,
         embedNote, getDownloadUrl } from '../services/api';

const NoteDetail = () => {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const chatEndRef = useRef(null);

  const [note, setNote]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState('info');  // 'info' | 'summary' | 'chat'

  // Summary state
  const [summary, setSummary]         = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError]     = useState('');

  // Q&A state
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Embed state
  const [embedding, setEmbedding] = useState(false);

  // Load note
  useEffect(() => {
    (async () => {
      try {
        const res = await getNoteById(id);
        setNote(res.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSummarize = async (force = false) => {
    if (force) {
      await clearSummaryCache(id);
      setSummary(null);
    }
    setSummaryLoading(true); setSummaryError('');
    try {
      const res = await summarizeNote(id);
      setSummary(res.data);
      setNote((n) => ({ ...n, hasSummary: true }));
    } catch (err) {
      setSummaryError(err.message);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question.trim();
    setQuestion('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setChatLoading(true);
    try {
      const res = await askQuestion(id, q);
      const d   = res.data;
      setMessages((m) => [...m, {
        role: 'assistant',
        text: d.answer,
        confidence: d.confidence,
        confident: d.confident,
        warning: d.warning,
      }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: err.message }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleEmbed = async () => {
    setEmbedding(true);
    try {
      await embedNote(id);
      setNote((n) => ({ ...n, embeddingIndexed: true }));
      alert('✅ Document embedded! It now appears in semantic search.');
    } catch (err) {
      alert('❌ ' + err.message);
    } finally {
      setEmbedding(false);
    }
  };

  if (loading) return (
    <div className="page-wrap flex items-center gap-12" style={{ paddingTop: 60, justifyContent: 'center' }}>
      <div className="spinner spinner-lg" /><span className="text-secondary">Loading note…</span>
    </div>
  );

  if (error) return (
    <div className="page-wrap">
      <div className="alert alert-error">{error}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/')}>← Back</button>
    </div>
  );

  const fileSize = note?.fileSize
    ? note.fileSize > 1_048_576 ? `${(note.fileSize / 1_048_576).toFixed(1)} MB`
                                : `${Math.round(note.fileSize / 1024)} KB`
    : '—';

  return (
    <div className="page-wrap" style={{ maxWidth: 760 }}>
      {/* Back */}
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}
        onClick={() => navigate(-1)}>← Back</button>

      {/* Header */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{note.title}</h1>
          <a href={getDownloadUrl(note.cid)} target="_blank" rel="noreferrer"
            className="btn btn-primary btn-sm">⬇ Download</a>
        </div>
        <div className="flex items-center gap-12 text-sm text-secondary flex-wrap" style={{ marginBottom: 12 }}>
          <span><strong>Subject:</strong> {note.subject}</span>
          <span>·</span>
          <span><strong>By:</strong> {note.uploadedBy}</span>
          <span>·</span>
          <span><strong>Size:</strong> {fileSize}</span>
          <span>·</span>
          <span><strong>Uploaded:</strong> {new Date(note.uploadedAt).toLocaleDateString()}</span>
        </div>
        <div className="tag-list" style={{ marginBottom: 12 }}>
          {(note.tags || []).map((t) => <span key={t} className="tag">{t}</span>)}
        </div>
        <div className="flex items-center gap-8 flex-wrap">
          {note.hasSummary      && <span className="badge badge-green">✓ AI Summary cached</span>}
          {note.embeddingIndexed && <span className="badge badge-purple">⚡ Semantically indexed</span>}
          {!note.embeddingIndexed && (
            <button className="btn btn-ghost btn-sm" onClick={handleEmbed} disabled={embedding}>
              {embedding ? 'Indexing…' : '⚡ Add to semantic search'}
            </button>
          )}
        </div>
        <div className="mt-8">
          <span className="text-sm text-muted">CID: </span>
          <span className="cid">{note.cid}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4" style={{ marginBottom: 16 }}>
        {[
          { id: 'summary', label: '🤖 AI Summary' },
          { id: 'chat',    label: '💬 Ask AI' },
        ].map(({ id: tid, label }) => (
          <button key={tid} type="button"
            className="btn btn-sm"
            onClick={() => setTab(tid)}
            style={{
              background: tab === tid ? 'var(--primary)' : 'var(--surface)',
              color:      tab === tid ? '#fff' : 'var(--text-secondary)',
              border:     `1px solid ${tab === tid ? 'var(--primary)' : 'var(--border)'}`,
            }}
          >{label}</button>
        ))}
      </div>

      {/* Summary tab */}
      {tab === 'summary' && (
        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
            <h2 className="section-title" style={{ margin: 0 }}>AI Summary</h2>
            <div className="flex gap-8">
              {note.hasSummary && !summary && (
                <button className="btn btn-ghost btn-sm"
                  onClick={() => handleSummarize(true)}
                  disabled={summaryLoading}>Regenerate</button>
              )}
            </div>
          </div>

          {!summary && !summaryLoading && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
              <p className="text-secondary" style={{ marginBottom: 20 }}>
                {note.hasSummary
                  ? 'A cached summary exists. Click below to load it.'
                  : 'Summarize this document using BART. Takes ~20s on first run.'}
              </p>
              <button className="btn btn-primary" onClick={() => handleSummarize(false)}>
                {note.hasSummary ? 'Load Summary' : 'Summarize Document'}
              </button>
            </div>
          )}

          {summaryLoading && (
            <div className="flex items-center gap-12" style={{ padding: '32px 0', justifyContent: 'center' }}>
              <div className="spinner spinner-lg" />
              <div>
                <div style={{ fontWeight: 500 }}>Generating summary…</div>
                <div className="text-sm text-muted">First run downloads the BART model (~1 GB). Subsequent runs are fast.</div>
              </div>
            </div>
          )}

          {summaryError && <div className="alert alert-error">{summaryError}</div>}

          {summary && (
            <>
              <div style={{
                background: 'var(--primary-light)', borderRadius: 'var(--radius)',
                padding: '16px 20px', marginBottom: 16, lineHeight: 1.8, fontSize: 15,
              }}>
                {summary.summary}
              </div>
              <div className="flex gap-16 text-sm text-muted">
                <span>📖 Original: ~{summary.word_count_original?.toLocaleString()} words</span>
                <span>📝 Summary: ~{summary.word_count_summary?.toLocaleString()} words</span>
                {summary.cached && <span className="badge badge-gray">Cached</span>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Chat tab */}
      {tab === 'chat' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
          <h2 className="section-title">Ask about this document</h2>
          <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
            Extractive Q&A — answers are pulled directly from the document text (no hallucination).
          </p>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
            {messages.length === 0 && (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-state-icon" style={{ fontSize: 28 }}>💬</div>
                <h3 style={{ fontSize: 14 }}>Ask any question about this document</h3>
                <p style={{ fontSize: 13 }}>e.g. "What is the main conclusion?" or "Define entropy."</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
              }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: msg.role === 'user'      ? 'var(--primary)'
                             : msg.role === 'error'    ? '#fee2e2'
                             : 'var(--bg)',
                  color: msg.role === 'user' ? '#fff' : msg.role === 'error' ? '#991b1b' : 'var(--text-primary)',
                  border: msg.role !== 'user' ? '1px solid var(--border)' : 'none',
                  fontSize: 14, lineHeight: 1.6,
                }}>
                  {msg.text}
                </div>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-8 mt-8" style={{ paddingLeft: 4 }}>
                    <span className={`badge ${msg.confident ? 'badge-green' : 'badge-yellow'}`}>
                      {Math.round(msg.confidence * 100)}% confidence
                    </span>
                    {msg.warning && <span className="text-sm text-muted">{msg.warning}</span>}
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex items-center gap-8" style={{ alignSelf: 'flex-start' }}>
                <div className="spinner" /><span className="text-sm text-muted">Thinking…</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleAsk} className="flex gap-8">
            <input className="form-input" style={{ flex: 1 }}
              placeholder="Ask a question about this document…"
              value={question} onChange={(e) => setQuestion(e.target.value)}
              disabled={chatLoading} />
            <button type="submit" className="btn btn-primary" disabled={chatLoading || !question.trim()}>
              Ask
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default NoteDetail;

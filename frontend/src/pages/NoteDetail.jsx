import React, { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { getNoteById, summarizeNote, askQuestion, clearSummaryCache,
         embedNote, getDownloadUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';

// File types the AI engine can extract text from
const TEXT_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const NoteDetail = () => {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const chatEndRef = useRef(null);
  const { isAuthenticated } = useAuth();

  const [note, setNote]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [tab, setTab]           = useState('summary');  // 'summary' | 'chat'

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

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setSummary(null); setMessages([]);
    getNoteById(id)
      .then((res) => { if (!cancelled) setNote(res.data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSummarize = async (force = false) => {
    setSummaryLoading(true); setSummaryError('');
    try {
      if (force) {
        await clearSummaryCache(id);
        setSummary(null);
      }
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
        sources: d.sources || [],
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
    } catch (err) {
      alert(`Indexing failed: ${err.message}`);
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

  const aiSupported = TEXT_TYPES.has(note.mimeType);

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
          {!note.embeddingIndexed && aiSupported && isAuthenticated && (
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

      {!aiSupported && (
        <div className="alert alert-info">
          AI summaries and Q&amp;A are available for PDF, DOCX and TXT files.
        </div>
      )}

      {aiSupported && !isAuthenticated && (
        <div className="alert alert-info">
          <Link to="/login" state={{ from: { pathname: `/note/${id}` } }}>Log in</Link> to summarize
          this document or ask questions about it.
        </div>
      )}

      {aiSupported && isAuthenticated && (<>
      {/* Tabs */}
      <div className="flex gap-8" style={{ marginBottom: 16 }}>
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
              {summary && (
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
                  : 'Generate a short summary of this document. The first run also indexes it, so it can take a little longer.'}
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
                <div className="text-sm text-muted">A document's first request also indexes it and is slower.</div>
              </div>
            </div>
          )}

          {summaryError && <div className="alert alert-error">{summaryError}</div>}

          {summary && (
            <>
              <div style={{
                background: 'var(--primary-light)', borderRadius: 'var(--radius)',
                padding: '16px 20px', marginBottom: 16, lineHeight: 1.8, fontSize: 15,
                whiteSpace: 'pre-wrap',
              }}>
                {summary.summary}
              </div>
              <div className="flex gap-16 text-sm text-muted">
                {summary.word_count_original != null && (
                  <span>📖 Original: ~{summary.word_count_original.toLocaleString()} words</span>
                )}
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
            Answers are written from the most relevant passages of this document, with numbered citations to them.
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
                  fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {msg.text}
                </div>
                {msg.role === 'assistant' && msg.sources?.length > 0 && (
                  <div className="text-sm text-muted mt-8" style={{ paddingLeft: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {msg.sources.map((s) => (
                      <div key={s.n} title={s.excerpt}>
                        <strong>[{s.n}]</strong> {s.section || 'Untitled section'}: “{s.excerpt.slice(0, 90)}…”
                      </div>
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-8 mt-8" style={{ paddingLeft: 4 }}>
                    <span className={`badge ${msg.confident ? 'badge-green' : 'badge-yellow'}`}>
                      {msg.confident ? 'From this document' : 'Not found in document'}
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
      </>)}
    </div>
  );
};

export default NoteDetail;

// src/pages/Search.jsx
import React, { useState } from 'react';
import { searchNotes, semanticSearch } from '../services/api';
import NoteCard from '../components/NoteCard';

const Search = () => {
  const [query, setQuery]     = useState('');
  const [mode, setMode]       = useState('semantic');  // 'keyword' | 'semantic'
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [meta, setMeta]       = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(''); setResults(null); setMeta(null);

    try {
      const res = mode === 'semantic'
        ? await semanticSearch(query.trim(), 10)
        : await searchNotes(query.trim(), 10);

      setResults(res.data || []);
      setMeta({
        query: res.query,
        count: res.count,
        total_indexed: res.total_indexed,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrap">
      <h1 className="page-title">Search Documents</h1>

      {/* Search form */}
      <div className="card" style={{ marginBottom: 24 }}>
        {/* Mode selector */}
        <div className="flex items-center gap-8" style={{ marginBottom: 16 }}>
          {[
            { id: 'semantic', label: '⚡ Semantic', desc: 'Search by meaning (AI-powered)' },
            { id: 'keyword',  label: '🔤 Keyword',  desc: 'Search by exact words' },
          ].map(({ id, label, desc }) => (
            <button
              key={id} type="button"
              onClick={() => { setMode(id); setResults(null); setMeta(null); }}
              className="btn btn-sm"
              style={{
                background: mode === id ? 'var(--primary)' : 'var(--bg)',
                color:      mode === id ? '#fff' : 'var(--text-secondary)',
                border:     `1px solid ${mode === id ? 'var(--primary)' : 'var(--border)'}`,
              }}
            >{label}</button>
          ))}
          <span className="text-sm text-muted" style={{ marginLeft: 4 }}>
            {mode === 'semantic'
              ? 'Finds conceptually similar docs — "motion" finds "Newton", "dynamics", "F=ma"'
              : 'Finds docs containing exact words or phrases'}
          </span>
        </div>

        <form onSubmit={handleSearch} className="flex gap-12">
          <input
            className="form-input"
            style={{ flex: 1 }}
            placeholder={
              mode === 'semantic'
                ? 'e.g. laws of motion, neural networks, heat transfer…'
                : 'e.g. thermodynamics, machine learning…'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
            {loading ? <><div className="spinner" /> Searching…</> : 'Search'}
          </button>
        </form>

        {/* Info callout for semantic */}
        {mode === 'semantic' && (
          <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0, fontSize: 13 }}>
            💡 Semantic search requires documents to be embedded first. The badge{' '}
            <span className="badge badge-purple" style={{ fontSize: 11 }}>⚡ Semantic</span>{' '}
            on a note means it's indexed and searchable.
            {meta?.total_indexed != null && (
              <> Currently <strong>{meta.total_indexed}</strong> document{meta.total_indexed !== 1 ? 's' : ''} indexed.</>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Results */}
      {results !== null && (
        <>
          <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
            <span className="text-sm text-secondary">
              {meta?.count
                ? <><strong>{meta.count}</strong> result{meta.count !== 1 ? 's' : ''} for "<em>{meta.query}</em>"</>
                : `No results for "${meta?.query}"`}
            </span>
            {mode === 'semantic' && meta?.total_indexed != null && (
              <span className="text-sm text-muted">
                Searched {meta.total_indexed} indexed document{meta.total_indexed !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <h3>No documents found</h3>
              <p>
                {mode === 'semantic'
                  ? 'Try uploading more documents or switching to keyword search.'
                  : 'Try different keywords or switch to semantic search.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {results.map((note) => (
                <NoteCard key={note.id} note={note} showScore={mode === 'semantic'} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Initial state */}
      {results === null && !loading && !error && (
        <div className="empty-state">
          <div className="empty-state-icon">🔭</div>
          <h3>Enter a query to search</h3>
          <p>Both keyword and semantic search are available.</p>
        </div>
      )}
    </div>
  );
};

export default Search;

// src/pages/Browse.jsx
import React, { useState } from 'react';
import { useNotes } from '../hooks/useNotes';
import NoteCard from '../components/NoteCard';

const Browse = () => {
  const [subject, setSubject] = useState('');
  const [page, setPage]       = useState(1);
  const [filter, setFilter]   = useState({});

  const { notes, loading, error, pagination, refetch, remove } = useNotes(
    { ...filter, page, limit: 12 }
  );

  const applyFilter = (e) => {
    e.preventDefault();
    setFilter(subject ? { subject } : {});
    setPage(1);
  };

  return (
    <div className="page-wrap">
      <div className="flex justify-between items-center" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Browse Notes</h1>
        <span className="text-sm text-muted">
          {pagination.total != null ? `${pagination.total} document${pagination.total !== 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {/* Subject filter */}
      <form onSubmit={applyFilter} className="card flex items-center gap-12" style={{ padding: '14px 20px', marginBottom: 20 }}>
        <input
          className="form-input" style={{ flex: 1 }}
          placeholder="Filter by subject (e.g. Physics)…"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        {filter.subject && (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => { setFilter({}); setSubject(''); setPage(1); }}
          >Clear</button>
        )}
      </form>

      {/* States */}
      {loading && (
        <div className="flex items-center gap-12" style={{ padding: '40px 0', justifyContent: 'center' }}>
          <div className="spinner spinner-lg" />
          <span className="text-secondary">Loading notes…</span>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {!loading && !error && notes.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📚</div>
          <h3>No notes found</h3>
          <p>Upload your first document to get started.</p>
        </div>
      )}

      {/* Notes grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.map((note) => (
          <NoteCard key={note.id} note={note} onDelete={remove} />
        ))}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center gap-8 mt-24" style={{ justifyContent: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >← Prev</button>
          <span className="text-sm text-secondary">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
          >Next →</button>
        </div>
      )}
    </div>
  );
};

export default Browse;

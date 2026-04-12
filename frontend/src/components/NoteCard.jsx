// src/components/NoteCard.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getDownloadUrl } from '../services/api';

const NoteCard = ({ note, onDelete, showScore }) => {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${note.title}"? This removes metadata only — file stays on IPFS.`)) return;
    setDeleting(true);
    try { await onDelete(note.id); }
    catch (err) { alert(err.message); setDeleting(false); }
  };

  const fileSize = note.fileSize
    ? note.fileSize > 1_048_576
      ? `${(note.fileSize / 1_048_576).toFixed(1)} MB`
      : `${Math.round(note.fileSize / 1024)} KB`
    : null;

  const mimeIcon =
    note.mimeType?.includes('pdf')  ? '📄' :
    note.mimeType?.includes('word') ? '📝' :
    note.mimeType?.includes('text') ? '📃' :
    note.mimeType?.includes('image')? '🖼️' : '📎';

  return (
    <div className="card" style={{ transition: 'box-shadow 0.15s' }}
      onMouseEnter={(e) => e.currentTarget.style.boxShadow = 'var(--shadow)'}
      onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'var(--shadow-sm)'}
    >
      <div className="flex justify-between items-center gap-12">
        {/* Left: info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-8" style={{ marginBottom: 4 }}>
            <span style={{ fontSize: 18 }}>{mimeIcon}</span>
            <Link to={`/note/${note.id}`} style={{
              fontWeight: 600, fontSize: 15, color: 'var(--primary)',
              textDecoration: 'none',
            }}
              className="truncate"
            >{note.title}</Link>
          </div>

          <div className="flex items-center gap-8 text-sm text-secondary" style={{ marginBottom: 8 }}>
            <span>{note.subject}</span>
            <span>·</span>
            <span>{note.uploadedBy}</span>
            {fileSize && <><span>·</span><span>{fileSize}</span></>}
            {note.uploadedAt && (
              <><span>·</span>
              <span>{new Date(note.uploadedAt).toLocaleDateString()}</span></>
            )}
          </div>

          <div className="flex items-center gap-8 flex-wrap">
            {/* Tags */}
            <div className="tag-list">
              {(note.tags || []).slice(0, 4).map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>

            {/* Badges */}
            {note.hasSummary && (
              <span className="badge badge-green">✓ Summary</span>
            )}
            {note.embeddingIndexed && (
              <span className="badge badge-purple">⚡ Semantic</span>
            )}

            {/* Semantic score */}
            {showScore && note.semanticScore != null && (
              <span className="badge badge-blue">
                {Math.round(note.semanticScore * 100)}% match
              </span>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex flex-col gap-8" style={{ flexShrink: 0 }}>
          <Link to={`/note/${note.id}`} className="btn btn-primary btn-sm">
            View
          </Link>
          <a
            href={getDownloadUrl(note.cid)}
            target="_blank" rel="noreferrer"
            className="btn btn-secondary btn-sm"
          >
            Download
          </a>
          {onDelete && (
            <button
              onClick={handleDelete} disabled={deleting}
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--danger)' }}
            >
              {deleting ? '…' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {/* CID row */}
      <div className="flex items-center gap-8 mt-8">
        <span className="text-sm text-muted">CID:</span>
        <span className="cid">{note.cid?.slice(0, 20)}…{note.cid?.slice(-8)}</span>
      </div>
    </div>
  );
};

export default NoteCard;

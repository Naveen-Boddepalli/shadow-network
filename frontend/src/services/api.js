// src/services/api.js
// All HTTP calls to the Node.js backend (/api/v1).
// Components never use axios/fetch directly — they call these functions.

import axios from 'axios';

const BASE = process.env.REACT_APP_API_URL || '/api/v1';

const api = axios.create({
  baseURL: BASE,
  timeout: 120_000,   // 2 min — AI endpoints can be slow on first model load
});

// ── Interceptor: normalize errors ──────────────────────────────
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      'Unknown error';
    return Promise.reject(new Error(message));
  }
);

// ── Files (Phase 1) ────────────────────────────────────────────

/**
 * Upload a file with metadata.
 * @param {FormData} formData  — must contain: file, title, subject, tags, uploadedBy
 * @param {function} onProgress — (percent: number) => void
 */
export const uploadFile = (formData, onProgress) =>
  api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });

/**
 * Get download URL for a CID.
 * Returns a URL string the browser can navigate to directly.
 */
export const getDownloadUrl = (cid) => `${BASE}/download/${cid}`;

// ── Notes (Phase 2) ────────────────────────────────────────────

export const getAllNotes = (params = {}) =>
  api.get('/notes', { params });   // ?subject=&limit=&page=

export const getNoteById = (id) =>
  api.get(`/notes/${id}`);

export const deleteNote = (id) =>
  api.delete(`/notes/${id}`);

export const searchNotes = (q, limit = 10) =>
  api.get('/search', { params: { q, limit } });

// ── AI — Summarize + Q&A (Phase 3) ────────────────────────────

export const summarizeNote = (id) =>
  api.post(`/notes/${id}/summarize`);

export const askQuestion = (id, question) =>
  api.post(`/notes/${id}/ask`, { question });

export const clearSummaryCache = (id) =>
  api.delete(`/notes/${id}/summary`);

// ── Semantic search (Phase 4) ──────────────────────────────────

export const semanticSearch = (q, k = 10) =>
  api.get('/semantic-search', { params: { q, k } });

export const embedNote = (id) =>
  api.post(`/notes/${id}/embed`);

// ── Health ─────────────────────────────────────────────────────

export const getHealth = () => api.get('/health');

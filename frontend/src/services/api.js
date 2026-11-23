// HTTP client for the Node backend (/api/v1). Components call these functions
// rather than using axios directly.

import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api/v1';

export const TOKEN_KEY = 'shadow_token';
// Fired when the backend rejects the stored token, so AuthContext can log out.
export const AUTH_EXPIRED_EVENT = 'shadow:auth-expired';

const readToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

const api = axios.create({
  baseURL: BASE,
  timeout: 120_000, // AI endpoints can be slow while a model loads
});

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401 && err.config?.headers?.Authorization) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      (err.code === 'ECONNABORTED' ? 'Request timed out' : err.message) ||
      'Unknown error';
    return Promise.reject(new Error(message));
  }
);

// ── Auth ───────────────────────────────────────────────────────

export const login = (secret) => api.post('/auth/token', { secret });

// ── Files ──────────────────────────────────────────────────────

/**
 * @param {FormData} formData  file, title, subject, tags, uploadedBy
 * @param {(percent: number) => void} onProgress
 */
export const uploadFile = (formData, onProgress) =>
  api.post('/upload', formData, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });

export const getDownloadUrl = (cid) => `${BASE}/download/${encodeURIComponent(cid)}`;

// ── Notes ──────────────────────────────────────────────────────

export const getAllNotes = (params = {}) => api.get('/notes', { params }); // subject, limit, page

export const getNoteById = (id) => api.get(`/notes/${id}`);

export const deleteNote = (id) => api.delete(`/notes/${id}`);

export const searchNotes = (q, limit = 10) => api.get('/search', { params: { q, limit } });

// ── AI ─────────────────────────────────────────────────────────

export const summarizeNote = (id) => api.post(`/notes/${id}/summarize`);

export const askQuestion = (id, question) => api.post(`/notes/${id}/ask`, { question });

export const clearSummaryCache = (id) => api.delete(`/notes/${id}/summary`);

export const semanticSearch = (q, k = 10) => api.get('/semantic-search', { params: { q, k } });

export const embedNote = (id) => api.post(`/notes/${id}/embed`);

// ── Health ─────────────────────────────────────────────────────

// The backend answers 503 (with the same body) when a dependency is down;
// that's still a useful status report, not an error.
export const getHealth = () =>
  api.get('/health', { validateStatus: (s) => s === 200 || s === 503 });

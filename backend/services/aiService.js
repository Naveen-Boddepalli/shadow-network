// HTTP client for the Python AI engine. Node never runs ML models itself.

const { httpError } = require('../utils/httpError');

const AI_ENGINE_URL = (process.env.AI_ENGINE_URL || 'http://localhost:8000').replace(/\/$/, '');
const AI_ENGINE_KEY = process.env.AI_ENGINE_KEY; // optional shared secret, must match the engine's
const TIMEOUT_MS    = 120_000; // first request after a cold start also loads the model

const headers = () => ({
  'Content-Type': 'application/json',
  ...(AI_ENGINE_KEY && { 'X-Internal-Key': AI_ENGINE_KEY }),
});

const callAIEngine = async (path, body) => {
  let res;
  try {
    res = await fetch(`${AI_ENGINE_URL}${path}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw httpError(504, `AI engine timed out after ${TIMEOUT_MS / 1000}s. The model may still be loading; try again.`);
    }
    throw httpError(503, `AI engine is unreachable at ${AI_ENGINE_URL} (${err.cause?.code || err.message}).`);
  }

  if (res.status === 429) {
    throw httpError(429, 'AI engine rate limit reached. Wait a moment and try again.');
  }
  if (res.status === 502 || res.status === 503) {
    throw httpError(503, 'AI engine is starting up. Render free-tier services sleep when idle; wait ~30s and retry.');
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw httpError(502, `AI engine returned a non-JSON response (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    // FastAPI puts the message in `detail` (a string, or a list for validation errors)
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d) => d.msg).join('; ')
      : data.detail;
    // Pass through 4xx from the engine (e.g. unsupported file type); everything else is a bad gateway.
    const status = res.status >= 400 && res.status < 500 ? res.status : 502;
    throw httpError(status, detail || `AI engine error (HTTP ${res.status})`);
  }
  return data;
};

const summarizeDocument = (cid, mimeType) =>
  callAIEngine('/summarize', { cid, mime_type: mimeType });

const askQuestion = (cid, question, mimeType) =>
  callAIEngine('/ask', { cid, question, mime_type: mimeType });

const embedDocument = (cid, noteId, mimeType) =>
  callAIEngine('/embed', { cid, note_id: noteId, mime_type: mimeType });

// Returns { results: [{ note_id, score, rank }], total_indexed }
const semanticSearch = (query, k = 10) =>
  callAIEngine('/semantic-search', { query, k });

const removeEmbedding = (noteId) =>
  callAIEngine('/remove-embedding', { note_id: noteId });

// Never throws; used by /health.
const checkAIEngineHealth = async () => {
  try {
    const res = await fetch(`${AI_ENGINE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false };
    return { ok: true, ...(await res.json()) };
  } catch {
    return { ok: false };
  }
};

module.exports = {
  summarizeDocument,
  askQuestion,
  embedDocument,
  semanticSearch,
  removeEmbedding,
  checkAIEngineHealth,
};

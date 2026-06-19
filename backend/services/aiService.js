// backend/services/aiService.js  —  Phase 3 + 4
// HTTP wrapper around the Python AI Engine.
// Node.js never runs ML models directly — it delegates here.

const http  = require('http');
const https = require('https');

const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';

// ── Core HTTP helper ───────────────────────────────────────────

const callAIEngine = (path, body, method = 'POST') => {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url     = new URL(AI_ENGINE_URL + path);
    const isHttps = url.protocol === 'https:';
    const client  = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname,
      method,
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        // ── Handle known HTTP error codes first ──────────────────
        if (res.statusCode === 429) {
          return reject(new Error(
            'AI engine rate limit reached (HTTP 429). Wait a moment and try again.'
          ));
        }
        if (res.statusCode === 503 || res.statusCode === 502) {
          return reject(new Error(
            `AI engine is starting up (HTTP ${res.statusCode}). ` +
            'Render free tier sleeps after inactivity — wait ~30s and retry.'
          ));
        }

        // ── Try to parse JSON ────────────────────────────────────
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(parsed.detail || `AI engine error (HTTP ${res.statusCode})`));
          } else {
            resolve(parsed);
          }
        } catch {
          if (data.includes('<!DOCTYPE') || data.includes('<html')) {
            reject(new Error(
              `AI engine is not responding (HTTP ${res.statusCode}). ` +
              'It may be asleep on Render free tier — wait ~30s and retry.'
            ));
          } else {
            reject(new Error(`AI engine returned invalid response (HTTP ${res.statusCode})`));
          }
        }
      });
    });

    req.setTimeout(120_000, () => {
      req.destroy();
      reject(new Error('AI engine timed out (120s). Model may still be loading.'));
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error('AI Engine is not running. Start: uvicorn main:app --port 8000'));
      } else {
        reject(err);
      }
    });

    req.write(payload);
    req.end();
  });
};

// ── Phase 3: Summarize ─────────────────────────────────────────
const summarizeDocument = (cid, mimeType = 'application/pdf') =>
  callAIEngine('/summarize', { cid, mime_type: mimeType });

// ── Phase 3: Q&A ───────────────────────────────────────────────
const askQuestion = (cid, question, mimeType = 'application/pdf') =>
  callAIEngine('/ask', { cid, question, mime_type: mimeType });

// ── Phase 4: Embed a document into FAISS ───────────────────────
/**
 * Fire-and-forget after upload — makes the doc semantically searchable.
 * @param {string} cid      IPFS CID
 * @param {string} noteId   MongoDB _id
 * @param {string} mimeType file MIME type
 */
const embedDocument = (cid, noteId, mimeType = 'application/pdf') =>
  callAIEngine('/embed', { cid, note_id: noteId, mime_type: mimeType });

// ── Phase 4: Semantic search ───────────────────────────────────
/**
 * Search by meaning. Returns [{note_id, score, rank}] sorted by relevance.
 * @param {string} query  Natural language search string
 * @param {number} k      Number of results (default 10)
 */
const semanticSearch = (query, k = 10) =>
  callAIEngine('/semantic-search', { query, k });

// ── Phase 4: Remove embedding on note delete ───────────────────
const removeEmbedding = (noteId) =>
  callAIEngine('/remove-embedding', { note_id: noteId });

// ── Health check ───────────────────────────────────────────────
const checkAIEngineHealth = () => {
  return new Promise((resolve) => {
    const url    = new URL(AI_ENGINE_URL + '/health');
    const client = url.protocol === 'https:' ? https : http;
    const req    = client.get(
      { hostname: url.hostname, port: url.port || 80, path: '/health', timeout: 3000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ ok: true, ...JSON.parse(data) }); }
          catch { resolve({ ok: false }); }
        });
      }
    );
    req.on('error',   () => resolve({ ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
  });
};

module.exports = {
  summarizeDocument,
  askQuestion,
  embedDocument,
  semanticSearch,
  removeEmbedding,
  checkAIEngineHealth,
};

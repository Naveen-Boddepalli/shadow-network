// backend/controllers/semanticController.js  —  Phase 4
// GET /api/v1/semantic-search?q=...
// POST /api/v1/notes/:id/embed   (manual re-embed trigger)

const Note = require('../models/Note');
const { semanticSearch, embedDocument, removeEmbedding } = require('../services/aiService');

/**
 * GET /api/v1/semantic-search?q=query&k=10
 *
 * How it works:
 * 1. Send query to Python AI engine → embed query with sentence-transformers
 * 2. FAISS finds k nearest document vectors (cosine similarity)
 * 3. Returns note_ids + scores
 * 4. We fetch full Note objects from MongoDB by those IDs
 * 5. Return enriched results to client
 *
 * Example:
 *   GET /api/v1/semantic-search?q=laws+of+motion
 *   Finds notes about Newton, dynamics, F=ma, kinematics — even if those
 *   exact words aren't in the query.
 */
const semanticSearchNotes = async (req, res, next) => {
  try {
    const { q, k = '10' } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Query param "q" is required (min 2 characters)',
      });
    }

    const kNum = Math.min(50, Math.max(1, parseInt(k) || 10));

    // ── 1. Ask AI engine for ranked note_ids ───────────────────
    const aiResult = await semanticSearch(q.trim(), kNum);

    if (aiResult.total_indexed === 0) {
      return res.json({
        success: true,
        query: q.trim(),
        count: 0,
        data: [],
        message: 'No documents have been semantically indexed yet. Upload files first.',
      });
    }

    // ── 2. Fetch full Note objects from MongoDB ────────────────
    const noteIds = aiResult.results.map((r) => r.note_id);
    const notes   = await Note.find({ _id: { $in: noteIds } });

    // ── 3. Merge score + rank into each Note ──────────────────
    // We need to preserve the ranking from FAISS, not MongoDB's order
    const noteMap = Object.fromEntries(notes.map((n) => [n._id.toString(), n]));

    const enrichedResults = aiResult.results
      .filter((r) => noteMap[r.note_id])  // Skip any note_ids not in MongoDB
      .map((r) => ({
        ...noteMap[r.note_id].toPublic(),
        semanticScore: r.score,   // Cosine similarity 0.0–1.0 (higher = more relevant)
        rank: r.rank,
      }));

    res.json({
      success: true,
      query:          q.trim(),
      count:          enrichedResults.length,
      total_indexed:  aiResult.total_indexed,
      data:           enrichedResults,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/notes/:id/embed
 * Manually trigger embedding for a note.
 * Useful if AI engine was down during upload, or for re-indexing.
 */
const embedNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    const result = await embedDocument(note.cid, note._id.toString(), note.mimeType);

    // Update flag in MongoDB
    note.embeddingIndexed = true;
    await note.save();

    res.json({
      success: true,
      message: result.indexed
        ? 'Document embedded and added to semantic search index.'
        : `Document was already indexed (position ${result.faiss_position}).`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { semanticSearchNotes, embedNote };

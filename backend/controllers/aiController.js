// backend/controllers/aiController.js
// Handles: POST /notes/:id/summarize  and  POST /notes/:id/ask

const Note = require('../models/Note');
const { summarizeDocument, askQuestion } = require('../services/aiService');

/**
 * POST /api/v1/notes/:id/summarize
 *
 * Summarizes the document attached to a Note.
 * - Looks up Note in MongoDB to get CID + MIME type
 * - Calls AI engine to summarize
 * - Caches the summary in MongoDB so next call is instant
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "noteId": "...",
 *     "title": "...",
 *     "summary": "...",
 *     "word_count_original": 4200,
 *     "word_count_summary": 180,
 *     "cached": false
 *   }
 * }
 */
const summarizeNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // ── Return cached summary if available ──────────────────
    if (note.summary) {
      return res.json({
        success: true,
        data: {
          noteId: note._id,
          title: note.title,
          summary: note.summary,
          word_count_original: null,   // Not stored in cache
          word_count_summary: note.summary.split(' ').length,
          cached: true,
          cachedAt: note.summaryGeneratedAt,
        },
      });
    }

    // ── Call AI engine ──────────────────────────────────────
    const result = await summarizeDocument(note.cid, note.mimeType);

    // ── Cache summary in MongoDB ────────────────────────────
    note.summary = result.summary;
    note.summaryGeneratedAt = new Date();
    await note.save();

    res.json({
      success: true,
      data: {
        noteId: note._id,
        title: note.title,
        summary: result.summary,
        word_count_original: result.word_count_original,
        word_count_summary: result.word_count_summary,
        chunks_processed: result.chunks_processed,
        cached: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/notes/:id/ask
 * Body: { "question": "What is the second law of thermodynamics?" }
 *
 * Answers a question about the document.
 * No caching here — questions are dynamic.
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "question": "...",
 *     "answer": "...",
 *     "confidence": 0.87,
 *     "confident": true,
 *     "chunks_searched": 3
 *   }
 * }
 */
const askAboutNote = async (req, res, next) => {
  try {
    const { question } = req.body;

    if (!question || question.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'A question of at least 5 characters is required in the request body',
      });
    }

    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // ── Call AI engine ──────────────────────────────────────
    const result = await askQuestion(note.cid, question.trim(), note.mimeType);

    res.json({
      success: true,
      data: {
        noteId: note._id,
        title: note.title,
        question: result.question,
        answer: result.answer,
        confidence: result.confidence,
        confident: result.confident,
        chunks_searched: result.chunks_searched,
        // Low confidence warning — the model isn't sure
        warning: !result.confident
          ? 'Low confidence answer. The document may not contain information about this topic.'
          : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/notes/:id/summary
 * Clears the cached summary so it gets regenerated on next request.
 * Useful if the AI model is updated or the summary was unsatisfactory.
 */
const clearSummaryCache = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    note.summary = undefined;
    note.summaryGeneratedAt = undefined;
    await note.save();

    res.json({ success: true, message: 'Summary cache cleared. Next call will regenerate.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { summarizeNote, askAboutNote, clearSummaryCache };

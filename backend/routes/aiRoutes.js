// backend/routes/aiRoutes.js
// AI-powered routes — all scoped to a specific note by :id
// All routes are PROTECTED: require a valid JWT.

const express = require('express');
const router  = express.Router();
const { summarizeNote, askAboutNote, clearSummaryCache } = require('../controllers/aiController');
const { requireAuth }                                    = require('../middleware/auth');
const { validateAsk, handleValidation }                  = require('../middleware/validators');

// POST /api/v1/notes/:id/summarize  ← PROTECTED
// Summarizes the document. Returns cached result if available.
router.post('/notes/:id/summarize', requireAuth, summarizeNote);

// POST /api/v1/notes/:id/ask  ← PROTECTED + validated
// Body: { "question": "your question here" }
// Answers a question about the document using extractive Q&A.
router.post('/notes/:id/ask', requireAuth, validateAsk, handleValidation, askAboutNote);

// DELETE /api/v1/notes/:id/summary  ← PROTECTED
// Clears cached summary so it gets freshly regenerated.
router.delete('/notes/:id/summary', requireAuth, clearSummaryCache);

module.exports = router;

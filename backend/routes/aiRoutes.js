// AI routes, scoped to a note by :id. All require a valid JWT.

const express = require('express');
const { summarizeNote, askAboutNote, clearSummaryCache } = require('../controllers/aiController');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter, apiLimiter } = require('../middleware/rateLimiters');
const { validateNoteId, validateAsk, handleValidation } = require('../middleware/validators');

const router = express.Router();

// Returns the cached summary when one exists.
router.post('/notes/:id/summarize', aiLimiter, requireAuth, validateNoteId, handleValidation, summarizeNote);

// Body: { "question": "..." } — extractive Q&A over the document text.
router.post('/notes/:id/ask', aiLimiter, requireAuth, validateAsk, handleValidation, askAboutNote);

// Clears the cached summary so the next summarize call regenerates it.
router.delete('/notes/:id/summary', apiLimiter, requireAuth, validateNoteId, handleValidation, clearSummaryCache);

module.exports = router;

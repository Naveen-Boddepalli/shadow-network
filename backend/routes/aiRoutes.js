// AI routes, scoped to a note by :id. All require a valid JWT.

const express   = require('express');
const rateLimit = require('express-rate-limit');
const { summarizeNote, askAboutNote, clearSummaryCache } = require('../controllers/aiController');
const { requireAuth } = require('../middleware/auth');
const { validateNoteId, validateAsk, handleValidation } = require('../middleware/validators');

const router = express.Router();

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many AI requests, please try again later.' },
});

// Returns the cached summary when one exists.
router.post('/notes/:id/summarize', requireAuth, aiLimiter, validateNoteId, handleValidation, summarizeNote);

// Body: { "question": "..." } — extractive Q&A over the document text.
router.post('/notes/:id/ask', requireAuth, aiLimiter, validateAsk, handleValidation, askAboutNote);

// Clears the cached summary so the next summarize call regenerates it.
router.delete('/notes/:id/summary', requireAuth, validateNoteId, handleValidation, clearSummaryCache);

module.exports = router;

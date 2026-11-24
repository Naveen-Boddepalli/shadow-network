const express = require('express');
const { semanticSearchNotes, embedNote } = require('../controllers/semanticController');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter, apiLimiter } = require('../middleware/rateLimiters');
const { validateNoteId, validateSemanticSearch, handleValidation } = require('../middleware/validators');

const router = express.Router();

// GET /semantic-search?q=query&k=10 — meaning-based search over document embeddings
router.get('/semantic-search', apiLimiter, validateSemanticSearch, handleValidation, semanticSearchNotes);

// Retry embedding for a note (e.g. the AI engine was asleep at upload time)
router.post('/notes/:id/embed', aiLimiter, requireAuth, validateNoteId, handleValidation, embedNote);

module.exports = router;

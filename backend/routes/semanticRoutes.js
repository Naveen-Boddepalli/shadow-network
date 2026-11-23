const express = require('express');
const { semanticSearchNotes, embedNote } = require('../controllers/semanticController');
const { requireAuth } = require('../middleware/auth');
const { validateNoteId, validateSemanticSearch, handleValidation } = require('../middleware/validators');

const router = express.Router();

// GET /semantic-search?q=query&k=10 — meaning-based search over document embeddings
router.get('/semantic-search', validateSemanticSearch, handleValidation, semanticSearchNotes);

// Retry embedding for a note (e.g. the AI engine was asleep at upload time)
router.post('/notes/:id/embed', requireAuth, validateNoteId, handleValidation, embedNote);

module.exports = router;

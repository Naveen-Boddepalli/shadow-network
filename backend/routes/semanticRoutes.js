// backend/routes/semanticRoutes.js  —  Phase 4

const express = require('express');
const router  = express.Router();
const { semanticSearchNotes, embedNote } = require('../controllers/semanticController');

// GET /api/v1/semantic-search?q=query&k=10
// Meaning-based search — finds conceptually similar docs even without exact keywords
router.get('/semantic-search', semanticSearchNotes);

// POST /api/v1/notes/:id/embed
// Manually trigger/retry FAISS embedding for a specific note
router.post('/notes/:id/embed', embedNote);

module.exports = router;

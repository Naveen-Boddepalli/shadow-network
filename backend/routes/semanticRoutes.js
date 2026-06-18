// backend/routes/semanticRoutes.js  —  Phase 4

const express = require('express');
const router  = express.Router();
const { semanticSearchNotes, embedNote } = require('../controllers/semanticController');
const { requireAuth }                    = require('../middleware/auth');
const { validateSearch, handleValidation } = require('../middleware/validators');

// GET /api/v1/semantic-search?q=query&k=10  ← PUBLIC + validated
// Meaning-based search — finds conceptually similar docs even without exact keywords
router.get('/semantic-search', validateSearch, handleValidation, semanticSearchNotes);

// POST /api/v1/notes/:id/embed  ← PROTECTED: requires valid JWT
// Manually trigger/retry FAISS embedding for a specific note
router.post('/notes/:id/embed', requireAuth, embedNote);

module.exports = router;

// backend/routes/aiRoutes.js
// AI-powered routes — all scoped to a specific note by :id

const express = require('express');
const router = express.Router();
const { summarizeNote, askAboutNote, clearSummaryCache } = require('../controllers/aiController');

// POST /api/v1/notes/:id/summarize
// Summarizes the document. Returns cached result if available.
router.post('/notes/:id/summarize', summarizeNote);

// POST /api/v1/notes/:id/ask
// Body: { "question": "your question here" }
// Answers a question about the document using extractive Q&A.
router.post('/notes/:id/ask', askAboutNote);

// DELETE /api/v1/notes/:id/summary
// Clears cached summary so it gets freshly regenerated.
router.delete('/notes/:id/summary', clearSummaryCache);

module.exports = router;

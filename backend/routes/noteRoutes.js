// routes/noteRoutes.js
// All routes for note metadata operations.

const express = require('express');
const router  = express.Router();
const {
  getAllNotes,
  searchNotes,
  getNoteById,
  deleteNote,
} = require('../controllers/notesController');
const { requireAuth }                                        = require('../middleware/auth');
const { validateSearch, validateNoteList, handleValidation } = require('../middleware/validators');

// GET /notes?subject=physics&limit=10&page=1  ← PUBLIC + validated query params
router.get('/notes', validateNoteList, handleValidation, getAllNotes);

// GET /search?q=machine+learning&limit=5  ← PUBLIC + validated
router.get('/search', validateSearch, handleValidation, searchNotes);

// GET /notes/:id  ← PUBLIC
router.get('/notes/:id', getNoteById);

// DELETE /notes/:id  ← PROTECTED: requires valid JWT
router.delete('/notes/:id', requireAuth, deleteNote);

module.exports = router;

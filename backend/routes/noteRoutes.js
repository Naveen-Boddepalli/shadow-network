const express = require('express');
const { getAllNotes, searchNotes, getNoteById, deleteNote } = require('../controllers/notesController');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiters');
const {
  validateNoteId, validateSearch, validateNoteList, handleValidation,
} = require('../middleware/validators');

const router = express.Router();

// GET /notes?subject=physics&limit=10&page=1
router.get('/notes', apiLimiter, validateNoteList, handleValidation, getAllNotes);

// GET /search?q=machine+learning&limit=5
router.get('/search', apiLimiter, validateSearch, handleValidation, searchNotes);

router.get('/notes/:id', apiLimiter, validateNoteId, handleValidation, getNoteById);

router.delete('/notes/:id', apiLimiter, requireAuth, validateNoteId, handleValidation, deleteNote);

module.exports = router;

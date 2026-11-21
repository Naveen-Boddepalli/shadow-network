const express = require('express');
const { getAllNotes, searchNotes, getNoteById, deleteNote } = require('../controllers/notesController');
const { requireAuth } = require('../middleware/auth');
const {
  validateNoteId, validateSearch, validateNoteList, handleValidation,
} = require('../middleware/validators');

const router = express.Router();

// GET /notes?subject=physics&limit=10&page=1
router.get('/notes', validateNoteList, handleValidation, getAllNotes);

// GET /search?q=machine+learning&limit=5
router.get('/search', validateSearch, handleValidation, searchNotes);

router.get('/notes/:id', validateNoteId, handleValidation, getNoteById);

router.delete('/notes/:id', requireAuth, validateNoteId, handleValidation, deleteNote);

module.exports = router;

// routes/noteRoutes.js
// All routes for note metadata operations.

const express = require('express');
const router = express.Router();
const {
  getAllNotes,
  searchNotes,
  getNoteById,
  deleteNote,
} = require('../controllers/notesController');

// GET /notes?subject=physics&limit=10&page=1
router.get('/notes', getAllNotes);

// GET /search?q=machine+learning&limit=5
router.get('/search', searchNotes);

// GET /notes/:id
router.get('/notes/:id', getNoteById);

// DELETE /notes/:id
router.delete('/notes/:id', deleteNote);

module.exports = router;

// backend/controllers/notesController.js  —  Phase 2 + Phase 4 delete
// GET /notes   GET /search   GET /notes/:id   DELETE /notes/:id

const Note = require('../models/Note');
const { removeEmbedding } = require('../services/aiService');

const getAllNotes = async (req, res, next) => {
  try {
    const { subject, limit = 20, page = 1 } = req.query;
    const filter  = subject ? { subject: { $regex: new RegExp(subject, 'i') } } : {};
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip    = (pageNum - 1) * limitNum;

    const [notes, total] = await Promise.all([
      Note.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Note.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: notes.map((n) => n.toPublic()),
      pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (error) { next(error); }
};

const searchNotes = async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q?.trim()) {
      return res.status(400).json({ success: false, error: 'Query param "q" is required' });
    }
    const keyword  = q.trim();
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));

    const [textResults, regexResults] = await Promise.all([
      Note.find({ $text: { $search: keyword } }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } }).limit(limitNum),
      Note.find({
        $or: [
          { title:   { $regex: keyword, $options: 'i' } },
          { subject: { $regex: keyword, $options: 'i' } },
          { tags:    { $elemMatch: { $regex: keyword, $options: 'i' } } },
        ],
      }).limit(limitNum),
    ]);

    const seen   = new Set();
    const merged = [...textResults, ...regexResults].filter((n) => {
      const id = n._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    res.json({ success: true, query: keyword, count: merged.length, data: merged.map((n) => n.toPublic()) });
  } catch (error) { next(error); }
};

const getNoteById = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, data: note.toPublic() });
  } catch (error) {
    if (error.name === 'CastError') return res.status(400).json({ success: false, error: 'Invalid note ID' });
    next(error);
  }
};

/**
 * DELETE /api/v1/notes/:id
 * Removes MongoDB metadata + removes from FAISS index (Phase 4).
 * IPFS file stays (content-addressed, immutable).
 */
const deleteNote = async (req, res, next) => {
  try {
    const note = await Note.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });

    // Phase 4: remove from FAISS index (fire-and-forget)
    removeEmbedding(req.params.id).catch((err) =>
      console.warn(`⚠️  Could not remove embedding for ${req.params.id}: ${err.message}`)
    );

    res.json({
      success: true,
      message: 'Note metadata deleted. FAISS embedding removed. File remains on IPFS.',
      data: { id: req.params.id, cid: note.cid },
    });
  } catch (error) { next(error); }
};

module.exports = { getAllNotes, searchNotes, getNoteById, deleteNote };

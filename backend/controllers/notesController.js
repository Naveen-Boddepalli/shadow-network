// GET /notes   GET /search   GET /notes/:id   DELETE /notes/:id

const Note = require('../models/Note');
const { removeEmbedding } = require('../services/aiService');
const { escapeRegex } = require('../utils/httpError');

const getAllNotes = async (req, res, next) => {
  try {
    const { subject } = req.query;
    const page  = req.query.page  || 1;
    const limit = req.query.limit || 20;
    const filter = subject ? { subject: { $regex: escapeRegex(subject), $options: 'i' } } : {};

    const [notes, total] = await Promise.all([
      Note.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      Note.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: notes.map((n) => n.toPublic()),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) { next(error); }
};

// Combines MongoDB $text search (whole words, ranked) with a case-insensitive
// substring match so partial words like "thermo" still find results.
const searchNotes = async (req, res, next) => {
  try {
    const keyword = req.query.q;
    const limit   = req.query.limit || 10;
    const pattern = { $regex: escapeRegex(keyword), $options: 'i' };

    const [textResults, regexResults] = await Promise.all([
      Note.find({ $text: { $search: keyword } }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit),
      Note.find({ $or: [{ title: pattern }, { subject: pattern }, { tags: pattern }] })
        .sort({ createdAt: -1 })
        .limit(limit),
    ]);

    const seen   = new Set();
    const merged = [...textResults, ...regexResults]
      .filter((n) => {
        const id = n._id.toString();
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, limit);

    res.json({ success: true, query: keyword, count: merged.length, data: merged.map((n) => n.toPublic()) });
  } catch (error) { next(error); }
};

const getNoteById = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, data: note.toPublic() });
  } catch (error) { next(error); }
};

// Deletes the metadata and its embedding. The file itself stays on IPFS
// (content-addressed storage can't be deleted from other nodes).
const deleteNote = async (req, res, next) => {
  try {
    const note = await Note.findByIdAndDelete(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });

    removeEmbedding(req.params.id).catch((err) =>
      console.warn(`Could not remove embedding for ${req.params.id}: ${err.message}`)
    );

    res.json({
      success: true,
      message: 'Note deleted. The file remains on IPFS.',
      data: { id: req.params.id, cid: note.cid },
    });
  } catch (error) { next(error); }
};

module.exports = { getAllNotes, searchNotes, getNoteById, deleteNote };

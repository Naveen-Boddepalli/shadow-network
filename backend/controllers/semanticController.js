// GET /semantic-search?q=&k=   POST /notes/:id/embed

const Note = require('../models/Note');
const { semanticSearch, embedDocument } = require('../services/aiService');

// The AI engine embeds the query and runs Atlas $vectorSearch, returning ranked
// note IDs. We hydrate those from MongoDB, keeping the engine's ranking.
const semanticSearchNotes = async (req, res, next) => {
  try {
    const q = req.query.q;
    const k = req.query.k || 10;

    const aiResult = await semanticSearch(q, k);

    if (aiResult.total_indexed === 0) {
      return res.json({
        success: true,
        query: q,
        count: 0,
        total_indexed: 0,
        data: [],
        message: 'No documents have been semantically indexed yet.',
      });
    }

    const notes   = await Note.find({ _id: { $in: aiResult.results.map((r) => r.note_id) } });
    const noteMap = new Map(notes.map((n) => [n._id.toString(), n]));

    const data = aiResult.results
      .filter((r) => noteMap.has(r.note_id)) // embedding may outlive a deleted note
      .map((r) => ({
        ...noteMap.get(r.note_id).toPublic(),
        semanticScore: r.score,
        rank: r.rank,
      }));

    res.json({
      success: true,
      query: q,
      count: data.length,
      total_indexed: aiResult.total_indexed,
      data,
    });
  } catch (error) {
    next(error);
  }
};

// Manually (re)index a note, e.g. when the AI engine was down at upload time.
const embedNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });

    const result = await embedDocument(note.cid, note._id.toString(), note.mimeType);

    note.embeddingIndexed = true;
    await note.save();

    res.json({
      success: true,
      message: result.reason === 'updated_existing'
        ? 'Existing embedding refreshed.'
        : 'Document added to the semantic search index.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { semanticSearchNotes, embedNote };

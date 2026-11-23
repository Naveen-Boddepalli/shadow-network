// POST /notes/:id/summarize   POST /notes/:id/ask   DELETE /notes/:id/summary

const Note = require('../models/Note');
const { summarizeDocument, askQuestion } = require('../services/aiService');

const countWords = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// Summaries are expensive, so the first result is cached on the note.
const summarizeNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });

    if (note.summary) {
      return res.json({
        success: true,
        data: {
          noteId:              note._id,
          title:               note.title,
          summary:             note.summary,
          word_count_original: null, // not stored with the cache
          word_count_summary:  countWords(note.summary),
          cached:              true,
          cachedAt:            note.summaryGeneratedAt,
        },
      });
    }

    const result = await summarizeDocument(note.cid, note.mimeType, note.title);

    note.summary            = result.summary;
    note.summaryGeneratedAt = new Date();
    await note.save();

    res.json({
      success: true,
      data: {
        noteId:              note._id,
        title:               note.title,
        summary:             result.summary,
        word_count_original: result.word_count_original,
        word_count_summary:  result.word_count_summary,
        chunks_processed:    result.chunks_processed,
        cached:              false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// RAG Q&A: the engine retrieves the most relevant passages and an LLM answers from
// them only, citing them as [1], [2]; `sources` lists the passages it cited.
const askAboutNote = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });

    const result = await askQuestion(note.cid, req.body.question, note.mimeType, note.title);

    res.json({
      success: true,
      data: {
        noteId:          note._id,
        title:           note.title,
        question:        result.question,
        answer:          result.answer,
        confidence:      result.confidence,
        confident:       result.confident,
        chunks_searched: result.chunks_searched,
        sources:         result.sources || [],
        warning: result.confident
          ? undefined
          : 'The document doesn\'t seem to cover this question.',
      },
    });
  } catch (error) {
    next(error);
  }
};

const clearSummaryCache = async (req, res, next) => {
  try {
    const note = await Note.findByIdAndUpdate(
      req.params.id,
      { summary: null, summaryGeneratedAt: null },
      { new: true }
    );
    if (!note) return res.status(404).json({ success: false, error: 'Note not found' });

    res.json({ success: true, message: 'Summary cache cleared. The next request will regenerate it.' });
  } catch (error) {
    next(error);
  }
};

module.exports = { summarizeNote, askAboutNote, clearSummaryCache };

// express-validator chains. Usage: router.post('/path', validateXxx, handleValidation, controller)
//
// Values are trimmed and length-checked but not HTML-escaped: they're stored as
// plain text and React escapes them on render. Escaping here would store "&amp;"
// in the database and show it literally in the UI.

const { body, query, param, validationResult } = require('express-validator');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const list = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return res.status(400).json({
      success: false,
      error: list.map((e) => e.message).join('; '),
      errors: list,
    });
  }
  next();
};

const validateNoteId = [
  param('id').isMongoId().withMessage('Invalid note ID'),
];

// POST /upload — multipart fields: title, subject, tags?, uploadedBy?
const validateUpload = [
  body('title')
    .isString().withMessage('title is required')
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('title must be 1–200 characters'),

  body('subject')
    .isString().withMessage('subject is required')
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('subject must be 1–100 characters'),

  body('tags')
    .optional()
    .isString().withMessage('tags must be a comma-separated string')
    .custom((value) => {
      const parts = value.split(',').map((t) => t.trim()).filter(Boolean);
      if (parts.length > 20) throw new Error('Maximum 20 tags allowed');
      if (parts.some((t) => t.length > 50)) throw new Error('Each tag must be at most 50 characters');
      return true;
    }),

  body('uploadedBy')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 50 }).withMessage('uploadedBy must be at most 50 characters'),
];

// POST /notes/:id/ask — body: { question }
const validateAsk = [
  ...validateNoteId,
  body('question')
    .isString().withMessage('question is required')
    .trim()
    .isLength({ min: 5, max: 500 }).withMessage('question must be 5–500 characters'),
];

// GET /search?q=&limit=
const validateSearch = [
  query('q')
    .isString().withMessage('Query param "q" is required')
    .trim()
    .isLength({ min: 1, max: 200 }).withMessage('q must be 1–200 characters'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1–50').toInt(),
];

// GET /semantic-search?q=&k=
const validateSemanticSearch = [
  query('q')
    .isString().withMessage('Query param "q" is required')
    .trim()
    .isLength({ min: 2, max: 200 }).withMessage('q must be 2–200 characters'),
  query('k').optional().isInt({ min: 1, max: 50 }).withMessage('k must be 1–50').toInt(),
];

// GET /notes?subject=&page=&limit=
const validateNoteList = [
  query('subject')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 }).withMessage('subject filter must be at most 100 characters'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100').toInt(),
];

module.exports = {
  validateNoteId,
  validateUpload,
  validateAsk,
  validateSearch,
  validateSemanticSearch,
  validateNoteList,
  handleValidation,
};

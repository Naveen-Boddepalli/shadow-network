// middleware/validators.js
// Reusable express-validator chains for every route that accepts user input.
// Usage: router.post('/path', validateXxx, handleValidation, controller)

const { body, query, validationResult } = require('express-validator');

// ── Shared error formatter ─────────────────────────────────────────────────

/**
 * Call after any validateXxx chain.
 * If there are validation errors, responds 400 with a structured error list
 * and halts the request. Otherwise passes through to the controller.
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ── Upload: POST /upload ───────────────────────────────────────────────────
// Fields: title (required), subject (required), tags (optional), uploadedBy (optional)

const validateUpload = [
  body('title')
    .trim()
    .notEmpty().withMessage('title is required')
    .isLength({ min: 1, max: 200 }).withMessage('title must be 1–200 characters')
    .escape(), // strip HTML entities to prevent XSS

  body('subject')
    .trim()
    .notEmpty().withMessage('subject is required')
    .isLength({ min: 1, max: 100 }).withMessage('subject must be 1–100 characters')
    .escape(),

  body('tags')
    .optional()
    .isString().withMessage('tags must be a comma-separated string')
    .custom((value) => {
      const parts = value.split(',').map((t) => t.trim()).filter(Boolean);
      if (parts.some((t) => t.length > 50)) {
        throw new Error('Each tag must be ≤ 50 characters');
      }
      if (parts.length > 20) {
        throw new Error('Maximum 20 tags allowed');
      }
      return true;
    }),

  body('uploadedBy')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('uploadedBy must be ≤ 50 characters')
    .escape(),
];

// ── AI Q&A: POST /notes/:id/ask ───────────────────────────────────────────
// Body: { question }

const validateAsk = [
  body('question')
    .trim()
    .notEmpty().withMessage('question is required')
    .isLength({ min: 5, max: 500 }).withMessage('question must be 5–500 characters'),
  // Note: we do NOT escape questions because they are passed to the AI engine as-is.
  // The AI engine never renders them as HTML so XSS is not a concern here.
];

// ── Search: GET /search?q=  and  GET /semantic-search?q= ──────────────────
// Query param: q

const validateSearch = [
  query('q')
    .trim()
    .notEmpty().withMessage('Query param "q" is required')
    .isLength({ min: 1, max: 200 }).withMessage('q must be 1–200 characters'),
];

// ── Note list: GET /notes?subject= ────────────────────────────────────────

const validateNoteList = [
  query('subject')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('subject filter must be ≤ 100 characters')
    .escape(),

  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('page must be a positive integer')
    .toInt(),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100')
    .toInt(),
];

module.exports = {
  validateUpload,
  validateAsk,
  validateSearch,
  validateNoteList,
  handleValidation,
};

const express   = require('express');
const rateLimit = require('express-rate-limit');
const { issueToken } = require('../controllers/authController');

const router = express.Router();

// The shared secret is the only credential, so throttle guessing.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
});

// POST /api/v1/auth/token   body: { "secret": "<API_SECRET>" }
router.post('/auth/token', loginLimiter, issueToken);

module.exports = router;

// Rate limiters, applied per route. Each one goes first in its route's chain,
// before requireAuth, so unauthenticated floods are throttled too.

const rateLimit = require('express-rate-limit');

const FIFTEEN_MIN = 15 * 60 * 1000;

const makeLimiter = (limit, error) => rateLimit({
  windowMs: FIFTEEN_MIN,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error },
});

// Reads and cheap writes: listing, search, download, delete.
const apiLimiter = makeLimiter(300, 'Too many requests, please try again later.');

// LLM-backed summarize/ask and embedding calls.
const aiLimiter = makeLimiter(15, 'Too many AI requests, please try again later.');

const uploadLimiter = makeLimiter(15, 'Too many upload requests, please try again later.');

module.exports = { apiLimiter, aiLimiter, uploadLimiter };

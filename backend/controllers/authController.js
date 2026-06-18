// controllers/authController.js
// POST /api/v1/auth/token
// Validates the shared API_SECRET and returns a signed JWT.

const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET;
const API_SECRET  = process.env.API_SECRET;
const TOKEN_TTL   = '24h';

/**
 * POST /api/v1/auth/token
 * Body: { "secret": "<API_SECRET value>" }
 *
 * Response (success):
 * { "success": true, "token": "<jwt>", "expiresIn": "24h" }
 *
 * Response (failure):
 * 401 { "success": false, "error": "Invalid secret" }
 */
const issueToken = (req, res) => {
  if (!JWT_SECRET || !API_SECRET) {
    return res.status(500).json({
      success: false,
      error: 'Server misconfiguration: JWT_SECRET or API_SECRET is not set',
    });
  }

  const { secret } = req.body;

  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ success: false, error: '"secret" field is required' });
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(API_SECRET);
  const provided = Buffer.from(secret);

  if (
    expected.length !== provided.length ||
    !require('crypto').timingSafeEqual(expected, provided)
  ) {
    return res.status(401).json({ success: false, error: 'Invalid secret' });
  }

  const token = jwt.sign({ sub: 'api-client' }, JWT_SECRET, { expiresIn: TOKEN_TTL });

  return res.json({
    success:   true,
    token,
    expiresIn: TOKEN_TTL,
  });
};

module.exports = { issueToken };

// POST /api/v1/auth/token — exchange the shared API_SECRET for a signed JWT.

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

const TOKEN_TTL = '24h';

// Hash both sides first so timingSafeEqual always compares equal-length buffers
// and the secret's length isn't leaked through an early return.
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();

const issueToken = (req, res) => {
  const { JWT_SECRET, API_SECRET } = process.env;
  if (!JWT_SECRET || !API_SECRET) {
    return res.status(500).json({
      success: false,
      error: 'Server misconfiguration: JWT_SECRET or API_SECRET is not set',
    });
  }

  const { secret } = req.body || {};
  if (!secret || typeof secret !== 'string') {
    return res.status(400).json({ success: false, error: '"secret" field is required' });
  }

  if (!crypto.timingSafeEqual(sha256(secret), sha256(API_SECRET))) {
    return res.status(401).json({ success: false, error: 'Invalid secret' });
  }

  const token = jwt.sign({ sub: 'api-client' }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return res.json({ success: true, token, expiresIn: TOKEN_TTL });
};

module.exports = { issueToken };

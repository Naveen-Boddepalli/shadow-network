// middleware/auth.js
// JWT verification middleware.
// Protected routes import { requireAuth } and place it before their controller.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Verifies the Authorization: Bearer <token> header.
 * On success attaches the decoded payload to req.user and calls next().
 * On failure returns 401 JSON — never leaks the reason in detail.
 */
const requireAuth = (req, res, next) => {
  if (!JWT_SECRET) {
    console.error('[auth] JWT_SECRET is not set. All protected routes will reject requests.');
    return res.status(500).json({ success: false, error: 'Server misconfiguration: JWT_SECRET missing' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    });
  }

  const token = authHeader.slice(7); // strip "Bearer "

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { sub, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired. Please request a new one.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token.' });
    }
    return res.status(401).json({ success: false, error: 'Authentication failed.' });
  }
};

module.exports = { requireAuth };

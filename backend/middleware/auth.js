// JWT verification for protected routes: router.post('/x', requireAuth, handler)

const jwt = require('jsonwebtoken');

const requireAuth = (req, res, next) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('[auth] JWT_SECRET is not set; protected routes are unavailable.');
    return res.status(500).json({ success: false, error: 'Server misconfiguration: JWT_SECRET missing' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Login required' });
  }

  try {
    req.user = jwt.verify(authHeader.slice(7), secret, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    const error = err.name === 'TokenExpiredError'
      ? 'Session expired. Please log in again.'
      : 'Invalid token. Please log in again.';
    return res.status(401).json({ success: false, error });
  }
};

module.exports = { requireAuth };

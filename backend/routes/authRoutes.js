// routes/authRoutes.js
// POST /api/v1/auth/token — exchange shared secret for a signed JWT

const express = require('express');
const router  = express.Router();
const { issueToken } = require('../controllers/authController');

// POST /api/v1/auth/token
// Body: { "secret": "<API_SECRET>" }
// Returns: { "token": "<jwt>", "expiresIn": "24h" }
router.post('/auth/token', issueToken);

module.exports = router;

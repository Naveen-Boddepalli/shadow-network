// routes/healthRoutes.js
const express = require('express');
const router = express.Router();
const { healthCheck } = require('../controllers/healthController');

// GET /health
router.get('/health', healthCheck);

module.exports = router;

// routes/fileRoutes.js
// All routes related to IPFS file operations.

const express = require('express');
const router  = express.Router();
const upload  = require('../middleware/upload');
const { uploadFile, downloadFile } = require('../controllers/fileController');
const { requireAuth }              = require('../middleware/auth');
const { validateUpload, handleValidation } = require('../middleware/validators');
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, error: 'Too many upload requests, please try again later.' }
});

// POST /upload  ← PROTECTED: requires valid JWT
// multipart/form-data: file + title + subject + tags
router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  validateUpload,
  handleValidation,
  uploadFile
);

// GET /download/:cid  ← PUBLIC: anyone can download by CID
router.get('/download/:cid', downloadFile);

module.exports = router;

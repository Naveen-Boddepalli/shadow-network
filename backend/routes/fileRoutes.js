const express = require('express');
const upload  = require('../middleware/upload');
const { uploadFile, downloadFile } = require('../controllers/fileController');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter, uploadLimiter } = require('../middleware/rateLimiters');
const { validateUpload, handleValidation } = require('../middleware/validators');

const router = express.Router();

// multipart/form-data: file, title, subject, tags?, uploadedBy?
router.post(
  '/upload',
  uploadLimiter,
  requireAuth,
  upload.single('file'),
  validateUpload,
  handleValidation,
  uploadFile
);

// Public: anyone with the CID can download.
router.get('/download/:cid', apiLimiter, downloadFile);

module.exports = router;

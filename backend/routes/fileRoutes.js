const express   = require('express');
const rateLimit = require('express-rate-limit');
const upload    = require('../middleware/upload');
const { uploadFile, downloadFile } = require('../controllers/fileController');
const { requireAuth } = require('../middleware/auth');
const { validateUpload, handleValidation } = require('../middleware/validators');

const router = express.Router();

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many upload requests, please try again later.' },
});

// multipart/form-data: file, title, subject, tags?, uploadedBy?
router.post(
  '/upload',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  validateUpload,
  handleValidation,
  uploadFile
);

// Public: anyone with the CID can download.
router.get('/download/:cid', downloadFile);

module.exports = router;

// routes/fileRoutes.js
// All routes related to IPFS file operations.

const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { uploadFile, downloadFile } = require('../controllers/fileController');

// POST /upload
// multipart/form-data: file + title + subject + tags
router.post('/upload', upload.single('file'), uploadFile);

// GET /download/:cid
// Returns the raw file from IPFS
router.get('/download/:cid', downloadFile);

module.exports = router;

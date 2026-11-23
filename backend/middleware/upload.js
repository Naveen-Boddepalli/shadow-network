// Multer config: files are kept in memory (req.file.buffer) and passed straight to IPFS.

const multer = require('multer');
const { httpError } = require('../utils/httpError');

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'application/zip',
  'application/x-zip-compressed', // what Windows browsers report for .zip
]);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) return cb(null, true);
  cb(httpError(400, `File type not allowed: ${file.mimetype || 'unknown'}`));
};

module.exports = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

// middleware/upload.js
// Configures multer to accept files in memory (as Buffer).
// We don't save to disk — we pass the buffer straight to IPFS.

const multer = require('multer');

// memoryStorage keeps the file in RAM as req.file.buffer
// This is perfect for IPFS upload — no temp files on disk
const storage = multer.memoryStorage();

// File filter — accept common academic file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png',
    'application/zip',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
  },
});

module.exports = upload;

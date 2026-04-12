// middleware/errorHandler.js
// Central error handler — all errors thrown in controllers land here.
// Express recognises a 4-argument middleware as an error handler.

const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);

  // Multer errors (file too large, wrong type)
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: `File upload error: ${err.message}`,
    });
  }

  // Mongoose validation errors (missing required fields etc.)
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      error: messages.join(', '),
    });
  }

  // Mongoose duplicate key (same CID uploaded twice)
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      error: 'This file has already been uploaded (duplicate CID)',
    });
  }

  // IPFS connection errors
  if (err.message && err.message.includes('ECONNREFUSED')) {
    return res.status(503).json({
      success: false,
      error: 'IPFS node is not running. Start Kubo with: ipfs daemon',
    });
  }

  // Generic fallback
  res.status(err.statusCode || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
};

module.exports = errorHandler;

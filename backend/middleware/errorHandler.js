// Central error handler. Express treats a 4-argument middleware as an error handler.

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const send = (status, error) => res.status(status).json({ success: false, error });

  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than the 50 MB limit' : err.message;
    return send(400, `File upload error: ${msg}`);
  }

  // Malformed ObjectId in a :id route param
  if (err.name === 'CastError') {
    return send(400, `Invalid ${err.path === '_id' ? 'note ID' : err.path}`);
  }

  if (err.name === 'ValidationError') {
    return send(400, Object.values(err.errors).map((e) => e.message).join(', '));
  }

  // Unique index on `cid`: the exact same file was already uploaded
  if (err.code === 11000) {
    return send(409, 'This file has already been uploaded (duplicate CID)');
  }

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    return send(400, 'Request body is not valid JSON');
  }

  const status = err.statusCode || 500;
  if (status >= 500) console.error('[error] %s %s:', req.method, req.originalUrl, err);

  // Don't leak internals on unexpected 500s in production
  const message = status >= 500 && process.env.NODE_ENV === 'production' && !err.expose
    ? 'Internal server error'
    : err.message || 'Internal server error';
  send(status, message);
};

module.exports = errorHandler;

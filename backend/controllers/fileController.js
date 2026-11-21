// POST /upload   GET /download/:cid

const { uploadToIPFS, downloadFromIPFS } = require('../services/ipfsService');
const { embedDocument }                  = require('../services/aiService');
const Note                               = require('../models/Note');

// CIDv0 (Qm…) and CIDv1 (bafy…) are base58/base32 strings; reject anything else
// before it ends up in a gateway URL.
const CID_PATTERN = /^[a-zA-Z0-9]{46,100}$/;

// Only these types can be text-extracted by the AI engine.
const EMBEDDABLE_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const indexInBackground = (note) => {
  if (!EMBEDDABLE_TYPES.has(note.mimeType)) return;
  embedDocument(note.cid, note._id.toString(), note.mimeType)
    .then(() => Note.updateOne({ _id: note._id }, { embeddingIndexed: true }))
    .then(() => console.log(`Embedding stored for note ${note._id}`))
    .catch((err) => console.warn(`Embedding failed for note ${note._id}: ${err.message}`));
};

const uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { title, subject, tags, uploadedBy } = req.body;
    const tagsArray = tags ? [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))] : [];

    const cid = await uploadToIPFS(req.file.buffer, req.file.originalname, req.file.mimetype);

    const note = await Note.create({
      title,
      subject,
      tags:         tagsArray,
      cid,
      originalName: req.file.originalname,
      mimeType:     req.file.mimetype,
      fileSize:     req.file.size,
      uploadedBy:   uploadedBy || 'anonymous',
    });

    // Don't make the client wait for the embedding; the note is already
    // keyword-searchable, and POST /notes/:id/embed can retry a failure.
    indexInBackground(note);

    res.status(201).json({
      success: true,
      message: EMBEDDABLE_TYPES.has(note.mimeType)
        ? 'File uploaded. Semantic indexing is running in the background.'
        : 'File uploaded.',
      data: { ...note.toPublic(), downloadUrl: `/api/v1/download/${cid}` },
    });
  } catch (error) {
    next(error);
  }
};

const downloadFile = async (req, res, next) => {
  try {
    const { cid } = req.params;
    if (!CID_PATTERN.test(cid)) {
      return res.status(400).json({ success: false, error: 'Invalid CID' });
    }

    const note       = await Note.findOne({ cid });
    const fileBuffer = await downloadFromIPFS(cid);

    // res.attachment() encodes non-ASCII and quote characters in the filename
    // correctly (RFC 6266); building the header by hand throws on them.
    res.attachment(note?.originalName || `file-${cid}`);
    res.type(note?.mimeType || 'application/octet-stream');
    res.set('X-IPFS-CID', cid);
    res.send(fileBuffer);
  } catch (error) {
    next(error);
  }
};

module.exports = { uploadFile, downloadFile };

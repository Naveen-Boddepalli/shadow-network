// backend/controllers/fileController.js  —  Phase 1 + Phase 4 embedding trigger
// POST /upload   GET /download/:cid

const { uploadToIPFS, downloadFromIPFS } = require('../services/ipfsService');
const { embedDocument }                  = require('../services/aiService');
const Note                               = require('../models/Note');

/**
 * POST /api/v1/upload
 * Accepts file + metadata, stores on IPFS, saves to MongoDB,
 * then ASYNC triggers embedding (Phase 4) — does not block the response.
 */
const uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { title, subject, tags, uploadedBy } = req.body;
    if (!title || !subject) {
      return res.status(400).json({ success: false, error: 'title and subject are required' });
    }

    const tagsArray = tags
      ? tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    // ── 1. Upload to IPFS ──────────────────────────────────────
    const cid = await uploadToIPFS(req.file.buffer, req.file.originalname);

    // ── 2. Save metadata to MongoDB ───────────────────────────
    const note = await Note.create({
      title,
      subject,
      tags: tagsArray,
      cid,
      originalName: req.file.originalname,
      mimeType:     req.file.mimetype,
      fileSize:     req.file.size,
      uploadedBy:   uploadedBy || 'anonymous',
    });

    // ── 3. Trigger FAISS embedding (Phase 4) ──────────────────
    // Fire-and-forget: we don't await this — it runs in background.
    // If it fails (AI engine down etc.) it logs a warning but upload succeeds.
    embedDocument(cid, note._id.toString(), req.file.mimetype)
      .then(() => {
        // Update embeddingIndexed flag in MongoDB
        Note.findByIdAndUpdate(note._id, { embeddingIndexed: true }).catch(() => {});
        console.log(`🔢 Embedding created for note: ${note._id}`);
      })
      .catch((err) => {
        console.warn(`⚠️  Embedding failed for note ${note._id}: ${err.message}`);
        // Non-fatal: doc is still uploaded and keyword-searchable
      });

    // ── 4. Return success immediately (don't wait for embedding) ─
    res.status(201).json({
      success: true,
      message: 'File uploaded successfully. Semantic indexing running in background.',
      data: {
        ...note.toPublic(),
        downloadUrl: `/api/v1/download/${cid}`,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/download/:cid
 * Fetches a file from IPFS by CID and streams it to the client.
 */
const downloadFile = async (req, res, next) => {
  try {
    const { cid } = req.params;

    let note = null;
    try { note = await Note.findOne({ cid }); } catch (_) {}

    const fileBuffer = await downloadFromIPFS(cid);

    const mimeType = note?.mimeType || 'application/octet-stream';
    const fileName = note?.originalName || `file-${cid}`;

    res.set({
      'Content-Type':        mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length':      fileBuffer.length,
      'X-IPFS-CID':          cid,
    });
    res.send(fileBuffer);
  } catch (error) {
    if (error.message?.includes('not found') || error.message?.includes('invalid')) {
      return res.status(404).json({ success: false, error: 'File not found on IPFS' });
    }
    next(error);
  }
};

module.exports = { uploadFile, downloadFile };

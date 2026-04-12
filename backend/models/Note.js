// models/Note.js  —  Phase 1 + 2 + 3 + 4

const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    title:        { type: String, required: [true, 'Title is required'],   trim: true, maxlength: 200 },
    subject:      { type: String, required: [true, 'Subject is required'], trim: true, maxlength: 100 },
    tags:         { type: [String], default: [], set: (tags) => tags.map((t) => t.trim().toLowerCase()) },
    cid:          { type: String, required: [true, 'CID is required'], unique: true },
    originalName: { type: String, required: true },
    mimeType:     { type: String, default: 'application/octet-stream' },
    fileSize:     { type: Number, default: 0 },
    uploadedBy:   { type: String, default: 'anonymous' },

    // Phase 3: AI summary cache
    summary:            { type: String, default: null },
    summaryGeneratedAt: { type: Date,   default: null },

    // Phase 4: FAISS embedding status
    // True once the document's vector has been added to the FAISS index.
    // False/undefined means not yet indexed (AI engine may have been down at upload time).
    embeddingIndexed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// MongoDB full-text search index (Phase 2)
noteSchema.index({ title: 'text', subject: 'text', tags: 'text' });

noteSchema.methods.toPublic = function () {
  return {
    id:                 this._id,
    title:              this.title,
    subject:            this.subject,
    tags:               this.tags,
    cid:                this.cid,
    originalName:       this.originalName,
    mimeType:           this.mimeType,
    fileSize:           this.fileSize,
    uploadedBy:         this.uploadedBy,
    hasSummary:         !!this.summary,
    summaryGeneratedAt: this.summaryGeneratedAt,
    embeddingIndexed:   this.embeddingIndexed,  // Phase 4
    uploadedAt:         this.createdAt,
  };
};

module.exports = mongoose.model('Note', noteSchema);

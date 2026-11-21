const mongoose = require('mongoose');

// Older records were HTML-escaped on input by the validator. Decode them on the
// way out so the UI shows "Tom's notes" rather than "Tom&#x27;s notes".
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#x2F;': '/', '&#x5C;': '\\', '&#96;': '`' };
const decode = (s) => (typeof s === 'string' ? s.replace(/&(amp|lt|gt|quot|#x27|#x2F|#x5C|#96);/g, (m) => ENTITIES[m]) : s);

const noteSchema = new mongoose.Schema(
  {
    title:        { type: String, required: [true, 'Title is required'],   trim: true, maxlength: 200 },
    subject:      { type: String, required: [true, 'Subject is required'], trim: true, maxlength: 100 },
    tags:         { type: [String], default: [], set: (tags) => tags.map((t) => t.trim().toLowerCase()) },
    cid:          { type: String, required: [true, 'CID is required'], unique: true },
    originalName: { type: String, required: true },
    mimeType:     { type: String, default: 'application/octet-stream' },
    fileSize:     { type: Number, default: 0 },
    uploadedBy:   { type: String, default: 'anonymous', trim: true },

    // Cached AI summary
    summary:            { type: String, default: null },
    summaryGeneratedAt: { type: Date,   default: null },

    // True once the AI engine has stored this note's vector for semantic search.
    // Stays false if the AI engine was unreachable at upload time.
    embeddingIndexed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

noteSchema.index({ title: 'text', subject: 'text', tags: 'text' });
noteSchema.index({ createdAt: -1 });

noteSchema.methods.toPublic = function () {
  return {
    id:                 this._id,
    title:              decode(this.title),
    subject:            decode(this.subject),
    tags:               this.tags,
    cid:                this.cid,
    originalName:       this.originalName,
    mimeType:           this.mimeType,
    fileSize:           this.fileSize,
    uploadedBy:         decode(this.uploadedBy),
    hasSummary:         !!this.summary,
    summaryGeneratedAt: this.summaryGeneratedAt,
    embeddingIndexed:   this.embeddingIndexed,
    uploadedAt:         this.createdAt,
  };
};

module.exports = mongoose.model('Note', noteSchema);

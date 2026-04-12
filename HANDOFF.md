# Shadow Network — Project Handoff v3
# Paste into any AI to continue. All 4 phases complete.

## PHASE STATUS
Phase 1 — IPFS file sharing              COMPLETE
Phase 2 — MongoDB metadata + keyword search  COMPLETE
Phase 3 — AI summarization + Q&A         COMPLETE
Phase 4 — FAISS semantic/vector search   COMPLETE
Phase 5 — Offline P2P mesh (Libp2p/WebRTC)  NOT STARTED

## FULL FILE TREE (27 files)
shadow-network/
  HANDOFF.md
  backend/
    server.js                      entry: mounts all 5 route modules
    package.json                   deps: express mongoose multer kubo-rpc-client cors dotenv
    .env.example
    README.md
    config/db.js                   connectDB() via mongoose
    models/Note.js                 full schema incl summary+embeddingIndexed
    routes/fileRoutes.js           POST /upload  GET /download/:cid
    routes/noteRoutes.js           GET /notes /search /notes/:id  DELETE /notes/:id
    routes/aiRoutes.js             POST /notes/:id/summarize /notes/:id/ask  DELETE /notes/:id/summary
    routes/semanticRoutes.js       GET /semantic-search  POST /notes/:id/embed
    routes/healthRoutes.js         GET /health
    controllers/fileController.js      uploadFile() downloadFile()
    controllers/notesController.js     getAllNotes() searchNotes() getNoteById() deleteNote()
    controllers/aiController.js        summarizeNote() askAboutNote() clearSummaryCache()
    controllers/semanticController.js  semanticSearchNotes() embedNote()
    controllers/healthController.js    checks MongoDB+IPFS+AIengine
    services/ipfsService.js        uploadToIPFS() downloadFromIPFS() getIPFSNodeInfo()
    services/aiService.js          summarizeDocument() askQuestion() embedDocument() semanticSearch() removeEmbedding()
    middleware/upload.js           multer memoryStorage 50MB MIME whitelist
    middleware/errorHandler.js     central 4-arg error handler
  ai-engine/
    main.py                        FastAPI app all routes
    extractor.py                   extract_text(bytes,mime) chunk_text()
    summarizer.py                  summarize(text) BART lazy-loaded
    qa.py                          answer_question(question,text) RoBERTa lazy-loaded
    embeddings.py                  add_document() semantic_search() remove_document() get_index_stats()
    requirements.txt               fastapi uvicorn transformers torch pymupdf python-docx faiss-cpu sentence-transformers numpy
    .env.example
    data/                          FAISS runtime files (git-ignored)
      embeddings.faiss             binary FAISS index (created at runtime)
      id_map.json                  {faiss_int_pos -> mongo_note_id} (created at runtime)

## ALL API ENDPOINTS  (Node.js base /api/v1 port 5000)
GET    /health                     MongoDB+IPFS+AIengine status
POST   /upload                     multipart: file+title+subject+tags+uploadedBy → Note+CID; triggers async embed
GET    /download/:cid              raw file from IPFS
GET    /notes                      all notes paginated (?subject=&limit=&page=)
GET    /search?q=k                 keyword: MongoDB $text + regex fallback on title/subject/tags
GET    /semantic-search?q=k&k=10   MEANING-based: FAISS cosine similarity on embeddings
GET    /notes/:id                  single note
DELETE /notes/:id                  delete metadata + remove from FAISS; IPFS file stays
POST   /notes/:id/summarize        AI summary cached in MongoDB (BART)
POST   /notes/:id/ask              body:{question} extractive answer (RoBERTa)
DELETE /notes/:id/summary          clear cached summary
POST   /notes/:id/embed            manual re-embed trigger for a note

Python AI Engine (port 8000):
GET    /health
POST   /summarize                  {cid, mime_type}
POST   /ask                        {cid, question, mime_type}
POST   /embed                      {cid, note_id, mime_type} → FAISS add
POST   /semantic-search            {query, k} → [{note_id, score, rank}]
POST   /remove-embedding           {note_id} → removes from id_map
POST   /rebuild-index              instructions for full rebuild

## NOTE MODEL FIELDS
title               String required max200
subject             String required max100
tags                [String] auto-lowercased
cid                 String required unique
originalName        String required
mimeType            String default:application/octet-stream
fileSize            Number bytes
uploadedBy          String default:anonymous
summary             String null→cached after first AI call
summaryGeneratedAt  Date
embeddingIndexed    Boolean default:false → true after /embed succeeds
createdAt/updatedAt auto (timestamps:true)
MongoDB text index on: title+subject+tags

## ENV VARIABLES
backend/.env:
  PORT=5000
  MONGO_URI=mongodb://localhost:27017/shadow-network
  IPFS_HOST=127.0.0.1  IPFS_PORT=5001  IPFS_PROTOCOL=http
  AI_ENGINE_URL=http://localhost:8000

ai-engine/.env:
  AI_PORT=8000
  IPFS_GATEWAY=http://127.0.0.1:8080
  SUMMARIZATION_MODEL=facebook/bart-large-cnn
  QA_MODEL=deepset/roberta-base-squad2
  SUMMARY_MAX_LENGTH=200  SUMMARY_MIN_LENGTH=50
  EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2

## HOW TO RUN (4 terminals)
1: ipfs daemon
2: mongod
3: cd ai-engine && source venv/bin/activate && uvicorn main:app --port 8000 --reload
4: cd backend && npm run dev

## KEY DESIGN DECISIONS
PHASE 4 SPECIFICS:
- Embedding model: all-MiniLM-L6-v2 (384-dim, fast, free, no API key)
- FAISS index type: IndexFlatIP (inner product = cosine similarity after L2 normalise)
- Persistence: embeddings.faiss + id_map.json written to disk after every add/remove
- Index loaded from disk on AI engine startup; stays in RAM for all searches
- Deletion: IndexFlatIP has no true delete; vector stays but is removed from id_map → filtered out
- Fire-and-forget embed: upload returns immediately; embedding happens async in background
  embeddingIndexed flag set to true in MongoDB once AI engine confirms success
- Semantic search flow: Node GET /semantic-search → POST to AI /semantic-search → FAISS →
  note_ids returned to Node → Node fetches full Notes from MongoDB → merged response
- Score = cosine similarity 0.0 to 1.0; higher = more relevant; attached as semanticScore in response

EARLIER PHASES:
- IPFS: multer memoryStorage → buffer → kubo-rpc-client → CID (no disk writes)
- Summarization: map-reduce chunking (chunk→summarize each→combine→final); cached in MongoDB
- Q&A: extractive RoBERTa, best-chunk strategy; no hallucination possible
- Keyword search: MongoDB $text (indexed) + $regex fallback merged and deduped
- All models lazy-loaded in Python; first call ~30s, subsequent calls fast

## KNOWN GAPS
- express-validator installed but not wired (add input sanitization to routes)
- No rate limiting (add express-rate-limit)
- CORS open (*) — restrict to frontend origin in production
- No authentication on any endpoint
- ipfs.pin.add not called — uploaded files may be garbage collected by IPFS
- Scanned PDF OCR not supported (add pytesseract for Phase 5)
- No frontend (React app not started)
- No tests (add Jest + supertest for Node; pytest for Python)
- FAISS IndexFlatIP: deleted docs leave ghost vectors (add /rebuild-index cron if needed)
- AI engine has no auth — must be localhost-only in production

## PHASE 5 PLAN (offline mesh)
Goal: students on same campus LAN share files without internet
Stack: Helia (browser IPFS) + js-libp2p (WebRTC transport) + mDNS peer discovery
- New frontend/ React app
- Replace Kubo HTTP calls with Helia in-browser IPFS
- Peers discover each other via mDNS on local network
- Files transferred over WebRTC DataChannel
- No backend changes needed for pure P2P mode

## SEARCH COMPARISON
Keyword search  GET /search?q=newton      Finds docs with word "newton"
Semantic search GET /semantic-search?q=newton  Finds docs about laws of motion,
                                               F=ma, dynamics, inertia etc.
Use both together for best results.

## QUICK TEST
curl http://localhost:5000/api/v1/health
curl -X POST http://localhost:5000/api/v1/upload \
  -F "file=@notes.pdf" -F "title=Newton Laws" \
  -F "subject=Physics" -F "tags=mechanics,exam"
# → returns note id and cid; embedding starts in background
curl "http://localhost:5000/api/v1/semantic-search?q=laws+of+motion"
# → returns notes ranked by semantic similarity
curl "http://localhost:5000/api/v1/search?q=newton"
# → returns notes with keyword match

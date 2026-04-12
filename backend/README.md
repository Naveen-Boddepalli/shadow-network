# The Shadow Network — Backend (Phase 1 + Phase 2)

Decentralized academic file sharing using IPFS + MongoDB.

---

## Prerequisites

- Node.js v18+
- MongoDB (local or Atlas)
- IPFS Kubo (local node)

---

## 1. Install IPFS Kubo (local node)

### macOS
```bash
brew install ipfs
```

### Linux
```bash
wget https://dist.ipfs.tech/kubo/v0.24.0/kubo_v0.24.0_linux-amd64.tar.gz
tar -xvzf kubo_v0.24.0_linux-amd64.tar.gz
cd kubo && sudo bash install.sh
```

### Windows
Download installer from: https://dist.ipfs.tech/kubo/

### After install:
```bash
ipfs init          # First time only — creates ~/.ipfs config
ipfs daemon        # Start the IPFS node (keep this running in a terminal)
```

IPFS API will be available at: `http://127.0.0.1:5001`
IPFS Gateway (browser view): `http://127.0.0.1:8080/ipfs/<CID>`

---

## 2. Setup the Backend

```bash
cd shadow-network/backend
cp .env.example .env       # Copy environment config
npm install                # Install all dependencies
npm run dev                # Start with nodemon (auto-restart on changes)
```

Or for production:
```bash
npm start
```

Server starts at: `http://localhost:5000`

---

## 3. Environment Variables (.env)

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/shadow-network
IPFS_HOST=127.0.0.1
IPFS_PORT=5001
IPFS_PROTOCOL=http
```

---

## 4. API Reference

### Health Check
```
GET /api/v1/health
```
Response:
```json
{
  "success": true,
  "health": {
    "server": "ok",
    "mongodb": "ok",
    "ipfs": "ok",
    "ipfsNodeId": "12D3KooW..."
  }
}
```

---

### Upload a File
```
POST /api/v1/upload
Content-Type: multipart/form-data
```

Form fields:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | ✅ | The PDF/doc/image to upload |
| title | string | ✅ | Human-readable title |
| subject | string | ✅ | Academic subject |
| tags | string | ❌ | Comma-separated: "exam,unit2" |
| uploadedBy | string | ❌ | Uploader name (default: anonymous) |

Success Response (201):
```json
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "id": "657a1f2e3c4b5a6d7e8f9012",
    "title": "Thermodynamics Notes Unit 3",
    "subject": "Physics",
    "tags": ["exam", "unit3", "heat"],
    "cid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
    "originalName": "thermo_unit3.pdf",
    "mimeType": "application/pdf",
    "fileSize": 245760,
    "uploadedBy": "alice",
    "uploadedAt": "2024-01-15T10:30:00.000Z",
    "downloadUrl": "/download/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco"
  }
}
```

---

### Download a File
```
GET /api/v1/download/:cid
```
Returns the raw file with correct Content-Type and Content-Disposition headers.

Example:
```
GET /api/v1/download/QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco
```

---

### Get All Notes
```
GET /api/v1/notes
GET /api/v1/notes?subject=Physics&limit=10&page=1
```

Query params:
- `subject` — filter by subject (partial match, case-insensitive)
- `limit` — results per page (default 20, max 100)
- `page` — page number (default 1)

Response:
```json
{
  "success": true,
  "data": [ ...notes ],
  "pagination": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "pages": 3
  }
}
```

---

### Search Notes
```
GET /api/v1/search?q=keyword
GET /api/v1/search?q=machine+learning&limit=5
```

Searches across: title, subject, tags
Uses both MongoDB $text index (fast) + regex fallback (catches partial words).

Response:
```json
{
  "success": true,
  "query": "machine learning",
  "count": 3,
  "data": [ ...matching notes ]
}
```

---

### Get Single Note
```
GET /api/v1/notes/:id
```

---

### Delete Note
```
DELETE /api/v1/notes/:id
```
Removes metadata from MongoDB. File stays on IPFS (content-addressed, immutable).

---

## 5. Postman / curl Examples

### Upload via curl
```bash
curl -X POST http://localhost:5000/api/v1/upload \
  -F "file=@/path/to/notes.pdf" \
  -F "title=Machine Learning Chapter 5" \
  -F "subject=Computer Science" \
  -F "tags=ml,deep-learning,exam" \
  -F "uploadedBy=alice"
```

### Download via curl
```bash
curl http://localhost:5000/api/v1/download/QmXoypizj... -o downloaded.pdf
```

### Search via curl
```bash
curl "http://localhost:5000/api/v1/search?q=thermodynamics"
```

---

## 6. Project Structure

```
backend/
├── server.js                  # Entry point
├── .env.example               # Environment template
├── package.json
│
├── config/
│   └── db.js                  # MongoDB connection
│
├── models/
│   └── Note.js                # Mongoose schema (title, subject, tags, cid...)
│
├── routes/
│   ├── fileRoutes.js          # /upload, /download/:cid
│   ├── noteRoutes.js          # /notes, /search, /notes/:id
│   └── healthRoutes.js        # /health
│
├── controllers/
│   ├── fileController.js      # Upload + download logic
│   ├── notesController.js     # CRUD + search logic
│   └── healthController.js    # System health check
│
├── services/
│   └── ipfsService.js         # ALL IPFS operations (upload, download, ping)
│
└── middleware/
    ├── upload.js              # Multer config (memory storage, 50MB limit)
    └── errorHandler.js        # Central error handler
```

---

## 7. How It Works (Phase by Phase)

### Phase 1 — IPFS Upload/Download
1. Client sends file via multipart form → Express receives it via multer
2. multer stores file in memory (no disk write) → `req.file.buffer`
3. `ipfsService.uploadToIPFS(buffer)` calls Kubo HTTP API
4. IPFS returns a CID (cryptographic hash of the file content)
5. Download: client sends CID → we call `ipfsService.downloadFromIPFS(cid)` → stream back

### Phase 2 — Metadata + Search
1. During upload, we ALSO save: title, subject, tags, CID, filename → MongoDB
2. Search: `$text` index on title+subject+tags for fast full-text search
3. Also: regex fallback for partial word matching
4. All results include the CID → client can trigger download at any time

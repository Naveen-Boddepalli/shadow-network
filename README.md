<div align="center">

# 🌑 The Shadow Network

### Decentralized Academic File Sharing for Campuses

[![Live Demo](https://img.shields.io/badge/Live%20Demo-shadow--network--kappa.vercel.app-6366f1?style=for-the-badge&logo=vercel)](https://shadow-network-kappa.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Render-46e3b7?style=for-the-badge&logo=render)](https://shadow-network-backend-623a.onrender.com/api/v1/health)
[![AI Engine](https://img.shields.io/badge/AI%20Engine-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://shadow-network-ai.onrender.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**Upload once. Share forever. No paywalls. No central servers.**

[Live Demo](https://shadow-network-kappa.vercel.app) · [Report Bug](https://github.com/Naveen-Boddepalli/shadow-network/issues) · [Request Feature](https://github.com/Naveen-Boddepalli/shadow-network/issues)

</div>

---

## 📖 Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Locally](#running-locally)
- [API Reference](#api-reference)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

<a id="about-the-project"></a>
## 🎯 About the Project

Students face three critical problems:

- 📚 **Paywalls** block access to research papers and academic resources
- 📶 **Poor connectivity** in campus labs and libraries breaks cloud-dependent tools
- 💾 **Centralized failure** — when Google Drive or Dropbox goes down, notes disappear

**The Shadow Network** stores documents on IPFS, adds an AI layer that lets students summarize, search and question them, and offers an optional browser-to-browser P2P mode.

---

<a id="features"></a>
## ✨ Features

### 📁 Decentralized File Storage (Phase 1)
- Upload PDFs, DOCX, TXT, images and ZIPs (up to 50 MB) to **IPFS** via Pinata, or a local Kubo node in development
- Every file gets a **CID** (Content Identifier) derived from its contents, so a file can't be altered without its CID changing
- Uploads are pinned so they aren't garbage-collected
- Anyone can download a file by its CID, no account needed

### 🔍 Metadata & Keyword Search (Phase 2)
- Attach **title, subject, and tags** to every uploaded document
- **Full-text search** across title, subject, and tags simultaneously
- MongoDB `$text` index for ranked whole-word matches, plus a substring match for partial words
- Filter notes by subject, paginate results

### 🤖 AI Layer — Summarize & Q&A (Phase 3)
- **One-click summary** of PDF, DOCX and TXT documents using DistilBART
- **Ask questions** about a document in natural language
- Answers are **extractive**: the model quotes a passage from the document rather than generating text
- Confidence score on every answer
- Summaries are **cached** in MongoDB, so each document is summarized once

### ⚡ Semantic Search (Phase 4)
- Search by **meaning**, not just keywords
- Query `"laws of motion"` → finds notes about Newton, F=ma, dynamics, kinematics
- Powered by `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional vectors)
- Vectors are stored in **MongoDB Atlas** and queried with `$vectorSearch`, so they survive restarts on Render's free tier
- Text documents are indexed in the background after upload; a failed index can be retried from the note page

### 🌐 P2P Offline Mesh (Phase 5)
- Runs a **browser-native IPFS node** (Helia), no installation needed
- Browsers connect to each other over **WebRTC**, using a libp2p relay to find and reach peers
- Fetch a file directly from a peer by its CID, without going through the backend

### 🔒 Security & Hardening
- **JWT authentication**: a shared `API_SECRET` is exchanged for a 24-hour token that protects upload, delete and AI endpoints
- **CORS allowlist** of exact frontend origins
- Input validation with **express-validator**
- **Rate limiting** on login, upload and AI endpoints
- Optional shared key (`AI_ENGINE_KEY`) so only the backend can call the AI engine

---

<a id="architecture"></a>
## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   React Frontend                         │
│         Browse · Upload · Search · Peers · Status        │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / REST
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js + Express Backend                   │
│         /upload · /search · /notes · /health            │
└──────┬──────────────────┬──────────────────┬────────────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐  ┌───────────────┐  ┌───────────────────┐
│   Pinata    │  │ MongoDB Atlas │  │  Python AI Engine  │
│ (IPFS Cloud)│  │  (Metadata)   │  │  FastAPI           │
│             │  │               │  │  DistilBART·MiniLM │
│ Files + CIDs│  │ Notes + Search│  │  Embeddings + Q&A  │
└─────────────┘  └───────────────┘  └───────────────────┘

── P2P Mode (optional) ──────────────────────────────────
┌──────────────┐   WebRTC    ┌──────────────┐
│ Student A    │ ←─────────► │ Student B    │
│ Helia Node   │  via relay  │ Helia Node   │
│ (browser)    │             │ (browser)    │
└──────────────┘             └──────────────┘
```

---

<a id="tech-stack"></a>
## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + Vite + React Router 7 | UI, routing, pages |
| Styling | Plain CSS with CSS variables | No Tailwind/MUI dependency |
| File Storage | Pinata (IPFS cloud) | Decentralized, permanent file storage |
| Backend | Node.js + Express | REST API, business logic |
| Database | MongoDB Atlas + Mongoose | Metadata, search, summary cache |
| AI Engine | Python FastAPI | Summarization, Q&A, embeddings |
| Summarization | distilbart-cnn-6-6 | Document summarization (BART family) |
| Q&A | minilm-uncased-squad2 | Extractive question answering |
| Embeddings | all-MiniLM-L6-v2 | 384-dim semantic vectors |
| Vector Search | MongoDB Atlas `$vectorSearch` | Cosine similarity search |
| PDF Extract | pdfplumber | Pure Python, no C++ compilation |
| P2P | Helia + libp2p + WebRTC | Browser-native IPFS mesh |
| Frontend Deploy | Vercel | Free, auto-deploys on push |
| Backend Deploy | Render | Free tier, Node + Python services |

---

<a id="getting-started"></a>
## 🚀 Getting Started

<a id="prerequisites"></a>
### Prerequisites

Make sure you have these installed:

```bash
node --version    # v20 or higher
python3 --version # v3.11 or higher
mongod --version  # MongoDB 6+
ipfs --version    # Kubo 0.24+ (optional for local dev)
```

<a id="installation"></a>
### Installation

**1. Clone the repository**
```bash
git clone https://github.com/Naveen-Boddepalli/shadow-network.git
cd shadow-network
```

**2. Install backend dependencies**
```bash
cd backend
npm install
```

**3. Install AI engine dependencies**
```bash
cd ../ai-engine
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**4. Install frontend dependencies**
```bash
cd ../frontend
npm install
```

<a id="running-locally"></a>
### Running Locally

You need **5 terminals** running simultaneously:

**Terminal 1 — IPFS (not needed if you set Pinata keys)**
```bash
ipfs init        # First time only
ipfs daemon
```

**Terminal 2 — MongoDB**
```bash
mongod
```

**Terminal 3 — AI Engine**
```bash
cd ai-engine
source venv/bin/activate
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 4 — Backend**
```bash
cd backend
cp .env.example .env
# Edit .env: MONGO_URI, JWT_SECRET, API_SECRET (and Pinata keys, or run ipfs daemon)
npm run dev
```

**Terminal 5 — Frontend**
```bash
cd frontend
cp .env.example .env
npm run dev
# Opens http://localhost:3000
```

**Check everything is running:**
```bash
curl http://localhost:5000/api/v1/health
```

Expected response:
```json
{
  "success": true,
  "health": {
    "server": "ok",
    "mongodb": "ok",
    "ipfs": "ok",
    "aiEngine": "ok"
  }
}
```

Semantic search also needs a one-time Atlas Vector Search index; see the comment at the top of [`ai-engine/embeddings.py`](ai-engine/embeddings.py).

**Run the tests:**
```bash
cd backend && npm test
cd ai-engine && pip install -r requirements-dev.txt && python -m pytest tests
```

---

<a id="api-reference"></a>
## 📡 API Reference

Endpoints marked 🔒 need an `Authorization: Bearer <token>` header.

### Auth
```
POST   /api/v1/auth/token          Body: { "secret": "<API_SECRET>" } → { "token", "expiresIn": "24h" }
```

### Health Check
```
GET /api/v1/health
```

### File Operations
```
POST   /api/v1/upload              🔒 Upload file + metadata
GET    /api/v1/download/:cid       Download file by CID
```

**Upload request (multipart/form-data):**
| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | ✅ | PDF, DOC/DOCX, TXT, PNG/JPEG, ZIP (max 50 MB; AI features need PDF, DOCX or TXT) |
| `title` | string | ✅ | Human-readable title |
| `subject` | string | ✅ | Academic subject |
| `tags` | string | ❌ | Comma-separated: `"exam,unit3"` |
| `uploadedBy` | string | ❌ | Uploader name (default: anonymous) |

**Upload response:**
```json
{
  "success": true,
  "data": {
    "id": "657a1f2e3c4b5a6d7e8f9012",
    "title": "Thermodynamics Unit 3",
    "subject": "Physics",
    "tags": ["exam", "unit3"],
    "cid": "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco",
    "fileSize": 245760,
    "uploadedAt": "2024-01-15T10:30:00.000Z",
    "downloadUrl": "/api/v1/download/QmXoypizj..."
  }
}
```

### Notes / Metadata
```
GET    /api/v1/notes               All notes (paginated)
GET    /api/v1/notes/:id           Single note
DELETE /api/v1/notes/:id           🔒 Delete note metadata (the file stays on IPFS)
GET    /api/v1/search?q=keyword    Keyword search
GET    /api/v1/semantic-search?q=  Semantic/meaning-based search
```

### AI Features
```
POST   /api/v1/notes/:id/summarize    🔒 Generate AI summary
POST   /api/v1/notes/:id/ask          🔒 Ask a question (body: {question})
DELETE /api/v1/notes/:id/summary      🔒 Clear cached summary
POST   /api/v1/notes/:id/embed        🔒 Add to semantic search index
```

**Ask question request:**
```json
{ "question": "What is the second law of thermodynamics?" }
```

**Ask question response:**
```json
{
  "success": true,
  "data": {
    "answer": "Energy cannot be created or destroyed...",
    "confidence": 0.87,
    "confident": true,
    "chunks_searched": 3
  }
}
```

### Example curl Commands
```bash
# Get a token
TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"secret": "your_api_secret"}' | jq -r .token)

# Upload a file
curl -X POST http://localhost:5000/api/v1/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@notes.pdf" \
  -F "title=Newton Laws" \
  -F "subject=Physics" \
  -F "tags=mechanics,exam"

# Search
curl "http://localhost:5000/api/v1/search?q=thermodynamics"

# Semantic search
curl "http://localhost:5000/api/v1/semantic-search?q=laws+of+motion"

# Summarize
curl -X POST http://localhost:5000/api/v1/notes/NOTE_ID/summarize \
  -H "Authorization: Bearer $TOKEN"

# Ask a question
curl -X POST http://localhost:5000/api/v1/notes/NOTE_ID/ask \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is entropy?"}'
```

---

<a id="deployment"></a>
## ☁️ Deployment

The project deploys to three free-tier platforms:

| Service | Platform | Auto-deploy |
|---|---|---|
| Frontend | Vercel | ✅ On every push to `main` |
| Backend | Render | ✅ GitHub Action, when `backend/` changes |
| AI Engine | Render | ✅ GitHub Action, when `ai-engine/` changes |
| Database | MongoDB Atlas | — (managed) |
| Files | Pinata IPFS | — (managed) |

See [DEPLOY.md](DEPLOY.md) for the complete step-by-step deployment guide.

### Enable P2P Mode
Set `VITE_P2P_MODE=true` in `frontend/.env` for local development, or in the Vercel project's environment variables for production (`frontend/.env.production` sets it for production builds).

---

<a id="environment-variables"></a>
## 🔐 Environment Variables

### Backend (`backend/.env`)
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/shadow-network
IPFS_HOST=127.0.0.1
IPFS_PORT=5001
IPFS_PROTOCOL=http
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
PINATA_GATEWAY=https://gateway.pinata.cloud
AI_ENGINE_URL=http://localhost:8000
AI_ENGINE_KEY=                 # optional; must match the AI engine's
JWT_SECRET=change_me           # long random string
API_SECRET=change_me           # shared login secret
ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend.vercel.app
```

### AI Engine (`ai-engine/.env`)
```env
SUMMARIZATION_MODEL=sshleifer/distilbart-cnn-6-6
QA_MODEL=deepset/minilm-uncased-squad2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
SUMMARY_MAX_LENGTH=200
SUMMARY_MIN_LENGTH=50
IPFS_GATEWAY=https://gateway.pinata.cloud
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=shadow-network
AI_ENGINE_KEY=                 # optional; must match the backend's
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_P2P_MODE=false
```

---

<a id="roadmap"></a>
## 🗺 Roadmap

- [x] Phase 1 — IPFS decentralized file storage
- [x] Phase 2 — MongoDB metadata + keyword search
- [x] Phase 3 — AI summarization + Q&A
- [x] Phase 4 — Semantic vector search (MongoDB Atlas)
- [x] Phase 5 — P2P browser mesh (Helia + libp2p)
- [x] Full cloud deployment (Vercel + Render + Atlas + Pinata)
- [x] JWT Authentication (API Key based)
- [x] Persistent Vector Store (MongoDB Atlas)
- [ ] Collections / Folders for organizing notes
- [ ] PWA support (offline caching + Add to Home Screen)
- [ ] OCR for scanned PDFs (pytesseract)
- [ ] Campus relay node for P2P behind NAT
- [ ] Mobile app (React Native)

---

<a id="contributing"></a>
## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/YourFeature`
3. Commit your changes: `git commit -m "Add YourFeature"`
4. Push to the branch: `git push origin feature/YourFeature`
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 👤 Author

**Naveen Boddepalli**
- GitHub: [@Naveen-Boddepalli](https://github.com/Naveen-Boddepalli)

---

<div align="center">

**[⬆ Back to top](#-the-shadow-network)**

</div>

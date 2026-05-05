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

## 🎯 About the Project

Students face three critical problems:

- 📚 **Paywalls** block access to research papers and academic resources
- 📶 **Poor connectivity** in campus labs and libraries breaks cloud-dependent tools
- 💾 **Centralized failure** — when Google Drive or Dropbox goes down, notes disappear

**The Shadow Network** solves all three by combining IPFS decentralized storage with an AI layer that lets students summarize, search, and question any document — and an optional P2P mode that works entirely offline on the same campus WiFi.

---

## ✨ Features

### 📁 Decentralized File Storage (Phase 1)
- Upload PDFs, DOCX, TXT, and images directly to **IPFS** via Pinata
- Every file gets a unique **CID** (Content Identifier) — a cryptographic hash
- Files are **immutable and permanent** — no one can delete or alter them
- Download any file with just its CID — no account needed

### 🔍 Metadata & Keyword Search (Phase 2)
- Attach **title, subject, and tags** to every uploaded document
- **Full-text search** across title, subject, and tags simultaneously
- MongoDB `$text` index for fast indexed search + regex fallback for partial words
- Filter notes by subject, paginate results

### 🤖 AI Layer — Summarize & Q&A (Phase 3)
- **One-click AI summary** of any document using BART (distilled)
- **Ask questions** about a document in natural language
- Answers are **extractive** — pulled directly from the document text, no hallucination
- Confidence score on every answer
- Summaries are **cached** in MongoDB — generated once, served instantly after

### ⚡ Semantic Search (Phase 4)
- Search by **meaning**, not just keywords
- Query `"laws of motion"` → finds notes about Newton, F=ma, dynamics, kinematics
- Powered by `sentence-transformers/all-MiniLM-L6-v2` (384-dimensional vectors)
- **FAISS** nearest-neighbour index for millisecond-speed search
- Every uploaded document is auto-indexed in the background

### 🌐 P2P Offline Mesh (Phase 5)
- Enable **browser-native IPFS** using Helia — no installation needed
- Share files directly between students on the **same campus WiFi**
- Works completely **offline** — no internet, no server, no Render
- Peer discovery via **mDNS** — classmates appear automatically
- Transfer files over **WebRTC DataChannels** (same tech as video calls)

---

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
│ (IPFS Cloud)│  │  (Metadata)   │  │  FastAPI + FAISS   │
│             │  │               │  │  BART · RoBERTa    │
│ Files + CIDs│  │ Notes + Search│  │  Embeddings + Q&A  │
└─────────────┘  └───────────────┘  └───────────────────┘

── P2P Mode (optional) ──────────────────────────────────
┌──────────────┐   WebRTC    ┌──────────────┐
│ Student A    │ ←─────────► │ Student B    │
│ Helia Node   │   same LAN  │ Helia Node   │
│ (browser)    │             │ (browser)    │
└──────────────┘             └──────────────┘
```

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18 + React Router v6 | UI, routing, pages |
| Styling | Plain CSS with CSS variables | No Tailwind/MUI dependency |
| File Storage | Pinata (IPFS cloud) | Decentralized, permanent file storage |
| Backend | Node.js + Express | REST API, business logic |
| Database | MongoDB Atlas + Mongoose | Metadata, search, summary cache |
| AI Engine | Python FastAPI | Summarization, Q&A, embeddings |
| Summarization | distilbart-cnn-6-6 | Document summarization (BART family) |
| Q&A | minilm-uncased-squad2 | Extractive question answering |
| Embeddings | all-MiniLM-L6-v2 | 384-dim semantic vectors |
| Vector Search | FAISS IndexFlatIP | Cosine similarity search |
| PDF Extract | pdfplumber | Pure Python, no C++ compilation |
| P2P | Helia + libp2p + WebRTC | Browser-native IPFS mesh |
| Frontend Deploy | Vercel | Free, auto-deploys on push |
| Backend Deploy | Render | Free tier, Node + Python services |

---

## 🚀 Getting Started

### Prerequisites

Make sure you have these installed:

```bash
node --version    # v18 or higher
python3 --version # v3.11 or higher
mongod --version  # MongoDB 6+
ipfs --version    # Kubo 0.24+ (optional for local dev)
```

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

### Running Locally

You need **5 terminals** running simultaneously:

**Terminal 1 — IPFS (optional with Pinata keys)**
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
# Edit .env with your MongoDB URI and Pinata keys
npm run dev
```

**Terminal 5 — Frontend**
```bash
cd frontend
cp .env.example .env
# Edit .env: REACT_APP_API_URL=http://localhost:5000/api/v1
npm start
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

---

## 📡 API Reference

### Health Check
```
GET /api/v1/health
```

### File Operations
```
POST   /api/v1/upload              Upload file + metadata
GET    /api/v1/download/:cid       Download file by CID
```

**Upload request (multipart/form-data):**
| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | ✅ | PDF, DOCX, TXT, image (max 50MB) |
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
DELETE /api/v1/notes/:id           Delete note metadata
GET    /api/v1/search?q=keyword    Keyword search
GET    /api/v1/semantic-search?q=  Semantic/meaning-based search
```

### AI Features
```
POST   /api/v1/notes/:id/summarize    Generate AI summary
POST   /api/v1/notes/:id/ask          Ask a question (body: {question})
DELETE /api/v1/notes/:id/summary      Clear cached summary
POST   /api/v1/notes/:id/embed        Add to semantic search index
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
# Upload a file
curl -X POST http://localhost:5000/api/v1/upload \
  -F "file=@notes.pdf" \
  -F "title=Newton Laws" \
  -F "subject=Physics" \
  -F "tags=mechanics,exam"

# Search
curl "http://localhost:5000/api/v1/search?q=thermodynamics"

# Semantic search
curl "http://localhost:5000/api/v1/semantic-search?q=laws+of+motion"

# Summarize
curl -X POST http://localhost:5000/api/v1/notes/NOTE_ID/summarize

# Ask a question
curl -X POST http://localhost:5000/api/v1/notes/NOTE_ID/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is entropy?"}'
```

---

## ☁️ Deployment

The project deploys to three free-tier platforms:

| Service | Platform | Auto-deploy |
|---|---|---|
| Frontend | Vercel | ✅ On every `git push` |
| Backend | Render | ✅ On every `git push` |
| AI Engine | Render | ✅ On every `git push` |
| Database | MongoDB Atlas | — (managed) |
| Files | Pinata IPFS | — (managed) |

See [DEPLOY.md](DEPLOY.md) for the complete step-by-step deployment guide.

**Quick deploy:**
```bash
git add .
git commit -m "your changes"
git push origin main
# Render and Vercel auto-deploy within 2-3 minutes
```

### Enable P2P Mode
```bash
# In frontend/.env
REACT_APP_P2P_MODE=true

git add frontend/.env
git commit -m "Enable P2P mode"
git push
```

---

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
FRONTEND_URL=http://localhost:3000
```

### AI Engine (`ai-engine/.env`)
```env
SUMMARIZATION_MODEL=sshleifer/distilbart-cnn-6-6
QA_MODEL=deepset/minilm-uncased-squad2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
SUMMARY_MAX_LENGTH=200
SUMMARY_MIN_LENGTH=50
IPFS_GATEWAY=https://gateway.pinata.cloud
```

### Frontend (`frontend/.env`)
```env
REACT_APP_API_URL=http://localhost:5000/api/v1
REACT_APP_P2P_MODE=false
```

---

## 🗺 Roadmap

- [x] Phase 1 — IPFS decentralized file storage
- [x] Phase 2 — MongoDB metadata + keyword search
- [x] Phase 3 — AI summarization + Q&A
- [x] Phase 4 — Semantic vector search (FAISS)
- [x] Phase 5 — P2P browser mesh (Helia + libp2p)
- [x] Full cloud deployment (Vercel + Render + Atlas + Pinata)
- [ ] JWT Authentication (login/register)
- [ ] Persistent FAISS index (Render Disk or Pinecone)
- [ ] Collections / Folders for organizing notes
- [ ] PWA support (offline caching + Add to Home Screen)
- [ ] OCR for scanned PDFs (pytesseract)
- [ ] Campus relay node for P2P behind NAT
- [ ] Mobile app (React Native)

---

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

Built with ❤️ for students who deserve better access to knowledge.

**[⬆ Back to top](#-the-shadow-network)**

</div>
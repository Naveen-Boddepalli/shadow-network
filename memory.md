# Project Memory — The Shadow Network

This document serves as the central source of truth for **The Shadow Network** project, describing the system architecture, component integrations, database models, environment configurations, and development instructions.

---

## 📖 Project Overview & Purpose

The **Shadow Network** is a decentralized academic file-sharing platform designed for campuses to solve three critical limitations:
1. **Paywalls:** Removing commercial/centralized blocks on academic materials.
2. **Connectivity:** Allowing offline file sharing directly over campus local area networks (LANs).
3. **Centralized Failure:** Ensuring permanent, immutable file access by leveraging peer-to-peer technologies (IPFS).

---

## 🛠 Project Status & Phases

All five planned phases are implemented:

| Phase | Description | Status | Reference Files |
| :--- | :--- | :--- | :--- |
| **Phase 1** | IPFS Decentralized File Sharing | **Complete** | [fileController.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/controllers/fileController.js), [ipfsService.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/services/ipfsService.js) |
| **Phase 2** | MongoDB Metadata + Keyword Search | **Complete** | [Note.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/models/Note.js), [notesController.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/controllers/notesController.js) |
| **Phase 3** | AI Summarization (BART) & Extractive Q&A (RoBERTa) | **Complete** | [aiController.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/controllers/aiController.js), [aiService.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/services/aiService.js), [summarizer.py](file:///Users/boddepallinaveen/Downloads/shadow-network/ai-engine/summarizer.py), [qa.py](file:///Users/boddepallinaveen/Downloads/shadow-network/ai-engine/qa.py) |
| **Phase 4** | Semantic Search (Vector Embeddings) | **Complete** | [embeddings.py](file:///Users/boddepallinaveen/Downloads/shadow-network/ai-engine/embeddings.py), [semanticController.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/controllers/semanticController.js) |
| **Phase 5** | Offline Browser-native P2P Sharing | **Complete** | [p2p.js](file:///Users/boddepallinaveen/Downloads/shadow-network/frontend/src/services/p2p.js), [P2PContext.jsx](file:///Users/boddepallinaveen/Downloads/shadow-network/frontend/src/context/P2PContext.jsx) |

---

## 🏗 System Architecture

The application is structured as a three-tier architecture with a decoupled AI service and an optional local/offline P2P mesh network.

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                   React Frontend                         │
                  │         Browse · Upload · Search · Peers · Status        │
                  └────────────────────────┬────────────────────────────────┘
                                           │ HTTP / REST
                                           ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │              Node.js + Express Backend                   │
                  │   /upload · /search · /notes · /health · /auth/token    │
                  └──────┬──────────────────┬──────────────────┬────────────┘
                         │                  │                  │
                         ▼                  ▼                  ▼
                  ┌─────────────┐  ┌───────────────┐  ┌───────────────────┐
                  │   Pinata    │  │ MongoDB Atlas │  │  Python AI Engine  │
                  │ (IPFS Cloud)│  │  (Metadata)   │  │  FastAPI + Atlas   │
                  │             │  │               │  │  Vector Search    │
                  │ Files + CIDs│  │ Notes + Search│  │  BART / RoBERTa   │
                  └─────────────┘  └───────────────┘  └───────────────────┘

                  ── P2P Mode (optional) ──────────────────────────────────
                  ┌──────────────┐   WebRTC    ┌──────────────┐
                  │ Student A    │ ←─────────► │ Student B    │
                  │ Helia Node   │   same LAN  │ Helia Node   │
                  │ (browser)    │             │ (browser)    │
                  └──────────────┘             └──────────────┘
```

### 1. React Frontend ([frontend](file:///Users/boddepallinaveen/Downloads/shadow-network/frontend))
- **Entry point:** [App.jsx](file:///Users/boddepallinaveen/Downloads/shadow-network/frontend/src/App.jsx)
- **State Management:**
  - `AuthContext`: Manages client-side authentication token storing it in `localStorage`.
  - `P2PContext`: Handles browser-native Helia initialization, peer connections, and status.
- **Styling:** Custom Vanilla CSS styling under [styles/global.css](file:///Users/boddepallinaveen/Downloads/shadow-network/frontend/src/styles/global.css) with glassmorphism, responsive grids, and subtle micro-animations.

### 2. Node.js Backend ([backend](file:///Users/boddepallinaveen/Downloads/shadow-network/backend))
- **Entry point:** [server.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/server.js)
- **Role:** Handles metadata orchestration, file buffer forwarding to Pinata, JWT token generation/validation, database indexes, and redirects semantic and AI requests to the Python AI engine.

### 3. Python AI Engine ([ai-engine](file:///Users/boddepallinaveen/Downloads/shadow-network/ai-engine))
- **Entry Point:** [main.py](file:///Users/boddepallinaveen/Downloads/shadow-network/ai-engine/main.py)
- **Role:** Text extraction (using `pdfplumber` and `python-docx`), running summarization (BART) and extractive Q&A (RoBERTa) models, and executing vector search generation using `all-MiniLM-L6-v2`.

---

## 🗄 Data Models

### 1. Note Schema (MongoDB `notes` collection)
Defined in [Note.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/models/Note.js):
* `title`: `String` (required, max 200)
* `subject`: `String` (required, max 100)
* `tags`: `[String]` (auto-lowercased & trimmed)
* `cid`: `String` (required, unique, IPFS Content Identifier)
* `originalName`: `String` (required, filename)
* `mimeType`: `String` (default `application/octet-stream`)
* `fileSize`: `Number` (file size in bytes)
* `uploadedBy`: `String` (default `anonymous`)
* `summary`: `String` (default `null`, cached after first Bart summarization request)
* `summaryGeneratedAt`: `Date` (default `null`)
* `embeddingIndexed`: `Boolean` (default `false`, set to `true` when embedding has been synced to MongoDB Vector index)
* **Indexes:** Text index on `{ title: 'text', subject: 'text', tags: 'text' }` for keyword searches.

### 2. Embeddings Schema (MongoDB Atlas `embeddings` collection)
Used in [embeddings.py](file:///Users/boddepallinaveen/Downloads/shadow-network/ai-engine/embeddings.py):
* `note_id`: `ObjectId` (referenced Note id, unique index)
* `embedding`: `[Double]` (384-dimensional vector from `all-MiniLM-L6-v2`)
* `text_preview`: `String` (first 200 characters of the document, helpful for Atlas debugging)

---

## 🔐 Security & Hardening

1. **JWT-based Authentication:**
   * Protects sensitive endpoints: `/upload`, `/notes/:id` (delete), AI summarization `/summarize`, and Q&A `/ask`.
   * Clients exchange a shared `API_SECRET` for a signed JWT (`24h` TTL) using constant-time comparison.
   * Middleware [auth.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/middleware/auth.js) validates incoming bearer tokens.
2. **CORS Allowlist:**
   * Configured in [server.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/server.js).
   * Restricts frontend origin to exact domains specified in the `ALLOWED_ORIGINS` env array. Wildcards are disabled.
3. **Input Sanitization & Validation:**
   * Routes are guarded via [validators.js](file:///Users/boddepallinaveen/Downloads/shadow-network/backend/middleware/validators.js) using `express-validator` to sanitize text and check fields.
4. **Rate Limiting:**
   * Uses `express-rate-limit` to restrict brute-forcing endpoints.
5. **IPFS Pinning:**
   * The backend calls `ipfs.pin.add` on successful uploads (using Pinata SDK in production) to ensure files aren't garbage collected.

---

## ⚙️ Environment Configurations

### 1. Backend (`backend/.env`)
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
JWT_SECRET=super_secure_jwt_secret_random_key_here
API_SECRET=your_shared_api_secret_key_used_to_get_token
ALLOWED_ORIGINS=http://localhost:3000,https://shadow-network-xxxx.vercel.app
```

### 2. AI Engine (`ai-engine/.env`)
```env
SUMMARIZATION_MODEL=sshleifer/distilbart-cnn-6-6
QA_MODEL=deepset/minilm-uncased-squad2
EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
SUMMARY_MAX_LENGTH=200
SUMMARY_MIN_LENGTH=50
IPFS_GATEWAY=https://gateway.pinata.cloud
MONGO_URI=mongodb+srv://<user>:<password>@shadow-network.xxxxx.mongodb.net/?retryWrites=true&w=majority
MONGO_DB_NAME=shadow-network
```

### 3. Frontend (`frontend/.env`)
```env
REACT_APP_API_URL=http://localhost:5000/api/v1
REACT_APP_P2P_MODE=false
```

---

## 🚀 Local Development Guide

To start the complete local stack, run the following processes in separate terminals:

1. **IPFS Daemon (If not relying on cloud Pinata):**
   ```bash
   ipfs daemon
   ```
2. **MongoDB Database:**
   ```bash
   mongod
   ```
3. **AI Engine:**
   ```bash
   cd ai-engine
   source venv/bin/activate
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```
4. **Express Backend:**
   ```bash
   cd backend
   npm run dev
   ```
5. **React Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

---

## 📡 REST API Reference

All backend endpoints are prefixed with `/api/v1`.

### 🛡 Auth
* `POST /auth/token` - Request a JWT by providing the shared secret.
  * Body: `{ "secret": "<API_SECRET>" }`
  * Response: `{ "success": true, "token": "<jwt>", "expiresIn": "24h" }`

### 📂 File Management
* `POST /upload` - Upload file & metadata to IPFS (and create DB note record).
  * *Auth required.*
  * Body (multipart/form-data): `file`, `title`, `subject`, `tags`, `uploadedBy`
* `GET /download/:cid` - Serves file directly from the decentralized storage network.

### 📝 Notes Metadata
* `GET /notes` - List notes (paginated). Optional filters: `?subject=Physics&page=1&limit=10`.
* `GET /notes/:id` - Fetch single note detail metadata.
* `DELETE /notes/:id` - Deletes metadata and triggers embedding removal.
  * *Auth required.*

### 🔍 Search Routes
* `GET /search?q=<query>` - Perform a keyword-based text search on title, subject, and tags.
* `GET /semantic-search?q=<query>&k=10` - Perform a vector/meaning-based search using MongoDB Atlas Vector Search.

### 🤖 AI Utilities
* `POST /notes/:id/summarize` - Triggers BART model to output a document summary (cached in MongoDB).
  * *Auth required.*
* `POST /notes/:id/ask` - Submits a natural language question; answers via RoBERTa model context.
  * *Auth required.*
  * Body: `{ "question": "<question string>" }`
* `DELETE /notes/:id/summary` - Clear the summary cache of a note.
  * *Auth required.*
* `POST /notes/:id/embed` - Re-trigger manual vector generation and index sync.

---

## 💡 Key Design Decisions

1. **MongoDB Atlas Vector Search over FAISS on Disk:**
   * Render free tier contains an ephemeral filesystem; local `.faiss` vector binaries get wiped on container sleeps and restarts. Storing normalized vectors directly in MongoDB Atlas ensures embeddings remain persisted permanently.
2. **Extractive Q&A instead of Generative LLM:**
   * RoBERTa is configured for extractive reading comprehension, locating response answers directly inside the uploaded document. This prevents hallucinations, which is critical for academic purposes.
3. **Helia browser-native IPFS Nodes:**
   * Enables decentralized file sharing directly in the client browser using WebRTC circuit transport, removing the server as a single point of failure.

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
| **Phase 1** | IPFS Decentralized File Sharing | **Complete** | [fileController.js](backend/controllers/fileController.js), [ipfsService.js](backend/services/ipfsService.js) |
| **Phase 2** | MongoDB Metadata + Keyword Search | **Complete** | [Note.js](backend/models/Note.js), [notesController.js](backend/controllers/notesController.js) |
| **Phase 3** | AI Summarization (DistilBART) & Extractive Q&A (MiniLM) | **Complete** | [aiController.js](backend/controllers/aiController.js), [aiService.js](backend/services/aiService.js), [summarizer.py](ai-engine/summarizer.py), [qa.py](ai-engine/qa.py) |
| **Phase 4** | Semantic Search (Vector Embeddings) | **Complete** | [embeddings.py](ai-engine/embeddings.py), [semanticController.js](backend/controllers/semanticController.js) |
| **Phase 5** | Offline Browser-native P2P Sharing | **Complete** (verified browser-to-browser over a local relay) | [p2p.js](frontend/src/services/p2p.js), [P2PContext.jsx](frontend/src/context/P2PContext.jsx), [p2p-relay/index.js](p2p-relay/index.js) |

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
                  │ Files + CIDs│  │ Notes + Search│  │ DistilBART/MiniLM │
                  └─────────────┘  └───────────────┘  └───────────────────┘

                  ── P2P Mode (optional) ──────────────────────────────────
                  ┌──────────────┐  direct WebRTC DataChannel  ┌──────────────┐
                  │ Student A    │ ◄─────────────────────────► │ Student B    │
                  │ Helia Node   │                             │ Helia Node   │
                  │ (browser)    │                             │ (browser)    │
                  └──────┬───────┘                             └──────┬───────┘
                         │ ws:// — circuit relay (signalling) + gossipsub │
                         └──────────────►┌──────────────┐◄─────────────┘
                                         │ Campus relay │  p2p-relay/ (Node, any
                                         │  (libp2p)    │  machine on the LAN)
                                         └──────────────┘
```

### 1. React Frontend ([frontend](frontend/))
- **Entry point:** [App.jsx](frontend/src/App.jsx)
- **State Management:**
  - `AuthContext`: Manages client-side authentication token storing it in `localStorage`.
  - `P2PContext`: Handles browser-native Helia initialization, peer connections, and status.
- **Styling:** Plain CSS with CSS variables in [styles/global.css](frontend/src/styles/global.css).

### 2. Node.js Backend ([backend](backend/))
- **Entry point:** [server.js](backend/server.js)
- **Role:** Stores files on IPFS (Pinata, or local Kubo in development), keeps note metadata in MongoDB, issues and verifies JWTs, and proxies AI and semantic-search requests to the Python AI engine.

### 2b. P2P: browser nodes + campus relay
- **Browser node** ([p2p.js](frontend/src/services/p2p.js)): Helia 6 / libp2p 3 built from Helia's `libp2pDefaults()`, plus gossipsub (`@libp2p/gossipsub@15`) and `@libp2p/pubsub-peer-discovery`. Blocks and the node's identity (peer key) persist in IndexedDB (`blockstore-idb@3`, `datastore-idb@4`, versions matched to Helia 6's store interfaces). Uploaded files are pinned. The whole P2P stack is lazy-loaded (separate ~1.6 MB chunk), so it costs nothing when `VITE_P2P_MODE` is off.
- **How peers meet:** each browser dials the relays in `VITE_P2P_RELAYS`, reserves a circuit-relay slot (giving it a `/p2p-circuit/webrtc` address), and announces that address every 10 s on the gossipsub topic `shadow-network._peer-discovery._p2p._pubsub`. On each announcement, other browsers dial it. The relay only carries the WebRTC handshake; file bytes go browser-to-browser, fetched by CID over bitswap.
- **Gotchas that were fixed (keep them in mind):**
  - libp2p v3 option is `connectionEncrypters`, not `connectionEncryption`.
  - libp2p's browser default connection gater refuses `ws://` and private/LAN IPs, so `p2p.js` overrides `denyDialMultiaddr`.
  - libp2p v3 no longer auto-dials discovered peers, and its `peer:discovery` event only fires for peers new to the persisted peer store, so `p2p.js` dials from the pubsub-discovery module's own `peer` event.
  - Gossipsub keeps one outbound stream per peer and resets it only when the peer's last connection closes. On a page reload the new connection can arrive before the old one closes, so the relay patches this on `connection:close` (see `p2p-relay/index.js`). Browsers also run a 15 s watchdog that reconnects to a relay that is connected but not a topic subscriber.
  - Tabs on the same origin share IndexedDB, so they share a peer ID. Use a different port to test two peers on one machine.
- **Campus relay** ([p2p-relay/](p2p-relay/)): libp2p node with WebSockets, Circuit Relay v2 server and gossipsub, subscribed to the discovery topic. Keeps its key in `p2p-relay/.relay-key` (git-ignored), or derives it from `RELAY_SEED`, so its peer ID is stable, and prints the multiaddrs to put in `VITE_P2P_RELAYS`. **Deployed** as the Render free web service `shadow-network-relay` (root dir `p2p-relay`, `npm ci` / `npm start`, `RELAY_SEED` generated by Render), reachable at `/dns4/shadow-network-relay.onrender.com/tcp/443/wss`. Render terminates TLS and the relay announces that address from `RENDER_EXTERNAL_HOSTNAME`. `frontend/.env.production` points `VITE_P2P_RELAYS` at it. The free instance sleeps after 15 min idle; the first browser then waits ~50 s while it wakes (the 15 s watchdog keeps retrying).
- **Login:** P2P-only uploads don't need a login (`/upload` allows unauthenticated access when P2P mode is on; the server-upload option stays disabled until login).

### 3. Python AI Engine ([ai-engine](ai-engine/))
- **Entry Point:** [main.py](ai-engine/main.py)
- **Role:** Text extraction (`pdfplumber`, `python-docx`), summarization (`sshleifer/distilbart-cnn-6-6`), extractive Q&A (`deepset/minilm-uncased-squad2`) and document embeddings (`all-MiniLM-L6-v2`, averaged over chunks) stored in Atlas for `$vectorSearch`. Models load lazily on first use; blocking work runs in a thread pool. If `AI_ENGINE_KEY` is set, every endpoint except `/` and `/health` requires a matching `X-Internal-Key` header.

---

## 🗄 Data Models

### 1. Note Schema (MongoDB `notes` collection)
Defined in [Note.js](backend/models/Note.js):
* `title`: `String` (required, max 200)
* `subject`: `String` (required, max 100)
* `tags`: `[String]` (auto-lowercased & trimmed)
* `cid`: `String` (required, unique, IPFS Content Identifier)
* `originalName`: `String` (required, filename)
* `mimeType`: `String` (default `application/octet-stream`)
* `fileSize`: `Number` (file size in bytes)
* `uploadedBy`: `String` (default `anonymous`)
* `summary`: `String` (default `null`, cached after the first summarization request)
* `summaryGeneratedAt`: `Date` (default `null`)
* `embeddingIndexed`: `Boolean` (default `false`, set to `true` when embedding has been synced to MongoDB Vector index)
* **Indexes:** Text index on `{ title: 'text', subject: 'text', tags: 'text' }` for keyword searches.

### 2. Embeddings Schema (MongoDB Atlas `embeddings` collection)
Used in [embeddings.py](ai-engine/embeddings.py):
* `note_id`: `String` (the Note's `_id` as a string, unique index)
* `embedding`: `[Double]` (384-dimensional vector from `all-MiniLM-L6-v2`)
* `text_preview`: `String` (first 200 characters of the document, helpful for Atlas debugging)

---

## 🔐 Security & Hardening

1. **JWT-based Authentication:**
   * Protects `/upload`, `DELETE /notes/:id`, `/notes/:id/summarize`, `/notes/:id/ask`, `DELETE /notes/:id/summary` and `/notes/:id/embed`.
   * Clients exchange a shared `API_SECRET` for a signed JWT (`24h` TTL) using constant-time comparison.
   * Middleware [auth.js](backend/middleware/auth.js) validates incoming bearer tokens.
2. **CORS Allowlist:**
   * Configured in [server.js](backend/server.js).
   * Restricts frontend origin to exact domains specified in the `ALLOWED_ORIGINS` env array. Wildcards are disabled.
3. **Input Sanitization & Validation:**
   * Routes are guarded via [validators.js](backend/middleware/validators.js) using `express-validator` (trim, length, ObjectId and CID checks). Text is stored unescaped; React escapes on render. User input used in regex queries is escaped first.
4. **Rate Limiting:**
   * `express-rate-limit` on `/auth/token`, `/upload` and the AI routes. `trust proxy` is set so limits apply per client behind Render's proxy.
5. **IPFS Pinning:**
   * Pinata pins uploads in production; on local Kubo the backend pins with `pin.add`.
6. **AI engine key:**
   * Optional `AI_ENGINE_KEY`, shared by the backend and AI engine, keeps the engine's endpoints private.

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
AI_ENGINE_KEY=
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
AI_ENGINE_KEY=
```

### 3. Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5000/api/v1
VITE_P2P_MODE=false
VITE_P2P_RELAYS=            # comma-separated relay multiaddrs printed by p2p-relay
VITE_P2P_PUBLIC_NETWORK=true # false = only talk to the relay(s); pure offline LAN
```

### 4. P2P relay (`p2p-relay`, environment variables)
```env
RELAY_PORT=9090            # also honours PORT
RELAY_ANNOUNCE=            # e.g. /dns4/relay.example.com/tcp/443/wss when behind a TLS proxy
RELAY_KEY_FILE=.relay-key
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
6. **P2P relay (only for P2P mode):**
   ```bash
   cd p2p-relay
   npm install && npm start
   ```
   Put one of the printed multiaddrs in `VITE_P2P_RELAYS` and set `VITE_P2P_MODE=true`. To try two peers on one machine, run a second frontend on another port (`npx vite --port 3001`), because same-origin tabs share a peer ID.

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
* `POST /notes/:id/summarize` - Summarizes the document with DistilBART (cached in MongoDB).
  * *Auth required.*
* `POST /notes/:id/ask` - Answers a natural-language question with a passage extracted from the document.
  * *Auth required.*
  * Body: `{ "question": "<question string>" }`
* `DELETE /notes/:id/summary` - Clear the summary cache of a note.
  * *Auth required.*
* `POST /notes/:id/embed` - Re-trigger vector generation for a note.
  * *Auth required.*

---

## 🚢 Deploy & CI

* Frontend: Vercel deploys `frontend/` on every push to `main`.
* Backend + AI engine: [render-deployments.yml](.github/workflows/render-deployments.yml) runs `npm test` (backend) and `pytest` (AI engine, ML models stubbed via `requirements-dev.txt`) for whichever service changed, then deploys it to Render on pushes to `main`. Pull requests run the tests only.
* [render.yaml](render.yaml) lists every env var; secrets (`JWT_SECRET`, `API_SECRET`, `ALLOWED_ORIGINS`, `MONGO_URI`, Pinata keys, `AI_ENGINE_KEY`) are `sync: false` and set in the Render dashboard. The AI engine pins `PYTHON_VERSION=3.11.8`.

---

## 💡 Key Design Decisions

1. **MongoDB Atlas Vector Search over FAISS on Disk:**
   * Render free tier contains an ephemeral filesystem; local `.faiss` vector binaries get wiped on container sleeps and restarts. Storing normalized vectors directly in MongoDB Atlas ensures embeddings remain persisted permanently.
2. **Extractive Q&A instead of Generative LLM:**
   * The Q&A model selects a span of the document as its answer instead of generating text, so answers are always quotes from the source.
3. **Helia browser-native IPFS Nodes + a tiny campus relay:**
   * Files are shared browser-to-browser over WebRTC, with no backend involved. Browsers can't use mDNS or accept incoming connections, so a small libp2p relay on the LAN acts as the meeting point (signalling + peer discovery only). It works without internet as long as the relay is reachable.

# Shadow Network — Backend

Express API for file storage (IPFS), note metadata and search (MongoDB), auth (JWT),
and a proxy to the Python AI engine. The full API reference and setup guide are in the
[root README](../README.md).

## Run locally

```bash
cp .env.example .env   # set MONGO_URI, JWT_SECRET, API_SECRET
npm install
npm run dev            # http://localhost:5000
```

Without `PINATA_API_KEY`/`PINATA_SECRET_KEY` the backend uses a local Kubo node,
so run `ipfs daemon` too. The AI routes need the AI engine running at `AI_ENGINE_URL`.

## Test

```bash
npm test
```

## Layout

```
server.js                 app setup, CORS, route mounting
config/db.js              MongoDB connection
models/Note.js            note schema + text index
routes/                   one file per area (auth, files, notes, ai, semantic, health)
controllers/              request handlers
services/ipfsService.js   Pinata (production) / Kubo (development)
services/aiService.js     HTTP client for the AI engine
middleware/               JWT auth, multer upload, validators, error handler
utils/httpError.js        client-safe errors, regex escaping
tests/                    supertest suite (no database needed)
```

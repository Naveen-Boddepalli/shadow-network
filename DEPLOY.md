# Shadow Network — Deployment Guide
# Free tier: Pinata + MongoDB Atlas + Render + Vercel

==========================================================================
OVERVIEW
==========================================================================

Service             Platform         Cost    URL pattern
Frontend            Vercel           Free    shadow-network.vercel.app
Backend (Node.js)   Render           Free    shadow-network-backend.onrender.com
AI Engine (Python)  Render           Free    shadow-network-ai.onrender.com
Database            MongoDB Atlas    Free    cluster.mongodb.net
File Storage        Pinata (IPFS)    Free    gateway.pinata.cloud

⚠️  Free tier limitations:
  - Render services SLEEP after 15 min inactivity → first request takes ~30s to wake
  - Render free = 512MB RAM → use the distilled models listed in Step 4A
  - Pinata free = 1GB storage, 100 pins
  - Atlas free = 512MB database storage

==========================================================================
STEP 1 — PUSH TO GITHUB
==========================================================================

1. Create a new GitHub repository:
   github.com → New repository → Name: "shadow-network" → Public → Create

2. Push your code:
   cd ~/Downloads/shadow-network
   git init
   git add .
   git commit -m "Initial commit — Shadow Network all phases"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/shadow-network.git
   git push -u origin main

==========================================================================
STEP 2 — MONGODB ATLAS (you already have an account)
==========================================================================

1. Go to: cloud.mongodb.com
2. Create a new Project → "Shadow Network"
3. Build a Database → FREE (M0) → AWS → closest region → Create
4. Set username + password → note them down
5. Network Access → Add IP Address → Allow Access from Anywhere (0.0.0.0/0)
6. Database → Connect → Drivers → Node.js → copy the connection string

   Looks like:
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority

   Replace <password> and add database name:
   mongodb+srv://username:yourpassword@cluster0.xxxxx.mongodb.net/shadow-network?retryWrites=true&w=majority

   SAVE THIS — you'll need it in Step 4.

7. Create the vector search index (needed for semantic search):
   Database → Browse Collections → shadow-network → embeddings
   (create the collection if it doesn't exist yet) → Search Indexes →
   Create Search Index → Atlas Vector Search → JSON editor:

   Index name: vector_index
   {
     "fields": [{ "type": "vector", "path": "embedding",
                  "numDimensions": 384, "similarity": "cosine" }]
   }

==========================================================================
STEP 3 — PINATA (free cloud IPFS)
==========================================================================

1. Go to: pinata.cloud → Sign up (free)
2. Go to: API Keys → New Key
3. Toggle ON: pinFileToIPFS, pinJSONToIPFS, unpin, userPinnedDataTotal
4. Key Name: "shadow-network" → Create Key
5. COPY BOTH:
   API Key:    xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   API Secret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

   ⚠️  The secret is shown ONCE. Copy it now.

==========================================================================
STEP 4 — RENDER (Backend + AI Engine)
==========================================================================

──── 4A. Deploy the AI Engine FIRST ────────────────────────────────────
(Deploy AI engine first so we have its URL for the backend env var)

1. Go to: render.com → New → Web Service
2. Connect GitHub → select your "shadow-network" repo
3. Fill in:
   Name:             shadow-network-ai
   Root Directory:   ai-engine
   Runtime:          Python 3
   Build Command:    pip install -r requirements.txt
   Start Command:    uvicorn main:app --host 0.0.0.0 --port $PORT
   Instance Type:    Free
   (If you created the service before render.yaml set it, add
    PYTHON_VERSION = 3.11.8 — torch 2.2 has no wheels for newer Pythons.)

4. Environment Variables → Add these one by one:
   SUMMARIZATION_MODEL   = sshleifer/distilbart-cnn-6-6
   QA_MODEL              = deepset/minilm-uncased-squad2
   EMBEDDING_MODEL       = sentence-transformers/all-MiniLM-L6-v2
   SUMMARY_MAX_LENGTH    = 200
   SUMMARY_MIN_LENGTH    = 50
   IPFS_GATEWAY          = https://gateway.pinata.cloud
   MONGO_URI             = mongodb+srv://...  (from Step 2)
   MONGO_DB_NAME         = shadow-network
   AI_ENGINE_KEY         = (a long random string; optional but recommended —
                            without it anyone can call the engine's endpoints)

5. Click "Create Web Service"
6. Wait for deploy → copy the URL shown at top:
   https://shadow-network-ai-xxxx.onrender.com
   SAVE THIS URL.

⚠️  NOTE on RAM: the full-size facebook/bart-large-cnn + deepset/roberta-base-squad2
    need ~2GB RAM and won't fit the free tier's 512MB. Use them only on a paid instance.

──── 4B. Deploy the Backend ────────────────────────────────────────────

1. render.com → New → Web Service
2. Connect same "shadow-network" repo
3. Fill in:
   Name:             shadow-network-backend
   Root Directory:   backend
   Runtime:          Node
   Build Command:    npm install
   Start Command:    npm start
   Instance Type:    Free

4. Environment Variables → Add ALL of these:
   NODE_ENV          = production
   PORT              = 10000
   MONGO_URI         = mongodb+srv://...  (from Step 2)
   PINATA_API_KEY    = (from Step 3)
   PINATA_SECRET_KEY = (from Step 3)
   PINATA_GATEWAY    = https://gateway.pinata.cloud
   AI_ENGINE_URL     = https://shadow-network-ai-xxxx.onrender.com  (from 4A)
   AI_ENGINE_KEY     = (same value as the AI engine's, if you set one)
   JWT_SECRET        = (long random string)
   API_SECRET        = (the shared secret users type on the Login page)
   ALLOWED_ORIGINS   = https://shadow-network.vercel.app  (update after Step 5)

   Generate random strings with:
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

5. Click "Create Web Service"
6. Wait for deploy → copy the URL:
   https://shadow-network-backend-xxxx.onrender.com
   SAVE THIS URL.

==========================================================================
STEP 5 — VERCEL (Frontend)
==========================================================================

1. Go to: vercel.com → New Project
2. Import Git Repository → select "shadow-network"
3. Configure Project:
   Framework Preset:  Vite
   Root Directory:    frontend        ← IMPORTANT: click "Edit" and set this
   Build Command:     npm run build
   Output Directory:  dist

4. Environment Variables → Add (these override frontend/.env.production):
   VITE_API_URL   = https://shadow-network-backend-xxxx.onrender.com/api/v1
   VITE_P2P_MODE  = false

5. Click Deploy
6. Your app will be live at:
   https://shadow-network-xxxx.vercel.app
   (or set a custom domain)

7. Go back to Render → Backend service → Environment Variables
   Update ALLOWED_ORIGINS = https://shadow-network-xxxx.vercel.app
   (comma-separate several origins; no trailing slash)
   Click "Save Changes" (triggers redeploy)

==========================================================================
STEP 6 — VERIFY EVERYTHING WORKS
==========================================================================

1. Open your Vercel URL
2. Go to Status page → should show:
   API Server  = ok
   MongoDB     = ok
   IPFS (Pinata) = ok
   AI Engine   = ok (may show disconnected if still sleeping — wait 30s and refresh)

3. Try uploading a PDF
4. Try searching

==========================================================================
CUSTOM DOMAIN (optional, free)
==========================================================================

Vercel: Project Settings → Domains → Add your domain
   e.g. shadownetwork.yourdomain.com

==========================================================================
KEEPING RENDER SERVICES AWAKE (optional)
==========================================================================

Free Render services sleep after 15 min. To prevent this:

Option A — UptimeRobot (free):
1. uptimerobot.com → New Monitor
2. Type: HTTP(s)
3. URL: https://shadow-network-backend-xxxx.onrender.com/api/v1/health
4. Interval: Every 14 minutes
Repeat for AI engine URL.

Option B — Upgrade to Render Starter ($7/month) — no sleep.

==========================================================================
UPDATING THE APP AFTER CHANGES
==========================================================================

# Make changes locally
git add .
git commit -m "your change description"
git push

→ Vercel deploys the frontend on every push to main. The GitHub Action in
  .github/workflows/render-deployments.yml runs the backend and AI engine
  tests and, if they pass, deploys whichever service changed to Render (needs the RENDER_API_KEY,
  RENDER_SERVICE_ID_BACKEND and RENDER_SERVICE_ID_AI repository secrets).

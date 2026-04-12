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
  - Render free = 512MB RAM → AI models load slowly (BART ~1.5GB, use lighter models)
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

   SAVE THIS — you'll need it in Step 3.

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

4. Environment Variables → Add these one by one:
   SUMMARIZATION_MODEL   = facebook/bart-large-cnn
   QA_MODEL              = deepset/roberta-base-squad2
   EMBEDDING_MODEL       = sentence-transformers/all-MiniLM-L6-v2
   SUMMARY_MAX_LENGTH    = 200
   SUMMARY_MIN_LENGTH    = 50
   IPFS_GATEWAY          = https://gateway.pinata.cloud

5. Click "Create Web Service"
6. Wait for deploy → copy the URL shown at top:
   https://shadow-network-ai-xxxx.onrender.com
   SAVE THIS URL.

⚠️  NOTE on RAM: BART + RoBERTa together need ~2GB RAM.
    Free tier has 512MB. To make it work on free tier, use lighter models:
    SUMMARIZATION_MODEL = sshleifer/distilbart-cnn-12-6    (lighter BART)
    QA_MODEL            = deepset/minilm-uncased-squad2     (lighter RoBERTa)
    These are 4x smaller, still good quality.

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
   FRONTEND_URL      = https://shadow-network.vercel.app  (update after Step 5)

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
   Framework Preset:  Create React App
   Root Directory:    frontend        ← IMPORTANT: click "Edit" and set this
   Build Command:     npm run build
   Output Directory:  build

4. Environment Variables → Add:
   REACT_APP_API_URL   = https://shadow-network-backend-xxxx.onrender.com/api/v1
   REACT_APP_P2P_MODE  = false

5. Click Deploy
6. Your app will be live at:
   https://shadow-network-xxxx.vercel.app
   (or set a custom domain)

7. Go back to Render → Backend service → Environment Variables
   Update FRONTEND_URL = https://shadow-network-xxxx.vercel.app
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

→ Render and Vercel auto-deploy on every push to main. That's it.

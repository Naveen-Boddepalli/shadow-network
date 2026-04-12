// backend/server.js  —  Phase 1-5, production-ready
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const fileRoutes     = require('./routes/fileRoutes');
const noteRoutes     = require('./routes/noteRoutes');
const aiRoutes       = require('./routes/aiRoutes');
const semanticRoutes = require('./routes/semanticRoutes');
const healthRoutes   = require('./routes/healthRoutes');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── CORS — allow frontend origins ─────────────────────────────
// In production, REACT_APP origins are set via env var
const allowedOrigins = [
  'http://localhost:3000',                        // local dev
  process.env.FRONTEND_URL,                       // Vercel production URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', fileRoutes);
app.use('/api/v1', noteRoutes);
app.use('/api/v1', aiRoutes);
app.use('/api/v1', semanticRoutes);
app.use('/api/v1', healthRoutes);

app.get('/', (req, res) => {
  res.json({
    message: '🌐 Shadow Network API',
    version: '2.0.0',
    status:  'running',
    phases:  ['IPFS', 'MongoDB', 'AI', 'Semantic', 'P2P'],
  });
});

app.use('*', (req, res) =>
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` })
);
app.use(errorHandler);

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Shadow Network API running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
  });
};

start();

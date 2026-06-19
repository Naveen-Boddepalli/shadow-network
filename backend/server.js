require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const connectDB    = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const authRoutes     = require('./routes/authRoutes');
const fileRoutes     = require('./routes/fileRoutes');
const noteRoutes     = require('./routes/noteRoutes');
const aiRoutes       = require('./routes/aiRoutes');
const semanticRoutes = require('./routes/semanticRoutes');
const healthRoutes   = require('./routes/healthRoutes');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Restricted CORS ──────────────────────────────────────────────────────────
// ALLOWED_ORIGINS is a comma-separated list of exact frontend origins.
// Example .env value: https://shadow-network.vercel.app,http://localhost:3000
// No wildcard pattern-matching; unknown origins are blocked.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin, curl, mobile apps)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', authRoutes);
app.use('/api/v1', fileRoutes);
app.use('/api/v1', noteRoutes);
app.use('/api/v1', aiRoutes);
app.use('/api/v1', semanticRoutes);
app.use('/api/v1', healthRoutes);

app.get('/', (req, res) => {
  res.json({ message: '🌐 Shadow Network API', status: 'running', version: '2.0.0' });
});

app.use('*', (req, res) =>
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` })
);
app.use(errorHandler);

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Shadow Network API running on port ${PORT}`);
    console.log(`🔒 CORS allowed origins: ${ALLOWED_ORIGINS.join(', ')}\n`);
  });
};

if (require.main === module) {
  start();
}
module.exports = app;

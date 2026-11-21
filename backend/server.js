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

// Render (and most PaaS hosts) sit behind a single reverse proxy. Without this,
// every request appears to come from the proxy's IP and all clients share one
// rate-limit bucket.
app.set('trust proxy', 1);

// Comma-separated list of exact frontend origins, e.g.
// https://shadow-network.vercel.app,http://localhost:3000
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Requests without an Origin header (curl, server-to-server) are allowed;
    // CORS only restricts browsers.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    const err = new Error(`Origin not allowed by CORS: ${origin}`);
    err.statusCode = 403;
    callback(err);
  },
}));

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use('/api/v1', authRoutes);
app.use('/api/v1', fileRoutes);
app.use('/api/v1', noteRoutes);
app.use('/api/v1', aiRoutes);
app.use('/api/v1', semanticRoutes);
app.use('/api/v1', healthRoutes);

app.get('/', (req, res) => {
  res.json({ message: 'Shadow Network API', status: 'running', version: '2.0.0' });
});

app.use((req, res) =>
  res.status(404).json({ success: false, error: `Route ${req.originalUrl} not found` })
);
app.use(errorHandler);

const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Shadow Network API listening on port ${PORT}`);
    console.log(`CORS allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  });
};

if (require.main === module) {
  start();
}

module.exports = app;

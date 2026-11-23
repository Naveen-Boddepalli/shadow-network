// GET /health — reports the status of MongoDB, IPFS and the AI engine.

const mongoose = require('mongoose');
const { getIPFSNodeInfo } = require('../services/ipfsService');
const { checkAIEngineHealth } = require('../services/aiService');

const healthCheck = async (req, res) => {
  const health = {
    server:    'ok',
    timestamp: new Date().toISOString(),
    mongodb:   mongoose.connection.readyState === 1 ? 'ok' : 'disconnected',
  };

  const [ipfs, ai] = await Promise.all([
    getIPFSNodeInfo().then((info) => ({ ok: true, ...info }), (err) => ({ ok: false, error: err.message })),
    checkAIEngineHealth(),
  ]);

  health.ipfs = ipfs.ok ? 'ok' : 'disconnected';
  if (ipfs.ok) {
    health.ipfsProvider = ipfs.provider;
    health.ipfsNodeId   = ipfs.nodeId;
  }

  // The AI engine is optional for core features (upload, browse, keyword search),
  // so it's reported but doesn't make the API unhealthy.
  health.aiEngine = ai.ok ? (ai.status === 'ok' ? 'ok' : 'degraded') : 'unreachable';
  if (ai.ok && ai.models) health.aiModels = ai.models;

  const isHealthy = health.mongodb === 'ok' && health.ipfs === 'ok';
  res.status(isHealthy ? 200 : 503).json({ success: isHealthy, health });
};

module.exports = { healthCheck };

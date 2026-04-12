// controllers/healthController.js
// GET /health — confirms server, DB, and IPFS are all alive.
// Great for debugging "is it running?" questions.

const mongoose = require('mongoose');
const { getIPFSNodeInfo } = require('../services/ipfsService');

const healthCheck = async (req, res) => {
  const health = {
    server: 'ok',
    timestamp: new Date().toISOString(),
    mongodb: 'unknown',
    ipfs: 'unknown',
  };

  // Check MongoDB
  health.mongodb = mongoose.connection.readyState === 1 ? 'ok' : 'disconnected';

  // Check IPFS
  try {
    const ipfsInfo = await getIPFSNodeInfo();
    health.ipfs = 'ok';
    health.ipfsNodeId = ipfsInfo.nodeId;
  } catch (_) {
    health.ipfs = 'disconnected — run: ipfs daemon';
  }

  const isHealthy = health.mongodb === 'ok' && health.ipfs === 'ok';
  res.status(isHealthy ? 200 : 503).json({ success: isHealthy, health });
};

module.exports = { healthCheck };

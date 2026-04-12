// backend/services/ipfsService.js  —  DEPLOYMENT VERSION
// Uses Pinata cloud IPFS when keys are set; falls back to local Kubo for dev.

const https = require('https');
const http  = require('http');

const PINATA_API_KEY    = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_GATEWAY    = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';

// ── Upload ─────────────────────────────────────────────────────
const uploadToIPFS = async (fileBuffer, fileName) => {
  if (PINATA_API_KEY && PINATA_SECRET_KEY) return uploadToPinata(fileBuffer, fileName);
  return uploadToKubo(fileBuffer, fileName);
};

const uploadToPinata = (fileBuffer, fileName) => {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const ext = fileName.split('.').pop().toLowerCase();
    const mimeMap = {
      pdf: 'application/pdf', txt: 'text/plain',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword', png: 'image/png',
      jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([header, fileBuffer, footer]);

    const req = https.request({
      hostname: 'api.pinata.cloud', port: 443,
      path: '/pinning/pinFileToIPFS', method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
        'pinata_api_key': PINATA_API_KEY,
        'pinata_secret_api_key': PINATA_SECRET_KEY,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const p = JSON.parse(data);
          if (p.IpfsHash) resolve(p.IpfsHash);
          else reject(new Error(`Pinata: ${JSON.stringify(p)}`));
        } catch (e) { reject(new Error('Invalid Pinata response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Pinata upload timed out')); });
    req.write(body);
    req.end();
  });
};

// ── Download ───────────────────────────────────────────────────
const downloadFromIPFS = (cid) => fetchFromUrl(`${PINATA_GATEWAY}/ipfs/${cid}`);

const fetchFromUrl = (url) => new Promise((resolve, reject) => {
  const client = url.startsWith('https') ? https : http;
  client.get(url, { timeout: 30000 }, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302)
      return fetchFromUrl(res.headers.location).then(resolve).catch(reject);
    if (res.statusCode === 404) return reject(new Error('File not found on IPFS'));
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve(Buffer.concat(chunks)));
  }).on('error', reject);
});

// ── Kubo fallback (local dev) ──────────────────────────────────
const uploadToKubo = async (fileBuffer, fileName) => {
  const { create } = require('kubo-rpc-client');
  const ipfs = create({ host: process.env.IPFS_HOST || '127.0.0.1', port: 5001, protocol: 'http' });
  const result = await ipfs.add({ path: fileName, content: fileBuffer }, { wrapWithDirectory: false });
  return result.cid.toString();
};

// ── Health check ───────────────────────────────────────────────
const getIPFSNodeInfo = async () => {
  if (PINATA_API_KEY && PINATA_SECRET_KEY) {
    return new Promise((resolve, reject) => {
      https.get({
        hostname: 'api.pinata.cloud', path: '/data/testAuthentication',
        headers: { 'pinata_api_key': PINATA_API_KEY, 'pinata_secret_api_key': PINATA_SECRET_KEY },
        timeout: 5000,
      }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          res.statusCode === 200
            ? resolve({ nodeId: 'pinata-cloud', agentVersion: 'Pinata IPFS' })
            : reject(new Error('Pinata auth failed — check your API keys'));
        });
      }).on('error', reject);
    });
  }
  const { create } = require('kubo-rpc-client');
  const ipfs = create({ host: process.env.IPFS_HOST || '127.0.0.1', port: 5001, protocol: 'http' });
  const id = await ipfs.id();
  return { nodeId: id.id.toString(), agentVersion: id.agentVersion };
};

module.exports = { uploadToIPFS, downloadFromIPFS, getIPFSNodeInfo };

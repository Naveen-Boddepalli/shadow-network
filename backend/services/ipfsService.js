// IPFS storage. Uses Pinata when PINATA_API_KEY/PINATA_SECRET_KEY are set
// (production); otherwise talks to a local Kubo node (development).

const { httpError } = require('../utils/httpError');

const PINATA_API_KEY    = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_GATEWAY    = (process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud').replace(/\/$/, '');
const usePinata         = Boolean(PINATA_API_KEY && PINATA_SECRET_KEY);

const pinataHeaders = {
  pinata_api_key:        PINATA_API_KEY,
  pinata_secret_api_key: PINATA_SECRET_KEY,
};

// ── Kubo (local node) ──────────────────────────────────────────
// kubo-rpc-client is ESM-only, so it has to be loaded with import().
let kuboClient;
const getKubo = async () => {
  if (!kuboClient) {
    const { create } = await import('kubo-rpc-client');
    kuboClient = create({
      host:     process.env.IPFS_HOST     || '127.0.0.1',
      port:     Number(process.env.IPFS_PORT) || 5001,
      protocol: process.env.IPFS_PROTOCOL || 'http',
    });
  }
  return kuboClient;
};

const kuboError = (err) =>
  err.cause?.code === 'ECONNREFUSED' || err.code === 'ECONNREFUSED'
    ? httpError(503, 'Local IPFS node is not running. Start it with: ipfs daemon')
    : err;

// ── Upload ─────────────────────────────────────────────────────

const uploadToPinata = async (fileBuffer, fileName, mimeType) => {
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);

  let res;
  try {
    res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: pinataHeaders,
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw httpError(503, `Could not reach Pinata: ${err.name === 'TimeoutError' ? 'upload timed out' : err.message}`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.IpfsHash) {
    const reason = data.error?.details || data.error?.reason || data.error || `HTTP ${res.status}`;
    throw httpError(502, `Pinata upload failed: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`);
  }
  return data.IpfsHash;
};

const uploadToKubo = async (fileBuffer) => {
  try {
    const ipfs = await getKubo();
    // ipfs.add pins by default; the explicit pin is a no-op safeguard against GC.
    const { cid } = await ipfs.add(fileBuffer, { pin: true });
    await ipfs.pin.add(cid);
    return cid.toString();
  } catch (err) {
    throw kuboError(err);
  }
};

const uploadToIPFS = (fileBuffer, fileName, mimeType = 'application/octet-stream') =>
  usePinata ? uploadToPinata(fileBuffer, fileName, mimeType) : uploadToKubo(fileBuffer);

// ── Download ───────────────────────────────────────────────────

const downloadFromGateway = async (cid) => {
  let res;
  try {
    res = await fetch(`${PINATA_GATEWAY}/ipfs/${cid}`, { signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw httpError(504, `IPFS gateway did not respond: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
  }
  if (res.status === 404) throw httpError(404, 'File not found on IPFS');
  if (!res.ok) throw httpError(502, `IPFS gateway error (HTTP ${res.status})`);
  return Buffer.from(await res.arrayBuffer());
};

const downloadFromKubo = async (cid) => {
  try {
    const ipfs = await getKubo();
    const chunks = [];
    for await (const chunk of ipfs.cat(cid, { timeout: 30_000 })) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (err) {
    throw kuboError(err);
  }
};

const downloadFromIPFS = (cid) => (usePinata ? downloadFromGateway(cid) : downloadFromKubo(cid));

// ── Health check ───────────────────────────────────────────────

const getIPFSNodeInfo = async () => {
  if (usePinata) {
    const res = await fetch('https://api.pinata.cloud/data/testAuthentication', {
      headers: pinataHeaders,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error('Pinata authentication failed; check the API keys');
    return { provider: 'pinata', nodeId: 'pinata-cloud' };
  }
  const ipfs = await getKubo();
  const id = await ipfs.id({ timeout: 5000 });
  return { provider: 'kubo', nodeId: id.id.toString(), agentVersion: id.agentVersion };
};

module.exports = { uploadToIPFS, downloadFromIPFS, getIPFSNodeInfo };

// src/services/p2p.js
// P2P service using Helia + libp2p
// Lazy loaded only when P2P mode is enabled

let heliaNode = null;
let unixFsInstance = null;

export const initHelia = async () => {
  if (heliaNode) return { helia: heliaNode, fs: unixFsInstance };
  try {
    const [
      { createHelia },
      { unixfs },
      { MemoryBlockstore },
      { MemoryDatastore },
    ] = await Promise.all([
      import('helia'),
      import('@helia/unixfs'),
      import('blockstore-core/memory'),
      import('datastore-core/memory'),
    ]);
    const blockstore = new MemoryBlockstore();
    const datastore  = new MemoryDatastore();
    heliaNode        = await createHelia({ blockstore, datastore });
    unixFsInstance   = unixfs(heliaNode);
    console.log('✅ Helia node ready');
    return { helia: heliaNode, fs: unixFsInstance };
  } catch (err) {
    console.error('Helia init failed:', err);
    throw err;
  }
};

export const uploadToHelia = async (file) => {
  const { fs } = await initHelia();
  const buffer = await file.arrayBuffer();
  const cid    = await fs.addFile({ path: file.name, content: new Uint8Array(buffer) });
  return cid.toString();
};

export const downloadFromHelia = async (cidString) => {
  const { fs } = await initHelia();
  const { CID } = await import('multiformats/cid');
  const cid    = CID.parse(cidString);
  const chunks = [];
  for await (const chunk of fs.cat(cid)) chunks.push(chunk);
  const total  = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let offset   = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
};

export const getP2PStatus = async () => {
  if (!heliaNode) return { initialized: false, peers: 0, peerId: null };
  const peers = heliaNode.libp2p?.getPeers() || [];
  return {
    initialized: true,
    peerId:  heliaNode.libp2p?.peerId?.toString() || null,
    peers:   peers.length,
    peerIds: peers.map((p) => p.toString()),
    started: true,
  };
};

export const stopHelia = async () => {
  if (heliaNode) { await heliaNode.stop(); heliaNode = null; unixFsInstance = null; }
};

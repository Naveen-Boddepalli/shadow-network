// src/services/p2p.js
// Helia + libp2p browser P2P — with identify service fix

let heliaNode = null;
let unixFsInstance = null;

export const initHelia = async () => {
  if (heliaNode) return { helia: heliaNode, fs: unixFsInstance };
  try {
    const { createHelia }        = await import('helia');
    const { unixfs }             = await import('@helia/unixfs');
    const { createLibp2p }       = await import('libp2p');
    const { webSockets }         = await import('@libp2p/websockets');
    const { noise }              = await import('@chainsafe/libp2p-noise');
    const { yamux }              = await import('@chainsafe/libp2p-yamux');
    const { identify }           = await import('@libp2p/identify');
    const { MemoryBlockstore }   = await import('blockstore-core');
    const { MemoryDatastore }    = await import('datastore-core');

    const blockstore = new MemoryBlockstore();
    const datastore  = new MemoryDatastore();

    const libp2p = await createLibp2p({
      transports:  [webSockets()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),   // ← fixes the error you saw
      },
    });

    heliaNode      = await createHelia({ libp2p, blockstore, datastore });
    unixFsInstance = unixfs(heliaNode);

    heliaNode.libp2p.addEventListener('peer:connect', (evt) => {
      console.log('✅ Peer connected:', evt.detail.toString());
    });

    console.log('✅ Helia node ready:', heliaNode.libp2p.peerId.toString());
    return { helia: heliaNode, fs: unixFsInstance };
  } catch (err) {
    console.error('❌ Helia init failed:', err);
    throw err;
  }
};

export const uploadToHelia = async (file) => {
  const { fs } = await initHelia();
  const buffer = await file.arrayBuffer();
  const cid    = await fs.addFile({
    path: file.name,
    content: new Uint8Array(buffer),
  });
  console.log('📦 File added to Helia:', cid.toString());
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
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

export const getP2PStatus = async () => {
  if (!heliaNode) return { initialized: false, peers: 0, peerId: null };
  const peers = heliaNode.libp2p?.getPeers() || [];
  return {
    initialized: true,
    peerId:      heliaNode.libp2p?.peerId?.toString() || null,
    peers:       peers.length,
    peerIds:     peers.map((p) => p.toString()),
    started:     heliaNode.libp2p?.status === 'started',
  };
};

export const stopHelia = async () => {
  if (heliaNode) {
    await heliaNode.stop();
    heliaNode      = null;
    unixFsInstance = null;
    console.log('🛑 Helia node stopped');
  }
};

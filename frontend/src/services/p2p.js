// src/services/p2p.js
// Phase 5: Browser-native IPFS using Helia + libp2p.
//
// How it works:
//   - Helia is a lightweight IPFS implementation that runs entirely in the browser
//   - libp2p handles peer discovery and transport (WebRTC for browser-to-browser)
//   - On the same campus LAN, peers find each other via:
//     a) Bootstrap nodes (if backend is running)
//     b) mDNS (automatic local network discovery — works offline)
//   - Files are chunked and transferred over WebRTC DataChannels
//
// This module is loaded lazily — only when P2P mode is enabled.

let heliaNode = null;        // Helia instance (browser IPFS node)
let unixFsInstance = null;   // UnixFS — file chunking/reassembly layer

/**
 * Initialize the Helia node with libp2p.
 * Call this once when the app starts in P2P mode.
 * Returns { helia, fs } or throws if browser doesn't support WebRTC.
 */
export const initHelia = async () => {
  if (heliaNode) return { helia: heliaNode, fs: unixFsInstance };

  // Lazy import — these are large, only load when needed
  const { createHelia }   = await import('helia');
  const { unixfs }        = await import('@helia/unixfs');
  const { createLibp2p }  = await import('libp2p');
  const { webRTC }        = await import('@libp2p/webrtc');
  const { webSockets }    = await import('@libp2p/websockets');
  const { bootstrap }     = await import('@libp2p/bootstrap');
  const { kadDHT }        = await import('@libp2p/kad-dht');
  const { MemoryBlockstore } = await import('blockstore-core');
  const { MemoryDatastore }  = await import('datastore-core');

  console.log('🌐 Initializing Helia P2P node...');

  const blockstore = new MemoryBlockstore();
  const datastore  = new MemoryDatastore();

  // Bootstrap peers — public IPFS nodes that help with initial discovery
  // In production, replace with your own campus relay/bootstrap nodes
  const bootstrapList = [
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
    '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
  ];

  const libp2p = await createLibp2p({
    transports: [
      webRTC(),         // Browser-to-browser (campus P2P — no server needed)
      webSockets(),     // Browser-to-server (fallback when server is available)
    ],
    peerDiscovery: [
      bootstrap({ list: bootstrapList }),
    ],
    services: {
      dht: kadDHT(),    // Kademlia DHT for distributed peer/content routing
    },
  });

  heliaNode = await createHelia({ libp2p, blockstore, datastore });
  unixFsInstance = unixfs(heliaNode);

  // Log peer connections for debugging
  heliaNode.libp2p.addEventListener('peer:connect', (evt) => {
    console.log(`✅ P2P peer connected: ${evt.detail.toString()}`);
  });
  heliaNode.libp2p.addEventListener('peer:disconnect', (evt) => {
    console.log(`❌ P2P peer disconnected: ${evt.detail.toString()}`);
  });

  console.log(`🆔 Our peer ID: ${heliaNode.libp2p.peerId.toString()}`);
  console.log('✅ Helia node ready');

  return { helia: heliaNode, fs: unixFsInstance };
};

/**
 * Upload a file to the browser's local Helia node.
 * The file is chunked and stored in the local blockstore.
 * Other peers on the same network can retrieve it by CID.
 *
 * @param {File} file  — Browser File object from input[type=file]
 * @returns {Promise<string>}  CID string
 */
export const uploadToHelia = async (file) => {
  const { fs } = await initHelia();
  const buffer = await file.arrayBuffer();
  const bytes  = new Uint8Array(buffer);

  // Add file to local blockstore — returns a CID object
  const cid = await fs.addFile({
    path: file.name,
    content: bytes,
  });

  console.log(`📦 File added to Helia: ${cid.toString()}`);
  return cid.toString();
};

/**
 * Download a file from the P2P network by CID.
 * Helia will try: local blockstore → connected peers → DHT routing.
 * On campus LAN this finds the file from classmates' browsers.
 *
 * @param {string} cidString  CID string
 * @returns {Promise<Uint8Array>}  File bytes
 */
export const downloadFromHelia = async (cidString) => {
  const { fs } = await initHelia();
  const { CID } = await import('multiformats/cid');

  const cid    = CID.parse(cidString);
  const chunks = [];

  for await (const chunk of fs.cat(cid)) {
    chunks.push(chunk);
  }

  // Merge all chunks into a single Uint8Array
  const total  = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset   = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
};

/**
 * Get current P2P node status.
 * Returns peer count, our peer ID, and connection state.
 */
export const getP2PStatus = async () => {
  if (!heliaNode) return { initialized: false, peers: 0, peerId: null };

  const peers = heliaNode.libp2p.getPeers();
  return {
    initialized: true,
    peerId:      heliaNode.libp2p.peerId.toString(),
    peers:       peers.length,
    peerIds:     peers.map((p) => p.toString()),
    started:     heliaNode.libp2p.status === 'started',
  };
};

/**
 * Stop the Helia node cleanly (call on app unmount).
 */
export const stopHelia = async () => {
  if (heliaNode) {
    await heliaNode.stop();
    heliaNode      = null;
    unixFsInstance = null;
    console.log('🛑 Helia node stopped');
  }
};

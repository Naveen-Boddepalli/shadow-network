// src/services/p2p.js
// P2P stub — Helia/libp2p removed from bundle to fix Vercel build
// P2P works in local dev only (run: npm install helia @helia/unixfs libp2p)

export const initHelia = async () => {
  throw new Error('P2P requires local dev setup. See README.');
};

export const uploadToHelia = async (file) => {
  throw new Error('P2P not available in production build.');
};

export const downloadFromHelia = async (cidString) => {
  throw new Error('P2P not available in production build.');
};

export const getP2PStatus = async () => ({
  initialized: false,
  peers: 0,
  peerId: null,
  started: false,
});

export const stopHelia = async () => {};

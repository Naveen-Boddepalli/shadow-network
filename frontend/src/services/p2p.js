// src/services/p2p.js
// Phase 5: Browser-native IPFS using Helia and libp2p.
// Connects to public bootstrap nodes and discovers peers via WebRTC and Circuit Relays.

import { createHelia } from 'helia';
import { unixfs } from '@helia/unixfs';
import { createLibp2p } from 'libp2p';
import { webRTC } from '@libp2p/webrtc';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';

let heliaInstance = null;
let unixFsInstance = null;

export const initHelia = async () => {
  if (heliaInstance) return heliaInstance;

  try {
    const libp2p = await createLibp2p({
      addresses: {
        listen: [
          // Listen for webRTC connections
          '/webrtc'
        ]
      },
      transports: [
        webSockets(),
        webRTC(),
        circuitRelayTransport({
          discoverRelays: 1
        })
      ],
      connectionEncryption: [noise()],
      streamMuxers: [yamux()],
      peerDiscovery: [
        bootstrap({
          list: [
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDuVkcruPhcoX21W32nDBi4uT4hHtr1bHapKqfndT',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
            '/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjWZcYWziX6',
            '/dns4/node0.preload.ipfs.io/tcp/443/wss/p2p/QmZMxNdpMkewiVShirYBVRxxAebwu6zzyo5471TqWntE1N',
            '/dns4/node1.preload.ipfs.io/tcp/443/wss/p2p/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzCQ8N5hU',
            '/dns4/node2.preload.ipfs.io/tcp/443/wss/p2p/QmV7gnbW5VTssk8Z5XN5EaGpsB79s3BmeH1Wb72X8Z2V3U',
            '/dns4/node3.preload.ipfs.io/tcp/443/wss/p2p/Y7sXvFS3U1zcbEAnWGBQkEMkEqZk8A53x2s9A1w1Mv2f4XQ',
          ]
        })
      ],
      services: {
        identify: identify()
      }
    });

    heliaInstance = await createHelia({
      libp2p
    });

    unixFsInstance = unixfs(heliaInstance);

    console.log('✅ Helia Node started with peer ID:', heliaInstance.libp2p.peerId.toString());

    // Listen for peer connections
    heliaInstance.libp2p.addEventListener('peer:connect', (evt) => {
      console.log('🔗 Connected to peer:', evt.detail.toString());
    });

    return heliaInstance;
  } catch (error) {
    console.error('Failed to initialize Helia:', error);
    throw new Error('Could not start P2P node. Check console for details.');
  }
};

export const uploadToHelia = async (file) => {
  if (!unixFsInstance) {
    throw new Error('Helia node is not running.');
  }
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    const cid = await unixFsInstance.addBytes(uint8Array);
    return cid.toString();
  } catch (error) {
    console.error('Error adding file to Helia:', error);
    throw new Error('Failed to upload file to P2P network.');
  }
};

export const downloadFromHelia = async (cidString) => {
  if (!unixFsInstance) {
    throw new Error('Helia node is not running.');
  }

  try {
    const { CID } = await import('multiformats/cid');
    const cid = CID.parse(cidString);
    
    let chunks = [];
    for await (const chunk of unixFsInstance.cat(cid)) {
      chunks.push(chunk);
    }
    
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  } catch (error) {
    console.error('Error fetching file from Helia:', error);
    throw new Error('Failed to download file from P2P network. It may not be available.');
  }
};

export const getP2PStatus = async () => {
  if (!heliaInstance) {
    return {
      initialized: false,
      peers: 0,
      peerId: null,
      peerIds: [],
      started: false,
    };
  }

  const peerId = heliaInstance.libp2p.peerId.toString();
  const peers = heliaInstance.libp2p.getPeers();
  
  return {
    initialized: true,
    peers: peers.length,
    peerIds: peers.map(p => p.toString()),
    peerId: peerId,
    started: heliaInstance.libp2p.status === 'started',
  };
};

export const stopHelia = async () => {
  if (heliaInstance) {
    await heliaInstance.stop();
    heliaInstance = null;
    unixFsInstance = null;
    console.log('🛑 Helia Node stopped.');
  }
};

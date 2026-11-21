// src/services/p2p.js
// Phase 5: Browser-native IPFS using Helia and libp2p.
//
// How peers find each other:
//   1. Every browser dials the Shadow Network relay(s) listed in VITE_P2P_RELAYS
//      (a small libp2p node — see /p2p-relay — that can run on any laptop on the
//      campus LAN, no internet required).
//   2. The browser reserves a circuit-relay slot on the relay, which gives it a
//      dialable /p2p-circuit/webrtc address.
//   3. Browsers announce those addresses on a gossipsub topic (pubsub peer
//      discovery). The relay forwards the announcements to everyone.
//   4. Peers dial each other; the relay is only used for WebRTC signalling and
//      the actual file bytes flow browser-to-browser over a WebRTC DataChannel.
//
// Blocks and the node's identity are persisted in IndexedDB so files you added
// stay servable after a reload and your peer ID stays stable.

import { createHelia, libp2pDefaults } from 'helia';
import { unixfs } from '@helia/unixfs';
import { gossipsub } from '@libp2p/gossipsub';
import { pubsubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';
import { KEEP_ALIVE } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import { multiaddr } from '@multiformats/multiaddr';
import { CID } from 'multiformats/cid';
import { IDBBlockstore } from 'blockstore-idb';
import { IDBDatastore } from 'datastore-idb';

export const DISCOVERY_TOPIC = 'shadow-network._peer-discovery._p2p._pubsub';

const DOWNLOAD_TIMEOUT_MS = 60_000;

// Comma-separated multiaddrs of Shadow Network relays, e.g.
// /ip4/192.168.1.20/tcp/9090/ws/p2p/12D3KooW...
const RELAYS = (import.meta.env.VITE_P2P_RELAYS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// When false, skip the public IPFS bootstrap nodes / delegated routing and
// only talk to the configured relay(s). Useful for a pure offline LAN.
const USE_PUBLIC_NETWORK = import.meta.env.VITE_P2P_PUBLIC_NETWORK !== 'false';

let heliaInstance = null;
let unixFsInstance = null;
let initPromise = null;
const relayPeerIds = new Set();
let shadowDiscovery = null;

const buildLibp2pConfig = () => {
  const config = libp2pDefaults();

  // Shared pubsub so Shadow Network peers can announce themselves.
  config.services.pubsub = gossipsub({
    allowPublishToZeroTopicPeers: true,
  });

  config.peerDiscovery = [
    ...(USE_PUBLIC_NETWORK ? config.peerDiscovery : []),
    // Keep a handle on the discovery module so we can react to every
    // announcement (libp2p's own peer:discovery only fires for peers that
    // are new to the persisted peer store).
    (components) => {
      shadowDiscovery = pubsubPeerDiscovery({ topics: [DISCOVERY_TOPIC], interval: 10_000 })(components);
      return shadowDiscovery;
    },
  ];

  if (!USE_PUBLIC_NETWORK) {
    delete config.services.delegatedRouting;
    delete config.services.autoNAT;
  }

  // libp2p's browser default refuses insecure ws:// and private (LAN) IPs,
  // which is exactly what a campus relay looks like. Allow them.
  config.connectionGater = {
    denyDialMultiaddr: () => false,
  };

  return config;
};

const connectToRelays = async (libp2p) => {
  await Promise.allSettled(
    RELAYS.map(async (addr) => {
      const ma = multiaddr(addr);
      const peerId = ma.getComponents().findLast((c) => c.name === 'p2p')?.value;
      if (peerId) relayPeerIds.add(peerId);
      try {
        await libp2p.dial(ma);
        console.log('🛰  Connected to relay:', addr);
      } catch (err) {
        console.warn('Could not reach relay', addr, err.message);
      }
      // Tag the relay keep-alive so libp2p reconnects if the link drops.
      // Done *after* the first dial: tagging triggers libp2p's own reconnect
      // dial, and two simultaneous dials leave a duplicate connection whose
      // teardown kills the relay's gossipsub stream.
      if (peerId) {
        await libp2p.peerStore.merge(peerIdFromString(peerId), {
          multiaddrs: [ma],
          tags: { [KEEP_ALIVE]: { value: 100 } },
        });
      }
    })
  );
};

const WATCHDOG_MS = 15_000;
let watchdog = null;

// Safety net. Gossipsub tracks one outbound stream per peer, not per
// connection, so overlapping connections (quick page reloads, relay restarts)
// can leave the relay link connected but deaf. p2p-relay repairs this on its
// side; this also covers older relays. Detect it — relay connected but not a
// topic subscriber — and reconnect for fresh streams.
const healRelayLinks = async (libp2p) => {
  const subscribers = new Set(
    libp2p.services.pubsub.getSubscribers(DISCOVERY_TOPIC).map((p) => p.toString())
  );
  for (const relay of relayPeerIds) {
    const peerId = peerIdFromString(relay);
    if (libp2p.getConnections(peerId).length === 0) {
      libp2p.dial(peerId).catch(() => {}); // relay down — keep trying
    } else if (!subscribers.has(relay)) {
      console.warn('Relay pubsub link is stale — reconnecting');
      try {
        await libp2p.hangUp(peerId);
        await libp2p.dial(peerId);
      } catch (err) {
        console.debug('Relay reconnect failed', err.message);
      }
    }
  }
};

const dialing = new Set();

const dialDiscoveredPeer = async (libp2p, { id, multiaddrs }) => {
  const peer = id.toString();
  if (peer === libp2p.peerId.toString() || relayPeerIds.has(peer) || dialing.has(peer)) return;
  if (libp2p.getConnections(id).some((c) => c.limits == null)) return; // already directly connected

  // Prefer the relayed WebRTC address: the relay only does signalling and the
  // resulting connection is direct and unlimited.
  const webrtcAddrs = (multiaddrs || []).filter((ma) => ma.toString().includes('/p2p-circuit/webrtc'));
  if (webrtcAddrs.length === 0) return; // not a Shadow Network browser peer

  dialing.add(peer);
  try {
    for (const ma of webrtcAddrs) {
      try {
        await libp2p.dial(ma, { signal: AbortSignal.timeout(20_000) });
        return;
      } catch (err) {
        console.debug('Dial failed', ma.toString(), err.message);
      }
    }
  } finally {
    dialing.delete(peer);
  }
};

const startHelia = async () => {
  const blockstore = new IDBBlockstore('shadow-network/blocks');
  const datastore = new IDBDatastore('shadow-network/datastore');
  await blockstore.open();
  await datastore.open();

  const helia = await createHelia({
    blockstore,
    datastore,
    libp2p: buildLibp2pConfig(),
  });

  helia.libp2p.addEventListener('peer:connect', (evt) => {
    console.log('🔗 Connected to peer:', evt.detail.toString());
  });

  // libp2p v3 no longer auto-dials discovered peers, so dial Shadow Network
  // peers ourselves whenever their announcement arrives via pubsub.
  shadowDiscovery?.addEventListener('peer', (evt) => {
    dialDiscoveredPeer(helia.libp2p, evt.detail);
  });

  console.log('✅ Helia node started with peer ID:', helia.libp2p.peerId.toString());

  if (RELAYS.length === 0) {
    console.warn(
      'VITE_P2P_RELAYS is not set — browsers will not be able to discover each other. ' +
      'Run the relay in /p2p-relay and set VITE_P2P_RELAYS to the address it prints.'
    );
  }
  // Don't block startup on the relay; discovery continues in the background.
  connectToRelays(helia.libp2p);
  watchdog = setInterval(() => healRelayLinks(helia.libp2p), WATCHDOG_MS);

  heliaInstance = helia;
  unixFsInstance = unixfs(helia);
  if (import.meta.env.DEV) globalThis.helia = helia; // handy for debugging in devtools
  return helia;
};

export const initHelia = () => {
  if (!initPromise) {
    initPromise = startHelia().catch((error) => {
      initPromise = null;
      console.error('Failed to initialize Helia:', error);
      throw new Error(`Could not start P2P node: ${error.message}`);
    });
  }
  return initPromise;
};

export const uploadToHelia = async (file) => {
  if (!unixFsInstance) {
    throw new Error('Helia node is not running.');
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const cid = await unixFsInstance.addBytes(bytes);
    // Pin so the blocks survive any garbage collection of the IndexedDB store.
    // Re-adding the same file yields the same CID, which is already pinned.
    if (!(await heliaInstance.pins.isPinned(cid))) {
      for await (const _ of heliaInstance.pins.add(cid)) { /* drain */ }
    }
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

  let cid;
  try {
    cid = CID.parse(cidString);
  } catch {
    throw new Error('That does not look like a valid CID.');
  }

  try {
    const chunks = [];
    for await (const chunk of unixFsInstance.cat(cid, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })) {
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
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('Timed out — no connected peer has this file. Make sure the peer who added it is online.');
    }
    throw new Error('Failed to download file from P2P network. It may not be available.');
  }
};

export const dialPeer = async (address) => {
  if (!heliaInstance) throw new Error('Helia node is not running.');
  let ma;
  try {
    ma = multiaddr(address.trim());
  } catch {
    throw new Error('Invalid multiaddr.');
  }
  await heliaInstance.libp2p.dial(ma, { signal: AbortSignal.timeout(20_000) });
};

export const getP2PStatus = async () => {
  if (!heliaInstance) {
    return {
      initialized: false,
      peers: 0,
      peerId: null,
      peerIds: [],
      shadowPeerIds: [],
      multiaddrs: [],
      relayConfigured: RELAYS.length > 0,
      relayConnected: false,
      started: false,
    };
  }

  const { libp2p } = heliaInstance;
  const peers = libp2p.getPeers().map((p) => p.toString());
  const subscribers = libp2p.services.pubsub
    .getSubscribers(DISCOVERY_TOPIC)
    .map((p) => p.toString());
  const shadowPeerIds = subscribers.filter((p) => !relayPeerIds.has(p) && peers.includes(p));

  return {
    initialized: true,
    peers: peers.length,
    peerIds: peers,
    shadowPeerIds,
    peerId: libp2p.peerId.toString(),
    multiaddrs: libp2p.getMultiaddrs().map((ma) => ma.toString()),
    relayConfigured: RELAYS.length > 0,
    relayConnected: peers.some((p) => relayPeerIds.has(p)),
    started: libp2p.status === 'started',
  };
};

export const stopHelia = async () => {
  const pending = initPromise;
  initPromise = null;
  clearInterval(watchdog);
  watchdog = null;
  if (!pending) return;
  const helia = await pending.catch(() => null);
  if (helia) {
    await helia.stop();
    heliaInstance = null;
    unixFsInstance = null;
    console.log('🛑 Helia node stopped.');
  }
};

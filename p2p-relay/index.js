// Shadow Network campus relay
//
// Browsers can't discover or dial each other directly. This node gives them a
// meeting point on the LAN (no internet needed):
//   - Circuit Relay v2 server: browsers reserve a slot and get a dialable
//     /p2p-circuit/webrtc address. The relay only carries the WebRTC handshake;
//     file bytes then flow browser-to-browser.
//   - Gossipsub: forwards peer-discovery announcements on the Shadow Network
//     topic so browsers learn each other's addresses.
//
// Usage:  npm start           (listens on ws://0.0.0.0:9090)
// Env:    RELAY_PORT=9090   (falls back to PORT, which Render sets)
//         RELAY_ANNOUNCE=/dns4/relay.example.com/tcp/443/wss   (optional, comma-separated;
//                         use when behind a TLS proxy). On Render this is derived
//                         automatically from RENDER_EXTERNAL_HOSTNAME.
//         RELAY_SEED=<random string>  (optional; derives a stable identity on hosts
//                         with an ephemeral disk, e.g. Render's free tier)
//         RELAY_KEY_FILE=.relay-key   (persisted identity when RELAY_SEED is unset)
//
// Browsers don't need the relay's peer ID: they can dial e.g.
// /dns4/<host>/tcp/443/wss and learn it on connect, so a changing identity is
// harmless. A stable one just makes the printed addresses reusable.

import { readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { createLibp2p } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { gossipsub } from '@libp2p/gossipsub';
import { generateKeyPair, generateKeyPairFromSeed, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys';
import { createHash } from 'node:crypto';

// Must match DISCOVERY_TOPIC in frontend/src/services/p2p.js
const DISCOVERY_TOPIC = 'shadow-network._peer-discovery._p2p._pubsub';

const PORT = Number(process.env.RELAY_PORT || process.env.PORT || 9090);
const KEY_FILE = process.env.RELAY_KEY_FILE || new URL('./.relay-key', import.meta.url).pathname;
const RENDER_HOST = process.env.RENDER_EXTERNAL_HOSTNAME;
const ANNOUNCE = (process.env.RELAY_ANNOUNCE || (RENDER_HOST ? `/dns4/${RENDER_HOST}/tcp/443/wss` : ''))
  .split(',').map((s) => s.trim()).filter(Boolean);

const loadOrCreateKey = async () => {
  if (process.env.RELAY_SEED) {
    const seed = createHash('sha256').update(process.env.RELAY_SEED).digest();
    return generateKeyPairFromSeed('Ed25519', seed);
  }
  try {
    return privateKeyFromProtobuf(await readFile(KEY_FILE));
  } catch {
    const key = await generateKeyPair('Ed25519');
    await writeFile(KEY_FILE, privateKeyToProtobuf(key), { mode: 0o600 });
    return key;
  }
};

const node = await createLibp2p({
  privateKey: await loadOrCreateKey(),
  addresses: {
    listen: [`/ip4/0.0.0.0/tcp/${PORT}/ws`],
    ...(ANNOUNCE.length ? { announce: ANNOUNCE } : {}),
  },
  transports: [webSockets()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionManager: {
    maxConnections: 1000,
  },
  services: {
    identify: identify(),
    ping: ping(),
    relay: circuitRelayServer({
      reservations: {
        maxReservations: 1000,
      },
    }),
    pubsub: gossipsub({
      allowPublishToZeroTopicPeers: true,
      // Forward messages we aren't the origin of — that's the whole point.
      canRelayMessage: true,
    }),
  },
});

// Subscribing makes the relay part of the topic mesh so it forwards announcements.
node.services.pubsub.subscribe(DISCOVERY_TOPIC);

// Gossipsub keeps one outbound stream per peer and only resets it on
// peer:disconnect, i.e. when the peer's *last* connection closes. A browser
// reload often opens the new connection before the old one is torn down, which
// leaves gossipsub writing into the dead connection's stream forever and the
// reloaded browser never hears announcements. When a connection closes but the
// peer is still connected, move gossipsub's outbound stream onto the live one.
node.addEventListener('connection:close', (evt) => {
  const closed = evt.detail;
  const peerId = closed.remotePeer;
  const live = node.getConnections(peerId).find((c) => c.status === 'open' && c.id !== closed.id);
  if (!live) return; // normal disconnect — gossipsub handles it

  const pubsub = node.services.pubsub;
  const id = peerId.toString();
  const stale = pubsub.streamsOutbound?.get(id);
  if (stale == null || pubsub.outboundInflightQueue == null) return;
  if (live.streams.includes(stale.rawStream)) return; // already on the live connection

  stale.close().catch(() => {});
  pubsub.streamsOutbound.delete(id);
  pubsub.outboundInflightQueue.push({ peerId, connection: live });
});

node.addEventListener('peer:connect', (evt) => {
  console.log(`+ peer ${evt.detail.toString()}  (${node.getPeers().length} connected)`);
});
node.addEventListener('peer:disconnect', (evt) => {
  console.log(`- peer ${evt.detail.toString()}  (${node.getPeers().length} connected)`);
});

const peerId = node.peerId.toString();
const lanAddrs = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `/ip4/${i.address}/tcp/${PORT}/ws/p2p/${peerId}`);

console.log('\n🛰  Shadow Network relay running');
console.log(`   Peer ID: ${peerId}\n`);
console.log('Set VITE_P2P_RELAYS in frontend/.env to one of these (the /p2p/... suffix is optional):');
const shown = ANNOUNCE.length
  ? ANNOUNCE.map((a) => `${a}/p2p/${peerId}`)
  : [`/ip4/127.0.0.1/tcp/${PORT}/ws/p2p/${peerId}`, ...lanAddrs];
for (const a of shown) {
  console.log(`   ${a}`);
}
console.log('');

const shutdown = async () => {
  await node.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

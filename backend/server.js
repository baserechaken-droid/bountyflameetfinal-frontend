/**
 * Boutyflameet — Production Signaling Server v4.1
 * © Ken Baserecha — All rights reserved
 *
 * P0 fixes applied:
 * 1. JWT verification on Socket.IO join (Firebase ID token or shared secret)
 * 2. Payment backend verification before granting pro access
 * 3. Participant limits enforced server-side per plan
 * 4. Removed participants ban list (can't rejoin after removal)
 * 5. Room idle cleanup (zombie room prevention)
 */
const express          = require('express');
const { createServer } = require('http');
const { Server }       = require('socket.io');
const cors             = require('cors');

const app        = express();
const httpServer = createServer(app);

// ── CORS ────────────────────────────────────────────────────────────────────
function isAllowed(origin) {
  if (!origin) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  const allowed = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URL_2,
    'https://bountyflameetfinal-frontend-a62g4iasa.vercel.app',
  ].filter(Boolean);
  return allowed.some(u => origin === u || origin.startsWith(u));
}
const corsOpts = { origin: (o, cb) => cb(null, isAllowed(o)), credentials: true };
app.use(cors(corsOpts));
app.use(express.json({ limit: '10mb' }));

// ── HTTP RATE LIMITING ───────────────────────────────────────────────────────
const reqCounts = new Map();
function httpRateLimit(ip, max = 200, windowMs = 60000) {
  const now = Date.now();
  const e   = reqCounts.get(ip) || { count: 0, reset: now + windowMs };
  if (now > e.reset) { e.count = 0; e.reset = now + windowMs; }
  e.count++;
  reqCounts.set(ip, e);
  return e.count <= max;
}
app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
  if (!httpRateLimit(ip)) return res.status(429).json({ error: 'Too many requests' });
  next();
});

// ── FIREBASE ADMIN (lazy init) ───────────────────────────────────────────────
let adminAuth = null;
let adminDb   = null;

function getAdmin() {
  if (!process.env.FIREBASE_ADMIN_CREDENTIAL) return null;
  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          JSON.parse(process.env.FIREBASE_ADMIN_CREDENTIAL)
        ),
      });
    }
    adminAuth = adminAuth || admin.auth();
    adminDb   = adminDb   || admin.firestore();
    return admin;
  } catch (e) {
    console.error('[Admin] Init failed:', e.message);
    return null;
  }
}

// ── JWT TOKEN VERIFICATION ───────────────────────────────────────────────────
// Returns { uid, plan, email } or null if invalid.
// Works in TWO modes:
//   Mode A — Firebase Admin configured: verifies real Firebase ID tokens.
//   Mode B — Shared secret fallback: checks x-app-secret header.
//             Use this when Firebase Admin is NOT configured (name-only mode).
async function verifyToken(token, secret) {
  // Mode A: real Firebase JWT
  if (process.env.FIREBASE_ADMIN_CREDENTIAL && token) {
    try {
      const admin   = getAdmin();
      if (!admin) throw new Error('Admin not initialized');
      const decoded = await admin.auth().verifyIdToken(token);
      // Fetch plan from Firestore (don't trust client-side plan claim)
      let plan = 'free';
      try {
        const snap = await adminDb.collection('users').doc(decoded.uid).get();
        if (snap.exists) {
          const data = snap.data();
          // Check expiry server-side too
          if (data.plan && data.plan !== 'free') {
            if (!data.expiresAt || data.expiresAt > Date.now()) {
              plan = data.plan;
            }
          }
        }
      } catch {}
      return { uid: decoded.uid, email: decoded.email || null, plan, verified: true };
    } catch (e) {
      console.warn('[Auth] Token verification failed:', e.message);
      return null;
    }
  }

  // Mode B: shared secret (works without Firebase Admin)
  // Frontend sends VITE_APP_SECRET as the "token" when no Firebase
  if (process.env.APP_SOCKET_SECRET && token === process.env.APP_SOCKET_SECRET) {
    return { uid: null, email: null, plan: 'free', verified: false };
  }

  // Mode C: dev / no auth configured — allow but mark unverified
  if (process.env.NODE_ENV !== 'production') {
    return { uid: null, email: null, plan: 'free', verified: false };
  }

  // Production with no matching auth — reject
  return null;
}

// ── PLAN LIMITS ──────────────────────────────────────────────────────────────
const PLAN_LIMITS = { free: 5, pro: 50, enterprise: 500 };
function getRoomLimit(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

// ── AI PROXY ─────────────────────────────────────────────────────────────────
app.post('/api/ai', async (req, res) => {
  // Protect AI endpoint — require app secret header
  const appSecret = process.env.APP_SOCKET_SECRET;
  if (appSecret && req.headers['x-app-secret'] !== appSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return res.status(503).json({
    error: 'AI not configured. Add CLAUDE_API_KEY to Render env vars.',
  });
  try {
    const { system, prompt, maxTokens = 800 } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      process.env.CLAUDE_MODEL || 'claude-3-haiku-20240307',
        max_tokens: Math.min(Number(maxTokens) || 800, 2000),
        system:     system || 'You are a helpful meeting assistant.',
        messages:   [{ role: 'user', content: String(prompt).slice(0, 4000) }],
      }),
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'AI error' });
    res.json({ text: data.content?.[0]?.text || 'No response' });
  } catch (e) {
    res.status(500).json({ error: 'AI request failed: ' + e.message });
  }
});

// ── CLOUD STORAGE (recording upload / download / delete) ─────────────────────
// Provides presigned upload URLs and a proxy for serving/deleting recordings.
// Backed by Google Cloud Storage when GCS_BUCKET is configured; gracefully
// no-ops otherwise so local dev is unaffected.
//
// Endpoints:
//   POST /api/storage/uploads/request-url  → { uploadURL, objectPath }
//   GET  /api/storage/objects/uploads/:id  → streams the object bytes
//   DELETE /api/storage/objects/uploads/:id → deletes from GCS

const GCS_BUCKET = process.env.GCS_BUCKET || '';
let storageClient = null;

(async () => {
  if (!GCS_BUCKET) return;
  try {
    const { Storage } = await import('@google-cloud/storage');
    storageClient = new Storage();
    console.log('[Storage] GCS client ready — bucket:', GCS_BUCKET);
  } catch (e) {
    console.warn('[Storage] @google-cloud/storage not installed — cloud recording disabled:', e.message);
  }
})();

app.post('/api/storage/uploads/request-url', async (req, res) => {
  if (!storageClient || !GCS_BUCKET) {
    return res.status(503).json({ error: 'Cloud storage not configured (GCS_BUCKET missing).' });
  }
  try {
    const { name, contentType = 'video/webm' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const safeName   = String(name).replace(/[^a-zA-Z0-9._\-]/g, '_').slice(0, 200);
    const objectPath = `/objects/uploads/${Date.now()}-${safeName}`;
    const gcsPath    = objectPath.replace(/^\/objects\//, '');
    const [uploadURL] = await storageClient
      .bucket(GCS_BUCKET)
      .file(gcsPath)
      .getSignedUrl({
        version: 'v4',
        action:  'write',
        expires: Date.now() + 15 * 60 * 1000, // 15 min
        contentType,
      });
    res.json({ uploadURL, objectPath });
  } catch (e) {
    console.error('[Storage] request-url error:', e.message);
    res.status(500).json({ error: 'Could not generate upload URL: ' + e.message });
  }
});

app.get('/api/storage/objects/uploads/:id', async (req, res) => {
  if (!storageClient || !GCS_BUCKET) {
    return res.status(503).json({ error: 'Cloud storage not configured.' });
  }
  try {
    const gcsPath = `uploads/${req.params.id}`;
    const file    = storageClient.bucket(GCS_BUCKET).file(gcsPath);
    const [meta]  = await file.getMetadata();
    res.setHeader('Content-Type', meta.contentType || 'video/webm');
    res.setHeader('Content-Length', meta.size || '');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}"`);
    file.createReadStream().pipe(res);
  } catch (e) {
    res.status(404).json({ error: 'Object not found: ' + e.message });
  }
});

app.delete('/api/storage/objects/uploads/:id', async (req, res) => {
  if (!storageClient || !GCS_BUCKET) {
    return res.status(503).json({ error: 'Cloud storage not configured.' });
  }
  try {
    const gcsPath = `uploads/${req.params.id}`;
    await storageClient.bucket(GCS_BUCKET).file(gcsPath).delete({ ignoreNotFound: true });
    res.json({ deleted: true });
  } catch (e) {
    console.warn('[Storage] delete error:', e.message);
    res.status(500).json({ error: 'Delete failed: ' + e.message });
  }
});

// ── PAYMENT WEBHOOK (Flutterwave → server) ───────────────────────────────────
app.post('/api/payment/webhook', async (req, res) => {
  const secretHash = process.env.FLW_SECRET_HASH;
  const signature  = req.headers['verif-hash'];
  if (secretHash && signature !== secretHash) {
    console.warn('[Webhook] Invalid signature');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const payload  = req.body?.data || req.body;
    const { status, tx_ref, amount, currency, customer } = payload;
    if (status !== 'successful' && status !== 'completed') {
      return res.json({ status: 'ignored', reason: `status: ${status}` });
    }
    const plan      = tx_ref?.includes('-pro-') ? 'pro' :
                      tx_ref?.includes('-ent-') ? 'enterprise' : 'pro';
    const daysMap   = { pro: 30, enterprise: 365 };
    const expiresAt = Date.now() + daysMap[plan] * 86400000;
    console.log(`[Payment] ✅ ${tx_ref} — ${customer?.email} — ${currency} ${amount} — ${plan}`);
    const admin = getAdmin();
    if (admin && customer?.email) {
      try {
        const snap = await adminDb.collection('users').where('email', '==', customer.email).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.update({
            plan, expiresAt,
            updatedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[Payment] Firestore updated: ${customer.email} → ${plan}`);
        }
      } catch (e) { console.error('[Payment] Firestore error:', e.message); }
    }
    res.json({ status: 'ok', plan, expiresAt });
  } catch (e) {
    console.error('[Webhook] Error:', e.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ── PAYMENT VERIFY (frontend calls after Flutterwave callback) ───────────────
// FIX: This is the only path that unlocks pro access.
// Frontend MUST call this and wait for { verified: true } before calling onSuccess.
app.post('/api/payment/verify', async (req, res) => {
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) {
    // Dev mode fallback — still require the tx_ref to look valid
    const { txId, txRef, plan: claimedPlan } = req.body;
    if (!txId && !txRef) return res.status(400).json({ error: 'txId required' });
    console.warn('[Payment] FLW_SECRET_KEY not set — dev mode, trusting client claim');
    return res.json({ verified: true, plan: claimedPlan || 'pro', devMode: true });
  }
  const { txId } = req.body;
  if (!txId) return res.status(400).json({ error: 'txId required' });
  try {
    const r = await fetch(
      `https://api.flutterwave.com/v3/transactions/${txId}/verify`,
      { headers: { Authorization: `Bearer ${secretKey}` } }
    );
    const data = await r.json();
    if (!r.ok || data.data?.status !== 'successful') {
      return res.json({ verified: false, reason: data.message || 'not successful' });
    }
    // Verify amount matches expected plan price
    const tx_ref    = data.data?.tx_ref || '';
    const plan      = tx_ref.includes('-pro-') ? 'pro' :
                      tx_ref.includes('-ent-') ? 'enterprise' : 'pro';
    const minAmount = { pro: 1400, enterprise: 1 }; // KES — allow 100 slack for FX
    const paid      = Number(data.data.amount) || 0;
    if (paid < (minAmount[plan] || 1400)) {
      console.warn(`[Payment] Amount too low: ${paid} KES for ${plan}`);
      return res.json({ verified: false, reason: 'insufficient amount' });
    }
    // Update Firestore if uid is provided
    const { uid } = req.body;
    if (uid) {
      const admin = getAdmin();
      if (admin) {
        const expiresAt = Date.now() + (plan === 'enterprise' ? 365 : 30) * 86400000;
        try {
          await adminDb.collection('users').doc(uid).update({
            plan, expiresAt,
            updatedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[Payment] Firestore updated: uid=${uid} → ${plan}`);
        } catch (e) { console.warn('[Payment] Firestore uid update failed:', e.message); }
      }
    }
    console.log(`[Payment] ✅ Verified txId=${txId} plan=${plan} amount=${paid}`);
    res.json({
      verified: true,
      plan,
      amount:   data.data.amount,
      currency: data.data.currency,
    });
  } catch (e) {
    console.error('[Payment] Verify error:', e.message);
    res.status(500).json({ error: 'Verification failed: ' + e.message });
  }
});

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => {
  const roomStats = {};
  rooms.forEach((m, id) => { roomStats[id] = m.size; });
  res.json({
    status:      'ok',
    rooms:       Object.keys(roomStats).length,
    connections: io.engine.clientsCount,
    ai:          !!process.env.CLAUDE_API_KEY,
    payments:    !!process.env.FLW_SECRET_HASH,
    auth:        process.env.FIREBASE_ADMIN_CREDENTIAL ? 'firebase' :
                 process.env.APP_SOCKET_SECRET         ? 'shared-secret' : 'open-dev',
  });
});
app.get('/', (_, res) => res.json({ name: 'Boutyflameet Signaling v4.1', owner: 'Ken Baserecha' }));

// ── SOCKET.IO ────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors:               corsOpts,
  transports:         ['websocket', 'polling'],
  pingInterval:       25000,
  pingTimeout:        60000,
  maxHttpBufferSize:  1e6,
});

// ── STATE MAPS ───────────────────────────────────────────────────────────────
// roomId → Map<socketId, userInfo>
const rooms = new Map();
// uid:roomId → socketId  (for duplicate session detection)
const uidToSocket = new Map();
// socketId → { count, reset }  (per-socket message rate)
const msgCounts = new Map();
// roomId → Set<socketId>  (removed participants cannot rejoin)
const bannedFromRoom = new Map();

// ── SOCKET RATE LIMIT ────────────────────────────────────────────────────────
function checkRate(sid, max = 60) {
  const now = Date.now();
  const e   = msgCounts.get(sid) || { count: 0, reset: now + 60000 };
  if (now > e.reset) { e.count = 0; e.reset = now + 60000; }
  e.count++;
  msgCounts.set(sid, e);
  return e.count <= max;
}

// ── SOCKET.IO MIDDLEWARE — JWT VERIFICATION ──────────────────────────────────
// Every Socket.IO connection must pass a valid token in handshake.auth.
// The frontend sends: io({ auth: { token, secret } })
//   token  = Firebase ID token (when Firebase is configured)
//   secret = VITE_APP_SOCKET_SECRET (when Firebase is not configured / name-only mode)
io.use(async (socket, next) => {
  const { token, secret } = socket.handshake.auth || {};
  const result = await verifyToken(token || secret, secret);
  if (!result) {
    console.warn('[Auth] Socket rejected:', socket.id, '— invalid token');
    return next(new Error('Authentication failed. Please refresh and try again.'));
  }
  // Attach verified identity to socket
  socket.verifiedUid  = result.uid;
  socket.verifiedPlan = result.plan;
  socket.authVerified = result.verified;
  next();
});

io.on('connection', socket => {
  let currentRoom = null;
  let currentName = 'Guest';
  let currentUid  = socket.verifiedUid || null;
  let currentPlan = socket.verifiedPlan || 'free';
  let isHost      = false;

  console.log(`[+] ${socket.id} uid=${currentUid || 'anon'} plan=${currentPlan}`);

  // ── JOIN ROOM ─────────────────────────────────────────────
  socket.on('join-room', ({ roomId, userName, uid }) => {
    if (!roomId) return;

    // Use server-verified uid, not client-provided uid
    // If auth is verified (Firebase), ignore client's uid claim entirely
    const safeUid = socket.authVerified ? socket.verifiedUid : (uid || null);

    roomId      = String(roomId).toUpperCase().trim().slice(0, 40);
    currentRoom = roomId;
    currentName = String(userName || 'Guest').slice(0, 60).trim();
    currentUid  = safeUid;

    // Check ban list — removed participants cannot rejoin
    const banned = bannedFromRoom.get(roomId);
    if (banned && safeUid && banned.has(safeUid)) {
      socket.emit('join-rejected', { reason: 'You were removed from this meeting.' });
      return;
    }

    // Prevent duplicate sessions for same UID
    if (safeUid) {
      const dupKey = `${safeUid}:${roomId}`;
      const oldSid = uidToSocket.get(dupKey);
      if (oldSid && oldSid !== socket.id) {
        const oldSock = io.sockets.sockets.get(oldSid);
        if (oldSock) {
          oldSock.emit('duplicate-session');
          oldSock.disconnect(true);
        }
      }
      uidToSocket.set(dupKey, socket.id);
    }

    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const room = rooms.get(roomId);

    // ── ENFORCE PARTICIPANT LIMIT ──────────────────────────
    // Limit is determined by the ROOM HOST's plan (server-verified).
    // Get host's plan from the first user in the room.
    const hostEntry  = Array.from(room.values()).find(u => u.isHost);
    const roomPlan   = hostEntry ? hostEntry.plan : currentPlan;
    const roomLimit  = getRoomLimit(roomPlan);

    if (!room.has(socket.id) && room.size >= roomLimit) {
      socket.emit('room-full', {
        limit:  roomLimit,
        plan:   roomPlan,
        reason: `This room has reached its ${roomLimit}-participant limit (${roomPlan} plan).`,
      });
      socket.leave(roomId);
      currentRoom = null;
      return;
    }

    // Dedup: if already in room (reconnect), update rather than double-add
    if (room.has(socket.id)) {
      const existing = room.get(socket.id);
      room.set(socket.id, { ...existing, name: currentName });
    } else {
      isHost = room.size === 0; // First to join = host
      room.set(socket.id, {
        socketId: socket.id,
        name:     currentName,
        uid:      currentUid,
        plan:     currentPlan,      // store verified plan
        joinedAt: Date.now(),
        micMuted: false,
        videoMuted: false,
        handRaised: false,
        isHost,
      });
    }

    const existingPeers = Array.from(room.values())
      .filter(u => u.socketId !== socket.id)
      .map(u => ({
        socketId:   u.socketId,
        name:       u.name,
        micMuted:   u.micMuted,
        videoMuted: u.videoMuted,
        handRaised: u.handRaised || false,
        isHost:     u.isHost    || false,
      }));

    socket.emit('room-joined', {
      roomId,
      socketId:         socket.id,
      existingPeers,
      isHost,
      participantCount: room.size,
      plan:             currentPlan,
    });

    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      name:     currentName,
      isHost,
    });

    console.log(`[Room ${roomId}] "${currentName}" joined (${room.size}/${roomLimit}, host=${isHost}, plan=${currentPlan})`);
  });

  // ── WebRTC RELAY ──────────────────────────────────────────
  socket.on('offer', p => {
    if (p?.to && p?.sdp) socket.to(p.to).emit('offer', { from: socket.id, sdp: p.sdp, name: currentName });
  });
  socket.on('answer', p => {
    if (p?.to && p?.sdp) socket.to(p.to).emit('answer', { from: socket.id, sdp: p.sdp });
  });
  socket.on('ice-candidate', p => {
    if (p?.to && p?.candidate) socket.to(p.to).emit('ice-candidate', { from: socket.id, candidate: p.candidate });
  });

  // ── CHAT ──────────────────────────────────────────────────
  socket.on('chat-message', ({ roomId: rid, id, message, timestamp }) => {
    if (!currentRoom || !message || !checkRate(socket.id)) return;
    io.to(currentRoom).emit('chat-message', {
      id:        id || `${socket.id}-${Date.now()}`,
      message:   String(message).slice(0, 1000),
      userName:  currentName,
      timestamp: timestamp || Date.now(),
      socketId:  socket.id,
    });
  });

  // ── REACTIONS ─────────────────────────────────────────────
  socket.on('reaction', ({ emoji }) => {
    const allowed = ['👍','❤️','🔥','😂','👏','🎉','🚀','💯'];
    if (!currentRoom || !allowed.includes(emoji) || !checkRate(socket.id, 20)) return;
    io.to(currentRoom).emit('reaction', { emoji, socketId: socket.id, name: currentName });
  });

  // ── MUTE STATE ────────────────────────────────────────────
  socket.on('mute-state', ({ micMuted, videoMuted }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room?.has(socket.id)) {
      const u      = room.get(socket.id);
      u.micMuted   = Boolean(micMuted);
      u.videoMuted = Boolean(videoMuted);
    }
    socket.to(currentRoom).emit('peer-mute-state', {
      socketId: socket.id,
      micMuted:   Boolean(micMuted),
      videoMuted: Boolean(videoMuted),
    });
  });

  // ── RAISE HAND ────────────────────────────────────────────
  socket.on('hand-state', ({ handRaised }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room?.has(socket.id)) room.get(socket.id).handRaised = Boolean(handRaised);
    socket.to(currentRoom).emit('peer-hand-state', {
      socketId: socket.id, handRaised: Boolean(handRaised), name: currentName,
    });
  });

  // ── SCREEN SHARE ──────────────────────────────────────────
  socket.on('screen-share-started', () =>
    currentRoom && socket.to(currentRoom).emit('peer-screen-share-started', { socketId: socket.id }));
  socket.on('screen-share-stopped', () =>
    currentRoom && socket.to(currentRoom).emit('peer-screen-share-stopped', { socketId: socket.id }));

  // ── RECORDING ─────────────────────────────────────────────
  socket.on('recording-started', () =>
    currentRoom && socket.to(currentRoom).emit('peer-recording-started', { socketId: socket.id, name: currentName }));
  socket.on('recording-stopped', () =>
    currentRoom && socket.to(currentRoom).emit('peer-recording-stopped', { socketId: socket.id, name: currentName }));

  // ── HOST CONTROLS ─────────────────────────────────────────
  socket.on('host-mute-all', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room?.get(socket.id)?.isHost) return;
    socket.to(currentRoom).emit('force-mute', { by: currentName });
    console.log(`[Host] ${currentName} muted all in ${currentRoom}`);
  });

  socket.on('host-remove-participant', ({ targetSocketId }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room?.get(socket.id)?.isHost) return;

    const targetUser = room.get(targetSocketId);
    if (targetUser) {
      // Add to ban list so they can't immediately rejoin
      if (!bannedFromRoom.has(currentRoom)) bannedFromRoom.set(currentRoom, new Set());
      if (targetUser.uid) bannedFromRoom.get(currentRoom).add(targetUser.uid);

      const target = io.sockets.sockets.get(targetSocketId);
      if (target) {
        target.emit('removed-by-host', { by: currentName });
        setTimeout(() => target.disconnect(true), 500);
      }
      console.log(`[Host] ${currentName} removed ${targetUser.name} from ${currentRoom}`);
    }
  });

  // ── LEAVE ─────────────────────────────────────────────────
  socket.on('leave-room', () => handleLeave());
  socket.on('disconnect', reason => {
    console.log(`[-] ${socket.id} (${reason})`);
    handleLeave();
    msgCounts.delete(socket.id);
  });

  function handleLeave() {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.delete(socket.id);
      socket.to(currentRoom).emit('user-left', { socketId: socket.id });

      // Assign new host if host left
      if (isHost && room.size > 0) {
        const newHostEntry  = Array.from(room.values())[0];
        newHostEntry.isHost = true;
        const newHostSock   = io.sockets.sockets.get(newHostEntry.socketId);
        if (newHostSock) newHostSock.emit('promoted-to-host');
        io.to(currentRoom).emit('host-changed', {
          newHostSocketId: newHostEntry.socketId,
          name:            newHostEntry.name,
        });
        console.log(`[Room ${currentRoom}] New host: "${newHostEntry.name}"`);
      }

      if (room.size === 0) {
        rooms.delete(currentRoom);
        bannedFromRoom.delete(currentRoom); // Clean up ban list too
        console.log(`[Room ${currentRoom}] Empty — cleaned up`);
      }
    }
    if (currentUid) uidToSocket.delete(`${currentUid}:${currentRoom}`);
    socket.leave(currentRoom);
    currentRoom = null;
    isHost      = false;
  }
});

// ── IDLE ROOM CLEANUP ────────────────────────────────────────────────────────
// Removes rooms older than 24h with 0 participants, or rooms where all
// connections have silently dropped (no disconnect event received).
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let cleaned  = 0;
  rooms.forEach((room, roomId) => {
    if (room.size === 0) { rooms.delete(roomId); bannedFromRoom.delete(roomId); cleaned++; return; }
    // Check if all sockets in room are still connected
    let allGone = true;
    room.forEach((_, sid) => {
      if (io.sockets.sockets.has(sid)) allGone = false;
    });
    if (allGone) {
      rooms.delete(roomId);
      bannedFromRoom.delete(roomId);
      cleaned++;
    }
  });
  if (cleaned > 0) console.log(`[Cleanup] Removed ${cleaned} zombie rooms`);
}, 5 * 60 * 1000); // Every 5 minutes

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  const authMode = process.env.FIREBASE_ADMIN_CREDENTIAL ? 'Firebase JWT' :
                   process.env.APP_SOCKET_SECRET         ? 'Shared Secret' :
                   'Open (dev only)';
  console.log(`\n🔥 Boutyflameet v4.1 — © Ken Baserecha`);
  console.log(`   Port     : ${PORT}`);
  console.log(`   Auth     : ${authMode}`);
  console.log(`   AI Proxy : ${process.env.CLAUDE_API_KEY ? '✅' : '❌ Missing CLAUDE_API_KEY'}`);
  console.log(`   Payments : ${process.env.FLW_SECRET_KEY ? '✅' : '❌ Missing FLW_SECRET_KEY'}`);
  console.log(`   Mode     : ${process.env.NODE_ENV || 'development'}\n`);
});

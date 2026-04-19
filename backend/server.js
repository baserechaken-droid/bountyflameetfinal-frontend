/**
 * Boutyflameet — Production Signaling + AI Proxy Server
 * © Ken Baserecha — All rights reserved
 * v3.0 — Full production with AI proxy, payments webhook, dedup
 */
// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/ai', async (req, res) => {
  try {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'AI not configured on server' });

    const system = String(req.body?.system || '').trim();
    const prompt = String(req.body?.prompt || '').trim();
    const maxTokens = Math.min(Math.max(Number(req.body?.maxTokens) || 800, 100), 4000);
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = data?.error?.message || data?.error || `Claude API error ${response.status}`;
      return res.status(502).json({ error: msg });
    }

    const text = Array.isArray(data?.content)
      ? data.content
          .filter((c) => c?.type === 'text' && typeof c?.text === 'string')
          .map((c) => c.text)
          .join('\n')
          .trim()
      : '';

    res.json({ text: text || 'No response' });
  } catch (e) {
    console.error('[AI] proxy error:', e);
    res.status(500).json({ error: 'AI request failed' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST'] }
});

const rooms = new Map(); // roomId → Map<socketId, {name, uid, micMuted, videoMuted, handRaised}>

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-room', (payload = {}) => {
    const roomId = String(payload.roomId || '').trim().toUpperCase();
    const userName = String(payload.userName || 'Guest').trim() || 'Guest';
    const uid = payload.uid || null;
    if (!roomId) return;

    socket.join(roomId);
    socket.data.roomId = roomId;

    if (!rooms.has(roomId)) rooms.set(roomId, new Map());
    const room = rooms.get(roomId);

    // Duplicate session protection
    for (const [sid, data] of room) {
      if (data.uid && data.uid === uid && sid !== socket.id) {
        socket.emit('duplicate-session');
        socket.disconnect(true);
        return;
      }
    }

    room.set(socket.id, { name: userName, uid: uid || null, micMuted: false, videoMuted: false, handRaised: false });

    const existingPeers = Array.from(room.entries())
      .filter(([sid]) => sid !== socket.id)
      .map(([sid, data]) => ({
        socketId: sid,
        name: data.name,
        micMuted: data.micMuted,
        videoMuted: data.videoMuted,
        handRaised: data.handRaised
      }));

    socket.emit('room-joined', { socketId: socket.id, existingPeers });
    socket.to(roomId).emit('user-joined', {
      socketId: socket.id,
      name: userName,
      micMuted: false,
      videoMuted: false,
      handRaised: false,
    });
  });

  // Signaling
  socket.on('offer', (payload = {}) => {
    const to = payload.to;
    if (!to || !payload.sdp) return;
    socket.to(to).emit('offer', { from: socket.id, sdp: payload.sdp, name: payload.name });
  });
  socket.on('answer', (payload = {}) => {
    const to = payload.to;
    if (!to || !payload.sdp) return;
    socket.to(to).emit('answer', { from: socket.id, sdp: payload.sdp });
  });
  socket.on('ice-candidate', (payload = {}) => {
    const to = payload.to;
    if (!to || !payload.candidate) return;
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate: payload.candidate });
  });

  // Mute / Screen share
  socket.on('mute-state', (payload = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const user = rooms.get(roomId).get(socket.id);
    const micMuted = !!payload.micMuted;
    const videoMuted = !!payload.videoMuted;
    if (user) {
      user.micMuted = micMuted;
      user.videoMuted = videoMuted;
    }
    socket.to(roomId).emit('peer-mute-state', { socketId: socket.id, micMuted, videoMuted });
  });

  socket.on('screen-share-started', () => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('peer-screen-share-started', { socketId: socket.id });
  });

  socket.on('screen-share-stopped', () => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('peer-screen-share-stopped', { socketId: socket.id });
  });

  socket.on('hand-state', (payload = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const user = rooms.get(roomId).get(socket.id);
    const handRaised = !!payload.handRaised;
    if (user) user.handRaised = !!handRaised;
    socket.to(roomId).emit('peer-hand-state', { socketId: socket.id, handRaised: !!handRaised });
  });

  // Chat & Reactions
  socket.on('chat-message', (data = {}) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    const id = typeof data.id === 'string' && data.id ? data.id : `${socket.id}-${Date.now()}`;
    const message = String(data.message || '').trim();
    if (!message) return;
    io.to(roomId).emit('chat-message', {
      id,
      message,
      userName: String(data.userName || 'Guest'),
      timestamp: Number(data.timestamp) || Date.now(),
      socketId: socket.id,
    });
  });

  socket.on('reaction', (payload = {}) => {
    const roomId = String(payload.roomId || '').trim().toUpperCase();
    const emoji = payload.emoji;
    if (!roomId || !emoji) return;
    const room = rooms.get(roomId);
    const user = room ? room.get(socket.id) : null;
    io.to(roomId).emit('reaction', {
      emoji,
      socketId: socket.id,
      name: user ? user.name : 'Someone'
    });
  });

  socket.on('leave-room', () => cleanupSocket(socket));
  socket.on('disconnect', () => cleanupSocket(socket));

  function cleanupSocket(socket) {
    const roomId = socket.data.roomId;
    if (!roomId || !rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    room.delete(socket.id);
    socket.to(roomId).emit('user-left', { socketId: socket.id });
    if (room.size === 0) rooms.delete(roomId);
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`🚀 Boutyflameet signaling server v4 on port ${PORT}`));
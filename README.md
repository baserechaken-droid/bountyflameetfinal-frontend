# 🔥 Boutyflameet

> Premium WebRTC video conferencing — Flame your connections.

A production-ready Google Meet alternative with real peer-to-peer video/audio, real-time chat, screen sharing, and magic shareable links. Built with **Vite + React + TypeScript** on the frontend and **Node.js + Express + Socket.io** for signaling.

---

## 📁 Project Structure

```
boutyflameet/
├── backend/
│   ├── server.js          ← Express + Socket.io signaling server
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   │   └── index.tsx     ← Shared: FlameIcon, VideoTile, Toast, Btn, etc.
│   │   │   ├── VideoGrid.tsx     ← Responsive video layout (1→hero, 2-4→grid, 5+→compact)
│   │   │   ├── ControlsBar.tsx   ← Floating glassy controls + keyboard shortcuts
│   │   │   ├── ChatPanel.tsx     ← Slide-in real-time chat
│   │   │   ├── PeoplePanel.tsx   ← Participant list with mute indicators
│   │   │   ├── SelfPiP.tsx       ← Draggable self-view picture-in-picture
│   │   │   └── TopBar.tsx        ← Title, invite link, timer, connection status
│   │   ├── hooks/
│   │   │   ├── useWebRTC.ts      ← 🔑 Full-mesh WebRTC: offers, answers, ICE, tracks
│   │   │   ├── useSocket.ts      ← Socket.io connection management
│   │   │   ├── useToast.ts       ← Toast notification system
│   │   │   └── useLocalStorage.ts
│   │   ├── lib/
│   │   │   ├── constants.ts      ← ICE servers (STUN + TURN), config
│   │   │   └── utils.ts          ← Room ID gen, formatting, clipboard, etc.
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx   ← Hero, features, how-it-works
│   │   │   ├── LobbyPage.tsx     ← Create/join meeting, recent meetings
│   │   │   └── MeetingPage.tsx   ← 🔑 Full meeting room, orchestrates everything
│   │   ├── types/index.ts        ← TypeScript interfaces
│   │   ├── App.tsx               ← Router (/ → /lobby → /join/:roomId)
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   │   ├── flame.svg
│   │   └── manifest.json
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
└── README.md
```

---

## 🚀 Local Development

### Prerequisites
- **Node.js 18+** and **npm 9+**
- A modern browser (Chrome 90+, Firefox 88+, Safari 15+, Edge 90+)

### 1. Install dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Configure environment

```bash
# backend/.env  (copy from .env.example)
PORT=3001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# frontend/.env.local
VITE_SIGNALING_URL=http://localhost:3001
```

### 3. Start both servers

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev          # uses nodemon for auto-reload
# → Listening on http://localhost:3001
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev          # Vite dev server with HMR
# → http://localhost:5173
```

Open **http://localhost:5173** in your browser.

### 4. Test a multi-device call

**Same machine, two tabs:**
1. Click "New Meeting" in Tab 1 → copy the URL
2. Paste the URL into Tab 2
3. Camera/mic should connect automatically via WebRTC

**Different devices on same Wi-Fi:**
1. Find your machine's local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Set `VITE_SIGNALING_URL=http://192.168.x.x:3001` in frontend `.env.local`
3. Access frontend at `http://192.168.x.x:5173` from other device

**Different networks (Internet):**
- Deploy backend (see below) — the TURN server handles NAT traversal
- Or run `ngrok http 3001` for quick tunneling

---

## ⚙️ How WebRTC Works in This App

```
Alice joins /join/BOUTY-ABC123
  └─ Socket emits 'join-room' → server
  └─ Server: no existing peers → sends 'room-joined' with empty list
  └─ Alice creates local stream (getUserMedia)

Bob opens /join/BOUTY-ABC123
  └─ Socket emits 'join-room' → server
  └─ Server:
      → tells Bob: 'room-joined' with [Alice's socketId]
      → tells Alice: 'user-joined' (Bob arrived)
  └─ Bob creates RTCPeerConnection for Alice
  └─ Bob sends 'offer' (SDP) to server → relayed to Alice
  └─ Alice receives offer → createAnswer → sends 'answer' back
  └─ Both exchange ICE candidates via server
  └─ ICE completes → direct P2P connection
  └─ 'ontrack' fires → Bob sees Alice's video, Alice sees Bob's video
  └─ Server is no longer involved in media — pure P2P!
```

### STUN vs TURN

- **STUN** (Google, Cloudflare): Free, helps peers discover their public IPs. Works for ~80% of connections.
- **TURN** (OpenRelay): Required for corporate firewalls, symmetric NAT. Relays media through a server. Free 20GB/month.

Configure your own TURN in `frontend/src/lib/constants.ts`:
```typescript
{
  urls: 'turn:openrelay.metered.ca:80',
  username: 'YOUR_USERNAME',
  credential: 'YOUR_CREDENTIAL',
}
```
Get free credentials: https://app.metered.ca/tools/openrelay

---

## 🌐 Deployment

### Backend → Render.com (recommended for WebSockets)

1. Push `boutyflameet/backend/` to a GitHub repo
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set:
   - Build command: `npm install`
   - Start command: `node server.js`
   - Environment variables:
     ```
     PORT=10000
     FRONTEND_URL=https://your-frontend.vercel.app
     NODE_ENV=production
     ```
4. Copy your Render URL: `https://boutyflameet-backend.onrender.com`

### Frontend → Vercel

1. Push `boutyflameet/frontend/` to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Add environment variable:
   ```
   VITE_SIGNALING_URL=https://boutyflameet-backend.onrender.com
   ```
4. Configure routing for React Router in `vercel.json`:
   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```

### Alternative: Railway

Railway works great for the backend — WebSocket support is first-class:
```bash
railway login
cd backend
railway init
railway up
railway variables set FRONTEND_URL=https://your-frontend.vercel.app NODE_ENV=production
```

### Custom Domain

1. On Vercel: Settings → Domains → Add `boutyflameet.app`
2. Update DNS: CNAME `www` → `cname.vercel-dns.com`
3. On Render: Settings → Custom Domain → Add `api.boutyflameet.app`
4. Update `VITE_SIGNALING_URL=https://api.boutyflameet.app`

SSL is automatic on both Vercel and Render. **WebRTC requires HTTPS** in production.

---

## 🎮 Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `M` | Toggle microphone |
| `V` | Toggle camera |
| `C` | Toggle chat panel |
| `R` | Send random reaction |

---

## 🔧 Configuration

### Change max room size
In `frontend/src/lib/constants.ts`:
```typescript
export const MAX_PEERS = 8; // full-mesh scales to ~8 comfortably
```

### Enable recording (future)
WebRTC `MediaRecorder` API can record `localStream` — hook it up in `MeetingPage.tsx`.

### Add authentication
1. Add a simple JWT auth middleware to `backend/server.js`
2. Pass the token in `socket.io` handshake auth: `io({ auth: { token } })`

---

## 📱 Mobile Support

- Bottom sheet chat on mobile (panel takes full width)
- PiP self-view is draggable
- Controls bar is touch-friendly
- PWA installable from browser menu

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Camera/mic not working | Check browser permissions. On Firefox, allow in address bar. |
| Video not showing | Ensure HTTPS in production. WebRTC requires secure context. |
| Can't connect between networks | Check TURN server credentials in `constants.ts`. |
| "Connection failed" | TURN relay may be needed — see TURN setup above. |
| Blank video tile | `ontrack` fires but `srcObject` not attached — check `VideoTile` `useEffect`. |
| Socket won't connect | Verify `VITE_SIGNALING_URL` matches your backend URL exactly. |

---

## 📄 License

MIT © 2025 Boutyflameet. Built with 🔥

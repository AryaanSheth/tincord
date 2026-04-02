# tincord

Anonymous peer-to-peer voice chat. No accounts, no history, no recordings. Two strangers, one string.

**[tincord.com](https://www.tincord.com)**

---

## how it works

When you pick up the can, the server matches you with another waiting user in under a second. Your browsers then negotiate a direct WebRTC audio connection — the server steps out of the way and never touches your audio. When the call ends, it's gone.

```
you  ──── signaling (offer/answer/ICE) ────  server  ────  stranger
you  ══════════════ audio (WebRTC P2P) ══════════════════  stranger
```

If a direct connection can't be established (e.g. both users behind strict NAT), audio is relayed through a TURN server. Still end-to-end, still not stored.

---

## stack

| Layer | Tech |
|-------|------|
| Client | Next.js (App Router), TypeScript |
| Signaling server | Node.js, Socket.io, Express |
| Realtime transport | WebRTC (`getUserMedia`, `RTCPeerConnection`) |
| State / matchmaking | Upstash Redis |
| TURN relay | Metered |
| Client hosting | Vercel |
| Server hosting | Render |
| Logs | Grafana (SOC2) |

---

## running locally

**Prerequisites:** Node.js 18+, a running Redis instance

```bash
# clone
git clone https://github.com/AryaanSheth/tincord.git
cd tincord

# install dependencies
npm run install:all

# configure server
cp server/.env.example server/.env
# fill in REDIS_URL — everything else has safe dev defaults

# start both client and server
npm run dev
```

Client runs on `http://localhost:3000`, server on `http://localhost:3001`.

To test a call locally, open two browser tabs. Note: two tabs on the same machine/network may fail with STUN only (hairpin NAT). Set `NEXT_PUBLIC_ICE_POLICY=all` and ensure TURN is configured, or test from two different networks.

---

## self-hosting

The repo includes a `docker-compose.yml` for self-hosted deployments (nginx + server + Redis). See [nginx/nginx.conf](nginx/nginx.conf) for the reverse proxy config — replace `tincan.example.com` with your domain and add TLS via Certbot or Cloudflare.

**Required environment variables (server):**

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection string (`rediss://` for TLS) |
| `ALLOWED_ORIGIN` | Your client URL (e.g. `https://www.tincord.com`) |
| `TURN_URL` | TURN server URL |
| `TURN_SECRET` | Metered API key or coturn shared secret |
| `HEALTH_API_KEY` | API key for the `/health` endpoint |
| `TRUST_PROXY` | Set to `true` if behind a reverse proxy |

**Client build-time variables:**

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SIGNAL_URL` | Signaling server URL |
| `NEXT_PUBLIC_ICE_POLICY` | `relay` (TURN only) or `all` (STUN + TURN) |

---

## security

- Origin validation on every WebSocket connection
- Dual-layer rate limiting: 60 events/10s per socket + 120 events/10s per IP (Redis-backed)
- SDP type allowlist (`offer`/`answer` only), 8 KB payload cap
- ICE candidate size cap (1 KB), buffer limit (50 candidates)
- Sliding-window abuse reporting: 3 reports in 30 min → 24h IP ban
- IPs hashed (SHA-256) in all log output
- TURN credentials fetched server-side only, never in the client bundle
- CSP, X-Frame-Options, and other security headers on both client and server

---

## project structure

```
tincord/
├── client/                 # Next.js app (Vercel)
│   ├── app/
│   │   ├── page.tsx        # main UI
│   │   └── privacy/        # privacy policy
│   ├── components/         # TinCan, StringCanvas, VoiceLevel, Timer
│   ├── hooks/
│   │   └── useWebRTC.ts    # WebRTC + socket state machine
│   └── lib/
│       └── socket.ts       # Socket.io client singleton
├── server/                 # Node.js signaling server (Render)
│   └── src/
│       ├── index.ts        # Express + Socket.io + matchmaking
│       ├── turn.ts         # TURN credential generation
│       ├── redis.ts        # Redis clients + key helpers
│       └── env.ts          # Environment validation
├── nginx/                  # Reverse proxy config (self-hosted)
└── docker-compose.yml      # Self-hosted stack
```

---

## license

MIT — see [LICENSE](LICENSE)

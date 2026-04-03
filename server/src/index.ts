import "./env";
import { ENV } from "./env";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import helmet from "helmet";
import cors from "cors";
import { randomBytes, createHash } from "crypto";
import { redis, redisPub, redisSub, KEY, TTL } from "./redis";
import { generateTurnCredentials } from "./turn";

// ─── Types ────────────────────────────────────────────────────────────────────
type SdpPayload = { type: string; sdp: string };
type IcePayload = {
  candidate:       string;
  sdpMid:          string | null;
  sdpMLineIndex:   number | null;
  usernameFragment?: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const RATE_WINDOW_MS       = 10_000;
const MAX_EVENTS_PER_SOCKET = 60;
const MAX_EVENTS_PER_IP    = 120; // across all sockets from one IP
const MAX_CONNS_PER_IP     = 10;
const BAN_DURATION_SEC     = 86_400;
const REPORTS_TO_BAN       = 3;
const REPORT_WINDOW_SEC    = 1_800;
const MAX_SDP_BYTES        = 8_192;
const MAX_ICE_BYTES        = 1_024;

// Allowed SDP types in a normal offer/answer flow
const VALID_SDP_TYPES = new Set(["offer", "answer"]);

// ─── Logging ──────────────────────────────────────────────────────────────────
function log(level: "info" | "warn" | "error", msg: string) {
  const ts = new Date().toISOString();
  const line = `${ts} [${level.toUpperCase()}] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Hash an IP for privacy-safe logging — one-way, consistent within a process. */
function hashIP(ip: string): string {
  return createHash("sha256").update(ip + (ENV.TURN_SECRET || "salt")).digest("hex").slice(0, 12);
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", ENV.TRUST_PROXY ? 1 : 0);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      connectSrc:  ["'self'", ENV.ALLOWED_ORIGIN],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({ origin: ENV.ALLOWED_ORIGIN, methods: ["GET"] }));
app.use(express.json({ limit: "4kb" }));

// ─── HTTP + Socket.io ─────────────────────────────────────────────────────────
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: ENV.ALLOWED_ORIGIN, methods: ["GET", "POST"] },
  maxHttpBufferSize: 16_384,
  pingTimeout:       20_000,
  pingInterval:      25_000,
  transports: ["websocket"],
});

io.adapter(createAdapter(redisPub, redisSub));

// ─── Socket.io security middleware ────────────────────────────────────────────
// Validates Origin header to prevent cross-site WebSocket hijacking / CSRF
io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  // Allow same-origin requests (no Origin header) and the configured allowed origin
  if (!origin || origin === ENV.ALLOWED_ORIGIN) return next();
  log("warn", `Rejected connection from origin: ${origin}`);
  next(new Error("Unauthorized origin"));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateTinId(): string {
  return `Tincord-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function resolveIP(socket: Socket): string {
  if (ENV.TRUST_PROXY) {
    const fwd = socket.handshake.headers["x-forwarded-for"];
    // Only trust the rightmost IP added by our proxy (nginx), not client-supplied ones
    if (typeof fwd === "string") {
      const ips = fwd.split(",").map(s => s.trim());
      // Return the last IP — the one nginx actually added
      return ips[ips.length - 1];
    }
  }
  return socket.handshake.address;
}

/** Per-socket rate limit (prevents single socket flooding). */
function socketRateLimited(socket: Socket): boolean {
  const now = Date.now();
  if (!socket.data.rl) socket.data.rl = { count: 0, windowStart: now };
  const rl = socket.data.rl as { count: number; windowStart: number };
  if (now - rl.windowStart > RATE_WINDOW_MS) { rl.count = 0; rl.windowStart = now; }
  if (++rl.count > MAX_EVENTS_PER_SOCKET) {
    log("warn", `Socket rate limit: ${socket.id}`);
    return true;
  }
  return false;
}

/** Per-IP rate limit via Redis (prevents multi-socket bypass). */
async function ipRateLimited(ip: string): Promise<boolean> {
  const key = `tc:iprl:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.pexpire(key, RATE_WINDOW_MS);
  if (count > MAX_EVENTS_PER_IP) {
    log("warn", `IP rate limit: ${hashIP(ip)} (${count} events)`);
    return true;
  }
  return false;
}

async function rateLimited(socket: Socket, ip: string): Promise<boolean> {
  if (socketRateLimited(socket)) {
    socket.disconnect(true); // disconnect abusive sockets rather than silently ignoring
    return true;
  }
  return ipRateLimited(ip);
}

function isValidSdp(data: unknown): data is { sdp: SdpPayload } {
  if (!data || typeof data !== "object") return false;
  const { sdp } = data as Record<string, unknown>;
  if (!sdp || typeof sdp !== "object") return false;
  const { type, sdp: s } = sdp as Record<string, unknown>;
  return (
    typeof type === "string" &&
    typeof s === "string" &&
    VALID_SDP_TYPES.has(type) &&  // only offer/answer — not pranswer/rollback
    s.length <= MAX_SDP_BYTES
  );
}

function isValidIce(data: unknown): data is { candidate: IcePayload } {
  if (!data || typeof data !== "object") return false;
  const { candidate } = data as Record<string, unknown>;
  if (!candidate || typeof candidate !== "object") return false;
  const { candidate: c, sdpMid, sdpMLineIndex } = candidate as Record<string, unknown>;
  return (
    typeof c === "string" && c.length <= MAX_ICE_BYTES &&
    (sdpMid === null || typeof sdpMid === "string") &&
    (sdpMLineIndex === null || typeof sdpMLineIndex === "number")
  );
}

// ─── Redis-backed state ───────────────────────────────────────────────────────
const LUA_MATCH = `
local existing = redis.call('RPOP', KEYS[1])
if existing then
  return existing
else
  redis.call('LPUSH', KEYS[1], ARGV[1])
  return false
end
`;

async function tryMatchRedis(socketId: string): Promise<string | null> {
  const result = await redis.eval(LUA_MATCH, 1, KEY.queue(), socketId) as string | null | false;
  return result || null;
}

async function removeFromQueueRedis(socketId: string) {
  await redis.lrem(KEY.queue(), 0, socketId);
}

async function setPair(a: string, b: string) {
  const pipe = redis.pipeline();
  pipe.set(KEY.pair(a), b, "EX", TTL.pair);
  pipe.set(KEY.pair(b), a, "EX", TTL.pair);
  await pipe.exec();
}

async function getPeer(socketId: string): Promise<string | null> {
  return redis.get(KEY.pair(socketId));
}

async function deletePair(a: string, b?: string) {
  const pipe = redis.pipeline();
  pipe.del(KEY.pair(a));
  if (b) pipe.del(KEY.pair(b));
  await pipe.exec();
}

async function setSocketMeta(socketId: string, ip: string, tinId: string) {
  await redis.hset(KEY.socket(socketId), { ip, tinId });
  await redis.expire(KEY.socket(socketId), TTL.socket);
}

async function getSocketMeta(socketId: string): Promise<{ ip: string; tinId: string } | null> {
  const data = await redis.hgetall(KEY.socket(socketId));
  if (!data?.ip) return null;
  return { ip: data.ip, tinId: data.tinId };
}

async function deleteSocketMeta(socketId: string) {
  await redis.del(KEY.socket(socketId));
}

async function isBanned(ip: string): Promise<boolean> {
  return (await redis.exists(KEY.ban(ip))) === 1;
}

async function banIP(ip: string) {
  await redis.set(KEY.ban(ip), "1", "EX", BAN_DURATION_SEC);
}

async function recordReport(ip: string): Promise<number> {
  const key    = KEY.reports(ip);
  const now    = Date.now();
  const cutoff = now - REPORT_WINDOW_SEC * 1000;
  const pipe   = redis.pipeline();
  pipe.zadd(key, now, `${now}`);
  pipe.zremrangebyscore(key, 0, cutoff);
  pipe.zcard(key);
  pipe.expire(key, REPORT_WINDOW_SEC);
  const results = await pipe.exec();
  return (results?.[2]?.[1] as number | null) ?? 0;
}

async function incrConnCount(ip: string): Promise<number> {
  const count = await redis.incr(KEY.connCount(ip));
  await redis.expire(KEY.connCount(ip), TTL.connCount);
  return count;
}

async function decrConnCount(ip: string) {
  const count = await redis.decr(KEY.connCount(ip));
  if (count <= 0) await redis.del(KEY.connCount(ip));
}

// ─── Warm TURN credential cache ───────────────────────────────────────────────
// Credentials are refreshed every 5 minutes in the background so that the
// matching hot-path never blocks on an external API call.
let warmCreds: { iceServers: object[] } | null = null;
async function refreshWarmCreds(): Promise<void> {
  try {
    warmCreds = (await generateTurnCredentials()) as { iceServers: object[] };
  } catch {
    // Keep stale credentials; generateTurnCredentials already has internal fallbacks
  }
  setTimeout(() => void refreshWarmCreds(), 5 * 60 * 1_000);
}

// ─── Connection handler ───────────────────────────────────────────────────────
// IMPORTANT: the outer callback is synchronous so that ALL socket.on() handlers
// are registered before any await. Socket.io sends the CONNECT packet to the
// client before this callback runs, meaning the client can fire "connect" and
// flush its send-buffer while we are still in async setup. If handlers are not
// registered yet, those events are silently dropped. The "ready" promise runs
// setup in the background; each handler awaits it before doing real work.
io.on("connection", (socket: Socket) => {
  const ip = resolveIP(socket);
  let tinId = "";
  let connIncremented = false;

  const ready = (async (): Promise<boolean> => {
    if (await isBanned(ip)) {
      socket.emit("banned", { reason: "Suspended for 24 hours due to multiple reports." });
      socket.disconnect(true);
      return false;
    }
    const connCount = await incrConnCount(ip);
    connIncremented = true;
    if (connCount > MAX_CONNS_PER_IP) {
      log("warn", `Conn limit: ${hashIP(ip)} (${connCount})`);
      socket.disconnect(true);
      await decrConnCount(ip);
      connIncremented = false;
      return false;
    }
    tinId = generateTinId();
    await setSocketMeta(socket.id, ip, tinId);
    log("info", `[+] ${tinId} (${hashIP(ip)})`);
    socket.emit("identity", { tinId });
    return true;
  })();

  // ── find_peer ────────────────────────────────────────────────────────────────
  socket.on("find_peer", async () => {
    if (!await ready) return;
    log("info", `find_peer from ${tinId} (${socket.id.slice(-8)})`);
    if (await rateLimited(socket, ip)) { log("warn", `find_peer rate-limited: ${tinId}`); return; }
    if (await isBanned(ip)) { socket.emit("banned", { reason: "Suspended." }); socket.disconnect(true); return; }
    await removeFromQueueRedis(socket.id);
    let peerId: string | null = null;
    try {
      peerId = await tryMatchRedis(socket.id);
    } catch (err) {
      log("error", `tryMatchRedis error for ${tinId}: ${err}`);
      socket.emit("waiting");
      return;
    }
    if (peerId) {
      log("info", `matched ${tinId} (${socket.id.slice(-8)}) <-> ${peerId.slice(-8)}`);
      await setPair(socket.id, peerId);
      redis.incr(KEY.totalCalls()); // fire-and-forget; non-critical counter
      const { iceServers } = warmCreds ?? ((await generateTurnCredentials()) as { iceServers: object[] });
      io.to(socket.id).emit("matched", { role: "offerer", iceServers });
      io.to(peerId).emit("matched",    { role: "answerer", iceServers });
    } else {
      log("info", `${tinId} (${socket.id.slice(-8)}) waiting in queue`);
      socket.emit("waiting");
    }
  });

  // ── Signaling relay ──────────────────────────────────────────────────────────
  socket.on("offer", async (data: unknown) => {
    if (!await ready) return;
    if (await rateLimited(socket, ip) || !isValidSdp(data)) { log("warn", `offer rejected from ${tinId} (rate/invalid)`); return; }
    const peerId = await getPeer(socket.id);
    log("info", `offer from ${tinId} → ${peerId ?? "no peer"}`);
    if (peerId) io.to(peerId).emit("offer", data);
  });

  socket.on("answer", async (data: unknown) => {
    if (!await ready) return;
    if (await rateLimited(socket, ip) || !isValidSdp(data)) { log("warn", `answer rejected from ${tinId} (rate/invalid)`); return; }
    const peerId = await getPeer(socket.id);
    log("info", `answer from ${tinId} → ${peerId ?? "no peer"}`);
    if (peerId) io.to(peerId).emit("answer", data);
  });

  socket.on("ice_candidate", async (data: unknown) => {
    if (!await ready) return;
    if (await rateLimited(socket, ip) || !isValidIce(data)) return;
    const peerId = await getPeer(socket.id);
    if (peerId) io.to(peerId).emit("ice_candidate", data);
  });

  // ── hang_up ──────────────────────────────────────────────────────────────────
  socket.on("hang_up", async () => {
    if (!await ready) return;
    if (await rateLimited(socket, ip)) return;
    const peerId = await getPeer(socket.id);
    log("info", `hang_up from ${tinId} (${socket.id.slice(-8)}) peer=${peerId ? peerId.slice(-8) : "none"}`);
    if (peerId) { io.to(peerId).emit("peer_hung_up"); await deletePair(socket.id, peerId); }
    else await deletePair(socket.id);
    await removeFromQueueRedis(socket.id);
  });

  // ── report_peer ───────────────────────────────────────────────────────────────
  socket.on("report_peer", async () => {
    if (!await ready) return;
    if (await rateLimited(socket, ip)) return;
    if (socket.data.reported) return;
    socket.data.reported = true;

    const peerId = await getPeer(socket.id);
    if (!peerId) return;

    const peerMeta = await getSocketMeta(peerId);
    if (!peerMeta) return;

    const reportCount = await recordReport(peerMeta.ip);
    log("warn", `Report against ${hashIP(peerMeta.ip)} — ${reportCount} in window`);

    if (reportCount >= REPORTS_TO_BAN) {
      await banIP(peerMeta.ip);
      log("warn", `Shadow-banned ${hashIP(peerMeta.ip)}`);
      io.to(peerId).emit("banned", { reason: "Suspended for 24 hours due to multiple reports." });
      io.in(peerId).disconnectSockets(true);
    } else {
      io.to(peerId).emit("peer_hung_up");
    }

    await deletePair(socket.id, peerId);
    socket.emit("peer_hung_up");
  });

  // ── disconnect ────────────────────────────────────────────────────────────────
  socket.on("disconnect", async (reason) => {
    await ready.catch(() => {}); // wait for setup so connIncremented is accurate
    const peerId = await getPeer(socket.id);
    if (peerId) { io.to(peerId).emit("peer_hung_up"); await deletePair(socket.id, peerId); }
    else await deletePair(socket.id);
    await removeFromQueueRedis(socket.id);
    await deleteSocketMeta(socket.id);
    if (connIncremented) await decrConnCount(ip);
    log("info", `[-] ${tinId || "?"} disconnected (${reason})`);
  });
});

// ─── HTTP endpoints ───────────────────────────────────────────────────────────
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!ENV.HEALTH_API_KEY) { next(); return; }
  if (req.headers["x-api-key"] !== ENV.HEALTH_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/** Public stats — only exposes what the UI needs. No auth required. */
app.get("/stats", async (_req, res) => {
  const [queueLen, totalCalls] = await Promise.all([
    redis.llen(KEY.queue()),
    redis.get(KEY.totalCalls()),
  ]);
  res.json({ waiting: queueLen, totalCalls: parseInt(totalCalls ?? "0", 10) });
});

/** Internal health check — requires API key in production. */
app.get("/health", requireApiKey, async (_req, res) => {
  const [queueLen, ping] = await Promise.all([
    redis.llen(KEY.queue()),
    redis.ping(),
  ]);
  res.json({
    status:    "ok",
    redis:     ping === "PONG" ? "connected" : "error",
    waiting:   queueLen,
    timestamp: new Date().toISOString(),
  });
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  log("info", `${signal} — shutting down`);
  httpServer.close(async () => {
    io.emit("server_shutdown", { message: "Server restarting. Please reconnect." });
    io.close();
    await redis.quit();
    await redisPub.quit();
    await redisSub.quit();
    log("info", "Shutdown complete");
    process.exit(0);
  });
  setTimeout(() => { log("error", "Forced shutdown"); process.exit(1); }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (err)    => log("error", `Uncaught: ${err.stack}`));
process.on("unhandledRejection", (reason) => log("error", `Unhandled: ${reason}`));

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  // Clear stale connection counts and queue from any previous crashed instance.
  // Safe for single-instance; in multi-instance, use instance-namespaced keys instead.
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", "tc:conns:*", "COUNT", 100);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== "0");
  await redis.del(KEY.queue());
  log("info", "Cleared stale connection counts and queue");

  void refreshWarmCreds(); // pre-fetch TURN credentials so first match is instant

  httpServer.listen(ENV.PORT, () => {
    log("info", `Tincord :${ENV.PORT} [${ENV.NODE_ENV}] origin=${ENV.ALLOWED_ORIGIN}`);
  });
}

start().catch((err) => { log("error", `Startup failed: ${err}`); process.exit(1); });

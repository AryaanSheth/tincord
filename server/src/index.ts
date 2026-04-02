import "./env"; // must be first — loads dotenv + validates
import { ENV } from "./env";
import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import helmet from "helmet";
import cors from "cors";
import { randomBytes } from "crypto";
import { redis, redisPub, redisSub, KEY, TTL } from "./redis";
import { generateTurnCredentials } from "./turn";

// ─── Types ────────────────────────────────────────────────────────────────────
type SdpPayload = { type: string; sdp: string };
type IcePayload = { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };

// ─── Constants ────────────────────────────────────────────────────────────────
const RATE_WINDOW_MS    = 10_000;
const MAX_EVENTS        = 60;
const MAX_CONNS_PER_IP  = 3;
const BAN_DURATION_SEC  = 86_400;  // 24 hours
const REPORTS_TO_BAN    = 3;
const REPORT_WINDOW_SEC = 1_800;   // 30 minutes
const MAX_SDP_BYTES     = 8_192;
const MAX_ICE_BYTES     = 1_024;

// ─── Logging ─────────────────────────────────────────────────────────────────
function log(level: "info" | "warn" | "error", msg: string) {
  const ts = new Date().toISOString();
  const line = `${ts} [${level.toUpperCase()}] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ─── Express ─────────────────────────────────────────────────────────────────
const app = express();
app.set("trust proxy", ENV.TRUST_PROXY ? 1 : 0);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      connectSrc:  ["'self'", ENV.ALLOWED_ORIGIN],
    },
  },
  crossOriginEmbedderPolicy: false, // WebRTC requires this to be off
}));

app.use(cors({
  origin: ENV.ALLOWED_ORIGIN,
  methods: ["GET"],
}));

app.use(express.json({ limit: "4kb" }));

// ─── HTTP + Socket.io ─────────────────────────────────────────────────────────
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: ENV.ALLOWED_ORIGIN, methods: ["GET", "POST"] },
  maxHttpBufferSize: 16_384,
  pingTimeout:  20_000,
  pingInterval: 25_000,
  transports: ["websocket"], // skip long-polling for lower latency
});

// Redis adapter — shares events across multiple server instances
io.adapter(createAdapter(redisPub, redisSub));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateTinId(): string {
  return `TinCan-${randomBytes(6).toString("hex").toUpperCase()}`;
}

function resolveIP(socket: Socket): string {
  if (ENV.TRUST_PROXY) {
    const fwd = socket.handshake.headers["x-forwarded-for"];
    if (typeof fwd === "string") return fwd.split(",")[0].trim();
  }
  return socket.handshake.address;
}

function rateLimited(socket: Socket): boolean {
  const now = Date.now();
  if (!socket.data.rl) socket.data.rl = { count: 0, windowStart: now };
  const rl = socket.data.rl as { count: number; windowStart: number };
  if (now - rl.windowStart > RATE_WINDOW_MS) { rl.count = 0; rl.windowStart = now; }
  if (++rl.count > MAX_EVENTS) {
    log("warn", `Rate limit hit: ${socket.id}`);
    return true;
  }
  return false;
}

function isValidSdp(data: unknown): data is { sdp: SdpPayload } {
  if (!data || typeof data !== "object") return false;
  const { sdp } = data as Record<string, unknown>;
  if (!sdp || typeof sdp !== "object") return false;
  const { type, sdp: s } = sdp as Record<string, unknown>;
  return (
    typeof type === "string" &&
    typeof s === "string" &&
    ["offer", "answer", "pranswer", "rollback"].includes(type) &&
    s.length <= MAX_SDP_BYTES
  );
}

function isValidIce(data: unknown): data is { candidate: IcePayload } {
  if (!data || typeof data !== "object") return false;
  const { candidate } = data as Record<string, unknown>;
  if (!candidate || typeof candidate !== "object") return false;
  const { candidate: c } = candidate as Record<string, unknown>;
  return typeof c === "string" && c.length <= MAX_ICE_BYTES;
}

// ─── Redis-backed state operations ────────────────────────────────────────────

/**
 * Atomic matchmaking: either pops an existing waiter or pushes self.
 * Uses a Lua script for atomicity across concurrent requests.
 */
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
  const key   = KEY.reports(ip);
  const now   = Date.now();
  const cutoff = now - REPORT_WINDOW_SEC * 1000;
  const pipe  = redis.pipeline();
  pipe.zadd(key, now, `${now}`);                // add this report
  pipe.zremrangebyscore(key, 0, cutoff);         // purge old ones
  pipe.zcard(key);                               // count in window
  pipe.expire(key, REPORT_WINDOW_SEC);
  const results = await pipe.exec();
  const countResult = results?.[2];
  return (countResult?.[1] as number | null) ?? 0;
}

async function getConnCount(ip: string): Promise<number> {
  return parseInt((await redis.get(KEY.connCount(ip))) ?? "0", 10);
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

// ─── Connection handler ───────────────────────────────────────────────────────
io.on("connection", async (socket: Socket) => {
  const ip = resolveIP(socket);

  // Per-IP connection limit
  const connCount = await incrConnCount(ip);
  if (connCount > MAX_CONNS_PER_IP) {
    log("warn", `Conn limit exceeded for ${ip} (${connCount})`);
    socket.disconnect(true);
    await decrConnCount(ip);
    return;
  }

  // Ban check
  if (await isBanned(ip)) {
    socket.emit("banned", { reason: "Suspended for 24 hours due to multiple reports." });
    socket.disconnect(true);
    await decrConnCount(ip);
    return;
  }

  const tinId = generateTinId();
  await setSocketMeta(socket.id, ip, tinId);
  log("info", `[+] ${tinId} connected from ${ip}`);
  socket.emit("identity", { tinId });

  // ── find_peer ────────────────────────────────────────────────────────────────
  socket.on("find_peer", async () => {
    if (rateLimited(socket)) return;
    if (await isBanned(ip)) {
      socket.emit("banned", { reason: "Suspended." });
      socket.disconnect(true);
      return;
    }
    await removeFromQueueRedis(socket.id);

    const peerId = await tryMatchRedis(socket.id);
    if (peerId) {
      await setPair(socket.id, peerId);
      io.to(socket.id).emit("matched", { role: "offerer" });
      io.to(peerId).emit("matched",    { role: "answerer" });
      log("info", `Paired ${socket.id} <-> ${peerId}`);
    } else {
      socket.emit("waiting");
    }
  });

  // ── Signaling relay ──────────────────────────────────────────────────────────
  socket.on("offer", async (data: unknown) => {
    if (rateLimited(socket) || !isValidSdp(data)) return;
    const peerId = await getPeer(socket.id);
    if (peerId) io.to(peerId).emit("offer", data);
  });

  socket.on("answer", async (data: unknown) => {
    if (rateLimited(socket) || !isValidSdp(data)) return;
    const peerId = await getPeer(socket.id);
    if (peerId) io.to(peerId).emit("answer", data);
  });

  socket.on("ice_candidate", async (data: unknown) => {
    if (rateLimited(socket) || !isValidIce(data)) return;
    const peerId = await getPeer(socket.id);
    if (peerId) io.to(peerId).emit("ice_candidate", data);
  });

  // ── hang_up ──────────────────────────────────────────────────────────────────
  socket.on("hang_up", async () => {
    if (rateLimited(socket)) return;
    const peerId = await getPeer(socket.id);
    if (peerId) {
      io.to(peerId).emit("peer_hung_up");
      await deletePair(socket.id, peerId);
    } else {
      await deletePair(socket.id);
    }
    await removeFromQueueRedis(socket.id);
  });

  // ── report_peer ───────────────────────────────────────────────────────────────
  socket.on("report_peer", async () => {
    if (rateLimited(socket)) return;
    if (socket.data.reported) return; // one report per call
    socket.data.reported = true;

    const peerId = await getPeer(socket.id);
    if (!peerId) return;

    const peerMeta = await getSocketMeta(peerId);
    if (!peerMeta) return;

    const reportCount = await recordReport(peerMeta.ip);
    log("warn", `Report against ${peerMeta.ip} — ${reportCount} in window`);

    if (reportCount >= REPORTS_TO_BAN) {
      await banIP(peerMeta.ip);
      log("warn", `Shadow-banned ${peerMeta.ip} for 24h`);
      io.to(peerId).emit("banned", { reason: "Suspended for 24 hours due to multiple reports." });
      // Force-disconnect via Socket.io (works across instances via Redis adapter)
      io.in(peerId).disconnectSockets(true);
    }

    await deletePair(socket.id, peerId);
    socket.emit("peer_hung_up");
  });

  // ── disconnect ────────────────────────────────────────────────────────────────
  socket.on("disconnect", async (reason) => {
    const peerId = await getPeer(socket.id);
    if (peerId) {
      io.to(peerId).emit("peer_hung_up");
      await deletePair(socket.id, peerId);
    } else {
      await deletePair(socket.id);
    }
    await removeFromQueueRedis(socket.id);
    await deleteSocketMeta(socket.id);
    await decrConnCount(ip);
    log("info", `[-] ${tinId} disconnected (${reason})`);
  });
});

// ─── HTTP endpoints ───────────────────────────────────────────────────────────

// Auth middleware for internal endpoints
function requireApiKey(req: Request, res: Response, next: NextFunction) {
  if (!ENV.HEALTH_API_KEY) { next(); return; } // skip auth in dev
  const key = req.headers["x-api-key"];
  if (key !== ENV.HEALTH_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

app.get("/health", requireApiKey, async (_req, res) => {
  const [queueLen, redisInfo] = await Promise.all([
    redis.llen(KEY.queue()),
    redis.ping(),
  ]);
  res.json({
    status:    "ok",
    redis:     redisInfo === "PONG" ? "connected" : "error",
    waiting:   queueLen,
    timestamp: new Date().toISOString(),
  });
});

app.get("/turn-credentials", (_req, res) => {
  res.json(generateTurnCredentials());
});

// 404 catch-all
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal: string) {
  log("info", `${signal} received — shutting down gracefully`);

  // Stop accepting new connections
  httpServer.close(async () => {
    log("info", "HTTP server closed");

    // Notify all connected clients
    io.emit("server_shutdown", { message: "Server restarting. Please reconnect in a moment." });
    io.close();

    // Close Redis connections
    await redis.quit();
    await redisPub.quit();
    await redisSub.quit();

    log("info", "Shutdown complete");
    process.exit(0);
  });

  // Force-kill after 10s if graceful shutdown stalls
  setTimeout(() => {
    log("error", "Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// Catch unhandled errors — log but don't crash
process.on("uncaughtException",     (err) => log("error", `Uncaught exception: ${err.stack}`));
process.on("unhandledRejection", (reason) => log("error", `Unhandled rejection: ${reason}`));

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(ENV.PORT, () => {
  log("info", `TinCan signaling server on :${ENV.PORT} [${ENV.NODE_ENV}] origin=${ENV.ALLOWED_ORIGIN}`);
});

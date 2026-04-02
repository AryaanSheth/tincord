import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

function createClient(name: string): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times) => {
      if (times > 10) {
        log(`[redis:${name}] Giving up after ${times} retries`);
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000);
    },
  });

  client.on("connect",     () => log(`[redis:${name}] connected`));
  client.on("ready",       () => log(`[redis:${name}] ready`));
  client.on("error",  (err) => log(`[redis:${name}] error: ${err.message}`));
  client.on("close",       () => log(`[redis:${name}] connection closed`));
  client.on("reconnecting",() => log(`[redis:${name}] reconnecting...`));

  return client;
}

function log(msg: string) {
  console.log(`${new Date().toISOString()} ${msg}`);
}

// Main client for data operations
export const redis = createClient("main");

// Dedicated pub/sub clients for Socket.io Redis adapter
export const redisPub = createClient("pub");
export const redisSub = createClient("sub");

// Key namespace helpers
export const KEY = {
  queue:      ()         => "tc:queue",
  pair:       (sid: string) => `tc:pair:${sid}`,
  socket:     (sid: string) => `tc:sock:${sid}`,
  ban:        (ip: string)  => `tc:ban:${ip}`,
  reports:    (ip: string)  => `tc:reports:${ip}`,
  connCount:  (ip: string)  => `tc:conns:${ip}`,
};

// TTLs
export const TTL = {
  socket:    3_600,          // 1 hour
  pair:      3_600,          // 1 hour
  ban:       86_400,         // 24 hours
  connCount: 3_600,          // 1 hour
};

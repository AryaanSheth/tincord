import "dotenv/config";

const IS_PROD = process.env.NODE_ENV === "production";

function mustHave(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function warn(key: string, fallback: string): string {
  const val = process.env[key];
  if (!val && IS_PROD) {
    console.warn(`[env] WARNING: ${key} not set in production — using fallback "${fallback}"`);
  }
  return val ?? fallback;
}

// In production, these must be set. In development, safe defaults are used.
export const ENV = {
  NODE_ENV:      process.env.NODE_ENV    ?? "development",
  IS_PROD,
  PORT:          parseInt(process.env.PORT ?? "3001", 10),
  REDIS_URL:     warn("REDIS_URL",       "redis://localhost:6379"),
  ALLOWED_ORIGIN:warn("ALLOWED_ORIGIN",  "http://localhost:3000"),
  TRUST_PROXY:   process.env.TRUST_PROXY === "true",
  HEALTH_API_KEY:process.env.HEALTH_API_KEY ?? "", // empty = no auth (dev only)
  TURN_URL:      warn("TURN_URL",        "turn:localhost:3478"),
  TURN_SECRET:   process.env.TURN_SECRET ?? "", // empty = static creds
  TURN_USER:     process.env.TURN_USER   ?? "tincan",
  TURN_PASS:     process.env.TURN_PASS   ?? "tincan",
};

// Hard failures in production
if (IS_PROD) {
  mustHave("REDIS_URL");
  mustHave("ALLOWED_ORIGIN");
  mustHave("TURN_URL");
  mustHave("TURN_SECRET");
  mustHave("HEALTH_API_KEY");
}

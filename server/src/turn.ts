import { createHmac } from "crypto";

const TURN_SECRET  = process.env.TURN_SECRET  ?? "";
const TURN_URL     = process.env.TURN_URL     ?? "turn:localhost:3478";
const TURN_TTL_SEC = 3_600; // credential lifetime

/**
 * Generates short-lived TURN credentials using the coturn
 * REST-API / HMAC-SHA1 mechanism (RFC-compliant).
 *
 * coturn config needed:
 *   use-auth-secret=true
 *   static-auth-secret=<same value as TURN_SECRET>
 */
export function generateTurnCredentials() {
  if (!TURN_SECRET) {
    // Dev fallback — static credentials, no HMAC
    return {
      urls:       TURN_URL,
      username:   process.env.TURN_USER ?? "tincan",
      credential: process.env.TURN_PASS ?? "tincan",
      ttl:        TURN_TTL_SEC,
    };
  }

  const expiry   = Math.floor(Date.now() / 1000) + TURN_TTL_SEC;
  const username = `${expiry}:tincan`;
  const credential = createHmac("sha1", TURN_SECRET)
    .update(username)
    .digest("base64");

  return {
    urls: TURN_URL,
    username,
    credential,
    ttl: TURN_TTL_SEC,
  };
}

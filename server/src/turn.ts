import { createHmac } from "crypto";

const TURN_SECRET  = process.env.TURN_SECRET  ?? "";
const TURN_URL     = process.env.TURN_URL     ?? "";
const TURN_TTL_SEC = 3_600;

// Extract the Metered domain from TURN_URL (e.g. "turns:tincan.metered.live:443" → "tincan.metered.live")
function meteredDomain(): string | null {
  if (!TURN_URL) return null;
  const match = TURN_URL.match(/^turns?:([^:]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch short-lived TURN credentials from Metered's REST API.
 * Falls back to HMAC-SHA1 (coturn use-auth-secret) if not a Metered domain,
 * and to STUN-only in dev when no secret is configured.
 */
export async function generateTurnCredentials(): Promise<object> {
  const domain = meteredDomain();

  // Metered: call their REST API for credentials
  if (domain && TURN_SECRET && domain.includes("metered.live")) {
    try {
      const res = await fetch(
        `https://${domain}/api/v1/turn/credentials?apiKey=${TURN_SECRET}`,
        { signal: AbortSignal.timeout(5_000) }
      );
      if (!res.ok) throw new Error(`Metered API ${res.status}`);
      const iceServers = await res.json() as object[];
      return { iceServers };
    } catch (err) {
      console.error(`[turn] Metered API error: ${err} — falling back to STUN only`);
      return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
    }
  }

  // Generic coturn use-auth-secret (HMAC-SHA1)
  if (TURN_SECRET && TURN_URL) {
    const expiry   = Math.floor(Date.now() / 1000) + TURN_TTL_SEC;
    const username = `${expiry}:tincan`;
    const credential = createHmac("sha1", TURN_SECRET)
      .update(username)
      .digest("base64");
    return {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: TURN_URL, username, credential },
      ],
    };
  }

  // Dev fallback — STUN only
  return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
}

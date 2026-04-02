import { createHmac } from "crypto";

const TURN_SECRET  = process.env.TURN_SECRET  ?? "";
const TURN_URL     = process.env.TURN_URL     ?? "";
const TURN_TTL_SEC = 3_600;

// Public TURN fallback for dev/testing — rate-limited, not for production load
function openRelayFallback() {
  return {
    iceServers: [
      { urls: "stun:openrelay.metered.ca:80" },
      { urls: "turn:openrelay.metered.ca:80",             username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443",            username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turns:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
    ],
  };
}

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

  // Metered: POST to their credential API
  if (domain && TURN_SECRET && domain.includes("metered.live")) {
    try {
      const res = await fetch(
        `https://${domain}/api/v1/turn/credential?secretKey=${encodeURIComponent(TURN_SECRET)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiryInSeconds: TURN_TTL_SEC, label: "tincan" }),
          signal: AbortSignal.timeout(5_000),
        }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Metered API ${res.status}: ${body}`);
      }
      const { username, password } = await res.json() as { username: string; password: string };

      return {
        iceServers: [
          { urls: `stun:${domain}:80` },
          { urls: `turn:${domain}:80`,                    username, credential: password },
          { urls: `turn:${domain}:80?transport=tcp`,      username, credential: password },
          { urls: `turn:${domain}:443?transport=tcp`,     username, credential: password },
          { urls: `turns:${domain}:443?transport=tcp`,    username, credential: password },
        ],
      };
    } catch (err) {
      console.error(`[turn] Metered API error: ${err} — falling back to OpenRelay`);
      return openRelayFallback();
    }
  }

  // Generic coturn use-auth-secret (HMAC-SHA1)
  if (TURN_SECRET && TURN_URL) {
    const expiry     = Math.floor(Date.now() / 1000) + TURN_TTL_SEC;
    const username   = `${expiry}:tincan`;
    const credential = createHmac("sha1", TURN_SECRET).update(username).digest("base64");
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

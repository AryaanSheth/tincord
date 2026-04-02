"use client";

const NAV_LINK: React.CSSProperties = {
  fontSize: 9, letterSpacing: 3, textTransform: "uppercase",
  textDecoration: "none", color: "#3a3530", transition: "color 0.2s",
};

const CODE: React.CSSProperties = {
  display: "block",
  background: "#141210",
  border: "1px solid #2a2520",
  borderRadius: 4,
  padding: "20px 24px",
  fontSize: 11,
  lineHeight: 1.8,
  color: "#8a7a6a",
  overflowX: "auto",
  whiteSpace: "pre",
  fontFamily: "'IBM Plex Mono', monospace",
  margin: "16px 0 0",
};

const DIVIDER: React.CSSProperties = {
  borderTop: "1px solid #2a2520",
  paddingTop: 48,
  paddingBottom: 48,
};

const LABEL: React.CSSProperties = {
  fontSize: 9, color: "#4a4035", letterSpacing: 4,
  textTransform: "uppercase", marginBottom: 16, display: "block",
};

const BODY: React.CSSProperties = {
  fontSize: 12, color: "#8a7a6a", lineHeight: 1.9, margin: 0,
};

const HEADING: React.CSSProperties = {
  fontSize: 11, color: "#c4a878", letterSpacing: 3,
  textTransform: "uppercase", margin: "0 0 12px", fontWeight: 400,
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 9, color: "#5a5045", letterSpacing: 2, textTransform: "uppercase",
      border: "1px solid #2a2520", borderRadius: 20, padding: "3px 10px",
      display: "inline-block", marginRight: 6, marginBottom: 6,
    }}>
      {children}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={DIVIDER}>
      <span style={LABEL}>{label}</span>
      {children}
    </div>
  );
}

const stackItems = [
  { layer: "client",      tech: "Next.js · TypeScript · WebRTC",  host: "Vercel" },
  { layer: "server",      tech: "Node.js · Socket.io · Express",   host: "Render" },
  { layer: "state",       tech: "Upstash Redis (serverless)",       host: "SOC2" },
  { layer: "turn relay",  tech: "Metered",                          host: "global" },
  { layer: "logs",        tech: "Grafana",                          host: "SOC2" },
];

const callSteps = [
  { n: "01", title: "mic grant", body: "getUserMedia acquires a 48 kHz mono stream with echo cancellation and noise suppression. An AudioContext + AnalyserNode is wired up immediately — the visualiser starts before a match is found." },
  { n: "02", title: "queue entry", body: "Socket connects and emits find_peer. An atomic Lua script on Redis either pops a waiting peer (match) or pushes the current socket ID (wait). The whole operation is a single Redis round trip — no race conditions possible." },
  { n: "03", title: "signaling", body: "On match, the server labels one peer offerer and one answerer. The offerer creates an SDP offer, sets it as local description, and emits it via Socket.io. The answerer mirrors the process with an answer. Both sides exchange ICE candidates bidirectionally through the server." },
  { n: "04", title: "ice negotiation", body: "Candidates arriving before setRemoteDescription completes are buffered (cap: 50) and drained once the remote description is set. This handles the common race where candidates arrive out of order. The server never inspects candidate content — it just relays them." },
  { n: "05", title: "connection", body: "RTCPeerConnection.connectionState transitions to connected — typically within 1–3 seconds of matching. The server steps out completely. Audio flows peer-to-peer, or through Metered's TURN relay if both users are behind strict NAT." },
  { n: "06", title: "teardown", body: "Either hang_up event or disconnect triggers pair deletion from Redis, peer_hung_up to the other side, PC close, mic track stop, and AudioContext close. The server decrements the per-IP connection count." },
];

const decisions = [
  {
    title: "atomic lua matchmaking",
    body: `The entire match/enqueue operation is one Lua script evaluated server-side. Redis executes Lua atomically, so two concurrent find_peer events cannot ever match the same waiting peer — even with multiple server instances.`,
    code: `local existing = redis.call('RPOP', KEYS[1])
if existing then return existing
else redis.call('LPUSH', KEYS[1], ARGV[1]) return false
end`,
  },
  {
    title: "turn credentials never in the bundle",
    body: `TURN credentials are generated server-side at match time and delivered through the existing WebSocket connection inside the matched event. No separate HTTP endpoint exists — credentials are only sent to users who are actually paired, never cached globally, and never reachable by unauthenticated HTTP requests.`,
    code: `// server: generate per-match and push through the WebSocket
const { iceServers } = await generateTurnCredentials();
io.to(socket.id).emit("matched", { role: "offerer", iceServers });
io.to(peerId).emit("matched",    { role: "answerer", iceServers });

// client: use credentials from the matched event directly
socket.on("matched", ({ role, iceServers }) => {
  const pc = new RTCPeerConnection({ iceServers });
});`,
  },
  {
    title: "reconnect re-queuing",
    body: `Render's load balancer drops idle WebSocket connections after ~55 seconds. Socket.io auto-reconnects with a new socket ID, but the old ID's queue entry was already removed by the server's disconnect handler. Without intervention, the user vanishes from the queue silently. The fix: re-emit find_peer on reconnect if still in searching state, and reset the 60-second search timer.`,
    code: `socket.on("connect", () => {
  if (callStateRef.current === "searching") {
    clearSearchTimer();
    startSearchTimer(); // full 60s window from reconnect
    socket.emit("find_peer");
  }
});`,
  },
  {
    title: "dual-layer rate limiting",
    body: `Per-socket limits (60 events/10s) are tracked in socket memory and disconnect abusive sockets immediately. Per-IP limits (120 events/10s) are tracked in Redis and cover multi-socket bypass attempts from the same IP. Both layers run on every signaling event.`,
    code: `// layer 1 — in memory, per socket
if (socketRateLimited(socket)) {
  socket.disconnect(true); return true;
}
// layer 2 — Redis, per IP (survives socket churn)
const count = await redis.incr(\`tc:iprl:\${ip}\`);
if (count > MAX_EVENTS_PER_IP) return true;`,
  },
];

export default function How() {
  return (
    <div style={{
      height: "100vh",
      overflowY: "auto",
      background: "#1a1612",
      fontFamily: "'IBM Plex Mono', monospace",
      color: "#8a7a6a",
    }}>
      {/* Nav */}
      <div style={{ borderBottom: "1px solid #2a2520", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={NAV_LINK}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#8a7a6a"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#3a3530"; }}>
          tincord
        </a>
        <span style={{ fontSize: 9, color: "#3a3530", letterSpacing: 3, textTransform: "uppercase" }}>
          engineering
        </span>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "80px 40px 160px" }}>

        {/* Hero */}
        <div style={{ marginBottom: 72 }}>
          <h1 style={{ fontSize: 36, fontWeight: 300, color: "#e8c9a0", letterSpacing: 5, textTransform: "lowercase", margin: "0 0 16px" }}>
            how it&apos;s built
          </h1>
          <p style={{ ...BODY, color: "#5a5045", maxWidth: 480 }}>
            A breakdown of the architecture, key technical decisions, and the problems that came up building a real-time anonymous voice app.
          </p>
          <div style={{ marginTop: 20 }}>
            <a
              href="https://github.com/AryaanSheth/tincord"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...NAV_LINK, border: "1px solid #2a2520", borderRadius: 20, padding: "5px 14px", display: "inline-block" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#c4a878"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "#4a3f35"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#3a3530"; (e.currentTarget as HTMLAnchorElement).style.borderColor = "#2a2520"; }}
            >
              ★ view source
            </a>
          </div>
        </div>

        {/* Architecture */}
        <Section label="architecture">
          <p style={BODY}>
            Three tiers. The signaling server exists only to bootstrap connections — once two browsers are talking, it goes completely idle for the rest of the call.
          </p>
          <code style={CODE}>{`browser A ──── websocket (signaling) ────▶ server ◀──── websocket ──── browser B
                                             │
                                         upstash redis
                                      (matchmaking state)

browser A ══════════════ webrtc audio (p2p) ══════════════ browser B
              (via metered turn relay if direct fails)`}
          </code>
        </Section>

        {/* Stack */}
        <Section label="stack">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#2a2520", borderRadius: 4, overflow: "hidden" }}>
            {stackItems.map(({ layer, tech, host }) => (
              <div key={layer} style={{ background: "#1a1612", padding: "20px 18px" }}>
                <div style={{ fontSize: 9, color: "#4a4035", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>{layer}</div>
                <div style={{ fontSize: 11, color: "#8a7a6a", lineHeight: 1.7 }}>{tech}</div>
                <div style={{ fontSize: 9, color: "#3a3530", marginTop: 6 }}>{host}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20 }}>
            <Tag>next.js</Tag><Tag>typescript</Tag><Tag>socket.io</Tag>
            <Tag>webrtc</Tag><Tag>redis</Tag><Tag>docker</Tag>
            <Tag>express</Tag><Tag>vercel</Tag><Tag>render</Tag>
          </div>
        </Section>

        {/* Call flow */}
        <Section label="a call, step by step">
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {callSteps.map((step, i) => (
              <div key={step.n} style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr",
                gap: 24,
                paddingTop: 24,
                paddingBottom: 24,
                borderBottom: i < callSteps.length - 1 ? "1px solid #1f1c19" : "none",
              }}>
                <div style={{ fontSize: 10, color: "#3a3530", letterSpacing: 2, paddingTop: 2 }}>{step.n}</div>
                <div>
                  <h3 style={HEADING}>{step.title}</h3>
                  <p style={BODY}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Key decisions */}
        <Section label="key decisions">
          <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
            {decisions.map((d) => (
              <div key={d.title}>
                <h3 style={HEADING}>{d.title}</h3>
                <p style={BODY}>{d.body}</p>
                <code style={CODE}>{d.code}</code>
              </div>
            ))}
          </div>
        </Section>

        {/* Security */}
        <Section label="security model">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "#2a2520", borderRadius: 4, overflow: "hidden" }}>
            {[
              { title: "origin validation", body: "Every WebSocket connection is rejected if the Origin header doesn't match the configured allowed origin. Prevents cross-site WebSocket hijacking." },
              { title: "payload validation", body: "SDP type is allowlisted (offer/answer only). SDP capped at 8 KB, ICE candidates at 1 KB. Socket.io maxHttpBufferSize set to 16 KB." },
              { title: "rate limiting", body: "60 events/10s per socket (in-memory, disconnects violators) + 120 events/10s per IP (Redis, survives socket churn). Both run on every event." },
              { title: "abuse + bans", body: "Reports use a Redis sorted set with timestamp scores. 3 reports in 30 min from distinct IPs triggers a 24-hour IP ban. Report data self-expires." },
              { title: "ip privacy", body: "IPs are SHA-256 hashed (salted) before appearing in any log. Raw IPs exist only in Redis for enforcement and expire automatically." },
              { title: "csp + headers", body: "Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy on both client (Next.js) and server (Helmet)." },
            ].map(({ title, body }) => (
              <div key={title} style={{ background: "#1a1612", padding: "24px 20px" }}>
                <div style={{ fontSize: 9, color: "#5a5045", letterSpacing: 3, textTransform: "uppercase", marginBottom: 10 }}>{title}</div>
                <p style={{ ...BODY, fontSize: 11 }}>{body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Footer */}
        <p style={{ marginTop: 80, marginBottom: 0, fontSize: 10, color: "#3a3530", letterSpacing: 2, textAlign: "center" }}>
          open source — <a href="https://github.com/AryaanSheth/tincord" target="_blank" rel="noopener noreferrer"
            style={{ color: "#4a4035", textDecoration: "none" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#8a7a6a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#4a4035"; }}>
            github.com/AryaanSheth/tincord
          </a>
        </p>
      </div>
    </div>
  );
}

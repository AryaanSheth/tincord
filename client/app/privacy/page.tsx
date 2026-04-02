"use client";

const sections = [
  {
    title: "what tincord is",
    content: `Tincord is an anonymous, ephemeral voice chat service. You are connected to a random stranger for a one-on-one voice conversation. No accounts are required. No audio is recorded or stored. When the call ends, it is gone.`,
  },
  {
    title: "what we collect",
    content: `Your IP address is collected temporarily for two purposes only: rate limiting (max 10 connections per IP) and abuse prevention (3 reports within 30 minutes triggers a 24-hour ban). IP addresses are hashed with SHA-256 before appearing in any logs. Raw IPs in Redis expire automatically — bans after 24 hours, rate counters within minutes. We do not use cookies, analytics, or tracking scripts. We do not collect names, emails, or any identifying information.`,
  },
  {
    title: "audio",
    content: `Voice audio travels directly between browsers over WebRTC. It only passes through a TURN relay server when a direct peer-to-peer connection cannot be established (e.g. both users are behind strict NAT). In either case, audio is never recorded, stored, or inspected.`,
  },
  {
    title: "session identifiers",
    content: `Each connection is assigned a random session ID (e.g. Tincord-A1B2C3D4E5F6) visible only to you. It exists for the duration of the connection and is discarded on disconnect. It is not linked to your identity.`,
  },
  {
    title: "reports and bans",
    content: `Reporting a user flags their IP. After 3 reports from different users within 30 minutes, that IP is banned for 24 hours. Report data expires after 30 minutes. We do not review reports manually.`,
  },
  {
    title: "infrastructure",
    content: `Signaling server: Render (United States). Session state: Upstash Redis (SOC2). Logs: Grafana (SOC2). TURN relay: Metered.`,
  },
  {
    title: "your rights",
    content: `We do not collect personal data tied to an identity, so there is nothing to access, correct, or delete beyond what expires automatically. Incorrectly banned? Wait 24 hours.`,
  },
  {
    title: "changes",
    content: `If this policy changes materially, the date at the top will reflect it. Continued use constitutes acceptance.`,
  },
];

export default function Privacy() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1612",
      fontFamily: "'IBM Plex Mono', monospace",
      color: "#8a7a6a",
    }}>
      {/* Thin top bar */}
      <div style={{ borderBottom: "1px solid #2a2520", padding: "20px 40px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="/" style={{
          fontSize: 11, color: "#4a4035", letterSpacing: 4,
          textDecoration: "none", textTransform: "lowercase",
          transition: "color 0.2s",
        }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#8a7a6a"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#4a4035"; }}
        >
          tincord
        </a>
        <span style={{ fontSize: 9, color: "#3a3530", letterSpacing: 3, textTransform: "uppercase" }}>
          privacy policy
        </span>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "80px 40px 120px" }}>

        {/* Hero */}
        <div style={{ marginBottom: 72 }}>
          <h1 style={{
            fontSize: 36, fontWeight: 300, color: "#e8c9a0",
            letterSpacing: 5, textTransform: "lowercase",
            margin: "0 0 16px",
          }}>
            privacy
          </h1>
          <p style={{ fontSize: 10, color: "#3a3530", letterSpacing: 3, textTransform: "uppercase", margin: 0 }}>
            last updated — april 2026
          </p>
        </div>

        {/* Summary cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 1,
          background: "#2a2520",
          marginBottom: 72,
          borderRadius: 4,
          overflow: "hidden",
        }}>
          {[
            { icon: "◎", label: "no accounts" },
            { icon: "◎", label: "no recordings" },
            { icon: "◎", label: "no tracking" },
          ].map(({ icon, label }) => (
            <div key={label} style={{
              background: "#1a1612",
              padding: "20px 16px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 16, color: "#4a4035", marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 9, color: "#5a5045", letterSpacing: 3, textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {sections.map((s, i) => (
            <div key={s.title} style={{
              borderTop: "1px solid #2a2520",
              paddingTop: 32,
              paddingBottom: 32,
              display: "grid",
              gridTemplateColumns: "180px 1fr",
              gap: 32,
              ...(i === sections.length - 1 ? { borderBottom: "1px solid #2a2520" } : {}),
            }}>
              <div style={{
                fontSize: 10, color: "#5a5045", letterSpacing: 3,
                textTransform: "uppercase", paddingTop: 3, lineHeight: 1.6,
              }}>
                {s.title}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#8a7a6a", lineHeight: 1.9 }}>
                {s.content}
              </p>
            </div>
          ))}
        </div>

        {/* Footer line */}
        <p style={{
          marginTop: 64, fontSize: 10, color: "#3a3530",
          letterSpacing: 2, textAlign: "center",
        }}>
          tincord.com — anonymous voice, nothing more.
        </p>
      </div>
    </div>
  );
}

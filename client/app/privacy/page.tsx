export default function Privacy() {
  const section: React.CSSProperties = { marginBottom: 32 };
  const h2: React.CSSProperties = {
    fontSize: 11, fontWeight: 400, letterSpacing: 3, textTransform: "uppercase",
    color: "#c4a878", marginBottom: 12, marginTop: 0,
  };
  const p: React.CSSProperties = { color: "#8a7a6a", lineHeight: 1.8, marginBottom: 10, marginTop: 0 };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1612",
      fontFamily: "'IBM Plex Mono', monospace",
      display: "flex",
      justifyContent: "center",
      padding: "60px 24px",
    }}>
      <div style={{ maxWidth: 580, width: "100%" }}>
        <a href="/" style={{ fontSize: 10, color: "#4a4035", letterSpacing: 3, textDecoration: "none",
          textTransform: "uppercase", display: "block", marginBottom: 40 }}>
          ← tincord
        </a>

        <h1 style={{ fontSize: 22, fontWeight: 300, color: "#e8c9a0", letterSpacing: 4,
          textTransform: "lowercase", marginBottom: 8, marginTop: 0 }}>
          privacy policy
        </h1>
        <p style={{ ...p, fontSize: 10, color: "#4a4035", marginBottom: 40 }}>
          last updated april 2026
        </p>

        <div style={section}>
          <h2 style={h2}>what tincord is</h2>
          <p style={p}>
            Tincord is an anonymous, ephemeral voice chat service. You are connected to a random
            stranger for a one-on-one voice conversation. No accounts are required. No audio is
            recorded or stored. When the call ends, it is gone.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>what we collect</h2>
          <p style={p}>
            We collect your IP address temporarily for the following purposes only:
          </p>
          <ul style={{ ...p, paddingLeft: 20 }}>
            <li style={{ marginBottom: 6 }}>Rate limiting — to prevent connection flooding (limit: 10 connections per IP).</li>
            <li style={{ marginBottom: 6 }}>Abuse prevention — if multiple users report you within a 30-minute window, your IP is banned for 24 hours.</li>
          </ul>
          <p style={p}>
            IP addresses are hashed (SHA-256) before appearing in any server logs. Raw IPs are
            stored in Redis only for ban/rate-limit enforcement and expire automatically (bans: 24 hours,
            rate counters: seconds to minutes).
          </p>
          <p style={p}>
            We do not use cookies. We do not use third-party analytics or tracking scripts.
            We do not collect names, emails, or any identifying information.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>audio</h2>
          <p style={p}>
            Voice audio is transmitted directly between browsers using WebRTC. It passes through
            our TURN relay servers only when a direct peer-to-peer connection cannot be established
            (e.g. both users are behind strict NAT). In either case, audio is never recorded,
            stored, or inspected.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>session identifiers</h2>
          <p style={p}>
            Each connection is assigned a random session ID (e.g. Tincord-A1B2C3D4E5F6) visible
            only to you. This ID exists for the duration of the connection and is discarded when
            you disconnect. It is not linked to your identity in any way.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>reports and bans</h2>
          <p style={p}>
            If you report another user, their IP is flagged. After 3 reports within 30 minutes
            from different users, that IP is banned for 24 hours. Report data expires after
            30 minutes. We do not review individual reports manually.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>infrastructure</h2>
          <p style={p}>
            The signaling server runs on Render (United States). Session state is stored in
            Upstash Redis (SOC2 compliant). Server logs are shipped to Grafana (SOC2 compliant).
            TURN relay is provided by Metered.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>your rights</h2>
          <p style={p}>
            Because we do not collect personal data tied to an identity, there is nothing to
            access, correct, or delete beyond what expires automatically. If you believe your IP
            has been incorrectly banned, you can wait 24 hours for the ban to expire.
          </p>
        </div>

        <div style={section}>
          <h2 style={h2}>changes</h2>
          <p style={p}>
            If this policy changes materially, the &quot;last updated&quot; date at the top will reflect that.
            Continued use of Tincord after changes constitutes acceptance.
          </p>
        </div>

        <p style={{ ...p, fontSize: 10, borderTop: "1px solid #2a2520", paddingTop: 24, marginTop: 40 }}>
          tincord.com — anonymous voice, nothing more.
        </p>
      </div>
    </div>
  );
}

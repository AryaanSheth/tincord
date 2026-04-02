"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import TinCan from "@/components/TinCan";
import StringCanvas from "@/components/StringCanvas";
import VoiceLevel from "@/components/VoiceLevel";
import Timer from "@/components/Timer";
import { getSocket } from "@/lib/socket";
import { useWebRTC } from "@/hooks/useWebRTC";

const BTN_BASE: React.CSSProperties = {
  background: "none",
  fontFamily: "'IBM Plex Mono', monospace",
  cursor: "pointer",
  letterSpacing: 3,
  textTransform: "uppercase",
  fontSize: 11,
  borderRadius: 50,
  padding: "10px 28px",
  transition: "all 0.3s",
};

export default function Home() {
  const socket = useMemo(() => getSocket(), []);
  const { callState, tinId, audioLevels, connectedAt, pickUp, hangUp, next, reportPeer, bindSocketEvents } =
    useWebRTC(socket);

  // Search animation dots
  const [searchDots, setSearchDots] = useState("");

  // Footer stats — polled from server health endpoint
  const [stats, setStats] = useState({ online: 0, totalCalls: 0 });
  const totalCallsRef = useRef(0);

  useEffect(() => {
    bindSocketEvents();
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [bindSocketEvents, socket]);

  // Dots animation while searching
  useEffect(() => {
    if (callState !== "searching") { setSearchDots(""); return; }
    let count = 0;
    const iv = setInterval(() => { count = (count + 1) % 4; setSearchDots(".".repeat(count)); }, 500);
    return () => clearInterval(iv);
  }, [callState]);

  // Poll /health for live stats
  useEffect(() => {
    const url = (process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:3001") + "/health";
    const poll = async () => {
      try {
        const res = await fetch(url);
        const data = await res.json();
        const online = (data.waiting ?? 0) + (data.activePairs ?? 0) * 2;
        if (callState === "connected") totalCallsRef.current = Math.max(totalCallsRef.current, data.activePairs ?? 0);
        setStats({ online, totalCalls: totalCallsRef.current });
      } catch { /* server not reachable */ }
    };
    poll();
    const iv = setInterval(poll, 5000);
    return () => clearInterval(iv);
  }, [callState]);

  const isConnected = callState === "connected";
  const isSearching = callState === "searching";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1a1612",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace",
        position: "relative",
        overflow: "hidden",
        padding: "40px 20px",
      }}
    >
      {/* Keyframe definitions */}
      <style>{`
        @keyframes tincan-pulse {
          0%   { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0;   transform: scale(1.5); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes searchGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(232,201,160,0.1); }
          50%       { box-shadow: 0 0 40px rgba(232,201,160,0.25); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes gentleBob {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-3px); }
        }
      `}</style>

      {/* Noise texture */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 50, animation: "fadeIn 0.8s ease" }}>
        <h1 style={{ fontSize: 42, fontWeight: 300, color: "#e8c9a0", margin: 0, letterSpacing: 6, textTransform: "lowercase" }}>
          tincan
        </h1>
        <div style={{ fontSize: 11, color: "#6a5d50", letterSpacing: 4, textTransform: "uppercase", marginTop: 8 }}>
          tin cans on a string
        </div>
        {tinId && (
          <div style={{ fontSize: 10, color: "#4a4035", letterSpacing: 3, marginTop: 6 }}>
            {tinId}
          </div>
        )}
      </div>

      {/* Cans + String */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
          marginBottom: 40,
          animation: "fadeIn 1s ease 0.2s both",
        }}
      >
        {/* Left can — you */}
        <div style={{ textAlign: "center" }}>
          <div style={{ animation: isConnected ? "gentleBob 3s ease infinite" : "none" }}>
            <TinCan
              side="left"
              active={isConnected}
              speaking={isConnected && audioLevels.local > 0.35}
            />
          </div>
          <div style={{ fontSize: 10, color: isConnected ? "#c4a878" : "#5a5045", letterSpacing: 2, textTransform: "uppercase", marginTop: 8 }}>
            you
          </div>
        </div>

        {/* String */}
        <div style={{ width: 240, margin: "0 -10px", marginBottom: 20 }}>
          <StringCanvas
            active={isConnected}
            searching={isSearching}
            remoteLevel={audioLevels.remote}
          />
        </div>

        {/* Right can — stranger */}
        <div style={{ textAlign: "center" }}>
          <div style={{ animation: isConnected ? "gentleBob 3s ease infinite 1.5s" : "none" }}>
            <TinCan
              side="right"
              active={isConnected}
              speaking={isConnected && audioLevels.remote > 0.35}
            />
          </div>
          <div style={{ fontSize: 10, color: isConnected ? "#c4a878" : "#5a5045", letterSpacing: 2, textTransform: "uppercase", marginTop: 8 }}>
            stranger
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          textAlign: "center",
          animation: "fadeIn 1s ease 0.4s both",
          minHeight: 160,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* IDLE */}
        {(callState === "idle" || callState === "banned") && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <button
              onClick={pickUp}
              disabled={callState === "banned"}
              style={{
                ...BTN_BASE,
                border: "1.5px solid #6a5d50",
                color: callState === "banned" ? "#4a4035" : "#e8c9a0",
                padding: "14px 48px",
                fontSize: 13,
                borderRadius: 50,
                cursor: callState === "banned" ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => {
                if (callState === "banned") return;
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#c4a878";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 30px rgba(232,201,160,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#6a5d50";
                (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
              }}
            >
              pick up the can
            </button>
            <div style={{ fontSize: 10, color: callState === "banned" ? "#8b2020" : "#4a4035", marginTop: 16, letterSpacing: 2 }}>
              {callState === "banned" ? "suspended for 24 hours." : "no accounts. no history. just voice."}
            </div>
          </div>
        )}

        {/* SEARCHING */}
        {callState === "searching" && (
          <div style={{ animation: "fadeIn 0.3s ease, searchGlow 2s ease infinite", padding: 20, borderRadius: 20 }}>
            <div style={{
              width: 32, height: 32,
              border: "2px solid #3a3530",
              borderTop: "2px solid #c4a878",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
              margin: "0 auto 16px",
            }} />
            <div style={{ fontSize: 13, color: "#8a7a6a", letterSpacing: 3, textTransform: "uppercase" }}>
              finding a stranger{searchDots}
            </div>
            <div style={{ marginTop: 16 }}>
              <VoiceLevel level={audioLevels.local} label="mic" />
            </div>
            <button
              onClick={hangUp}
              style={{ background: "none", border: "none", color: "#5a5045", fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", cursor: "pointer", marginTop: 12, letterSpacing: 2 }}
            >
              cancel
            </button>
          </div>
        )}

        {/* CONNECTED */}
        {callState === "connected" && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <Timer startTime={connectedAt} />
            <div style={{ display: "flex", gap: 40, justifyContent: "center", margin: "20px 0" }}>
              <VoiceLevel level={audioLevels.local} label="you" />
              <VoiceLevel level={audioLevels.remote} label="them" />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 4, flexWrap: "wrap" }}>
              <button
                onClick={next}
                style={{ ...BTN_BASE, border: "1px solid #4a4035", color: "#8a7a6a" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#6a5d50"; (e.currentTarget as HTMLButtonElement).style.color = "#c4a878"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#4a4035"; (e.currentTarget as HTMLButtonElement).style.color = "#8a7a6a"; }}
              >
                next
              </button>
              <button
                onClick={hangUp}
                style={{ ...BTN_BASE, border: "1px solid #6b3a3a", color: "#c47a6a" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#8b4a4a"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 0 20px rgba(196,122,106,0.15)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#6b3a3a"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "none"; }}
              >
                hang up
              </button>
              <button
                onClick={reportPeer}
                style={{ ...BTN_BASE, border: "1px solid #4a2020", color: "#8a5050", fontSize: 10 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#8b3a3a"; (e.currentTarget as HTMLButtonElement).style.color = "#c47a6a"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#4a2020"; (e.currentTarget as HTMLButtonElement).style.color = "#8a5050"; }}
              >
                report
              </button>
            </div>
          </div>
        )}

        {/* DISCONNECTED */}
        {callState === "disconnected" && (
          <div style={{ animation: "fadeIn 0.3s ease", fontSize: 13, color: "#6a5d50", letterSpacing: 3 }}>
            string cut.
          </div>
        )}

        {/* TIMEOUT */}
        {callState === "timeout" && (
          <div style={{ animation: "fadeIn 0.3s ease", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#6a5d50", letterSpacing: 3, marginBottom: 6 }}>
              no one online right now.
            </div>
            <div style={{ fontSize: 10, color: "#4a4035", letterSpacing: 2 }}>
              try again in a moment.
            </div>
          </div>
        )}

        {/* SERVER ERROR */}
        {callState === "server_error" && (
          <div style={{ animation: "fadeIn 0.3s ease", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "#8b2020", letterSpacing: 3, marginBottom: 6 }}>
              connection lost.
            </div>
            <button
              onClick={pickUp}
              style={{ ...BTN_BASE, border: "1px solid #6a5d50", color: "#e8c9a0", marginTop: 8 }}
            >
              try again
            </button>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: 0, right: 0,
          display: "flex",
          justifyContent: "center",
          gap: 32,
          animation: "fadeIn 1.2s ease 0.6s both",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, color: "#6a5d50", fontWeight: 300 }}>{stats.online}</div>
          <div style={{ fontSize: 9, color: "#4a4035", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>online</div>
        </div>
        <div style={{ width: 1, height: 30, background: "#2a2520" }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, color: "#6a5d50", fontWeight: 300 }}>{stats.totalCalls.toLocaleString()}</div>
          <div style={{ fontSize: 9, color: "#4a4035", letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>calls made</div>
        </div>
      </div>
    </div>
  );
}

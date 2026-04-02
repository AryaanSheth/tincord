"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

export type CallState =
  | "idle"
  | "searching"
  | "connected"
  | "disconnected"
  | "banned"
  | "timeout"      // no match found within SEARCH_TIMEOUT_MS
  | "server_error"; // signaling server unreachable

const SEARCH_TIMEOUT_MS = 60_000; // 60 s with no match → timeout state

export interface AudioLevels {
  local: number;
  remote: number;
}

// Fetch short-lived TURN credentials from the server (never bundled in JS)
async function fetchIceConfig(): Promise<RTCConfiguration> {
  const signalUrl  = process.env.NEXT_PUBLIC_SIGNAL_URL ?? "http://localhost:3001";
  const icePolicy  = (process.env.NEXT_PUBLIC_ICE_POLICY ?? "all") as RTCIceTransportPolicy;

  try {
    const res = await fetch(`${signalUrl}/turn-credentials`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const creds = await res.json();
    return {
      iceTransportPolicy: icePolicy,
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: creds.urls, username: creds.username, credential: creds.credential },
      ],
    };
  } catch {
    // Dev fallback — env vars
    return {
      iceTransportPolicy: icePolicy,
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        {
          urls:       process.env.NEXT_PUBLIC_TURN_URL  ?? "turn:localhost:3478",
          username:   process.env.NEXT_PUBLIC_TURN_USER ?? "tincan",
          credential: process.env.NEXT_PUBLIC_TURN_PASS ?? "tincan",
        },
      ],
    };
  }
}

export function useWebRTC(socket: Socket) {
  const [callState, setCallState]     = useState<CallState>("idle");
  const [tinId, setTinId]             = useState("");
  const [audioLevels, setAudioLevels] = useState<AudioLevels>({ local: 0, remote: 0 });
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  const pcRef              = useRef<RTCPeerConnection | null>(null);
  const localStreamRef     = useRef<MediaStream | null>(null);
  const remoteAudioRef     = useRef<HTMLAudioElement | null>(null);
  const analyzerRunning    = useRef(false);
  const analyzerFrameRef   = useRef<number>(0);
  const localAnalyzerRef   = useRef<{ analyzer: AnalyserNode; data: Uint8Array<ArrayBuffer> } | null>(null);
  const remoteAnalyzerRef  = useRef<{ analyzer: AnalyserNode; data: Uint8Array<ArrayBuffer> } | null>(null);
  const audioCtxRef        = useRef<AudioContext | null>(null);
  const iceCandidateBuffer = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet      = useRef(false);
  const searchTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Audio: local mic ─────────────────────────────────────────────────────────
  const setupLocalAudio = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      video: false,
    });
    localStreamRef.current = stream;

    const ctx      = new AudioContext();
    audioCtxRef.current = ctx;
    const src      = ctx.createMediaStreamSource(stream);
    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = 256;
    src.connect(analyzer);
    const data = new Uint8Array(analyzer.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    localAnalyzerRef.current = { analyzer, data };
    return stream;
  }, []);

  // ── Audio: remote stream ─────────────────────────────────────────────────────
  const setupRemoteAnalyzer = useCallback((stream: MediaStream) => {
    const ctx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = ctx;
    const src      = ctx.createMediaStreamSource(stream);
    const analyzer = ctx.createAnalyser();
    analyzer.fftSize = 256;
    src.connect(analyzer);
    const data = new Uint8Array(analyzer.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    remoteAnalyzerRef.current = { analyzer, data };
  }, []);

  // ── Single RAF loop — starts at mic-grant, stops at teardown ─────────────────
  const startAnalyzerLoop = useCallback(() => {
    if (analyzerRunning.current) return;
    analyzerRunning.current = true;
    const tick = () => {
      let local = 0, remote = 0;
      if (localAnalyzerRef.current) {
        const { analyzer, data } = localAnalyzerRef.current;
        analyzer.getByteFrequencyData(data);
        local = data.reduce((a, b) => a + b, 0) / (data.length * 255);
      }
      if (remoteAnalyzerRef.current) {
        const { analyzer, data } = remoteAnalyzerRef.current;
        analyzer.getByteFrequencyData(data);
        remote = data.reduce((a, b) => a + b, 0) / (data.length * 255);
      }
      setAudioLevels({ local, remote });
      analyzerFrameRef.current = requestAnimationFrame(tick);
    };
    analyzerFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const stopAnalyzerLoop = useCallback(() => {
    cancelAnimationFrame(analyzerFrameRef.current);
    analyzerRunning.current = false;
  }, []);

  // ── Search timeout timer ──────────────────────────────────────────────────────
  const startSearchTimer = useCallback(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setCallState("timeout");
      socket.emit("hang_up");
    }, SEARCH_TIMEOUT_MS);
  }, [socket]);

  const clearSearchTimer = useCallback(() => {
    if (searchTimerRef.current) { clearTimeout(searchTimerRef.current); searchTimerRef.current = null; }
  }, []);

  // ── Peer teardown (keeps mic alive for next()) ────────────────────────────────
  const closePeer = useCallback(() => {
    clearSearchTimer();
    remoteAnalyzerRef.current = null;
    iceCandidateBuffer.current = [];
    remoteDescSet.current = false;
    pcRef.current?.close();
    pcRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
  }, [clearSearchTimer]);

  // ── Full teardown ─────────────────────────────────────────────────────────────
  const teardown = useCallback((nextState: CallState = "idle") => {
    stopAnalyzerLoop();
    setAudioLevels({ local: 0, remote: 0 });
    closePeer();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localAnalyzerRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setConnectedAt(null);
    setCallState(nextState);
  }, [closePeer, stopAnalyzerLoop]);

  // ── RTCPeerConnection ─────────────────────────────────────────────────────────
  const createPC = useCallback(async (stream: MediaStream): Promise<RTCPeerConnection> => {
    const iceConfig = await fetchIceConfig();
    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;
    iceCandidateBuffer.current = [];
    remoteDescSet.current = false;

    stream.getTracks().forEach((t) => pc.addTrack(t, stream));

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("ice_candidate", { candidate: e.candidate.toJSON() });
    };

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0] ?? new MediaStream([e.track]);
      setupRemoteAnalyzer(remoteStream);
      if (!remoteAudioRef.current) {
        remoteAudioRef.current = new Audio();
        remoteAudioRef.current.autoplay = true;
        remoteAudioRef.current.volume = 1;
      }
      remoteAudioRef.current.srcObject = remoteStream;
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") {
        clearSearchTimer();
        setCallState("connected");
        setConnectedAt(Date.now());
      } else if (s === "failed" || s === "closed") {
        teardown("disconnected");
      }
    };

    return pc;
  }, [socket, setupRemoteAnalyzer, clearSearchTimer, teardown]);

  // ── pickUp ────────────────────────────────────────────────────────────────────
  const pickUp = useCallback(async () => {
    setCallState("searching");
    try {
      await setupLocalAudio();
    } catch {
      setCallState("idle");
      return;
    }
    startAnalyzerLoop();
    startSearchTimer();
    socket.connect();
    socket.emit("find_peer");
  }, [socket, setupLocalAudio, startAnalyzerLoop, startSearchTimer]);

  // ── hangUp ────────────────────────────────────────────────────────────────────
  const hangUp = useCallback(() => {
    socket.emit("hang_up");
    teardown("disconnected");
  }, [socket, teardown]);

  // ── next ──────────────────────────────────────────────────────────────────────
  const next = useCallback(() => {
    socket.emit("hang_up");
    closePeer();
    setConnectedAt(null);
    setCallState("searching");
    startSearchTimer();
    socket.emit("find_peer");
  }, [socket, closePeer, startSearchTimer]);

  // ── reportPeer ────────────────────────────────────────────────────────────────
  const reportPeer = useCallback(() => {
    socket.emit("report_peer");
    teardown("disconnected");
  }, [socket, teardown]);

  // ── Socket event handlers ─────────────────────────────────────────────────────
  const bindSocketEvents = useCallback(() => {
    socket.on("connect_error", () => setCallState("server_error"));

    socket.on("identity", ({ tinId: id }: { tinId: string }) => setTinId(id));

    socket.on("waiting", () => setCallState("searching")); // confirm still queued

    socket.on("matched", async ({ role }: { role: "offerer" | "answerer" }) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      clearSearchTimer();
      const pc = await createPC(stream);
      if (role === "offerer") {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("offer", { sdp: pc.localDescription });
      }
    });

    socket.on("offer", async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      remoteDescSet.current = true;
      for (const c of iceCandidateBuffer.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* benign */ }
      }
      iceCandidateBuffer.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", { sdp: pc.localDescription });
    });

    socket.on("answer", async ({ sdp }: { sdp: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      remoteDescSet.current = true;
      for (const c of iceCandidateBuffer.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* benign */ }
      }
      iceCandidateBuffer.current = [];
    });

    socket.on("ice_candidate", async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      if (!remoteDescSet.current) { iceCandidateBuffer.current.push(candidate); return; }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* benign */ }
    });

    socket.on("peer_hung_up",    () => teardown("disconnected"));
    socket.on("banned",          () => teardown("banned"));
    socket.on("server_shutdown", () => teardown("server_error"));
  }, [socket, createPC, teardown, clearSearchTimer]);

  // ── Auto-transitions ──────────────────────────────────────────────────────────
  // disconnected → idle after 2s
  useEffect(() => {
    if (callState !== "disconnected") return;
    const t = setTimeout(() => setCallState("idle"), 2000);
    return () => clearTimeout(t);
  }, [callState]);

  // timeout → idle after 4s (gives user time to read the message)
  useEffect(() => {
    if (callState !== "timeout") return;
    const t = setTimeout(() => setCallState("idle"), 4000);
    return () => clearTimeout(t);
  }, [callState]);

  return {
    callState, tinId, audioLevels, connectedAt,
    pickUp, hangUp, next, reportPeer, bindSocketEvents,
  };
}

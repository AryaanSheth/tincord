"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Socket } from "socket.io-client";

export type CallState =
  | "idle"
  | "requesting_mic"  // waiting for browser mic permission dialog
  | "searching"
  | "connecting"    // matched, waiting for WebRTC/ICE to establish
  | "connected"
  | "disconnected"
  | "banned"
  | "mic_denied"    // user denied mic access
  | "timeout"       // no match found within SEARCH_TIMEOUT_MS
  | "server_error"; // signaling server unreachable

const SEARCH_TIMEOUT_MS       = 60_000; // 60 s with no match → timeout state
const CONNECT_TIMEOUT_MS      = 30_000; // 30 s to complete WebRTC handshake after matching
const MAX_ICE_BUFFER          = 50;     // max buffered candidates before remote desc is set

export interface AudioLevels {
  local: number;
  remote: number;
}


export function useWebRTC(socket: Socket) {
  const [callState, setCallState]     = useState<CallState>("idle");
  const [tinId, setTinId]             = useState("");
  const [audioLevels, setAudioLevels] = useState<AudioLevels>({ local: 0, remote: 0 });
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const callStateRef       = useRef<CallState>("idle");
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
  const connectTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Keep ref in sync so socket event handlers always see the latest callState
  useEffect(() => { callStateRef.current = callState; }, [callState]);

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

  const startConnectTimer = useCallback((onTimeout: () => void) => {
    if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    connectTimerRef.current = setTimeout(onTimeout, CONNECT_TIMEOUT_MS);
  }, []);

  const clearConnectTimer = useCallback(() => {
    if (connectTimerRef.current) { clearTimeout(connectTimerRef.current); connectTimerRef.current = null; }
  }, []);

  // ── Peer teardown (keeps mic alive for next()) ────────────────────────────────
  const closePeer = useCallback(() => {
    clearSearchTimer();
    clearConnectTimer();
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
  const createPC = useCallback(async (stream: MediaStream, iceServers: RTCIceServer[]): Promise<RTCPeerConnection> => {
    const icePolicy = (process.env.NEXT_PUBLIC_ICE_POLICY ?? "all") as RTCIceTransportPolicy;
    const pc = new RTCPeerConnection({ iceTransportPolicy: icePolicy, iceServers });
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
        clearConnectTimer();
        setCallState("connected");
        setConnectedAt(Date.now());
      } else if (s === "failed") {
        // Notify the server so it cleans up the pair and tells the peer.
        // Without this, the Redis pair entry lingers and the peer gets a
        // spurious peer_hung_up only when *they* eventually disconnect.
        socket.emit("hang_up");
        teardown("disconnected");
        // Note: "closed" is intentionally not handled here — it fires when
        // closePeer() calls pc.close() and must not trigger another teardown.
      }
    };

    return pc;
  }, [socket, setupRemoteAnalyzer, clearConnectTimer, teardown]);

  // ── pickUp ────────────────────────────────────────────────────────────────────
  const pickUp = useCallback(async () => {
    setCallState("requesting_mic");
    try {
      await setupLocalAudio();
    } catch {
      setCallState("mic_denied");
      return;
    }
    setCallState("searching");
    startAnalyzerLoop();
    startSearchTimer();
    socket.connect();
    // If already connected (subsequent pickUp after hang-up), emit directly.
    // If not yet connected, the "connect" handler emits find_peer once the
    // handshake completes — avoids the duplicate emission on first connect.
    if (socket.connected) socket.emit("find_peer");
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
    // Track unintentional disconnects so the UI can show a reconnecting indicator.
    socket.on("disconnect", (reason) => {
      if (reason === "io client disconnect") return; // intentional — user hung up
      if (["searching", "connecting", "connected"].includes(callStateRef.current)) {
        setReconnecting(true);
      }
    });

    // Re-register in queue after a reconnect (new socket ID assigned by server).
    // Render's load balancer drops idle WebSocket connections after ~55s,
    // causing a silent reconnect that would otherwise leave the user invisible to the queue.
    // Guard: only re-queue when there is no active peer connection. After matching,
    // callState stays "searching" until WebRTC reaches "connected", so without this
    // check a brief EIO-level transport recovery fires "connect" and re-queues the
    // socket — overwriting the matched pair's queue slot and breaking signaling.
    socket.on("connect", () => {
      setReconnecting(false);
      if (callStateRef.current === "searching" && !pcRef.current) {
        // Reset the search timer so the reconnected user gets a full 60s window
        clearSearchTimer();
        startSearchTimer();
        socket.emit("find_peer");
      }
    });

    socket.on("connect_error", () => setCallState("server_error"));

    socket.on("identity", ({ tinId: id }: { tinId: string }) => setTinId(id));

    socket.on("waiting", () => setCallState("searching")); // confirm still queued

    socket.on("matched", async ({ role, iceServers }: { role: "offerer" | "answerer"; iceServers: RTCIceServer[] }) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      clearSearchTimer();
      setCallState("connecting");
      // If WebRTC handshake doesn't complete within 30 s, give up
      startConnectTimer(() => { socket.emit("hang_up"); teardown("timeout"); });
      const pc = await createPC(stream, iceServers);
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
      if (!remoteDescSet.current) {
        // Cap buffer to prevent memory exhaustion from a malicious peer
        if (iceCandidateBuffer.current.length < MAX_ICE_BUFFER) {
          iceCandidateBuffer.current.push(candidate);
        }
        return;
      }
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* benign */ }
    });

    socket.on("peer_hung_up",    () => teardown("disconnected"));
    socket.on("banned",          () => teardown("banned"));
    socket.on("server_shutdown", () => teardown("server_error"));
  }, [socket, createPC, teardown, clearSearchTimer, startSearchTimer, startConnectTimer]);

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
    callState, tinId, audioLevels, connectedAt, reconnecting,
    pickUp, hangUp, next, reportPeer, bindSocketEvents,
  };
}

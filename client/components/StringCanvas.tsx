"use client";

import { useEffect, useRef } from "react";

interface StringCanvasProps {
  active: boolean;      // connected
  searching: boolean;   // in queue
  localLevel: number;   // 0–1, local mic level
  remoteLevel: number;  // 0–1, remote audio level
}

export default function StringCanvas({ active, searching, localLevel, remoteLevel }: StringCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef(0);
  const animRef = useRef(0);
  const propsRef = useRef({ active, searching, localLevel, remoteLevel });

  // Keep latest props accessible inside the animation loop without restarting it
  useEffect(() => {
    propsRef.current = { active, searching, localLevel, remoteLevel };
  }, [active, searching, localLevel, remoteLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    const draw = () => {
      timeRef.current += 0.02;
      const t = timeRef.current;
      const { active, searching, localLevel, remoteLevel } = propsRef.current;
      // Scale raw analyzer values (same factor as VoiceLevel) for visual consistency
      const scaledLocal  = Math.min(localLevel  * 5, 1);
      const scaledRemote = Math.min(remoteLevel * 5, 1);
      const combinedLevel = Math.max(scaledLocal, scaledRemote);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const midY = h / 2;
      const amplitude = active
        ? 3 + combinedLevel * 22
        : searching
        ? 8 + Math.sin(t * 3) * 5
        : 1;
      const frequency = active ? 0.015 : searching ? 0.025 : 0.01;
      // Speed up the wave proportionally to how loud it is
      const speed = active ? 3 + combinedLevel * 6 : 3;

      // Primary string
      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let x = 0; x <= w; x += 2) {
        const progress = x / w;
        const sag = Math.sin(progress * Math.PI) * 20;
        const wave = Math.sin(x * frequency + t * speed) * amplitude;
        const vibration = active
          ? Math.sin(x * 0.05 + t * (8 + combinedLevel * 10)) * (2 + combinedLevel * 4) * Math.sin(progress * Math.PI)
          : 0;
        ctx.lineTo(x, midY + sag + wave + vibration);
      }

      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      if (active) {
        gradient.addColorStop(0,   "#c4956a");
        gradient.addColorStop(0.5, "#e8c9a0");
        gradient.addColorStop(1,   "#c4956a");
      } else if (searching) {
        gradient.addColorStop(0,   "#8a7060");
        gradient.addColorStop(0.5, "#b8956e");
        gradient.addColorStop(1,   "#8a7060");
      } else {
        gradient.addColorStop(0,   "#4a3f35");
        gradient.addColorStop(0.5, "#6a5d50");
        gradient.addColorStop(1,   "#4a3f35");
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = active ? 2.5 : 2;
      ctx.stroke();

      // Glow pass when active — intensity scales with voice
      if (active) {
        ctx.shadowColor = "#e8c9a0";
        ctx.shadowBlur = 6 + combinedLevel * 20;
        ctx.strokeStyle = `rgba(232, 201, 160, ${0.1 + combinedLevel * 0.5})`;
        ctx.lineWidth = 2 + combinedLevel * 4;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, []); // runs once; reads live props via ref

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={80}
      style={{ width: "100%", maxWidth: 300, height: 80, display: "block" }}
    />
  );
}

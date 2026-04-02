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

      // Calm sine wave when audio detected, still line when silent
      const amplitude = active
        ? combinedLevel * 10        // gentle — scales only with voice level
        : searching
        ? 4 + Math.sin(t * 2) * 3  // subtle idle pulse while searching
        : 0;                        // dead straight when idle

      const frequency = 0.018;
      const speed = 2.5;

      // Primary string
      ctx.beginPath();
      ctx.moveTo(0, midY);
      for (let x = 0; x <= w; x += 2) {
        const progress = x / w;
        const sag = Math.sin(progress * Math.PI) * 18;
        const wave = Math.sin(x * frequency + t * speed) * amplitude * Math.sin(progress * Math.PI);
        ctx.lineTo(x, midY + sag + wave);
      }

      const gradient = ctx.createLinearGradient(0, 0, w, 0);
      if (active) {
        gradient.addColorStop(0,   "#6a5d50");
        gradient.addColorStop(0.5, "#e8c9a0");
        gradient.addColorStop(1,   "#6a5d50");
      } else if (searching) {
        gradient.addColorStop(0,   "#4a3f35");
        gradient.addColorStop(0.5, "#8a7060");
        gradient.addColorStop(1,   "#4a3f35");
      } else {
        gradient.addColorStop(0,   "#3a3530");
        gradient.addColorStop(0.5, "#5a5045");
        gradient.addColorStop(1,   "#3a3530");
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5;
      ctx.stroke();

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

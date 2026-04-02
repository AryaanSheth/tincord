"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  startTime: number | null;
}

export default function Timer({ startTime }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) { setElapsed(0); return; }
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [startTime]);

  const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");

  return (
    <span
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 28,
        fontWeight: 300,
        color: "#e8c9a0",
        letterSpacing: 4,
      }}
    >
      {m}:{s}
    </span>
  );
}

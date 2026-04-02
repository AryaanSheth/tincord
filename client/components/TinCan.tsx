"use client";

import { motion } from "framer-motion";

interface TinCanProps {
  side: "left" | "right";
  active: boolean;
  speaking: boolean;
}

export default function TinCan({ side, active, speaking }: TinCanProps) {
  const isLeft = side === "left";
  const scale = speaking ? 1.03 : 1;
  const glow = active ? "drop-shadow(0 0 12px rgba(232,201,160,0.4))" : "none";

  return (
    <motion.div
      style={{
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        gap: 8,
        filter: glow,
        scaleX: isLeft ? 1 : -1,
      }}
      animate={{ scale }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <svg className="tc-can-svg" width="90" height="120" viewBox="0 0 90 120">
        <defs>
          <linearGradient id={`canGrad-${side}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={active ? "#a08060" : "#6b5d50"} />
            <stop offset="30%"  stopColor={active ? "#d4b896" : "#8a7a6a"} />
            <stop offset="50%"  stopColor={active ? "#e8cda8" : "#9a8a78"} />
            <stop offset="70%"  stopColor={active ? "#d4b896" : "#8a7a6a"} />
            <stop offset="100%" stopColor={active ? "#a08060" : "#6b5d50"} />
          </linearGradient>
          <linearGradient id={`rimGrad-${side}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor={active ? "#c4a878" : "#7a6e60"} />
            <stop offset="50%"  stopColor={active ? "#f0dcc0" : "#a09080"} />
            <stop offset="100%" stopColor={active ? "#c4a878" : "#7a6e60"} />
          </linearGradient>
        </defs>

        {/* Main cylinder */}
        <rect
          x="15" y="20" width="60" height="80" rx="3"
          fill={`url(#canGrad-${side})`}
          stroke={active ? "#c4a878" : "#5a5045"}
          strokeWidth="1.5"
        />

        {/* Top rim */}
        <ellipse
          cx="45" cy="22" rx="30" ry="8"
          fill={`url(#rimGrad-${side})`}
          stroke={active ? "#c4a878" : "#5a5045"}
          strokeWidth="1.5"
        />

        {/* Bottom rim */}
        <ellipse
          cx="45" cy="98" rx="30" ry="8"
          fill={active ? "#8a7050" : "#5a5045"}
          stroke={active ? "#a08060" : "#4a4035"}
          strokeWidth="1.5"
        />

        {/* Horizontal ridges */}
        {[38, 55, 72].map((y) => (
          <line
            key={y}
            x1="16" y1={y} x2="74" y2={y}
            stroke={active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"}
            strokeWidth="1"
          />
        ))}

        {/* String hole — on the outer edge */}
        <circle
          cx="75" cy="60" r="3"
          fill={active ? "#2a2218" : "#1a1510"}
          stroke={active ? "#a08060" : "#4a4035"}
          strokeWidth="1"
        />

        {/* Label area */}
        <rect
          x="25" y="42" width="40" height="28" rx="2"
          fill="rgba(0,0,0,0.15)"
          stroke={active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"}
          strokeWidth="0.5"
        />

        {/* Sound wave rings when speaking */}
        {speaking && [0, 1, 2].map((i) => (
          <circle
            key={i}
            cx="45" cy="22"
            r={12 + i * 8}
            fill="none"
            stroke="rgba(232,201,160,0.2)"
            strokeWidth="1"
            style={{ animation: `tincan-pulse 1.2s ease-out ${i * 0.3}s infinite` }}
          />
        ))}
      </svg>
    </motion.div>
  );
}

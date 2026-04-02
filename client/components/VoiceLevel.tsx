"use client";

interface VoiceLevelProps {
  level: number; // 0–1 (raw analyzer value)
  label: string;
}

// Raw analyzer averages all frequency bins (most silent), so values top out ~0.2.
// Scale up so normal speech fills the meter visually.
function scaleLevel(raw: number): number {
  return Math.min(raw * 5, 1);
}

// Bar color: green → amber → warm white as level increases
const BAR_COLORS = ["#6ab04c", "#8ac44a", "#c4b84a", "#e8c97a", "#e8c9a0", "#f0dcc0", "#fff8f0"];

export default function VoiceLevel({ level, label }: VoiceLevelProps) {
  const displayLevel = scaleLevel(level);

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          color: "#8a7a6a",
          letterSpacing: 2,
          textTransform: "uppercase" as const,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          gap: 3,
          justifyContent: "center",
          alignItems: "flex-end",
          height: 32,
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => {
          const barThreshold = (i + 1) / 7;
          const isActive = barThreshold <= displayLevel;
          return (
            <div
              key={i}
              style={{
                width: 5,
                height: 8 + i * 4,
                borderRadius: 2,
                backgroundColor: isActive ? BAR_COLORS[i] : "#2a2520",
                transition: "background-color 0.06s, box-shadow 0.06s",
                boxShadow: isActive ? `0 0 6px ${BAR_COLORS[i]}88` : "none",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

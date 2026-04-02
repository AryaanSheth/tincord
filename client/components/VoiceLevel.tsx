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

export default function VoiceLevel({ level, label }: VoiceLevelProps) {
  const displayLevel = scaleLevel(level);

  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 10,
          color: "#6a5d50",
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
          // Dimmer at bottom, brighter at top — matte white
          const opacity = isActive ? 0.3 + (i / 6) * 0.7 : 0.08;
          return (
            <div
              key={i}
              style={{
                width: 4,
                height: 8 + i * 4,
                borderRadius: 1,
                backgroundColor: "#e8c9a0",
                opacity,
                transition: "opacity 0.06s",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

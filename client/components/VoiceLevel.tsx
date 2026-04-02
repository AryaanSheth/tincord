"use client";

interface VoiceLevelProps {
  level: number; // 0–1
  label: string;
}

export default function VoiceLevel({ level, label }: VoiceLevelProps) {
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
          height: 24,
        }}
      >
        {Array.from({ length: 7 }).map((_, i) => {
          const barThreshold = (i + 1) / 7;
          const isActive = barThreshold <= level;
          return (
            <div
              key={i}
              style={{
                width: 4,
                height: 6 + i * 3,
                borderRadius: 1,
                backgroundColor: isActive ? "#e8c9a0" : "#3a3530",
                transition: "background-color 0.08s",
                opacity: isActive ? 0.6 + (i / 7) * 0.4 : 0.3,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

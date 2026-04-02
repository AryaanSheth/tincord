"use client";

import { motion, AnimatePresence } from "framer-motion";

interface StatusLineProps {
  state: "idle" | "searching" | "connected" | "banned";
  tinId: string;
}

const MESSAGES: Record<string, string> = {
  idle: "pick up the can.",
  searching: "searching...",
  connected: "connected.",
  banned: "suspended for 24h.",
};

export default function StatusLine({ state, tinId }: StatusLineProps) {
  return (
    <div style={{ textAlign: "center", minHeight: 48 }}>
      <AnimatePresence mode="wait">
        <motion.p
          key={state}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 13,
            letterSpacing: "0.15em",
            color: state === "banned" ? "#A52A2A" : "#B87333",
            textTransform: "lowercase",
          }}
        >
          {MESSAGES[state] ?? ""}
        </motion.p>
      </AnimatePresence>

      {tinId && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.35 }}
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "#B87333",
            marginTop: 6,
            textTransform: "uppercase",
          }}
        >
          {tinId}
        </motion.p>
      )}
    </div>
  );
}

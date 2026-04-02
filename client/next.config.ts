import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // produces a self-contained Node.js server for Docker
  turbopack: {
    // Silence the workspace root warning from multi-lockfile detection
    root: __dirname,
  },
};

export default nextConfig;

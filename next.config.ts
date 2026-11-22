import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page here is per-request (file-backed audits, live progress), so the
  // Cache Components prerendering model is turned off.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Every page here is per-request (file-backed audits, live progress), so the
  // Cache Components prerendering model is turned off.
  cacheComponents: false,
  // Don't advertise the framework in every response.
  poweredByHeader: false,
  // Security headers for every response, static files included. The Content Security Policy
  // (which needs a fresh nonce per page) and the optional password live in src/proxy.ts.
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      // Links out to audited sites shouldn't reveal which audit page they came from.
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
      // Audits hold client details: keep the app out of search engines.
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
    }
    return [{ source: "/:path*", headers }];
  },
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

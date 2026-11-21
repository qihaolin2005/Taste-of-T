import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Let phones reach the dev server through the `npm run phone` tunnel
  // or over the LAN, without Next blocking dev assets as cross-origin.
  allowedDevOrigins: ["*.trycloudflare.com", "192.168.*.*", "10.*.*.*", "*.local"],
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Hide the Next.js "N" badge `next dev` draws in the corner (it shows up in demos and on
  // phones). Compile and runtime errors still appear.
  devIndicators: false,
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

import type { NextConfig } from "next";

// Pure client-side mini app (auth lives in the Telegram WebView), so no Cache Components / PPR.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["acutely-king-unhappily.ngrok-free.dev", "dev.tradexai.pro"],
  experimental: {
    // the free icon pack is one barrel of ~4,000 modules
    optimizePackageImports: ["@hugeicons/core-free-icons"],
    agentUpgrade: "security",
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

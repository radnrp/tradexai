import type { NextConfig } from "next";

// Pure client-side mini app (auth lives in the Telegram WebView), so no Cache Components / PPR.
const nextConfig: NextConfig = {
  allowedDevOrigins: ["acutely-king-unhappily.ngrok-free.dev", "dev.tradexai.pro"],
  // the free icon pack is one barrel of ~4,000 modules
  experimental: { optimizePackageImports: ["@hugeicons/core-free-icons"] },
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

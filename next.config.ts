import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@aws-crypto"],
  async rewrites() {
    return [
      { source: "/privacy", destination: "/pdfs/privacypolicy01.pdf" },
      { source: "/terms", destination: "/pdfs/termsofuse01.pdf" },
    ];
  },
};

export default nextConfig;

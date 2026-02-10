import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@aws-crypto"],
  async redirects() {
    return [
      { source: "/privacy", destination: "/pdfs/privacypolicy01.pdf", permanent: true },
      { source: "/terms", destination: "/pdfs/termsofuse01.pdf", permanent: true },
    ];
  },
};

export default nextConfig;

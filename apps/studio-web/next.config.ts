import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  headers: async () => [
    { source: "/(.*)", headers: [{ key: "Cross-Origin-Opener-Policy", value: "same-origin" }] }
  ]
};
export default nextConfig;

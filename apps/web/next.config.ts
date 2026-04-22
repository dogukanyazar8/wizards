import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@wizards/ui", "@wizards/types", "@wizards/db"],
  allowedDevOrigins: ["192.168.1.4"],
};

export default nextConfig;

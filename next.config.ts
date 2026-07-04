import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/vehicles": ["./data/gtfs-static/metadata.json"],
    "/api/trip-updates": ["./data/gtfs-static/metadata.json"]
  }
};

export default nextConfig;

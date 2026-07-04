import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/vehicles": ["./data/gtfs-static/metadata.json", "./data/gtfs-static/metadata.json.gz"],
    "/api/trip-updates": ["./data/gtfs-static/metadata.json", "./data/gtfs-static/metadata.json.gz"],
    "/api/trip-details": [
      "./data/gtfs-static/metadata.json",
      "./data/gtfs-static/metadata.json.gz",
      "./data/gtfs-static/trip-details.json.gz"
    ]
  }
};

export default nextConfig;

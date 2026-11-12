import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

// Makes Cloudflare bindings available during `next dev`.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());

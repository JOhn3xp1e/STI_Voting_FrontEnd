import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

// Makes Cloudflare bindings available during `next dev`. Bindings marked `remote` in
// wrangler.jsonc (IMAGES, AI: the photo editor) use your Cloudflare account, so run
// `npx wrangler login` once. CLOUDFLARE_REMOTE_BINDINGS=false keeps everything local.
import("@opennextjs/cloudflare").then((m) =>
  m.initOpenNextCloudflareForDev({ remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS !== "false" }),
);

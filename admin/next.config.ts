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
// Only `next dev` connects remotely: this file also runs during `next build` (CI),
// where the deploy token can't open a remote dev session and the build would fail.
const useRemoteBindings = process.env.NODE_ENV === "development" && process.env.CLOUDFLARE_REMOTE_BINDINGS !== "false";
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev({ remoteBindings: useRemoteBindings }));

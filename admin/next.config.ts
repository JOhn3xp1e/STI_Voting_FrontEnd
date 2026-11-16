import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;

// Makes Cloudflare bindings available during `next dev`. There it uses the `dev`
// environment of wrangler.jsonc, whose IMAGES binding is remote (the photo editor's
// background removal), so run `npx wrangler login` once; CLOUDFLARE_REMOTE_BINDINGS=false
// keeps everything local. This file also runs during `next build` (CI), which must stay
// local: the deploy token can't open a remote session.
const remoteDev = process.env.NODE_ENV === "development" && process.env.CLOUDFLARE_REMOTE_BINDINGS !== "false";
import("@opennextjs/cloudflare").then((m) =>
  m.initOpenNextCloudflareForDev(remoteDev ? { environment: "dev" } : { remoteBindings: false }),
);

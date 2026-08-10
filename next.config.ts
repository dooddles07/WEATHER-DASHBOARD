import type { NextConfig } from "next";

/**
 * Weather data has wildly different useful lifetimes: a current observation is
 * stale within minutes, a climate archive record from 1974 never changes.
 * These profiles are the single place those decisions are recorded, and they
 * are what keeps us inside Open-Meteo's rate limits.
 *
 * `stale`      how long a client may reuse a value without asking again
 * `revalidate` how often the server refreshes it in the background
 * `expire`     the point at which a stale value is no longer acceptable
 */
const cacheLife = {
  observation: { stale: 60, revalidate: 120, expire: 900 },
  nowcast: { stale: 60, revalidate: 120, expire: 900 },
  hourly: { stale: 300, revalidate: 600, expire: 3600 },
  daily: { stale: 900, revalidate: 1800, expire: 14400 },
  airQuality: { stale: 600, revalidate: 900, expire: 7200 },
  alerts: { stale: 60, revalidate: 120, expire: 900 },
  storms: { stale: 180, revalidate: 300, expire: 3600 },
  radarIndex: { stale: 30, revalidate: 60, expire: 600 },
  geocoding: { stale: 3600, revalidate: 86400, expire: 604800 },
  archive: { stale: 86400, revalidate: 604800, expire: 2592000 },
} satisfies NextConfig["cacheLife"];

/**
 * The browser only ever talks to our own origin, the map's base tiles, and
 * RainViewer's radar tiles. Every provider that needs a key is proxied through
 * a route handler, so no upstream weather host appears here.
 */
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js inlines its bootstrap and flight payloads. A nonce would fix this
  // but forces every route dynamic, which costs the static shell that the rest
  // of the performance work depends on. Documented in SECURITY.md.
  // React's dev build needs eval() for its debugging tooling; production never
  // does, so the allowance is scoped to development only.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.rainviewer.com",
  "font-src 'self'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.openfreemap.org https://*.rainviewer.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  cacheLife,
  typedRoutes: true,

  // maplibre-gl and the d3 modules are large and only needed on the routes
  // that use them; keep their imports from pulling in whole barrels.
  experimental: {
    optimizePackageImports: ["lucide-react", "d3-scale", "d3-shape", "d3-array"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Geolocation is used by "locate me" and must stay same-origin.
            key: "Permissions-Policy",
            value:
              "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

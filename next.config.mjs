/** @type {import('next').NextConfig} */

// Security response headers applied to every route. These are static, so they
// live here; the Content-Security-Policy is per-request (it carries a fresh
// nonce) and is set in middleware.ts instead. `frame-ancestors 'none'` in the
// CSP is the modern clickjacking control; X-Frame-Options is the fallback for
// older browsers.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    // Features the site never uses — denied outright so an injected script
    // can't reach the camera, mic, location or the viewer's browsing topics.
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig = {
  // The short addresses people (and app stores, and Meta's WhatsApp review)
  // expect for the legal pages.
  async redirects() {
    return [
      { source: "/privacy", destination: "/legal/privacy", permanent: true },
      { source: "/terms", destination: "/legal/terms", permanent: true },
      { source: "/refunds", destination: "/legal/refunds", permanent: true },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

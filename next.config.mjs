/** @type {import('next').NextConfig} */
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
};

export default nextConfig;

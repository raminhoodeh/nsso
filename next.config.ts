import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  generateBuildId: async () => process.env.NSSO_BUILD_ID || null,
  // Send the small Tailwind stylesheet with the document so first paint does
  // not wait for a second network round trip. Client navigation keeps CSS links.
  experimental: {
    inlineCss: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.nsso.me',
        port: '',
        pathname: '/images/products/**',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'ymckairbwictbfsfpqzt.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/docs/deck',
        destination: '/deck.pdf',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

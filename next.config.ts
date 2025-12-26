import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ignore TypeScript errors during build (for production deployment)
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ymckairbwictbfsfpqzt.supabase.co',
      },
    ],
  },
};

export default nextConfig;

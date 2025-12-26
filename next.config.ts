import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {},
  },
  async rewrites() {
    const backendOrigin = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:6000";

    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;

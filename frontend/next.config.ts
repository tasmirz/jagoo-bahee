import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {},
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
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

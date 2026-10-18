/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@rajshree/shared"],
  // Local fallback when NEXT_PUBLIC_API_URL is missing (browser default is `/api`).
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/:path*",
      },
    ];
  },
};

export default nextConfig;

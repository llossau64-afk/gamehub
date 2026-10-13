/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === "development";
const backend = process.env.VELQIN_BACKEND_URL || "http://127.0.0.1:8080";

const nextConfig = {
  // Production: static export served by the FastAPI backend (one port, same origin, no Node at runtime).
  output: isDev ? undefined : "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

if (isDev) {
  // Development only: proxy /api to the backend so cookies stay same-origin.
  nextConfig.rewrites = async () => [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
}

export default nextConfig;

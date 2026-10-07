import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Migrations are read from disk at startup (src/lib/bootstrap.ts), so ship them with the server.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  // Static OBSA × Smytten clickable demo (public/smytten-demo/index.html), public without login.
  async rewrites() {
    return [{ source: "/smytten-demo", destination: "/smytten-demo/index.html" }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

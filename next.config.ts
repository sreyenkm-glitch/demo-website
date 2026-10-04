import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Migrations are read from disk at startup (src/lib/bootstrap.ts), so ship them with the server.
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /** Smaller bundles for icon-heavy UI (tree-shakes lucide entry). */
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;

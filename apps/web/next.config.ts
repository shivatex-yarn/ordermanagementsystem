import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /** The weekly report PDF is built on the server; load jsPDF as a normal Node module instead of bundling its browser build. */
  serverExternalPackages: ["jspdf", "jspdf-autotable"],
  /** Smaller bundles for icon-heavy UI (tree-shakes lucide entry). */
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist must run as an external Node module on Vercel serverless,
  // otherwise the bundler mangles its dynamic worker imports.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;

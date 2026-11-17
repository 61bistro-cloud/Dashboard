import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // pdfjs-dist must run as an external Node module on Vercel serverless,
  // otherwise the bundler mangles its dynamic worker imports.
  serverExternalPackages: ["pdfjs-dist", "googleapis"],
};

export default createNextIntlPlugin("./i18n/request.ts")(nextConfig);

import path from "node:path";
import type { NextConfig } from "next";

// @wagmi/connectors only exports its barrel, which pulls optional SDKs we don't install.
const wcConnector = path.resolve(__dirname, "node_modules/@wagmi/connectors/dist/esm/walletConnect.js");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Type-check and lint run via `npm run check`; the in-build checker OOMs on wagmi/viem ABI types.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  webpack: (config) => {
    config.resolve.alias["@wagmi/connectors/walletConnect$"] = wcConnector;
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;

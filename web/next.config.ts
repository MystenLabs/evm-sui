import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the Walrus SDK + its WASM sibling out of the server bundle —
  // they expect Node-native module resolution and dynamic WASM loading
  // that webpack's bundler defeats. Without this, the API route at
  // /api/walrus/upload fails to load the BlobEncoder at runtime.
  serverExternalPackages: ['@mysten/walrus', '@mysten/walrus-wasm'],
};

export default nextConfig;

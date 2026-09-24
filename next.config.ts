import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Facturas en PDF de hasta 15 MB (el servidor vuelve a comprobar el tamaño).
    serverActions: { bodySizeLimit: "16mb" },
  },
  poweredByHeader: false,
};

export default nextConfig;

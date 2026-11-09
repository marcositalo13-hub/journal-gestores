import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      // o service worker nunca fica em cache: atualizações chegam na próxima abertura
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};

export default nextConfig;

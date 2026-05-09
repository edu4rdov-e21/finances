import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // better-sqlite3 tem binding nativo C++. Webpack tentaria bundlar e quebra
  // em "Can't resolve 'fs'". Externalizar = "deixa o Node carregar em runtime".
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;

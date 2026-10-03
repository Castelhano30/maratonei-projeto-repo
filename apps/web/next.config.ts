import type { NextConfig } from 'next';
import { loadEnv } from './env';

const nextConfig: NextConfig = {
  transpilePackages: ['@maratonei/shared'],
  // O proxy não deve encerrar a requisição antes do cliente durante a partida a frio (AD-17).
  experimental: { proxyTimeout: 120_000 },
  // O navegador só fala com a origem do web; `/api/*` segue para a API (AD-2).
  async rewrites() {
    const { INTERNAL_API_URL } = loadEnv();
    return [
      { source: '/api/:path*', destination: `${INTERNAL_API_URL.replace(/\/$/, '')}/api/:path*` },
    ];
  },
};

export default nextConfig;

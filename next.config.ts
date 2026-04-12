import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  serverExternalPackages: ['pdf-parse'],
}

export default nextConfig

import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    }
    return config
  },
}

export default nextConfig

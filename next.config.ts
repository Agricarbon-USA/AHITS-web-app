import type { NextConfig } from 'next'
import withSerwistInit from '@serwist/next'

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  register: true,
})

const nextConfig: NextConfig = {
  output: 'standalone', // Required for Cloud Run / Docker
  experimental: { serverActions: { allowedOrigins: ['*'] } },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
}

export default withSerwist(nextConfig)

import type { NextConfig } from 'next'
import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  register: false,
  sw: 'sw.js',
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    skipWaiting: true,
  },
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
}

export default withPWA(nextConfig)

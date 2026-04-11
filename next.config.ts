// next.config.ts
import type { NextConfig } from 'next'
const withPWA = require('next-pwa')({
  dest: 'public',
  register: false,
  skipWaiting: true,
  sw: '/sw.js',
  disable: process.env.NODE_ENV === 'development',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
}

export default withPWA(nextConfig)

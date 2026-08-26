import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['pdf-parse'],
  // Il worktree convive con pnpm-workspace.yaml della root pwa-v2: Turbopack
  // inferiva il root SBAGLIATO (tutte le route 404). Lo fissiamo alla dir del
  // progetto (vedi warning 'inferred your workspace root').
  turbopack: {
    root: process.cwd(),
  },
}

export default nextConfig

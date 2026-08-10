/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@radix-ui/*'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/*'],
  },
}

module.exports = nextConfig
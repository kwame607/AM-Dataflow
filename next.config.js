/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.qrserver.com' },
      { protocol: 'https', hostname: 'ykmptuwoxqcwhqbovpvb.supabase.co' },
    ],
  },
};

module.exports = nextConfig;

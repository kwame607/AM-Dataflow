/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Prevent clickjacking — stops other sites from embedding this site in an iframe
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Force HTTPS for 2 years, include subdomains, allow preload
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Limit referrer info sent to other domains
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable unused browser features
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.paystack.com")' },
  // Content Security Policy
  // - script-src: self + Paystack inline script. 'unsafe-inline' required for Next.js App Router hydration.
  // - style-src: 'unsafe-inline' required for Next.js injected styles.
  // - frame-src: Paystack checkout opens as an iframe from checkout.paystack.com.
  // - connect-src: Supabase (https + wss for realtime), Paystack API.
  // - img-src: QR code generator + Supabase storage.
  // - font-src: next/font self-hosts Google Fonts, so only 'self' needed.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.paystack.co",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: https://api.qrserver.com https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.paystack.co https://console.hubnet.app",
      "frame-src https://checkout.paystack.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.qrserver.com' },
      { protocol: 'https', hostname: 'ykmptuwoxqcwhqbovpvb.supabase.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;

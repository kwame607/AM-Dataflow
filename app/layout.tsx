// app/layout.tsx
import type { Metadata } from 'next';
import Script from 'next/script';
import { DM_Sans } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ADMUNZ — Fast Data Bundles',
  description: 'Buy MTN and AirtelTigo data bundles instantly.',
  openGraph: {
    title: 'ADMUNZ',
    description: 'Buy MTN and AirtelTigo data bundles instantly.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={dmSans.variable}>
        {/*
          suppressHydrationWarning on <html> prevents React from
          complaining when ThemeProvider updates data-theme client-side.
          The inline script below sets the theme BEFORE React hydrates
          to prevent any flash of wrong theme.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('admunz-theme');
                  var preferred = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  var theme = saved || preferred;
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(e) {}
              })();
            `,
          }}
        />
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Script
          src="https://js.paystack.co/v1/inline.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

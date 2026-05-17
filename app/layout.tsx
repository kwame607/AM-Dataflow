import type { Metadata } from 'next';
import Script from 'next/script';
import { Syne, DM_Sans } from 'next/font/google';
import './globals.css';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', display: 'swap' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans', display: 'swap' });

export const metadata: Metadata = {
  title: 'ADOMUN — Fast Data Bundles',
  description: 'Buy MTN and AirtelTigo data bundles instantly.',
  openGraph: {
    title: 'ADOMUN',
    description: 'Buy MTN and AirtelTigo data bundles instantly.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${syne.variable} ${dmSans.variable}`}>
        {children}
        <Script
          src="https://js.paystack.co/v1/inline.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

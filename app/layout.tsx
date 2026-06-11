import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'ADMUNZ — Fast Data Bundles',
  description: 'Buy MTN and AirtelTigo data bundles instantly.',
  openGraph: {
    title: 'ADMUNZ',
    description: 'Buy MTN and AirtelTigo data bundles instantly.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}

        <Script
          src="https://js.paystack.co/v1/inline.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}

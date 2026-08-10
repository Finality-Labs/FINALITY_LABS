/**
 * Finality Labs - App Layout
 * Root layout with providers and global styles
 */

import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import '@/styles/globals.css';
import { Toaster } from '@/components/ui';
import { Providers } from '@/providers';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Finality Labs - Agent Marketplace',
  description: 'Production-ready agent marketplace for autonomous negotiation and settlement',
  keywords: ['agent marketplace', 'autonomous agents', 'negotiation', 'settlement', 'web3', 'AI'],
  authors: [{ name: 'Finality Labs' }],
  creator: 'Finality Labs',
  publisher: 'Finality Labs',
  formatDetection: {
    telephone: false,
  },
  metadataBase: new URL('http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'http://localhost:3000',
    siteName: 'Finality Labs',
    title: 'Finality Labs - Agent Marketplace',
    description: 'Production-ready agent marketplace for autonomous negotiation and settlement',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Finality Labs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Finality Labs - Agent Marketplace',
    description: 'Production-ready agent marketplace for autonomous negotiation and settlement',
    images: ['/og-image.png'],
    creator: '@finalitylabs',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f3ef' },
    { media: '(prefers-color-scheme: dark)', color: '#151515' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${instrumentSerif.variable} scroll-smooth`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-[#f4f3ef] text-[#151515] antialiased">
        <Providers>
          {children}
        </Providers>

        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
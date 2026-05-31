import type { Metadata } from 'next';
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
});

const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
  display: 'swap',
});

const jetBrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const SITE_DESCRIPTION =
  'A data explorer for the six-wave Understanding America Study panel on social media and technology, 2023–2025.';

export const metadata: Metadata = {
  metadataBase: new URL('https://strata.mattmotyl.com'),
  title: {
    default: 'Ground Truth Strata',
    template: '%s · Ground Truth Strata',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'Ground Truth Strata',
  alternates: { canonical: '/' },
  // app/favicon.ico covers the canonical /favicon.ico (sizes="any").
  // These add the crisp PNG sizes, Apple touch icon, and Android icons
  // from public/images/ (the favicon set in public/images).
  icons: {
    icon: [
      { url: '/images/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
      { url: '/images/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/images/favicon-48x48.png', type: 'image/png', sizes: '48x48' },
      {
        url: '/images/android-chrome-192x192.png',
        type: 'image/png',
        sizes: '192x192',
      },
      {
        url: '/images/android-chrome-512x512.png',
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    apple: [{ url: '/images/apple-touch-icon.png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Ground Truth Strata',
    url: 'https://strata.mattmotyl.com',
    title: 'Ground Truth Strata',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ground Truth Strata',
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${dmSerif.variable} ${jetBrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        <TooltipProvider>
          <SiteHeader />
          <main className="flex-1 flex flex-col">{children}</main>
          <SiteFooter />
        </TooltipProvider>
        <Analytics />
      </body>
    </html>
  );
}

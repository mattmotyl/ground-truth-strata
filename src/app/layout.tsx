import type { Metadata } from 'next';
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
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
      </body>
    </html>
  );
}

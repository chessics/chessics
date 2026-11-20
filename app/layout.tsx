import type { Metadata } from 'next'
import { HOME_TITLE, SITE_DESCRIPTION, SITE_NAME, jsonLdScript, siteJsonLd, siteUrl } from '@/lib/site'
import PageAnalytics from '@/components/layout/PageAnalytics'
import './globals.css'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: HOME_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
}

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=EB+Garamond:ital,wght@0,400;0,500;1,400&family=Geist:wght@400;500;600&display=swap'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS_URL} />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(siteJsonLd()) }} />
        {children}
        <PageAnalytics />
      </body>
    </html>
  )
}

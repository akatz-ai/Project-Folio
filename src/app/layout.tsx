import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Source_Serif_4 } from 'next/font/google'
import { Providers } from '@/components/Providers'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-source-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Project Folio',
  description: 'Manage your projects with AI assistance',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: '#FAF8F5',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fraunces.variable} ${sourceSerif.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

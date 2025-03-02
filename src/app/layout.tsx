import { Analytics } from "@vercel/analytics/next"
import type { Metadata } from "next"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import "./globals.css"

export const metadata: Metadata = {
  title: "Mixer - J3-C7",
  description: "Soundscape mixer to relax and zone out",
  openGraph: {
    images: [{ url: "/cover.png" }],
  },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </head>
      {/* <ReactScan /> */}
      <body>
        <NextThemesProvider defaultTheme="system" attribute="class">
          {children}
        </NextThemesProvider>
        <Analytics />
      </body>
    </html>
  )
}

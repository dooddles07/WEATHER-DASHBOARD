import type { Metadata, Viewport } from "next";
import { Archivo, Martian_Mono } from "next/font/google";

import "./globals.css";

/**
 * One superfamily carries the whole interface. Hierarchy comes from width
 * rather than a second personality: measured values are set expanded so they
 * read like a gauge face, prose stays at normal width.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

/** Reserved for machine-measured values: times, coordinates, units, codes. */
const martianMono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-martian-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ISOBAR — Weather intelligence",
    template: "%s — ISOBAR",
  },
  description:
    "Current conditions, hourly and 14-day forecasts, radar, air quality and severe weather for anywhere in the world.",
  applicationName: "ISOBAR",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ISOBAR", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: "website",
    siteName: "ISOBAR",
    title: "ISOBAR — Weather intelligence",
    description:
      "Current conditions, hourly and 14-day forecasts, radar, air quality and severe weather for anywhere in the world.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e12" },
  ],
};

/**
 * Applies the stored theme before first paint. Without this the page renders
 * light, then repaints dark — which is both ugly and, at night, unpleasant.
 */
const themeInit = `(function(){try{var s=localStorage.getItem("isobar-theme")||"system";var d=s==="dark"||(s==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${archivo.variable} ${martianMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-dvh bg-base text-primary antialiased">
        {children}
      </body>
    </html>
  );
}

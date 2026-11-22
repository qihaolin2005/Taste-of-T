import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

// Design-system fonts (see globals.css): DM Sans for body, DM Serif Display for headings.
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const dmSerif = DM_Serif_Display({ subsets: ["latin"], weight: "400", variable: "--font-dm-serif" });

export const metadata: Metadata = {
  title: "Taste of T",
  description: "Food quests and group adventures along the Boston T.",
  applicationName: "Taste of T",
  // iOS home-screen app behavior (full-screen, status bar over content).
  appleWebApp: {
    capable: true,
    title: "Taste of T",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Content extends under the notch; Screen pads it back with --safe-top/--safe-bottom.
  // (No maximumScale: pinch-zoom stays on for accessibility; 16px inputs stop iOS auto-zoom.)
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f5ff" },
    { media: "(prefers-color-scheme: dark)", color: "#16111c" },
  ],
};

// When rendered inside the /demo iPhone frame, flag <html> before first paint so
// safe areas match a real iPhone (see html.in-frame in globals.css).
const frameScript = `if (window.self !== window.top) document.documentElement.classList.add("in-frame");`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: frameScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

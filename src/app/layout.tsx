import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Fallback for non-Apple screens (the demo laptop); iPhones use SF Pro via -apple-system.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Taste of T",
  description: "Food quests and group nights out along the Boston T.",
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
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// When rendered inside the /demo iPhone frame, flag <html> before first paint so
// safe areas match a real iPhone (see html.in-frame in globals.css).
const frameScript = `if (window.self !== window.top) document.documentElement.classList.add("in-frame");`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: frameScript }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

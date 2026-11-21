import type { Metadata, Viewport } from "next";
import "./globals.css";
import InstallPrompt from "@/components/shared/InstallPrompt";

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
  // Content extends under the notch; .app-safe-area in globals.css pads it back.
  // (No maximumScale: pinch-zoom stays on for accessibility; 16px inputs stop iOS auto-zoom.)
  viewportFit: "cover",
  themeColor: "#0b0f1a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="app-safe-area min-h-full flex flex-col">
        {children}
        <InstallPrompt />
      </body>
    </html>
  );
}

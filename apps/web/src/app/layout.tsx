import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import Script from "next/script";

import { CommandPalette } from "../components/command-palette";
import { PwaRegister } from "../components/pwa-register";
import { QueryProvider } from "../components/query-provider";
import { Toaster } from "../components/toaster";
import { TooltipProvider } from "../components/ui/tooltip";
import "./globals.css";

const fontDisplay = Nunito({
  subsets: ["latin"],
  variable: "--font-display-google",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono-google",
  display: "swap",
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "harwick",
  description: "private lead desk for real estate teams.",
  applicationName: "Harwick",
  appleWebApp: {
    capable: true,
    title: "Harwick",
    statusBarStyle: "black-translucent" as const,
  },
  icons: {
    icon: "/harwick-gemini-logo.png",
    apple: "/harwick-gemini-logo.png",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

/**
 * Synchronous dev-only kill switch for any stale service worker. Runs in <head>
 * before any chunk loads, so a SW from an earlier session can't intercept the
 * request and serve stale Turbopack chunks. Without this, Tooltip provider
 * errors appear and pages spin forever on refresh in dev.
 */
const SW_DEV_KILL_SCRIPT = `
(function() {
  try {
    var h = location.hostname;
    var devHost = h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local');
    if (!devHost) return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { r.unregister(); });
      });
    }
    if ('caches' in self) {
      caches.keys().then(function (keys) {
        keys.forEach(function (k) {
          if (k.indexOf('harwick-') === 0) caches.delete(k);
        });
      });
    }
  } catch (e) {}
})();
`.trim();

export default function RootLayout(props: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fontDisplay.variable} ${fontMono.variable}`}>
      <body>
        <Script
          id="harwick-sw-dev-kill"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: SW_DEV_KILL_SCRIPT }}
        />
        <PwaRegister />
        <Toaster />
        <QueryProvider>
          <TooltipProvider>
            <CommandPalette />
            {props.children}
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

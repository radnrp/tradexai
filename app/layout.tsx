import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { AppProviders } from "@/components/shell/app-providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
// only the weights the app uses; preload off so an English user never downloads it
const dana = localFont({
  src: [
    { path: "../assets/Webfonts/woff2/DanaFaNum-Regular.woff2", weight: "400" },
    { path: "../assets/Webfonts/woff2/DanaFaNum-Medium.woff2", weight: "500" },
    { path: "../assets/Webfonts/woff2/DanaFaNum-DemiBold.woff2", weight: "600" },
    { path: "../assets/Webfonts/woff2/DanaFaNum-Bold.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-dana",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "TradeXai",
  description: "An AI trading agent for your USDT, inside Telegram.", // i18n-ignore: Telegram's link preview, not the app
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#181a1c",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Telegram's SDK writes viewport CSS vars onto <html> before hydration
    <html lang="en" className={`${inter.variable} ${dana.variable}`} suppressHydrationWarning>
      <body>
        {/* Dev-only in-app console/network inspector: Telegram's WebView has no devtools. Placed
            first so it records from the very first request, including the Telegram sign-in. */}
        {process.env.NODE_ENV === "development" && (
          <>
            <Script src="https://cdn.jsdelivr.net/npm/eruda@3.4.3/eruda.min.js" strategy="beforeInteractive" />
            <Script id="eruda-init" strategy="beforeInteractive">{`window.eruda && eruda.init();`}</Script>
          </>
        )}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/Header";
import { BRAND } from "@/lib/config";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${BRAND} — launch tokens on Robinhood Chain`,
  description: "Fair-launch tokens on Robinhood Chain with instant Uniswap v4 liquidity, burned LP and creator rewards.",
};

export const viewport: Viewport = { themeColor: "#050505", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-dvh antialiased`}>
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

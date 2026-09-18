import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

// Inter is only *declared* here (as a CSS variable). The client pages apply it
// through `.client-root` in globals.css; admin keeps its system font.
// latin-ext carries the ₦ glyph.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lodge Internet - Fast and Reliable Hostel Internet",
  description:
    "Get instant access to high-speed internet for your hostel room. Purchase Lodge Internet data plans with secure payment.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

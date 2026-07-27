import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";
import WhatsAppBotCTA from "@/components/WhatsAppBotCTA";

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
    <html lang="en">
      <body>
        <ToastProvider>
          <WhatsAppBotCTA variant="top-banner" prefill="Hi Lodge Internet" />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}

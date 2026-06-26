import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Enquiry Management System",
  description: "Enterprise enquiry management with divisions, SLA, and audit",
  icons: {
    icon: "/company-logo.png",
    shortcut: "/company-logo.png",
    apple: "/company-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body
        className="antialiased min-h-screen overflow-x-hidden bg-white text-slate-900"
        suppressHydrationWarning
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

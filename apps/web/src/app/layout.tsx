import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { APP_NAME, COMPANY_NAME } from "@/lib/branding";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: `${COMPANY_NAME} · ${APP_NAME}`,
  description: `${COMPANY_NAME} — enterprise enquiry management with divisions, SLA, and audit`,
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
        className="antialiased min-h-screen overflow-x-hidden bg-[var(--app-plane)] text-[var(--app-ink)]"
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

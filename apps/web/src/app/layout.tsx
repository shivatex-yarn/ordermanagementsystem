import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { APP_NAME, COMPANY_NAME } from "@/lib/branding";
import "./globals.css";

/** Bundled with the app (SIL Open Font License) so production builds never depend on downloading it from Google. */
const plusJakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  variable: "--font-plus-jakarta",
  display: "swap",
  weight: "200 800",
});

export const metadata: Metadata = {
  title: `${COMPANY_NAME} · ${APP_NAME}`,
  description: `${COMPANY_NAME} — enterprise enquiry management with divisions, SLA, and audit`,
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

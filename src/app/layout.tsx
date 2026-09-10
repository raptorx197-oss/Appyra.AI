import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Appyra — Digital Restaurant Operations",
  description: "Reservations and ordering for Ethiopian restaurants. Prototype build.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stone-50 text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight text-amber-800">
              Appyra
            </Link>
            <nav className="flex items-center gap-4 text-sm text-stone-600">
              <Link href="/" className="hover:text-stone-900">
                Browse
              </Link>
              <Link href="/guest" className="hover:text-stone-900">
                Check my order/reservation
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md bg-amber-800 px-3 py-1.5 font-medium text-white hover:bg-amber-900"
              >
                Staff login
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-stone-200 bg-white py-6 text-center text-xs text-stone-400">
          Appyra prototype — pay at pickup, no online payment in V1. Built from the project spec.
        </footer>
      </body>
    </html>
  );
}

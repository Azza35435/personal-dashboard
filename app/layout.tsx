import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import Sidebar from "@/components/Sidebar";
import BackgroundTheme from "@/components/BackgroundTheme";

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Dashboard",
  description: "Your personal one-stop shop",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="h-full">
        <BackgroundTheme />
        <SessionProviderWrapper>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-hidden h-full">
              {children}
            </main>
          </div>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}

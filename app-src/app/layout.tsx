import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Equipment Accountability Report Generator | AIMF Tech. Corp.",
  description:
    "Generate professional Equipment Accountability & Turn-Over DOCX reports for post-installation hardware deployment. Fill the form, upload photos, and download all three copies instantly.",
  keywords: ["equipment accountability", "AIMF", "DOCX report", "installation report", "vessel accountability"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}

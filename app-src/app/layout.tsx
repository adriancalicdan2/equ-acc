import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/firebase/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "AIMF Tech. Corp. - Reports",
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
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}

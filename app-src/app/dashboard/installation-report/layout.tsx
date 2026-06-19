import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Installation Report - AIMF Tech. Corp.',
  description: 'Fill out and download AIMF installation service reports.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

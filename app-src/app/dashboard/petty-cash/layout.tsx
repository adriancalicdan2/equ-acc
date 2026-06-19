import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Petty Cash Report - AIMF Tech. Corp.',
  description: 'Fill out and manage petty cash fund replenishment reports.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

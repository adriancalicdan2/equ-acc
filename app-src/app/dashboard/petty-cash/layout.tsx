import type { Metadata } from 'next';
import ViewGuard from '@/components/ViewGuard';

export const metadata: Metadata = {
  title: 'Petty Cash Report - AIMF Tech. Corp.',
  description: 'Fill out and manage petty cash fund replenishment reports.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewGuard view="petty-cash">{children}</ViewGuard>;
}

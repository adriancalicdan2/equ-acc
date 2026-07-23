import type { Metadata } from 'next';
import ViewGuard from '@/components/ViewGuard';

export const metadata: Metadata = {
  title: 'Equipment Accountability - AIMF Tech. Corp.',
  description: 'Fill out and manage vessel equipment accountability reports.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewGuard view="equipment-accountability">{children}</ViewGuard>;
}

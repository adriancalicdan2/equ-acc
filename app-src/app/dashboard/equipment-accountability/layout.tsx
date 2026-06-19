import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Equipment Accountability - AIMF Tech. Corp.',
  description: 'Fill out and manage vessel equipment accountability reports.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

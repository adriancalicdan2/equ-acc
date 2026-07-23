import type { Metadata } from 'next';
import ViewGuard from '@/components/ViewGuard';

export const metadata: Metadata = {
  title: 'Admin Console - AIMF Tech. Corp.',
  description: 'System administrator portal for managing reports and employees.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewGuard adminOnly>{children}</ViewGuard>;
}

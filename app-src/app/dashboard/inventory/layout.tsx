import type { Metadata } from 'next';
import ViewGuard from '@/components/ViewGuard';

export const metadata: Metadata = {
  title: 'Inventory Control - AIMF Tech. Corp.',
  description: 'Manage hardware inventory and stock levels.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewGuard view="inventory">{children}</ViewGuard>;
}

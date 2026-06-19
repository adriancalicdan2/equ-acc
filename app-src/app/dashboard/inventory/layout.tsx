import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inventory Control - AIMF Tech. Corp.',
  description: 'Manage hardware inventory and stock levels.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

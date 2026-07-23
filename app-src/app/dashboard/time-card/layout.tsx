import type { Metadata } from 'next';
import ViewGuard from '@/components/ViewGuard';

export const metadata: Metadata = {
  title: 'Time Card - AIMF Tech. Corp.',
  description: 'Manage employee time cards and attendance records.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewGuard view="time-card">{children}</ViewGuard>;
}

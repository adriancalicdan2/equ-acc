import type { Metadata } from 'next';
import ViewGuard from '@/components/ViewGuard';

export const metadata: Metadata = {
  title: 'Daily Logs & Voyages - AIMF Tech. Corp.',
  description: 'Analyze Dredge Master daily reports and generate voyage workbooks.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewGuard view="daily-logs-voyages">{children}</ViewGuard>;
}

import type { Metadata } from 'next';
import ViewGuard from '@/components/ViewGuard';

export const metadata: Metadata = {
  title: 'Payslip Center - AIMF Tech. Corp.',
  description: 'Generate employee payroll and payslip reports.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <ViewGuard view="payslip">{children}</ViewGuard>;
}

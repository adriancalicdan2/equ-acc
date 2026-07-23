'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/firebase/AuthContext';
import type { ViewId } from '@/lib/server/auth';

export default function ViewGuard({
  children,
  view,
  adminOnly = false,
}: {
  children: React.ReactNode;
  view?: ViewId;
  adminOnly?: boolean;
}) {
  const { user, loading, isAdmin, allowedViews } = useAuth();
  const router = useRouter();
  const hasAccess = Boolean(
    user && (isAdmin || (!adminOnly && view && allowedViews?.includes(view))),
  );

  useEffect(() => {
    if (!loading && user && !hasAccess) {
      toast.error('Access denied for this module.');
      router.replace('/dashboard/equipment-accountability');
    }
  }, [hasAccess, loading, router, user]);

  if (loading || (user && !hasAccess)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return hasAccess ? <>{children}</> : null;
}

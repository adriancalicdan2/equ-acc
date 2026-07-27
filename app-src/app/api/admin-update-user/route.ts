import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest, VIEW_IDS } from '@/lib/server/auth';
import { enforceRateLimit } from '@/lib/server/rateLimit';
import { parseJsonRequest } from '@/lib/server/request';
import { adminUserRequestSchema } from '@/lib/validations/apiSchemas';
import { firebaseConfig } from '@/lib/firebase/config';
import { updateAllowedViewsWithIdToken } from '@/lib/firebase/adminUserRest';

export async function POST(request: NextRequest) {
  const authorization = await authorizeRequest(request, { adminOnly: true });
  if (!authorization.authorized) return authorization.response;
  const rateLimited = enforceRateLimit(`admin-users:${authorization.token.uid}`, 30, 60_000);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonRequest(request, adminUserRequestSchema);
  if (!parsed.success) return parsed.response;

  try {
    const data = parsed.data;
    const isPermissionOnlyUpdate = data.action === 'update'
      && data.allowedViews !== undefined
      && data.email === undefined
      && data.displayName === undefined
      && data.password === undefined
      && data.role === undefined
      && data.shiftHours === undefined
      && data.restDays === undefined;

    if (isPermissionOnlyUpdate && data.action === 'update' && data.allowedViews !== undefined) {
      const encodedToken = request.headers.get('authorization')?.slice(7);
      if (!encodedToken) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      await updateAllowedViewsWithIdToken({
        projectId: firebaseConfig.projectId,
        uid: data.uid,
        allowedViews: data.allowedViews,
        idToken: encodedToken,
      });
      return NextResponse.json({ success: true });
    }

    const [{ getAdminAuth, getAdminFirestore }, { FieldValue }] = await Promise.all([
      import('@/lib/firebase/admin'),
      import('firebase-admin/firestore'),
    ]);
    const auth = getAdminAuth();
    const db = getAdminFirestore();
    if (data.action === 'create') {
      const createdUser = await auth.createUser({
        email: data.email,
        displayName: data.displayName || undefined,
        password: data.password,
      });

      try {
        await db.collection('users').doc(createdUser.uid).set({
          email: data.email,
          displayName: data.displayName,
          role: data.role,
          allowedViews: data.role === 'admin' ? [...VIEW_IDS] : data.allowedViews,
          shiftHours: data.shiftHours,
          restDays: data.restDays,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        await auth.deleteUser(createdUser.uid);
        throw error;
      }

      return NextResponse.json({ success: true, uid: createdUser.uid }, { status: 201 });
    }

    if (data.action === 'delete') {
      if (data.uid === authorization.token.uid) {
        return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
      }

      await Promise.all([
        auth.deleteUser(data.uid),
        db.collection('users').doc(data.uid).delete(),
      ]);
      return NextResponse.json({ success: true });
    }

    if (data.uid === authorization.token.uid && data.role === 'user') {
      return NextResponse.json({ error: 'You cannot remove your own administrator role' }, { status: 400 });
    }

    const authUpdates: Parameters<typeof auth.updateUser>[1] = {};
    if (data.email) authUpdates.email = data.email;
    if (data.displayName !== undefined) authUpdates.displayName = data.displayName;
    if (data.password) authUpdates.password = data.password;
    if (Object.keys(authUpdates).length > 0) {
      await auth.updateUser(data.uid, authUpdates);
    }

    const firestoreUpdates: Record<string, unknown> = {};
    if (data.email) firestoreUpdates.email = data.email;
    if (data.displayName !== undefined) firestoreUpdates.displayName = data.displayName;
    if (data.role) firestoreUpdates.role = data.role;
    if (data.allowedViews) firestoreUpdates.allowedViews = data.allowedViews;
    if (data.role === 'admin') firestoreUpdates.allowedViews = [...VIEW_IDS];
    if (data.shiftHours !== undefined) firestoreUpdates.shiftHours = data.shiftHours;
    if (data.restDays !== undefined) firestoreUpdates.restDays = data.restDays;

    if (Object.keys(firestoreUpdates).length > 0) {
      await db.collection('users').doc(data.uid).set(firestoreUpdates, { merge: true });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[admin-update-user] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

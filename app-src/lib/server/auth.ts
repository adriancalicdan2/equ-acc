import 'server-only';

import type { DecodedIdToken } from 'firebase-admin/auth';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin';

export const VIEW_IDS = [
  'equipment-accountability',
  'inventory',
  'petty-cash',
  'time-card',
  'installation-report',
  'payslip',
  'daily-logs-voyages',
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

interface UserProfile {
  role: string;
  allowedViews: string[];
}

interface FirestoreRestValue {
  stringValue?: string;
  arrayValue?: { values?: FirestoreRestValue[] };
}

interface FirestoreRestDocument {
  fields?: Record<string, FirestoreRestValue>;
}

export interface AuthorizedRequest {
  authorized: true;
  token: DecodedIdToken;
  profile: UserProfile;
}

export interface RejectedRequest {
  authorized: false;
  response: NextResponse;
}

const REJECTED_TOKEN_CODES = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
]);

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : String(code ?? '');
}

function profileFromData(data: Record<string, unknown>): UserProfile {
  return {
    role: typeof data.role === 'string' ? data.role : 'user',
    allowedViews: Array.isArray(data.allowedViews)
      ? data.allowedViews.filter((view): view is string => typeof view === 'string')
      : [],
  };
}

function profileFromRestDocument(document: FirestoreRestDocument): UserProfile {
  const fields = document.fields ?? {};
  const allowedViews = fields.allowedViews?.arrayValue?.values ?? [];
  return {
    role: fields.role?.stringValue ?? 'user',
    allowedViews: allowedViews
      .map((view) => view.stringValue)
      .filter((view): view is string => typeof view === 'string'),
  };
}

async function loadProfileWithUserToken(
  token: DecodedIdToken,
  encodedToken: string,
): Promise<UserProfile | null> {
  const projectId = encodeURIComponent(token.aud);
  const uid = encodeURIComponent(token.uid);
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
    {
      headers: { Authorization: `Bearer ${encodedToken}` },
      cache: 'no-store',
    },
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore user-profile lookup failed with status ${response.status}.`);
  }

  return profileFromRestDocument(await response.json() as FirestoreRestDocument);
}

async function loadUserProfile(
  token: DecodedIdToken,
  encodedToken: string,
): Promise<UserProfile | null> {
  try {
    const snapshot = await getAdminFirestore().collection('users').doc(token.uid).get();
    return snapshot.exists ? profileFromData(snapshot.data() ?? {}) : null;
  } catch (error) {
    console.warn(
      `[authorizeRequest] Admin Firestore profile lookup failed (${errorCode(error) || 'unknown'}); retrying with the verified user's credentials.`,
    );
    return loadProfileWithUserToken(token, encodedToken);
  }
}

export async function authorizeRequest(
  request: NextRequest,
  options: { view?: ViewId; adminOnly?: boolean } = {},
): Promise<AuthorizedRequest | RejectedRequest> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const encodedToken = authorization.slice(7);
  let token: DecodedIdToken;
  try {
    token = await getAdminAuth().verifyIdToken(encodedToken);
  } catch (error) {
    const code = errorCode(error);
    console.error('[authorizeRequest] Token verification failed:', error);
    const invalidToken = REJECTED_TOKEN_CODES.has(code);
    return {
      authorized: false,
      response: NextResponse.json(
        { error: invalidToken ? 'Invalid or expired authentication token' : 'Authentication service is temporarily unavailable' },
        { status: invalidToken ? 401 : 503 },
      ),
    };
  }

  let profile: UserProfile | null;
  try {
    profile = await loadUserProfile(token, encodedToken);
  } catch (error) {
    console.error('[authorizeRequest] User-profile lookup failed:', error);
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unable to load user permissions. Please try again.' },
        { status: 503 },
      ),
    };
  }

  if (!profile) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'User profile is not active' }, { status: 403 }),
    };
  }

  const isAdmin = profile.role === 'admin';

  if (options.adminOnly && !isAdmin) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Administrator access required' }, { status: 403 }),
    };
  }

  if (options.view && !isAdmin && !profile.allowedViews.includes(options.view)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'You do not have access to this module' }, { status: 403 }),
    };
  }

  return { authorized: true, token, profile };
}
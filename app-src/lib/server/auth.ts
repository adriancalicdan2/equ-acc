import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { firebaseConfig } from '@/lib/firebase/config';

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

interface VerifiedIdToken {
  uid: string;
  aud: string;
  email?: string;
}

interface IdentityToolkitResponse {
  users?: Array<{
    localId?: string;
    email?: string;
    disabled?: boolean;
  }>;
  error?: {
    message?: string;
  };
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
  token: VerifiedIdToken;
  profile: UserProfile;
}

export interface RejectedRequest {
  authorized: false;
  response: NextResponse;
}

const REJECTED_TOKEN_CODES = new Set([
  'CREDENTIAL_TOO_OLD_LOGIN_AGAIN',
  'INVALID_ID_TOKEN',
  'TOKEN_EXPIRED',
  'USER_DISABLED',
  'USER_NOT_FOUND',
]);

class TokenVerificationError extends Error {
  constructor(
    message: string,
    readonly invalidToken: boolean,
  ) {
    super(message);
  }
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

async function verifyIdToken(encodedToken: string): Promise<VerifiedIdToken> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: encodedToken }),
      cache: 'no-store',
    },
  );

  let payload: IdentityToolkitResponse;
  try {
    payload = await response.json() as IdentityToolkitResponse;
  } catch {
    throw new TokenVerificationError('Firebase returned an invalid authentication response.', false);
  }

  if (!response.ok) {
    const code = payload.error?.message?.split(' : ')[0] ?? '';
    throw new TokenVerificationError(
      payload.error?.message ?? 'Firebase rejected the authentication token.',
      REJECTED_TOKEN_CODES.has(code),
    );
  }

  const user = payload.users?.[0];
  if (!user?.localId || user.disabled) {
    throw new TokenVerificationError('Firebase user is unavailable.', true);
  }

  return {
    uid: user.localId,
    aud: firebaseConfig.projectId,
    email: user.email,
  };
}

async function loadUserProfile(
  token: VerifiedIdToken,
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
  let token: VerifiedIdToken;
  try {
    token = await verifyIdToken(encodedToken);
  } catch (error) {
    console.error('[authorizeRequest] Token verification failed:', error);
    const invalidToken = error instanceof TokenVerificationError && error.invalidToken;
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
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let adminApp: App | null = null;

function loadServiceAccount(): ServiceAccount {
  const inlineCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inlineCredentials) {
    return JSON.parse(inlineCredentials) as ServiceAccount;
  }

  const credentialPath = path.join(process.cwd(), 'service-account.json');
  if (!fs.existsSync(credentialPath)) {
    throw new Error(
      'Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT or provide app-src/service-account.json.',
    );
  }

  return JSON.parse(fs.readFileSync(credentialPath, 'utf8')) as ServiceAccount;
}

function getAdminApp(): App {
  if (adminApp) return adminApp;

  const existingApp = getApps()[0];
  adminApp = existingApp ?? initializeApp({ credential: cert(loadServiceAccount()) });
  return adminApp;
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}

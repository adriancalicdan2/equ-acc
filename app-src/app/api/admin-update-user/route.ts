import { NextRequest, NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  try {
    let serviceAccount: any;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    }

    initializeApp({
      credential: cert(serviceAccount),
    });
  } catch (err: any) {
    console.error('Firebase Admin initialization error:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const {
      uid,
      email,
      displayName,
      role,
      allowedViews,
      shiftHours,
      restDays,
      password,
    } = data;

    if (!uid) {
      return NextResponse.json({ error: 'User UID is required' }, { status: 400 });
    }

    // 1. Update Firebase Authentication
    const authUpdates: any = {};
    if (email) authUpdates.email = email.trim().toLowerCase();
    if (displayName) authUpdates.displayName = displayName.trim();
    if (password && password.length >= 6) authUpdates.password = password;

    if (Object.keys(authUpdates).length > 0) {
      const auth = getAuth();
      await auth.updateUser(uid, authUpdates);
    }

    // 2. Update Firestore profile document
    const db = getFirestore();
    const userRef = db.collection('users').doc(uid);

    const firestoreUpdates: any = {};
    if (email) firestoreUpdates.email = email.trim().toLowerCase();
    if (displayName !== undefined) firestoreUpdates.displayName = displayName.trim();
    if (role) {
      firestoreUpdates.role = role;
      // If role is admin, ensure they have access to all views
      if (role === 'admin') {
        firestoreUpdates.allowedViews = ['equipment-accountability', 'petty-cash', 'time-card'];
      } else if (allowedViews) {
        firestoreUpdates.allowedViews = allowedViews;
      }
    } else if (allowedViews) {
      firestoreUpdates.allowedViews = allowedViews;
    }
    
    if (shiftHours !== undefined) firestoreUpdates.shiftHours = Number(shiftHours);
    if (restDays !== undefined) firestoreUpdates.restDays = restDays;

    await userRef.set(firestoreUpdates, { merge: true });

    return NextResponse.json({ success: true, message: 'User updated successfully' }, { status: 200 });
  } catch (err: any) {
    console.error('Admin update user error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

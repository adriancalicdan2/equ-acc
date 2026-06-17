'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, firestore } from './client';
import { doc, onSnapshot, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  role: string | null;
  displayName: string | null;
  shiftHours: number;
  restDays: number[]; // day-of-week: 0=Sun,1=Mon...6=Sat
  allowedViews: string[] | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  role: null,
  displayName: null,
  shiftHours: 10,
  restDays: [0, 6],
  allowedViews: null,
  isAdmin: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [shiftHours, setShiftHours] = useState<number>(10);
  const [restDays, setRestDays] = useState<number[]>([0, 6]);
  const [allowedViews, setAllowedViews] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeUserDoc: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);

        const userDocRef = doc(firestore, 'users', firebaseUser.uid);
        
        try {
          const userDocSnap = await getDoc(userDocRef);
          if (!userDocSnap.exists()) {
            await firebaseSignOut(auth);
            setUser(null);
            setRole(null);
            setAllowedViews(null);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('Error checking user doc:', err);
        }

        unsubscribeUserDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            setRole(data.role || 'user');
            setDisplayName(data.displayName || null);
            setShiftHours(typeof data.shiftHours === 'number' ? data.shiftHours : 10);
            setRestDays(Array.isArray(data.restDays) ? data.restDays : [0, 6]);
            setAllowedViews(data.allowedViews || ['equipment-accountability', 'petty-cash']);
          } else {
            // User was deleted/disabled from database - sign out immediately
            firebaseSignOut(auth);
          }
          setLoading(false);
        }, (err) => {
          console.error('Error listening to user doc:', err);
          setLoading(false);
        });

      } else {
        setUser(null);
        setRole(null);
        setDisplayName(null);
        setShiftHours(10);
        setRestDays([0, 6]);
        setAllowedViews(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
      }
    };
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider value={{ user, loading, role, displayName, shiftHours, restDays, allowedViews, isAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


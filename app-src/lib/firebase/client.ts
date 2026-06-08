import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAwBR9v2q3cC4QSXt1XSRjJ9x8ZcHPCUr8",
  authDomain: "equipment-accountability.firebaseapp.com",
  projectId: "equipment-accountability",
  storageBucket: "equipment-accountability.firebasestorage.app",
  messagingSenderId: "80407771135",
  appId: "1:80407771135:web:ec44c73140625e339399ca",
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const firestore = getFirestore(app);

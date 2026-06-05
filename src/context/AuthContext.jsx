import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function login() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Error signing in with Google via popup', error);
      // If popup is blocked, closed by user, or domain is an issue, try redirect as a fallback
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cross-origin-opener-policy-failed') {
        console.log('Falling back to redirect authentication...');
        await signInWithRedirect(auth, provider);
      } else {
        throw error;
      }
    }
  }

  function logout() {
    setUserRole(null);
    return signOut(auth);
  }

  async function handleUserRole(user) {
    try {
      if (!user) { setUserRole(null); return; }
      const userRef = doc(db, 'system_users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        setUserRole(userSnap.data().role || 'VIEWER');
      } else {
        const defaultRole = 'VIEWER';
        await setDoc(userRef, { email: user.email, displayName: user.displayName, role: defaultRole, createdAt: new Date() });
        setUserRole(defaultRole);
      }
    } catch (err) {
      console.error('Error handling role:', err);
      setUserRole('VIEWER');
    }
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await handleUserRole(user);
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = { currentUser, userRole, login, logout };
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

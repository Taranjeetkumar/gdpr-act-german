import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { useDispatch, useSelector } from 'react-redux';
import { auth, googleProvider } from '../firebase';
import { authActions } from '../store';
import client from '../api/client';

const AuthContext = createContext(null);

// ─── Fixed admin credentials ───────────────────────────────────────────────
const ADMIN_EMAIL    = 'admin@gdprtracker.com';
const ADMIN_PASSWORD = 'Admin@1234';
// ───────────────────────────────────────────────────────────────────────────

// module-level guard so concurrent onAuthStateChanged firings don't
// race each other by running /me + /register twice in parallel
let resolveInFlight = null;

async function resolveDbUser(dispatch) {
  if (resolveInFlight) return resolveInFlight;

  resolveInFlight = (async () => {
    try {
      const res = await client.get('/api/auth/me');
      dispatch(authActions.setDbUser(res.data.data));
      return res.data.data;
    } catch (err) {
      if (err.response?.status === 404) {
        try {
          // new user — register in AlloyDB + Firestore + Memorystore + Datastore
          const reg = await client.post('/api/auth/register');
          dispatch(authActions.setDbUser(reg.data.data));
          return reg.data.data;
        } catch (regErr) {
          console.error('[Auth] Registration failed:', regErr.response?.data || regErr.message);
          dispatch(authActions.setDbUser(null));
          return null;
        }
      }
      console.error('[Auth] /me failed (non-404):', err.response?.data || err.message);
      dispatch(authActions.setDbUser(null));
      return null;
    } finally {
      resolveInFlight = null;
    }
  })();

  return resolveInFlight;
}

export function AuthProvider({ children }) {
  const dispatch = useDispatch();
  const { user, dbUser, loading } = useSelector(s => s.auth);
  const [dbUserReady, setDbUserReady]         = useState(false);
  const [isAdmin, setIsAdmin]                 = useState(false);
  const [adminLoginError, setAdminLoginError] = useState('');

  useEffect(() => {
    // ── Restore admin session on page refresh ────────────────────────────
    // Do this BEFORE subscribing to Firebase so the admin flag is set
    // immediately, but we STILL subscribe below so Google sign-in always works.
    const savedAdmin = sessionStorage.getItem('gdpr_admin_session') === 'true';
    if (savedAdmin) {
      dispatch(authActions.setUser({
        uid: 'admin-local', email: ADMIN_EMAIL,
        displayName: 'Administrator', photoURL: null,
      }));
      dispatch(authActions.setDbUser({
        id: 'admin', full_name: 'Administrator', email: ADMIN_EMAIL, role: 'admin',
      }));
      dispatch(authActions.setLoading(false));
      setIsAdmin(true);
      setDbUserReady(true);
    }

    // ── Always register the Firebase listener ────────────────────────────
    // This is what makes Google sign-in work. Without this, signInWithPopup
    // fires but nothing updates the Redux store.
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      // If we're in an admin session, ignore Firebase state changes entirely —
      // there's no Firebase user, and that's expected.
      if (sessionStorage.getItem('gdpr_admin_session') === 'true') return;

      setDbUserReady(false);

      dispatch(authActions.setUser(firebaseUser ? {
        uid:         firebaseUser.uid,
        email:       firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL:    firebaseUser.photoURL,
      } : null));

      if (firebaseUser) {
        await resolveDbUser(dispatch);
      } else {
        dispatch(authActions.setDbUser(null));
      }

      dispatch(authActions.setLoading(false));
      setDbUserReady(true);
    });

    return unsub; // cleanup on unmount
  }, [dispatch]);

  const refreshDbUser = useCallback(() => resolveDbUser(dispatch), [dispatch]);

  // ── Admin local login ────────────────────────────────────────────────────
  const signInAsAdmin = useCallback((email, password) => {
    setAdminLoginError('');
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      sessionStorage.setItem('gdpr_admin_session', 'true');
      dispatch(authActions.setUser({
        uid: 'admin-local', email: ADMIN_EMAIL,
        displayName: 'Administrator', photoURL: null,
      }));
      dispatch(authActions.setDbUser({
        id: 'admin', full_name: 'Administrator', email: ADMIN_EMAIL, role: 'admin',
      }));
      dispatch(authActions.setLoading(false));
      setIsAdmin(true);
      setDbUserReady(true);
      return true;
    }
    setAdminLoginError('Invalid admin credentials. Please try again.');
    return false;
  }, [dispatch]);
  // ────────────────────────────────────────────────────────────────────────

  const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

  const logout = async () => {
    if (isAdmin) {
      sessionStorage.removeItem('gdpr_admin_session');
      setIsAdmin(false);
    } else {
      await signOut(auth);
    }
    dispatch(authActions.clearAuth());
    setDbUserReady(false);
  };

  return (
    <AuthContext.Provider value={{
      user, dbUser, loading, dbUserReady,
      isAdmin,
      adminLoginError,
      signInWithGoogle,
      signInAsAdmin,
      logout,
      refreshDbUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

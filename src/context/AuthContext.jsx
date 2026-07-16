import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updatePassword,
  reauthenticateWithPopup
} from 'firebase/auth';
import { 
  collection, doc, getDoc, getDocs, query, where,
  setDoc, addDoc, serverTimestamp, updateDoc, onSnapshot 
} from 'firebase/firestore';
import { getRoleDefaultPermissions } from '../utils/dbSeeder';

const OWNER_EMAIL = 'nageshn444@gmail.com';
const OWNER_UID   = 'EByfpLYSWsM2nxTKB1urzXgHjV02';

const OWNER_PROFILE = {
  employeeId: '20726',
  employeeName: 'Nagesha N',
  email: OWNER_EMAIL,
  designation: 'Station Superintendent',
  role: 'SUPER_ADMIN',
  active: true,
  approved: true,
  loginEnabled: true,
  status: 'ACTIVE',
  firstLogin: false,
  passwordResetRequired: false
};

const isOwner = (user) => {
  const email = String(user?.email || '').toLowerCase();
  return email === OWNER_EMAIL || email === '20726@pyidcc.bmrcl.com' || user?.uid === OWNER_UID;
};

const normalizeEmployeeId = (value) => String(value ?? '').trim();

const isApprovedProfile = (profile) => {
  if (!profile) return false;
  if (profile.approved === true) return true;
  if (profile.active === false && profile.status !== 'ACTIVE' && profile.status !== 'active' && profile.status !== 'approved' && profile.status !== 'APPROVED') {
    return false;
  }
  return ['ACTIVE', 'active', 'approved', 'APPROVED'].includes(profile.status) || profile.loginEnabled !== false;
};

const isAccessReadyProfile = (profile) => {
  if (!profile) return false;
  if (isApprovedProfile(profile)) return true;
  return profile.active === true || profile.status === 'ACTIVE' || profile.loginEnabled === true;
};

const findSystemUserProfile = async (employeeId, email = '') => {
  const id = normalizeEmployeeId(employeeId);
  const candidates = [];
  if (id) {
    candidates.push({ field: 'employeeId', value: id });
    const numericId = Number(id);
    if (!Number.isNaN(numericId)) candidates.push({ field: 'employeeId', value: numericId });
  }
  if (email) candidates.push({ field: 'email', value: email });

  for (const candidate of candidates) {
    try {
      const q = query(collection(db, 'system_users'), where(candidate.field, '==', candidate.value));
      const snap = await getDocs(q);
      if (!snap.empty) return snap.docs[0];
    } catch (_) {
      // Ignore and continue searching with the next candidate.
    }
  }

  return null;
};

const mapDesignationToRole = (employeeId, designation) => {
  if (String(employeeId) === '20726') return 'SUPER_ADMIN';
  if (!designation) return 'VIEWER';
  const d = String(designation).trim();
  if (d === 'Station Superintendent') return 'ADMIN_Station_Superintendent';
  if (d === 'Crew Controller' || d === 'CREW_CONTROLLER') return 'CREW_CONTROLLER';
  if (d === 'Station Controller') return 'STATION_CONTROLLER';
  if (d === 'Train Operator' || d === 'Station Controller / Train Operator') return 'TRAIN_OPERATOR';
  return 'VIEWER';
};

const AuthContext = createContext();
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      currentUser: null,
      userProfile: null,
      permissions: {},
      loading: false,
      approvalPending: false,
      loginWithGoogle: async () => { throw new Error('Authentication context is not ready.'); },
      logout: async () => {},
      hasPermission: () => false,
      logAudit: async () => {},
      submitLoginRequest: async () => {},
      updateAuthPassword: async () => {}
    };
  }
  return context;
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [approvalPending, setApprovalPending] = useState(false);

  // ─── Auth State Listener ────────────────────────────────────────────────────
  useEffect(() => {
    let unsubscribeSystemUser = () => {};
    let unsubscribePermissions = () => {};
    let unsubscribeRole = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      // Clean up previous listeners
      unsubscribeSystemUser();
      unsubscribePermissions();
      unsubscribeRole();

      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setPermissions({});
        setApprovalPending(false);
        setLoading(false);
        return;
      }

      // ── Owner fast-pass ──
      if (isOwner(user)) {
        setUserProfile({ ...OWNER_PROFILE, uid: user.uid });
        setPermissions(getRoleDefaultPermissions('SUPER_ADMIN'));
        setApprovalPending(false);
        setLoading(false);
        return;
      }

      // ── Regular user: listen to system_users in real-time ──
      unsubscribeSystemUser = onSnapshot(
        doc(db, 'system_users', user.uid),
        (snap) => {
          if (!snap.exists()) {
            setUserProfile(null);
            setPermissions({});
            setApprovalPending(false);
            setLoading(false);
            return;
          }

          const profile = snap.data();

          // Force-logout flag
          if (profile.forceLogout === true) {
            signOut(auth);
            updateDoc(doc(db, 'system_users', user.uid), { forceLogout: false }).catch(() => {});
            alert('Your session has been reset by the Administrator. Please log in again.');
            return;
          }

          // Block check
          const approved      = profile.approved === true;
          const loginEnabled  = profile.loginEnabled === true;
          const active        = profile.active === true || profile.status === 'ACTIVE';

          if (!approved || !loginEnabled || !active) {
            setUserProfile(profile);
            setPermissions({});
            setApprovalPending(true);
            setLoading(false);
            return;
          }

          setApprovalPending(false);
          setUserProfile(profile);

          // ── Load permissions ──
          if (!profile.employeeId) {
            setLoading(false);
            return;
          }

          let baseRolePermissions = {};
          
          const resolveAndSetPermissions = (rolePerms, userPermsDoc) => {
            if (userPermsDoc.exists() && userPermsDoc.data().custom === true) {
              setPermissions(applyTrainOpOverride(userPermsDoc.data().permissions || {}, profile.role));
            } else {
              setPermissions(applyTrainOpOverride(rolePerms, profile.role));
            }
          };

          unsubscribeRole = onSnapshot(
            doc(db, 'role_permissions', profile.role),
            (roleDoc) => {
              baseRolePermissions = roleDoc.data()?.permissions || {};
              
              // Now listen to the user permissions override in real-time
              unsubscribePermissions = onSnapshot(
                doc(db, 'userPermissions', String(profile.employeeId)),
                (permsDoc) => {
                  resolveAndSetPermissions(baseRolePermissions, permsDoc);
                  setLoading(false);
                },
                (err) => {
                  if (err.code !== 'permission-denied') console.error('userPermissions error:', err);
                  // fallback to role permissions on error
                  setPermissions(applyTrainOpOverride(baseRolePermissions, profile.role));
                  setLoading(false);
                }
              );
            },
            (err) => {
              if (err.code !== 'permission-denied') console.error('role_permissions error:', err);
              setLoading(false);
            }
          );
        },
        (err) => {
          if (err.code !== 'permission-denied') console.error('system_users error:', err);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSystemUser();
      unsubscribePermissions();
      unsubscribeRole();
    };
  }, []);

  // ─── Google Redirect Result Handler ─────────────────────────────────────────
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result?.user) return;
        await finishLogin(result.user);
      })
      .catch((err) => {
        if (!err.message?.includes('Cross-Origin')) {
          console.error('Redirect result error:', err);
        }
      });
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const applyTrainOpOverride = (perms, role) => {
    if (role !== 'TRAIN_OPERATOR') return perms;
    const p = { ...perms };
    const defaults = {
      'Dashboard': 'View', 'Crew Registry': 'View', 'Duty Roster': 'View',
      'Shift Exchange': 'Request', 'Duty Swap': 'Request',
      'Automated Dispatch Gate': 'View', 'Live Relief Tracking': 'View',
      'Emergency Relief Module': 'View', 'Reports Center': 'View',
      'KM Calculator Suite': 'View', 'Rake Registry': 'View', 'Leave Requests': 'Request',
    };
    Object.entries(defaults).forEach(([mod, val]) => {
      const cur = p[mod];
      // Only set default when unset, 'No', or leftover object from old code
      if (!cur || cur === 'No' || typeof cur === 'object') p[mod] = val;
    });
    return p;
  };


  const getBrowserName = () => {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Chrome'))  return 'Chrome';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('Edge'))    return 'Edge';
    return 'Web Browser';
  };

  const logAudit = async (action, performedBy, performedByName, details) => {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        action,
        performedBy,
        performedByName: performedByName || 'Unknown',
        details: details || '',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error('Failed to write audit log:', e);
    }
  };

  const logLoginHistory = async (employeeId, name, status, reason = '') => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'login_history'), {
        employeeId: employeeId || '',
        employeeName: name || 'Unknown',
        timestamp: serverTimestamp(),
        device: navigator.userAgent,
        status,
        reason
      });
    } catch (e) {
      console.error('Failed to log login history:', e);
    }
  };

  async function createLoginRequest(employeeId, employeeName, designation, depot, email, loginMethod, firebaseUid = null) {
    try {
      const now = new Date();
      const fallbackEmployeeId = normalizeEmployeeId(employeeId) || (email ? email.split('@')[0] : 'google-user');
      const reqId = `req_${Date.now()}_${fallbackEmployeeId}`;
      const payload = {
        requestId: reqId,
        employeeId: fallbackEmployeeId ? String(fallbackEmployeeId) : '',
        employeeName: employeeName || 'Unknown',
        designation: designation || 'Train Operator',
        depot: depot || 'Peenya Depot (PYID)',
        email: email || '',
        requestedRole: mapDesignationToRole(fallbackEmployeeId, designation) || 'TRAIN_OPERATOR',
        loginMethod,
        requestStatus: 'Pending',
        requestDate: now.toLocaleDateString('en-GB').replace(/\//g, '-'),
        requestTime: now.toTimeString().split(' ')[0].substring(0, 5),
        device: navigator.userAgent,
        browser: getBrowserName(),
        ipAddress: '192.168.1.100',
        firebaseUid: firebaseUid || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'login_requests', reqId), payload);
      return payload;
    } catch (e) {
      console.error('Failed to create login request:', e);
      throw e;
    }
  }

  async function findApprovedLoginRequest(email) {
    if (!email) return null;
    try {
      const q = query(collection(db, 'login_requests'), where('email', '==', email));
      const snap = await getDocs(q);
      const approved = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .find((item) => {
          const status = String(item.requestStatus || item.status || '').toLowerCase();
          return status === 'approved' || status === 'approved by admin' || status === 'approved_by_admin';
        });
      return approved || null;
    } catch (e) {
      console.warn('Unable to resolve approved login request:', e);
      return null;
    }
  }

  const finishLogin = async (user) => {
    if (!user) return { ok: false, reason: 'No user returned' };

    if (isOwner(user)) {
      // Always guarantee the owner has the correct local profile immediately
      setUserProfile({ ...OWNER_PROFILE, uid: user.uid });
      setPermissions(getRoleDefaultPermissions('SUPER_ADMIN'));
      setApprovalPending(false);
      try {
        await setDoc(doc(db, 'system_users', user.uid), {
          uid: user.uid,
          ...OWNER_PROFILE,
          email: user.email || OWNER_PROFILE.email,
          employeeName: user.displayName || OWNER_PROFILE.employeeName,
          role: 'SUPER_ADMIN',
          approved: true,
          loginEnabled: true,
          active: true,
          status: 'ACTIVE',
          firstLogin: false,
          passwordResetRequired: false,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        await setDoc(doc(db, 'users', '20726'), {
          employeeId: '20726',
          ...OWNER_PROFILE,
          email: user.email || OWNER_PROFILE.email,
          operationalCrew: 'YES',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (profileErr) {
        console.warn('Owner profile sync skipped due to Firestore permissions:', profileErr);
      }
      return { ok: true, user, approved: true };
    }

    let profile = null;
    try {
      const uidProfileDoc = await getDoc(doc(db, 'system_users', user.uid));
      if (uidProfileDoc.exists()) {
        profile = uidProfileDoc.data();
      }
    } catch (profileErr) {
      console.warn('Unable to read system user profile during Google sign-in:', profileErr);
    }

    if (profile) {
      const approved = isAccessReadyProfile(profile);
      if (approved) {
        try {
          await setDoc(doc(db, 'system_users', user.uid), {
            ...profile,
            uid: user.uid,
            email: user.email || profile.email,
            employeeName: user.displayName || profile.employeeName || 'Unknown',
            role: profile.role || 'VIEWER',
            approved: true,
            loginEnabled: true,
            active: true,
            status: 'ACTIVE',
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (profileWriteErr) {
          console.warn('Profile update skipped during Google sign-in:', profileWriteErr);
        }
        setApprovalPending(false);
        return { ok: true, user, approved: true };
      }
      setApprovalPending(true);
      return { ok: true, user, pendingApproval: true, message: 'Your Google account is pending admin approval.' };
    }

    const approvedRequest = await findApprovedLoginRequest(user.email);
    if (approvedRequest) {
      try {
        await setDoc(doc(db, 'system_users', user.uid), {
          uid: user.uid,
          employeeId: approvedRequest.employeeId || user.email?.split('@')[0] || '',
          employeeName: approvedRequest.employeeName || user.displayName || user.email || 'Unknown',
          email: user.email || approvedRequest.email,
          designation: approvedRequest.designation || 'Station Controller / Train Operator',
          role: approvedRequest.requestedRole || 'VIEWER',
          depot: approvedRequest.depot || 'Peenya Depot (PYID)',
          approved: true,
          loginEnabled: true,
          active: true,
          status: 'ACTIVE',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (profileWriteErr) {
        console.warn('Approved-request profile sync skipped during Google sign-in:', profileWriteErr);
      }
      setApprovalPending(false);
      return { ok: true, user, approved: true };
    }

    try {
      await createLoginRequest(
        user.email?.split('@')[0] || '',
        user.displayName || user.email || 'Unknown',
        'Station Controller / Train Operator',
        'Peenya Depot (PYID)',
        user.email || '',
        'Google',
        user.uid
      );
    } catch (requestErr) {
      console.warn('Login request creation skipped during Google sign-in:', requestErr);
    }

    setApprovalPending(true);
    return { ok: true, user, pendingApproval: true, message: 'Your Google login request has been submitted. Please wait for Super Admin or Admin SS approval.' };
  };

  const submitLoginRequest = async (employeeId, employeeName) =>
    createLoginRequest(
      employeeId,
      employeeName,
      'Station Controller / Train Operator',
      'Peenya Depot (PYID)',
      `${employeeId}@pyidcc.bmrcl.com`,
      'Google'
    );

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    let result;
    try {
      result = await signInWithPopup(auth, provider);
    } catch (popupErr) {
      if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/popup-closed-by-user') {
        await signInWithRedirect(auth, provider);
        return { ok: true, redirected: true };
      }
      throw popupErr;
    }

    return finishLogin(result.user);
  };

  const requestPasswordReset = async (employeeId) => {
    const email = `${employeeId}@pyidcc.bmrcl.com`;
    await sendPasswordResetEmail(auth, email);
    await logAudit('PASSWORD_RESET_REQUEST', 'system', 'System', `Password reset email dispatched for Employee ID: ${employeeId}.`);
  };

  const updateAuthPassword = async (newPassword) => {
    if (!auth.currentUser) throw new Error('No authenticated user session found.');

    const performUpdate = async () => {
      await updatePassword(auth.currentUser, newPassword);
      const empId = userProfile?.employeeId;
      if (empId) {
        await updateDoc(doc(db, 'system_users', auth.currentUser.uid), { firstLogin: false, passwordResetRequired: false });
        try { await updateDoc(doc(db, 'users', String(empId)), { firstLogin: false, passwordResetRequired: false }); } catch (_) {}
        await logAudit('PASSWORD_CHANGE', auth.currentUser.uid, userProfile.employeeName, 'Password reset/changed successfully.');
        setUserProfile(prev => ({ ...prev, firstLogin: false, passwordResetRequired: false }));
      }
    };

    try {
      await performUpdate();
    } catch (err) {
      // Firebase requires a recent login for sensitive operations like password change.
      // Re-authenticate via Google and retry.
      if (err.code === 'auth/requires-recent-login') {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account', login_hint: auth.currentUser.email || '' });
          await reauthenticateWithPopup(auth.currentUser, provider);
          await performUpdate();
        } catch (reAuthErr) {
          throw new Error(
            reAuthErr.code === 'auth/popup-closed-by-user'
              ? 'Re-authentication cancelled. Please try again.'
              : 'Re-authentication failed. Please sign out and sign back in, then try again.'
          );
        }
      } else {
        throw err;
      }
    }
  };

  const logout = async () => {
    if (currentUser && userProfile) {
      await logAudit('LOGOUT', currentUser.uid, userProfile.employeeName, 'Logged out of session.');
    }
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
    setPermissions({});
    setApprovalPending(false);
  };

  // ─── Permission Helper ───────────────────────────────────────────────────────
  const hasPermission = (moduleName, requiredLevel) => {
    if (userProfile?.role === 'SUPER_ADMIN') return true;

    const altMap = {
      'Reports Center': 'Reports',
      'Reports': 'Reports Center',
      'User Control Center': 'User Management',
      'User Management': 'User Control Center',
      'Role Management': 'User Control Center',
      'Settings': 'User Control Center',
      'Automated Dispatch Gate': 'Manual Override',
      'Manual Override': 'Automated Dispatch Gate',
    };
    const alt = altMap[moduleName];
    const levelOrObj = permissions[moduleName] || (alt ? permissions[alt] : undefined);
    if (!levelOrObj) return false;

    if (typeof levelOrObj === 'object') {
      if (requiredLevel === 'Full') {
        return !!(levelOrObj['Full Control'] || levelOrObj['Approve'] || levelOrObj['Admin Access'] ||
                  levelOrObj['Delete'] || levelOrObj['Manage Users'] || levelOrObj['Assign Permissions'] ||
                  levelOrObj['Assign Roles'] || levelOrObj['Override Dispatch']);
      }
      if (requiredLevel === 'View' || requiredLevel === 'Own') return levelOrObj['View'] === true;
      if (requiredLevel === 'Request') return levelOrObj['Create Request'] === true || levelOrObj['View'] === true;
      return false;
    }

    // Legacy string permissions
    if (levelOrObj === 'No') return false;
    if (requiredLevel === 'Full') return levelOrObj === 'Full';
    if (requiredLevel === 'View' || requiredLevel === 'Own') return ['Full', 'View', 'Own'].includes(levelOrObj);
    if (requiredLevel === 'Request') return ['Full', 'Request'].includes(levelOrObj);
    return false;
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      permissions,
      loading,
      approvalPending,
      loginWithGoogle,
      logout,
      hasPermission,
      logAudit,
      submitLoginRequest,
      updateAuthPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
}
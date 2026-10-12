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
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  inMemoryPersistence
} from 'firebase/auth';
import { 
  collection, doc, getDoc, getDocs, query, where,
  setDoc, addDoc, serverTimestamp, updateDoc, onSnapshot 
} from 'firebase/firestore';
import { getRoleDefaultPermissions } from '../utils/dbSeeder';

const OWNER_EMAIL = 'nageshn444@gmail.com';
const OWNER_UID   = 'EByfpLYSWsM2nxTKB1urzXgHjV02';

export const isOwnerUser = (user, profile) => {
  if (!user && !profile) return false;
  const userEmail = String(user?.email || '').toLowerCase().trim();
  const profEmail = String(profile?.email || '').toLowerCase().trim();
  const empId = String(profile?.employeeId || user?.employeeId || '').trim();
  const uid = user?.uid;

  if (uid === OWNER_UID) return true;
  if (userEmail === OWNER_EMAIL || profEmail === OWNER_EMAIL) return true;
  if (userEmail.startsWith('20726@') || profEmail.startsWith('20726@')) return true;
  if (userEmail.includes('20726') || profEmail.includes('20726')) return true;
  if (empId === '20726') return true;
  if (profile?.role === 'SUPER_ADMIN') return true;
  return false;
};

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
  if (!user) return false;
  const email = String(user?.email || '').toLowerCase().trim();
  const empId = String(user?.employeeId || '').trim();
  return (
    user?.uid === OWNER_UID ||
    email === OWNER_EMAIL ||
    email.startsWith('20726@') ||
    email.includes('20726') ||
    empId === '20726'
  );
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
  if (email) {
    candidates.push({ field: 'email', value: email });
    // Also try the pyidcc.bmrcl.com variant if a different email was given
    if (email.includes('@') && !email.endsWith('@pyidcc.bmrcl.com')) {
      const localPart = email.split('@')[0];
      candidates.push({ field: 'email', value: `${localPart}@pyidcc.bmrcl.com` });
    }
  }

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
      approvalPendingMessage: '',
      loginWithIdAndPassword: async () => { throw new Error('Authentication context is not ready.'); },
      loginWithGoogle: async () => { throw new Error('Authentication context is not ready.'); },
      requestPasswordReset: async () => { throw new Error('Authentication context is not ready.'); },
      logout: async () => {},
      hasPermission: () => false,
      logAudit: async () => {},
      submitLoginRequest: async () => {},
      updateAuthPassword: async () => {}
    };
  }
  return context;
}

const CACHED_PROFILE_KEY = 'pyidcc_cached_user_profile';
const CACHED_PERMS_KEY   = 'pyidcc_cached_user_perms';

const saveProfileToCache = (profile, perms) => {
  try {
    if (profile && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profile));
    }
    if (perms && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CACHED_PERMS_KEY, JSON.stringify(perms));
    }
  } catch (_) {}
};

const clearProfileCache = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(CACHED_PROFILE_KEY);
      window.localStorage.removeItem(CACHED_PERMS_KEY);
    }
  } catch (_) {}
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => auth.currentUser);
  const [userProfile, setUserProfile] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = window.localStorage.getItem(CACHED_PROFILE_KEY);
        return cached ? JSON.parse(cached) : null;
      }
    } catch (_) {}
    return null;
  });
  const [permissions, setPermissions] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = window.localStorage.getItem(CACHED_PERMS_KEY);
        return cached ? JSON.parse(cached) : {};
      }
    } catch (_) {}
    return {};
  });
  const [loading, setLoading] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = window.localStorage.getItem(CACHED_PROFILE_KEY);
        if (cached) return false;
      }
    } catch (_) {}
    return !auth.currentUser;
  });
  const [approvalPending, setApprovalPending] = useState(false);
  const [approvalPendingMessage, setApprovalPendingMessage] = useState('');

  const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia('(max-width: 768px)').matches)
    );
  };

  // Safety watchdog: never keep loading stuck on mobile devices if connection stalls
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  const checkEmployeeExists = async (empId, email) => {
    if (String(empId) === '20726') return true;
    try {
      const id = normalizeEmployeeId(empId);
      if (id) {
        // users collection is keyed by employeeId
        const uSnap = await getDoc(doc(db, 'users', id));
        if (uSnap.exists()) return true;
        // crewRegistry is keyed by employeeId
        const rSnap = await getDoc(doc(db, 'crewRegistry', id));
        if (rSnap.exists()) return true;
        // system_users is keyed by UID — must query by field
        const sQ = query(collection(db, 'system_users'), where('employeeId', '==', id));
        const sSnap = await getDocs(sQ);
        if (!sSnap.empty) return true;
        // Try numeric form as well
        const numId = Number(id);
        if (!Number.isNaN(numId)) {
          const sQNum = query(collection(db, 'system_users'), where('employeeId', '==', numId));
          const sSnapNum = await getDocs(sQNum);
          if (!sSnapNum.empty) return true;
        }
      }
      if (email) {
        const emailVariants = [email];
        if (!email.endsWith('@pyidcc.bmrcl.com')) {
          emailVariants.push(`${email.split('@')[0]}@pyidcc.bmrcl.com`);
        }
        for (const ev of emailVariants) {
          const q = query(collection(db, 'system_users'), where('email', '==', ev));
          const snap = await getDocs(q);
          if (!snap.empty) return true;
        }
      }
    } catch (_) {}
    return false;
  };

  const resolveUserProfile = async (user) => {
    if (!user) return null;
    const email = (user.email || '').toLowerCase().trim();
    const empCandidate = email.includes('@') ? email.split('@')[0] : '';

    // 1. Direct system_users document by UID
    try {
      const directSnap = await getDoc(doc(db, 'system_users', user.uid));
      if (directSnap.exists()) return directSnap.data();
    } catch (_) {}

    // 2. Query system_users by email
    if (email) {
      try {
        const qEmail = query(collection(db, 'system_users'), where('email', '==', email));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          const found = snapEmail.docs[0].data();
          await setDoc(doc(db, 'system_users', user.uid), {
            ...found,
            uid: user.uid,
            email,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          return found;
        }
      } catch (_) {}
    }

    // 3. Query system_users by employeeId
    if (empCandidate) {
      try {
        const qEmp = query(collection(db, 'system_users'), where('employeeId', '==', empCandidate));
        const snapEmp = await getDocs(qEmp);
        if (!snapEmp.empty) {
          const found = snapEmp.docs[0].data();
          await setDoc(doc(db, 'system_users', user.uid), {
            ...found,
            uid: user.uid,
            employeeId: empCandidate,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          return found;
        }
      } catch (_) {}
    }

    // 4. Fallback to users collection
    if (empCandidate) {
      try {
        const uSnap = await getDoc(doc(db, 'users', empCandidate));
        if (uSnap.exists()) {
          const uData = uSnap.data();
          const profile = {
            uid: user.uid,
            employeeId: empCandidate,
            employeeName: uData.employeeName || user.displayName || 'BMRCL Officer',
            email: email || uData.email || `${empCandidate}@pyidcc.bmrcl.com`,
            designation: uData.designation || 'Station Controller / Train Operator',
            role: uData.role || 'TRAIN_OPERATOR',
            depot: uData.depot || 'Peenya Depot (PYID)',
            status: 'ACTIVE',
            active: true,
            approved: true,
            loginEnabled: true,
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'system_users', user.uid), profile, { merge: true });
          return profile;
        }
      } catch (_) {}
    }

    // 5. Check approved login_requests
    if (email) {
      const approved = await findApprovedLoginRequest(email);
      if (approved) {
        const profile = {
          uid: user.uid,
          employeeId: approved.employeeId || empCandidate || '',
          employeeName: approved.employeeName || user.displayName || 'BMRCL Officer',
          email,
          designation: approved.designation || 'Station Controller / Train Operator',
          role: approved.requestedRole || 'TRAIN_OPERATOR',
          depot: approved.depot || 'Peenya Depot (PYID)',
          status: 'ACTIVE',
          active: true,
          approved: true,
          loginEnabled: true,
          updatedAt: new Date().toISOString()
        };
        await setDoc(doc(db, 'system_users', user.uid), profile, { merge: true });
        return profile;
      }
    }

    return null;
  };

  // ─── Auth State Listener ────────────────────────────────────────────────────
  useEffect(() => {
    let unsubscribeSystemUser = () => {};
    let unsubscribePermissions = () => {};
    let unsubscribeRole = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Clean up previous listeners
      unsubscribeSystemUser();
      unsubscribePermissions();
      unsubscribeRole();

      setCurrentUser(user);

      if (!user) {
        setUserProfile(null);
        setPermissions({});
        setApprovalPending(false);
        setApprovalPendingMessage('');
        clearProfileCache();
        setLoading(false);
        return;
      }

      // ── Owner fast-pass ──
      if (isOwner(user)) {
        const ownerProf = { ...OWNER_PROFILE, uid: user.uid };
        const ownerPerms = getRoleDefaultPermissions('SUPER_ADMIN');
        setUserProfile(ownerProf);
        setPermissions(ownerPerms);
        saveProfileToCache(ownerProf, ownerPerms);
        setApprovalPending(false);
        setApprovalPendingMessage('');
        setLoading(false);
        return;
      }

      // ── Regular user: listen to system_users in real-time ──
      // Track whether this is the first snapshot callback for this login session
      let firstSnapshotReceived = false;

      unsubscribeSystemUser = onSnapshot(
        doc(db, 'system_users', user.uid),
        async (snap) => {
          if (!snap.exists()) {
            if (!firstSnapshotReceived) {
              firstSnapshotReceived = true;
              // First callback: doc doesn't exist yet — try multi-stage lookup
              // This is common right after staff login creates a new Firebase Auth account
              const fallbackProfile = await resolveUserProfile(user);
              if (fallbackProfile) {
                // resolveUserProfile wrote to system_users/{uid}, listener will re-fire
                return;
              }
              // Genuinely new user: show pending approval
              setUserProfile(null);
              setPermissions({});
              setApprovalPending(true);
              setApprovalPendingMessage('Your login request has been submitted. Please wait for Super Admin or Admin SS approval.');
              setLoading(false);
              return;
            }
            // Subsequent callbacks where doc still doesn't exist: keep pending state
            setLoading(false);
            return;
          }
          firstSnapshotReceived = true;

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
            setApprovalPendingMessage('Your account is awaiting Super Admin or Admin SS activation.');
            setLoading(false);
            return;
          }

          setApprovalPending(false);
          setApprovalPendingMessage('');
          setUserProfile(profile);

          // ── Load permissions ──
          if (!profile.employeeId) {
            setLoading(false);
            return;
          }

          let baseRolePermissions = {};
          
          const resolveAndSetPermissions = (rolePerms, userPermsDoc) => {
            const finalPerms = (userPermsDoc.exists() && userPermsDoc.data().custom === true)
              ? applyTrainOpOverride(userPermsDoc.data().permissions || {}, profile.role)
              : applyTrainOpOverride(rolePerms, profile.role);
            setPermissions(finalPerms);
            saveProfileToCache(profile, finalPerms);
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
  // On mobile browsers (especially Safari/iOS), getRedirectResult may throw
  // cross-origin or operation-not-supported errors — these are always harmless
  // and should be silenced; the onAuthStateChanged listener handles the actual
  // session restoration after the redirect.
  useEffect(() => {
    const KNOWN_HARMLESS_CODES = new Set([
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported',
      'auth/null-user',
      'auth/cancelled-popup-request',
    ]);
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result?.user) return;
        await finishLogin(result.user);
      })
      .catch((err) => {
        const isSilent = 
          KNOWN_HARMLESS_CODES.has(err.code) ||
          String(err.message || '').includes('Cross-Origin') ||
          String(err.message || '').includes('cross-origin') ||
          String(err.message || '').includes('storage') ||
          String(err.code || '').includes('web-storage');
        if (!isSilent) {
          console.warn('[Auth] Redirect result error (non-fatal):', err.code, err.message);
        }
      });
  }, []);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const applyTrainOpOverride = (perms, role) => {
    if (role !== 'TRAIN_OPERATOR') return perms;
    const p = { ...perms };
    const systemSettingsModules = [
      'User Control Center', 'User Management', 'Role Management', 'Settings', 'ADMIN'
    ];
    const requestModules = [
      'Shift Exchange', 'Duty Swap', 'Leave Requests', 'Leave Request'
    ];
    const operationalViewModules = [
      'Dashboard', 'Command Overview', 'Automated Dispatch Gate', 'Manual Override',
      'Duty Roster', 'WTT Timetable', 'Link Roster', 'Duty Generator Suite',
      'Crew Registry', 'Reports Center', 'Reports', 'KM Calculator Suite',
      "JMD TO's Driving Hours", 'Rake Registry', 'Live Relief Tracking',
      'Emergency Relief Module', 'Emergency Relief', 'Night Changeover',
      'Changeover Link', 'OCC Modules Suite', 'Train ID Swap Engine',
      'AI Faults Reporting', 'AI ALS Cab Inspection'
    ];

    systemSettingsModules.forEach(mod => { p[mod] = 'No'; });
    requestModules.forEach(mod => { p[mod] = 'Request'; });
    operationalViewModules.forEach(mod => { p[mod] = 'View'; });
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

    setCurrentUser(user);

    if (isOwner(user)) {
      const ownerProf = { ...OWNER_PROFILE, uid: user.uid };
      const ownerPerms = getRoleDefaultPermissions('SUPER_ADMIN');
      setUserProfile(ownerProf);
      setPermissions(ownerPerms);
      saveProfileToCache(ownerProf, ownerPerms);
      setApprovalPending(false);
      setApprovalPendingMessage('');
      setLoading(false);

      // Non-blocking background sync — never block navigation on mobile network latency
      Promise.all([
        setDoc(doc(db, 'system_users', user.uid), {
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
        }, { merge: true }),
        setDoc(doc(db, 'users', '20726'), {
          employeeId: '20726',
          ...OWNER_PROFILE,
          email: user.email || OWNER_PROFILE.email,
          operationalCrew: 'YES',
          updatedAt: new Date().toISOString()
        }, { merge: true })
      ]).catch((profileErr) => {
        console.warn('Owner background sync skipped:', profileErr);
      });

      return { ok: true, user, approved: true };
    }

    let profile = await resolveUserProfile(user);

    if (profile) {
      const approved = isAccessReadyProfile(profile);
      setUserProfile(profile);
      setLoading(false);

      if (approved) {
        setApprovalPending(false);
        setApprovalPendingMessage('');
        setDoc(doc(db, 'system_users', user.uid), {
          ...profile,
          uid: user.uid,
          email: user.email || profile.email,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
        return { ok: true, user, approved: true };
      }
      setApprovalPending(true);
      const msg = 'Your account is pending Super Admin or Admin SS approval.';
      setApprovalPendingMessage(msg);
      return { ok: true, user, pendingApproval: true, message: msg };
    }

    const approvedRequest = await findApprovedLoginRequest(user.email);
    if (approvedRequest) {
      const newProf = {
        uid: user.uid,
        employeeId: approvedRequest.employeeId || user.email?.split('@')[0] || '',
        employeeName: approvedRequest.employeeName || user.displayName || user.email || 'BMRCL Officer',
        email: user.email || approvedRequest.email,
        designation: approvedRequest.designation || 'Station Controller / Train Operator',
        role: approvedRequest.requestedRole || 'VIEWER',
        depot: approvedRequest.depot || 'Peenya Depot (PYID)',
        approved: true,
        loginEnabled: true,
        active: true,
        status: 'ACTIVE',
        updatedAt: new Date().toISOString()
      };
      try {
        await setDoc(doc(db, 'system_users', user.uid), newProf, { merge: true });
      } catch (profileWriteErr) {
        console.warn('Approved-request profile sync skipped during sign-in:', profileWriteErr);
      }
      setUserProfile(newProf);
      setApprovalPending(false);
      setApprovalPendingMessage('');
      return { ok: true, user, approved: true };
    }

    try {
      await createLoginRequest(
        user.email?.split('@')[0] || '',
        user.displayName || user.email || 'BMRCL Officer',
        'Station Controller / Train Operator',
        'Peenya Depot (PYID)',
        user.email || '',
        user.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 'Staff_ID',
        user.uid
      );
    } catch (requestErr) {
      console.warn('Login request creation skipped:', requestErr);
    }

    setApprovalPending(true);
    const pendingMsg = 'Your login request has been submitted. Please wait for Super Admin or Admin SS approval.';
    setApprovalPendingMessage(pendingMsg);
    return { ok: true, user, pendingApproval: true, message: pendingMsg };
  };

  const submitLoginRequest = async (employeeId, employeeName) =>
    createLoginRequest(
      employeeId,
      employeeName,
      'Station Controller / Train Operator',
      'Peenya Depot (PYID)',
      `${employeeId}@pyidcc.bmrcl.com`,
      'Staff_ID'
    );

  const loginWithIdAndPassword = async (idOrEmail, password) => {
    const raw = String(idOrEmail || '').trim();
    if (!raw) throw new Error('Please enter your Employee ID or email.');
    if (!password) throw new Error('Please enter your password.');

    const cleanRaw = raw.toLowerCase();
    const isEmail = raw.includes('@');
    const employeeId = isEmail ? raw.split('@')[0].trim() : raw.trim();

    // Identify if targeting Super Admin (ID 20726 or Nagesh variations)
    const isOwnerTarget = (
      employeeId === '20726' ||
      cleanRaw === '20726' ||
      cleanRaw === OWNER_EMAIL ||
      cleanRaw.includes('nagesh') ||
      cleanRaw === 'admin' ||
      cleanRaw === 'superadmin' ||
      cleanRaw.startsWith('20726@')
    );

    const canonicalEmpId = isOwnerTarget ? '20726' : employeeId;
    const pyidccEmail = `${canonicalEmpId}@pyidcc.bmrcl.com`;
    const bmrclEmail  = `${canonicalEmpId}@bmrc.co.in`;
    const gmailEmail  = isEmail && cleanRaw.endsWith('@gmail.com') ? cleanRaw : null;
    const primaryEmail = isEmail ? cleanRaw : pyidccEmail;

    // Ensure session persistence is set before login attempt
    try {
      await setPersistence(auth, browserLocalPersistence);
    } catch (_) {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (__) {
        try { await setPersistence(auth, inMemoryPersistence); } catch (___) {}
      }
    }

    let userCredential = null;
    let authError = null;

    // Build ordered list of emails to attempt sign-in
    const emailsToTry = [];
    if (isOwnerTarget) {
      emailsToTry.push(pyidccEmail);
      if (!emailsToTry.includes(OWNER_EMAIL)) emailsToTry.push(OWNER_EMAIL);
      if (!emailsToTry.includes(bmrclEmail))  emailsToTry.push(bmrclEmail);
      if (primaryEmail && !emailsToTry.includes(primaryEmail)) emailsToTry.push(primaryEmail);
    } else {
      emailsToTry.push(primaryEmail);
      if (primaryEmail !== pyidccEmail) emailsToTry.push(pyidccEmail);
      if (primaryEmail !== bmrclEmail)  emailsToTry.push(bmrclEmail);
      if (gmailEmail && !emailsToTry.includes(gmailEmail)) emailsToTry.push(gmailEmail);
    }

    // Attempt sign-in with each candidate email
    for (const emailAttempt of emailsToTry) {
      try {
        userCredential = await signInWithEmailAndPassword(auth, emailAttempt, password);
        authError = null;
        break;
      } catch (err) {
        authError = err;
        // Don't break on wrong-password/invalid-credential — try remaining emails in the list!
      }
    }

    // Auto-provision in Firebase Auth if employee exists in BMRCL registry/users
    if (!userCredential && authError && (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential')) {
      const isEligible = isOwnerTarget || await checkEmployeeExists(employeeId, primaryEmail);
      if (isEligible) {
        // Always provision using pyidccEmail so it never conflicts with OWNER_EMAIL Google SSO
        const provisionEmail = pyidccEmail;
        try {
          userCredential = await createUserWithEmailAndPassword(auth, provisionEmail, password);
          authError = null;
        } catch (createErr) {
          if (createErr.code === 'auth/email-already-in-use') {
            throw new Error('Incorrect password. Please verify your credentials or use Forgot Password / Google SSO.');
          }
          throw createErr;
        }
      }
    }

    if (!userCredential) {
      if (authError?.code === 'auth/wrong-password' || authError?.code === 'auth/invalid-credential') {
        throw new Error('Invalid Employee ID or password. Please verify and try again.');
      }
      if (authError?.code === 'auth/user-not-found') {
        throw new Error('Employee ID not found in BMRCL registry. Please contact Administrator.');
      }
      if (authError?.code === 'auth/too-many-requests') {
        throw new Error('Too many failed attempts. Please wait a few minutes and try again, or use Forgot Password.');
      }
      throw new Error(authError?.message || 'Authentication failed. Please try again.');
    }

    return finishLogin(userCredential.user);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    const mobile = isMobileDevice();

    // On mobile devices, always use signInWithRedirect to avoid popup blocking.
    // Set session persistence first so the redirect result survives the page
    // reload without relying on cross-origin cookies (blocked by Safari ITP).
    if (mobile) {
      try {
        await setPersistence(auth, browserSessionPersistence);
      } catch (_) {
        // If session persistence fails (e.g. private browsing), fall back to memory
        try { await setPersistence(auth, inMemoryPersistence); } catch (__) {}
      }
      try {
        await signInWithRedirect(auth, provider);
        return { ok: true, redirected: true };
      } catch (redirectErr) {
        if (redirectErr.code === 'auth/unauthorized-domain') {
          throw new Error(`Domain (${window.location.hostname}) is not authorized in Google OAuth. Please use Staff ID Login instead.`);
        }
        throw redirectErr;
      }
    }

    // Desktop: try popup first, fall back to redirect on failure
    let result;
    try {
      await setPersistence(auth, browserLocalPersistence);
      result = await signInWithPopup(auth, provider);
    } catch (popupErr) {
      if (popupErr.code === 'auth/unauthorized-domain') {
        throw new Error(`Domain (${window.location.hostname}) is not authorized in Google OAuth. Please use Staff ID Login instead.`);
      }
      if (
        popupErr.code === 'auth/popup-blocked' || 
        popupErr.code === 'auth/popup-closed-by-user' ||
        popupErr.code === 'auth/cancelled-popup-request' ||
        popupErr.code === 'auth/operation-not-supported-in-this-environment' ||
        String(popupErr?.message || '').includes('Cross-Origin-Opener-Policy')
      ) {
        await signInWithRedirect(auth, provider);
        return { ok: true, redirected: true };
      }
      throw popupErr;
    }

    return finishLogin(result.user);
  };

  const requestPasswordReset = async (employeeIdOrEmail) => {
    const raw = String(employeeIdOrEmail || '').trim();
    if (!raw) throw new Error('Please enter your Employee ID or email.');
    const email = raw.includes('@') ? raw : `${raw}@pyidcc.bmrcl.com`;
    await sendPasswordResetEmail(auth, email);
    await logAudit('PASSWORD_RESET_REQUEST', 'system', 'System', `Password reset email dispatched for ${raw}.`);
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
    clearProfileCache();
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
    setPermissions({});
    setApprovalPending(false);
  };

  // ─── Permission Helper ───────────────────────────────────────────────────────
  const hasPermission = (moduleName, requiredLevel) => {
    if (userProfile?.role === 'SUPER_ADMIN') return true;

    // Strict Train Operator permissions enforcement:
    // 1. Block System Settings completely
    // 2. Block all write/modification/deletion operations (strict read-only)
    // 3. Allow 'Request' only for Leave Requests and Shift Exchange / Duty Swap
    // 4. Allow 'View' and 'Own' for all other operational modules across the application
    if (userProfile?.role === 'TRAIN_OPERATOR') {
      const isSystemSettings = [
        'User Control Center',
        'User Management',
        'Role Management',
        'Settings',
        'ADMIN'
      ].includes(moduleName);

      if (isSystemSettings) return false;
      if (requiredLevel === 'Full') return false;

      if (requiredLevel === 'Request') {
        return ['Leave Requests', 'Leave Request', 'Shift Exchange', 'Duty Swap'].includes(moduleName);
      }

      if (requiredLevel === 'View' || requiredLevel === 'Own') {
        return true;
      }

      return false;
    }

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
      approvalPendingMessage,
      loginWithIdAndPassword,
      loginWithGoogle,
      requestPasswordReset,
      logout,
      hasPermission,
      logAudit,
      submitLoginRequest,
      updateAuthPassword,
      isOwner: isOwnerUser(currentUser, userProfile),
      isOwnerUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}
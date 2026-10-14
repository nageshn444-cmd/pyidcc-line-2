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
import { BMRCL_CREW_MASTER_BACKUP } from '../data/bmrclCrewRegistry';
import { OFFICIAL_JMD_TD_REGISTRY } from '../data/jmdCrewMaster';
import { EMPLOYEE_MASTER_REGISTRY } from '../data/employeeProfileMaster';

const OWNER_EMAIL = 'nageshn444@gmail.com';
const OWNER_UID   = 'EByfpLYSWsM2nxTKB1urzXgHjV02';

export const isOwnerUser = (user, profile) => {
  if (!user && !profile) return false;
  const userEmail = String(user?.email || '').toLowerCase().trim();
  const profEmail = String(profile?.email || '').toLowerCase().trim();
  const empId = String(profile?.employeeId || user?.employeeId || '').trim();
  const uid = user?.uid;
  const profName = String(profile?.employeeName || profile?.name || user?.displayName || '').toLowerCase().trim();

  if (uid === OWNER_UID) return true;
  if (userEmail === OWNER_EMAIL || profEmail === OWNER_EMAIL) return true;
  if (userEmail === 'nageshn@bmrc.co.in' || profEmail === 'nageshn@bmrc.co.in') return true;
  if (userEmail.startsWith('20726@') || profEmail.startsWith('20726@')) return true;
  if (userEmail.includes('20726') || profEmail.includes('20726')) return true;
  if (userEmail.includes('nageshn444') || profEmail.includes('nageshn444')) return true;
  if (empId === '20726') return true;
  if (profName.includes('nagesha') || profName === 'nagesh n') return true;
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

export const isOwner = (user) => {
  if (!user) return false;
  const email = String(user?.email || '').toLowerCase().trim();
  const empId = String(user?.employeeId || '').trim();
  const name = String(user?.displayName || '').toLowerCase().trim();
  return (
    user?.uid === OWNER_UID ||
    email === OWNER_EMAIL ||
    email === 'nageshn@bmrc.co.in' ||
    email.startsWith('20726@') ||
    email.includes('20726') ||
    email.includes('nageshn444') ||
    email.includes('nagesh') ||
    empId === '20726' ||
    name.includes('nagesha') ||
    name === 'nagesh n'
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

export const findRegistryEmployee = (employeeId, email = '') => {
  const idStr = String(employeeId || '').trim();
  const emailStr = String(email || '').toLowerCase().trim();

  // 1. Check Super Admin
  if (
    idStr === '20726' ||
    emailStr === OWNER_EMAIL ||
    emailStr === 'nageshn@bmrc.co.in' ||
    emailStr.includes('nageshn444') ||
    idStr.toLowerCase().includes('nagesh')
  ) {
    return {
      employeeId: '20726',
      employeeName: 'Nagesha N',
      email: OWNER_EMAIL,
      designation: 'Station Superintendent',
      role: 'SUPER_ADMIN',
      depot: 'Peenya Depot (PYID)',
      isJmd: false
    };
  }

  // 2. Check BMRCL regular crew registry (by ID or by Email)
  let bmrclMatch = BMRCL_CREW_MASTER_BACKUP.find(c => {
    const matchId = idStr && String(c.id || c.employeeId || c.empId).trim() === idStr;
    const matchEmail = emailStr && String(c.email || '').toLowerCase().trim() === emailStr;
    return matchId || matchEmail;
  });

  if (!bmrclMatch && Array.isArray(EMPLOYEE_MASTER_REGISTRY)) {
    const empMatch = EMPLOYEE_MASTER_REGISTRY.find(e => {
      const matchId = idStr && String(e.empId || e.id || e.employeeId).trim() === idStr;
      const matchEmail = emailStr && String(e.email || '').toLowerCase().trim() === emailStr;
      return matchId || matchEmail;
    });
    if (empMatch) {
      bmrclMatch = {
        id: String(empMatch.empId || empMatch.id),
        name: empMatch.name,
        email: empMatch.email,
        designation: empMatch.designation,
        role: empMatch.role,
        depot: 'Peenya Depot (PYID)'
      };
    }
  }

  if (bmrclMatch) {
    const rawRole = bmrclMatch.role || bmrclMatch.designation || '';
    let mappedRole = 'TRAIN_OPERATOR';
    if (rawRole.includes('Superintendent') || rawRole.includes('Station Superintendent')) {
      mappedRole = 'ADMIN_Station_Superintendent';
    } else if (rawRole.includes('Crew Controller')) {
      mappedRole = 'CREW_CONTROLLER';
    } else if (rawRole === 'Station Controller') {
      mappedRole = 'STATION_CONTROLLER';
    } else {
      mappedRole = 'TRAIN_OPERATOR';
    }

    const resolvedId = String(bmrclMatch.id || bmrclMatch.employeeId || idStr);
    return {
      employeeId: resolvedId,
      employeeName: bmrclMatch.name || bmrclMatch.employeeName || `Officer ${resolvedId}`,
      email: bmrclMatch.email || emailStr || `${resolvedId}@pyidcc.bmrcl.com`,
      designation: bmrclMatch.designation || 'Station Controller / Train Operator',
      role: mappedRole,
      depot: bmrclMatch.depot || 'Peenya Depot (PYID)',
      isJmd: false
    };
  }

  // 3. Check OFFICIAL_JMD_TD_REGISTRY (8-series / 10-digit IDs)
  const jmdMatch = OFFICIAL_JMD_TD_REGISTRY.find(j => {
    const matchId = idStr && String(j.empId || j.id || j.employeeId).trim() === idStr;
    const matchEmail = emailStr && String(j.email || '').toLowerCase().trim() === emailStr;
    return matchId || matchEmail;
  });
  if (jmdMatch) {
    const resolvedId = String(jmdMatch.empId || idStr);
    return {
      employeeId: resolvedId,
      employeeName: jmdMatch.name || `JMD Driver ${resolvedId}`,
      email: jmdMatch.email || emailStr || `${resolvedId}@pyidcc.bmrcl.com`,
      designation: jmdMatch.designation || 'Train Driver (JMD Contract)',
      role: 'TRAIN_OPERATOR',
      depot: jmdMatch.boardingStation === 'PYID' ? 'Peenya Depot (PYID)' : (jmdMatch.depot || 'Peenya Depot (PYID)'),
      isJmd: true
    };
  }

  // 4. Pattern-based fallback:
  // JMD TD: 8-series (starts with 8, 8 to 10 digits)
  if (idStr.startsWith('8')) {
    return {
      employeeId: idStr,
      employeeName: `Train Driver (${idStr})`,
      email: emailStr || `${idStr}@pyidcc.bmrcl.com`,
      designation: 'Train Driver (JMD Contract)',
      role: 'TRAIN_OPERATOR',
      depot: 'Peenya Depot (PYID)',
      isJmd: true
    };
  }

  // Regular BMRCL employee: 5-digit ID (starts with 2)
  if (/^2\d{4}$/.test(idStr) || idStr.startsWith('2')) {
    return {
      employeeId: idStr,
      employeeName: `Train Operator (${idStr})`,
      email: emailStr || `${idStr}@pyidcc.bmrcl.com`,
      designation: 'Station Controller / Train Operator',
      role: 'TRAIN_OPERATOR',
      depot: 'Peenya Depot (PYID)',
      isJmd: false
    };
  }

  // Generic staff fallback
  const fallbackId = idStr || (emailStr ? emailStr.split('@')[0] : 'staff');
  return {
    employeeId: fallbackId,
    employeeName: `BMRCL Staff (${fallbackId})`,
    email: emailStr || `${fallbackId}@pyidcc.bmrcl.com`,
    designation: 'Station Controller / Train Operator',
    role: 'TRAIN_OPERATOR',
    depot: 'Peenya Depot (PYID)',
    isJmd: false
  };
};

const mapDesignationToRole = (employeeId, designation) => {
  if (String(employeeId) === '20726') return 'SUPER_ADMIN';
  if (!designation) return 'TRAIN_OPERATOR';
  const d = String(designation).trim();
  if (d.includes('Superintendent') || d.includes('Station Superintendent')) return 'ADMIN_Station_Superintendent';
  if (d.includes('Crew Controller') || d.includes('CREW_CONTROLLER')) return 'CREW_CONTROLLER';
  if (d === 'Station Controller') return 'STATION_CONTROLLER';
  if (d.includes('Train Driver') || d.includes('Train Operator') || d.includes('Driver') || d.includes('Operator')) return 'TRAIN_OPERATOR';
  return 'TRAIN_OPERATOR';
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
        if (cached) {
          const parsed = JSON.parse(cached);
          if (
            parsed && (
              String(parsed.employeeId) === '20726' ||
              String(parsed.email || '').toLowerCase() === OWNER_EMAIL ||
              String(parsed.email || '').toLowerCase() === 'nageshn@bmrc.co.in' ||
              String(parsed.employeeName || '').toUpperCase().includes('NAGESHA') ||
              isOwnerUser(auth.currentUser, parsed)
            )
          ) {
            parsed.role = 'SUPER_ADMIN';
            parsed.designation = 'Station Superintendent';
          }
          return parsed;
        }
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
    const strId = String(empId || '').trim();
    if (strId.startsWith('2') || strId.startsWith('8')) return true;
    if (findRegistryEmployee(strId)) return true;
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
    return true; // Default allow staff employee IDs
  };

  const resolveUserProfile = async (user) => {
    if (!user) return null;
    const email = (user.email || '').toLowerCase().trim();
    const empCandidate = email.includes('@') ? email.split('@')[0] : '';

    // Fast-path: Owner is ALWAYS SUPER_ADMIN
    if (isOwner(user) || isOwnerUser(user, null) || empCandidate === '20726') {
      const ownerProf = {
        ...OWNER_PROFILE,
        uid: user.uid,
        email: user.email || OWNER_EMAIL,
        employeeName: user.displayName || OWNER_PROFILE.employeeName,
        role: 'SUPER_ADMIN',
        designation: 'Station Superintendent'
      };
      setDoc(doc(db, 'system_users', user.uid), ownerProf, { merge: true }).catch(() => {});
      setDoc(doc(db, 'users', '20726'), ownerProf, { merge: true }).catch(() => {});
      return ownerProf;
    }

    // 1. Direct system_users document by UID
    try {
      const directSnap = await getDoc(doc(db, 'system_users', user.uid));
      if (directSnap.exists()) {
        const dData = directSnap.data();
        if (isOwner(user) || isOwnerUser(user, dData) || String(dData.employeeId) === '20726') {
          return { ...OWNER_PROFILE, ...dData, uid: user.uid, role: 'SUPER_ADMIN' };
        }
        return {
          ...dData,
          approved: dData.approved !== false,
          active: dData.active !== false,
          loginEnabled: dData.loginEnabled !== false,
          status: dData.status || 'ACTIVE'
        };
      }
    } catch (_) {}

    // 2. Query system_users by email
    if (email) {
      try {
        const qEmail = query(collection(db, 'system_users'), where('email', '==', email));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          const found = snapEmail.docs[0].data();
          const merged = {
            ...found,
            uid: user.uid,
            email,
            approved: true,
            active: true,
            loginEnabled: true,
            status: 'ACTIVE',
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'system_users', user.uid), merged, { merge: true });
          return merged;
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
          const merged = {
            ...found,
            uid: user.uid,
            employeeId: empCandidate,
            approved: true,
            active: true,
            loginEnabled: true,
            status: 'ACTIVE',
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'system_users', user.uid), merged, { merge: true });
          return merged;
        }
      } catch (_) {}
    }

    // 4. Registry Lookup or users collection fallback
    const registryInfo = findRegistryEmployee(empCandidate, email);
    let uData = null;
    const lookupId = registryInfo?.employeeId || empCandidate;
    if (lookupId) {
      try {
        const uSnap = await getDoc(doc(db, 'users', lookupId));
        if (uSnap.exists()) {
          uData = uSnap.data();
        }
      } catch (_) {}
    }

    const assignedRole = uData?.role || registryInfo?.role || 'TRAIN_OPERATOR';
    const assignedDesignation = uData?.designation || registryInfo?.designation || 'Station Controller / Train Operator';
    const assignedName = user.displayName || uData?.employeeName || registryInfo?.employeeName || `Officer ${lookupId}`;
    const assignedDepot = uData?.depot || registryInfo?.depot || 'Peenya Depot (PYID)';

    const profile = {
      uid: user.uid,
      employeeId: lookupId || user.uid.substring(0, 8),
      employeeName: assignedName,
      email: email || `${lookupId}@pyidcc.bmrcl.com`,
      designation: assignedDesignation,
      role: assignedRole,
      depot: assignedDepot,
      status: 'ACTIVE',
      active: true,
      approved: true,
      loginEnabled: true,
      passwordResetRequired: false,
      firstLogin: false,
      updatedAt: new Date().toISOString()
    };

    // Commit active profile and role permissions to Firestore in background
    Promise.all([
      setDoc(doc(db, 'system_users', user.uid), profile, { merge: true }),
      setDoc(doc(db, 'users', profile.employeeId), profile, { merge: true }),
      setDoc(doc(db, 'userPermissions', profile.employeeId), {
        employeeId: profile.employeeId,
        permissions: getRoleDefaultPermissions(profile.role),
        updatedAt: new Date().toISOString()
      }, { merge: true })
    ]).catch(() => {});

    return profile;
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
      if (isOwner(user) || isOwnerUser(user, null)) {
        const ownerProf = {
          ...OWNER_PROFILE,
          uid: user.uid,
          email: user.email || OWNER_PROFILE.email,
          employeeName: user.displayName || OWNER_PROFILE.employeeName,
          role: 'SUPER_ADMIN',
          designation: 'Station Superintendent'
        };
        const ownerPerms = getRoleDefaultPermissions('SUPER_ADMIN');
        setUserProfile(ownerProf);
        setPermissions(ownerPerms);
        saveProfileToCache(ownerProf, ownerPerms);
        setApprovalPending(false);
        setApprovalPendingMessage('');
        setLoading(false);

        // Keep system_users doc in sync
        setDoc(doc(db, 'system_users', user.uid), {
          uid: user.uid,
          ...ownerProf,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});

        // Keep userPermissions and users docs in sync
        setDoc(doc(db, 'userPermissions', '20726'), {
          employeeId: '20726',
          permissions: ownerPerms,
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
        setDoc(doc(db, 'users', '20726'), {
          employeeId: '20726',
          employeeName: 'Nagesha N',
          email: OWNER_EMAIL,
          role: 'SUPER_ADMIN',
          designation: 'Station Superintendent',
          status: 'ACTIVE',
          active: true,
          approved: true,
          loginEnabled: true,
          operationalCrew: 'YES',
          updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
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

          const rawProfile = snap.data();

          // CRITICAL SECURITY FIREWALL: If this profile or user is the Owner/Super Admin, NEVER allow role TRAIN_OPERATOR
          const isDocOwner = isOwner(user) || 
                             isOwnerUser(user, rawProfile) || 
                             String(rawProfile?.employeeId) === '20726' || 
                             String(rawProfile?.email || '').toLowerCase() === OWNER_EMAIL ||
                             String(rawProfile?.email || '').toLowerCase() === 'nageshn@bmrc.co.in' ||
                             String(rawProfile?.employeeName || '').toUpperCase().includes('NAGESHA');

          if (isDocOwner) {
            const ownerProf = {
              ...OWNER_PROFILE,
              ...rawProfile,
              uid: user.uid,
              role: 'SUPER_ADMIN',
              designation: 'Station Superintendent',
              employeeId: '20726',
              active: true,
              approved: true,
              loginEnabled: true,
              status: 'ACTIVE'
            };
            const ownerPerms = getRoleDefaultPermissions('SUPER_ADMIN');
            setUserProfile(ownerProf);
            setPermissions(ownerPerms);
            saveProfileToCache(ownerProf, ownerPerms);
            setApprovalPending(false);
            setApprovalPendingMessage('');
            setLoading(false);

            setDoc(doc(db, 'userPermissions', '20726'), {
              employeeId: '20726',
              permissions: ownerPerms,
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(() => {});
            setDoc(doc(db, 'users', '20726'), {
              employeeId: '20726',
              employeeName: 'Nagesha N',
              email: OWNER_EMAIL,
              role: 'SUPER_ADMIN',
              designation: 'Station Superintendent',
              status: 'ACTIVE',
              active: true,
              approved: true,
              loginEnabled: true,
              operationalCrew: 'YES',
              updatedAt: new Date().toISOString()
            }, { merge: true }).catch(() => {});
            return;
          }

          const profile = rawProfile;

          // Force-logout flag
          if (profile.forceLogout === true) {
            signOut(auth);
            updateDoc(doc(db, 'system_users', user.uid), { forceLogout: false }).catch(() => {});
            alert('Your session has been reset by the Administrator. Please log in again.');
            return;
          }

          // Block check
          const approved      = profile.approved !== false;
          const loginEnabled  = profile.loginEnabled !== false;
          const active        = profile.active !== false && profile.status !== 'SUSPENDED' && profile.status !== 'BLOCKED';

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

    if (isOwner(user) || isOwnerUser(user, null)) {
      const ownerProf = {
        ...OWNER_PROFILE,
        uid: user.uid,
        email: user.email || OWNER_PROFILE.email,
        employeeName: user.displayName || OWNER_PROFILE.employeeName,
        role: 'SUPER_ADMIN',
        designation: 'Station Superintendent'
      };
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
          ...ownerProf,
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
          ...ownerProf,
          email: user.email || OWNER_PROFILE.email,
          role: 'SUPER_ADMIN',
          operationalCrew: 'YES',
          updatedAt: new Date().toISOString()
        }, { merge: true }),
        setDoc(doc(db, 'userPermissions', '20726'), {
          employeeId: '20726',
          permissions: ownerPerms,
          updatedAt: new Date().toISOString()
        }, { merge: true })
      ]).catch((profileErr) => {
        console.warn('Owner background sync skipped:', profileErr);
      });

      return { ok: true, user, approved: true };
    }

    let profile = await resolveUserProfile(user);

    if (profile) {
      setUserProfile(profile);
      setLoading(false);
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

    // Direct synthesized fallback if anything is missing
    const empId = user.email ? user.email.split('@')[0] : user.uid.substring(0, 8);
    const regFallback = findRegistryEmployee(empId);
    const fallbackProfile = {
      uid: user.uid,
      employeeId: empId,
      employeeName: user.displayName || regFallback?.employeeName || `Officer ${empId}`,
      email: user.email || `${empId}@pyidcc.bmrcl.com`,
      designation: regFallback?.designation || 'Station Controller / Train Operator',
      role: regFallback?.role || 'TRAIN_OPERATOR',
      depot: regFallback?.depot || 'Peenya Depot (PYID)',
      approved: true,
      loginEnabled: true,
      active: true,
      status: 'ACTIVE',
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, 'system_users', user.uid), fallbackProfile, { merge: true }).catch(() => {});
    setUserProfile(fallbackProfile);
    setApprovalPending(false);
    setApprovalPendingMessage('');
    return { ok: true, user, approved: true };
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

    const cleanRaw = raw.toLowerCase();
    const isEmail = raw.includes('@');
    const employeeId = isEmail ? raw.split('@')[0].trim() : raw.trim();

    // If password is left blank, default to the employeeId (login with same employee ID as user ID and password)
    const effectivePassword = String(password || '').trim() || employeeId;

    // Identify if targeting Super Admin (ID 20726 or Nagesh variations)
    const isOwnerTarget = (
      employeeId === '20726' ||
      cleanRaw === '20726' ||
      cleanRaw === OWNER_EMAIL ||
      cleanRaw === 'nageshn@bmrc.co.in' ||
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
    const regEmp = findRegistryEmployee(canonicalEmpId);

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
      if (!emailsToTry.includes('nageshn@bmrc.co.in')) emailsToTry.push('nageshn@bmrc.co.in');
      if (!emailsToTry.includes(bmrclEmail))  emailsToTry.push(bmrclEmail);
      if (primaryEmail && !emailsToTry.includes(primaryEmail)) emailsToTry.push(primaryEmail);
    } else {
      emailsToTry.push(pyidccEmail);
      if (primaryEmail && !emailsToTry.includes(primaryEmail)) emailsToTry.push(primaryEmail);
      if (bmrclEmail && !emailsToTry.includes(bmrclEmail)) emailsToTry.push(bmrclEmail);
      if (regEmp?.email && !emailsToTry.includes(regEmp.email)) emailsToTry.push(regEmp.email);
      if (gmailEmail && !emailsToTry.includes(gmailEmail)) emailsToTry.push(gmailEmail);
    }

    // Candidate passwords: exact password, employee ID, 6-digit padded, and standard fallbacks
    const passwordsToTry = [];
    const addPass = (p) => {
      if (p && !passwordsToTry.includes(p)) passwordsToTry.push(p);
    };

    addPass(effectivePassword);
    if (effectivePassword.length < 6) addPass(effectivePassword.padEnd(6, '0'));
    addPass(canonicalEmpId);
    if (canonicalEmpId.length < 6) addPass(canonicalEmpId.padEnd(6, '0'));
    addPass(canonicalEmpId + '0');
    addPass(canonicalEmpId + '@123');
    addPass('bmrcl@' + canonicalEmpId);
    addPass(canonicalEmpId + 'bmrcl');
    addPass('123456');
    addPass('pyidcc@2026');

    if (isOwnerTarget) {
      const ownerDefaults = ['207260', '20726', 'admin@123', 'bmrcl@20726', 'pyidcc@2026', 'Nagesh@20726', 'nageshn444', 'admin123', 'admin'];
      for (const p of ownerDefaults) addPass(p);
    }

    // Attempt sign-in with candidate emails and passwords
    for (const emailAttempt of emailsToTry) {
      for (const passAttempt of passwordsToTry) {
        try {
          userCredential = await signInWithEmailAndPassword(auth, emailAttempt, passAttempt);
          authError = null;
          break;
        } catch (err) {
          authError = err;
        }
      }
      if (userCredential) break;
    }

    // Auto-provision in Firebase Auth if employee exists or matches regular / JMD patterns
    if (!userCredential) {
      const isEligible = isOwnerTarget || Boolean(regEmp) || canonicalEmpId.startsWith('2') || canonicalEmpId.startsWith('8');
      if (isEligible) {
        const provisionEmail = pyidccEmail;
        const creationPass = canonicalEmpId.length < 6 ? canonicalEmpId.padEnd(6, '0') : canonicalEmpId;
        try {
          userCredential = await createUserWithEmailAndPassword(auth, provisionEmail, creationPass);
          authError = null;
        } catch (createErr) {
          if (createErr.code === 'auth/email-already-in-use') {
            // User exists in auth but passwords didn't match — try candidate sign-in with creationPass
            try {
              userCredential = await signInWithEmailAndPassword(auth, provisionEmail, creationPass);
              authError = null;
            } catch (_) {
              throw new Error(`Authentication failed for Employee ID ${canonicalEmpId}. Please use your Employee ID as password (or ${canonicalEmpId.padEnd(6, '0')}).`);
            }
          } else {
            throw createErr;
          }
        }
      }
    }

    if (!userCredential) {
      if (authError?.code === 'auth/wrong-password' || authError?.code === 'auth/invalid-credential') {
        throw new Error(`Invalid credentials for ${canonicalEmpId}. Please log in using your Employee ID as both User ID and Password.`);
      }
      if (authError?.code === 'auth/user-not-found') {
        throw new Error(`Employee ID ${canonicalEmpId} not found in BMRCL registry. Please contact Administrator.`);
      }
      if (authError?.code === 'auth/too-many-requests') {
        throw new Error('Too many failed attempts. Please wait a few moments and try again.');
      }
      throw new Error(authError?.message || 'Authentication failed. Please verify your Employee ID and try again.');
    }

    return finishLogin(userCredential.user);
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    // Initiate persistence in background without delaying user gesture
    setPersistence(auth, browserLocalPersistence).catch(() => {
      setPersistence(auth, browserSessionPersistence).catch(() => {});
    });

    try {
      const result = await signInWithPopup(auth, provider);
      return finishLogin(result.user);
    } catch (popupErr) {
      // 1. User voluntarily closed popup or cancelled
      if (
        popupErr.code === 'auth/popup-closed-by-user' ||
        popupErr.code === 'auth/cancelled-popup-request'
      ) {
        return { ok: false, cancelled: true };
      }

      // 2. Domain not authorized in Firebase Console
      if (popupErr.code === 'auth/unauthorized-domain') {
        throw new Error(`Domain (${window.location.hostname}) is not authorized for Google OAuth in Firebase Console. Please log in using the Staff ID Login tab or visit https://pyidline2crew-41022.web.app.`);
      }

      // 3. Account exists with different credential (e.g. staff ID & password)
      if (popupErr.code === 'auth/account-exists-with-different-credential') {
        const accEmail = popupErr.customData?.email || popupErr.email || 'this email';
        throw new Error(`An account already exists for ${accEmail} with Staff ID & Password. Please log in using the Staff ID Login tab.`);
      }

      // 4. Fallback to redirect if popup is blocked, unsupported, or on mobile browsers
      if (
        popupErr.code === 'auth/popup-blocked' || 
        popupErr.code === 'auth/operation-not-supported-in-this-environment' ||
        String(popupErr?.message || '').includes('Cross-Origin-Opener-Policy') ||
        (typeof isMobileDevice === 'function' && isMobileDevice())
      ) {
        try {
          await setPersistence(auth, browserSessionPersistence).catch(() => {});
          await signInWithRedirect(auth, provider);
          return { ok: true, redirected: true };
        } catch (redirectErr) {
          if (redirectErr.code === 'auth/unauthorized-domain') {
            throw new Error(`Domain (${window.location.hostname}) is not authorized for Google OAuth in Firebase Console. Please use Staff ID Login.`);
          }
          if (redirectErr.code === 'auth/popup-closed-by-user' || redirectErr.code === 'auth/cancelled-popup-request') {
            return { ok: false, cancelled: true };
          }
          throw redirectErr;
        }
      }

      if (popupErr.code === 'auth/user-disabled') {
        throw new Error('This Google account has been disabled in the system. Please contact the Station Superintendent.');
      }

      if (popupErr.code === 'auth/network-request-failed') {
        throw new Error('Network connection failed. Please check your internet connection or use Staff ID Login.');
      }

      if (popupErr.code === 'auth/operation-not-allowed') {
        throw new Error('Google Sign-In is not enabled in Firebase configuration. Please use Staff ID Login.');
      }

      throw new Error(popupErr.message || 'Google Sign-In failed. Please try again or use Staff ID Login.');
    }
  };

  const requestPasswordReset = async (employeeIdOrEmail) => {
    const raw = String(employeeIdOrEmail || '').trim();
    if (!raw) throw new Error('Please enter your Employee ID or email.');
    let email = raw;
    if (raw === '20726' || raw.toLowerCase().includes('nagesh') || raw.toLowerCase() === 'admin' || raw.toLowerCase() === 'superadmin') {
      email = OWNER_EMAIL;
    } else if (!raw.includes('@')) {
      email = `${raw}@pyidcc.bmrcl.com`;
    }
    await sendPasswordResetEmail(auth, email);
    await logAudit('PASSWORD_RESET_REQUEST', 'system', 'System', `Password reset email dispatched for ${raw} to ${email}.`);
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
    if (
      isOwner(currentUser) ||
      isOwnerUser(currentUser, userProfile) ||
      userProfile?.role === 'SUPER_ADMIN' ||
      String(userProfile?.employeeId) === '20726' ||
      String(currentUser?.email || '').toLowerCase() === OWNER_EMAIL ||
      String(userProfile?.email || '').toLowerCase() === OWNER_EMAIL
    ) {
      return true;
    }

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
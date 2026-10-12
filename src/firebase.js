import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  memoryLocalCache, 
  setLogLevel, 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { getAuth } from "firebase/auth"; 

// Suppress internal non-fatal Firestore SDK multi-tab lease warnings
setLogLevel('silent');

// Filter non-fatal Firestore multi-tab lease arbitration errors from React DevTools / console
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    const combined = args
      .map(a => (typeof a === 'string' ? a : (a?.message || '')))
      .join(' ');
    if (
      combined.includes("Failed to obtain primary lease for action") ||
      combined.includes("Backfill Indexes")
    ) {
      // Harmless multi-tab lease contention from Firestore background sync
      return;
    }
    originalError.apply(console, args);
  };

  // Intercept fatal Firestore internal assertion failure (e.g. b7de / b815 / batchId)
  const isFatalFirestoreAssertion = (err) => {
    const str = String(err?.message || err?.stack || err || '');
    return (
      str.includes('INTERNAL ASSERTION FAILED') ||
      (str.includes('FIRESTORE') && (str.includes('b7de') || str.includes('b815') || str.includes('batchId')))
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isFatalFirestoreAssertion(event.reason)) {
      console.warn('[BMRCL Firestore Guard] Caught internal Firestore assertion error. Queuing local cache purge...', event.reason);
      sessionStorage.setItem('__PYIDCC_PURGE_FIRESTORE__', '1');
      try {
        if (window.indexedDB) {
          window.indexedDB.deleteDatabase('firestore/[DEFAULT]/pyidline2crew-41022/main');
        }
      } catch (_) {}
    }
  });

  window.addEventListener('error', (event) => {
    if (isFatalFirestoreAssertion(event.error)) {
      console.warn('[BMRCL Firestore Guard] Caught internal Firestore error:', event.error);
      sessionStorage.setItem('__PYIDCC_PURGE_FIRESTORE__', '1');
      try {
        if (window.indexedDB) {
          window.indexedDB.deleteDatabase('firestore/[DEFAULT]/pyidline2crew-41022/main');
        }
      } catch (_) {}
    }
  });
}

// Self-healing check: if the previous run marked cache as corrupted, delete IndexedDB immediately
if (typeof window !== 'undefined') {
  const needsPurge = 
    sessionStorage.getItem('__PYIDCC_PURGE_FIRESTORE__') === '1' ||
    localStorage.getItem('__PYIDCC_FORCE_FIRESTORE_RESET__') === '1';

  if (needsPurge) {
    sessionStorage.removeItem('__PYIDCC_PURGE_FIRESTORE__');
    localStorage.removeItem('__PYIDCC_FORCE_FIRESTORE_RESET__');
    try {
      if (window.indexedDB) {
        window.indexedDB.deleteDatabase('firestore/[DEFAULT]/pyidline2crew-41022/main');
      }
    } catch (_) {}
  }
}

export const purgeCorruptedFirestoreCache = async () => {
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    if (typeof window.indexedDB.databases === 'function') {
      const dbs = await window.indexedDB.databases();
      for (const d of dbs) {
        if (d.name && (d.name.includes('firestore') || d.name.includes('pyidline2crew'))) {
          try {
            window.indexedDB.deleteDatabase(d.name);
          } catch (_) {}
        }
      }
    }
    try {
      window.indexedDB.deleteDatabase('firestore/[DEFAULT]/pyidline2crew-41022/main');
    } catch (_) {}
  } catch (err) {
    console.warn('[purgeCorruptedFirestoreCache]', err);
  }
};

if (typeof window !== 'undefined') {
  window.purgeFirestoreCache = purgeCorruptedFirestoreCache;
}

export const firebaseConfig = {
  apiKey: "AIzaSyDucdRrkYezPjjzZ250pqZUovb3B8MO5lg",
  // Use the web.app hosting domain as authDomain so that signInWithRedirect
  // returns to the correct origin on mobile browsers (Safari, Chrome on iOS, etc.)
  // Using firebaseapp.com causes the redirect to land on a different origin and
  // lose the auth session on devices that block cross-origin cookies.
  authDomain: "pyidline2crew-41022.web.app",
  projectId: "pyidline2crew-41022",
  storageBucket: "pyidline2crew-41022.firebasestorage.app",
  messagingSenderId: "783173298649",
  appId: "1:783173298649:web:f3283c39f648a6481c51c8",
  measurementId: "G-MZ63RZPQD2"
};

export const app = initializeApp(firebaseConfig);

// Detect Safari / iOS — these browsers severely restrict IndexedDB in many
// contexts (private mode, cross-origin iframes, some iOS WebViews) which causes
// the Firestore persistent cache to fail silently and block all Firestore reads.
const isSafariBrowser = typeof window !== 'undefined' && (
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent) ||
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && 'ontouchend' in document)
);

let firestoreDb;
try {
  if (isSafariBrowser) {
    // Safari: use memory cache to avoid IndexedDB permission errors
    firestoreDb = initializeFirestore(app, {
      localCache: memoryLocalCache()
    });
  } else {
    // Desktop Chrome / Firefox / Edge: use persistent multi-tab cache
    firestoreDb = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    });
  }
} catch (e) {
  // Already initialized (e.g. Vite HMR) — reuse existing instance
  try {
    firestoreDb = getFirestore(app);
  } catch (_) {
    // Last resort: memory-only cache (no persistence, always works)
    try {
      firestoreDb = initializeFirestore(app, {
        localCache: memoryLocalCache()
      });
    } catch (__) {
      firestoreDb = getFirestore(app);
    }
  }
}

export const db = firestoreDb;
export const auth = getAuth(app);

// Single declaration of the relief engine
export const calculateReliefScore = (operator, currentTime) => {
   const dutyDuration = (currentTime - operator.signOnTime) / (1000 * 60 * 60);
   if (dutyDuration >= 8) return { score: 0, eligible: false };
   let score = 30 + ((8 - dutyDuration) * 3.125) + 10;
   return { score: Math.round(score), eligible: true };
};
// --- AUTOMATED DISPATCH GATE ENGINE ---
export const runRecommendationEngine = async (incident, db) => {
  const [attSnap, depSnap] = await Promise.all([
    getDocs(collection(db, 'crew_live_attendance')),
    getDocs(collection(db, 'crew_daily_deployment'))
  ]);

  const now = new Date().getTime();
  const candidates = attSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(op => op.status === 'SIGNED_ON' && !op.assignedTrain)
    .map(op => {
      const duration = (now - new Date(op.signOnTime).getTime()) / (1000 * 60 * 60);
      return { ...op, duration, isEligible: duration < 8 };
    })
    .filter(op => op.isEligible)
    .map(op => ({
      ...op,
      score: Math.round((30) + ((8 - op.duration) * 3.125) + 10)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  await setDoc(doc(db, "automated_dispatch_gate", incident.id), {
    incidentId: incident.id,
    trainId: incident.trainId,
    recommendations: candidates.map(c => ({ 
        empId: c.empId, 
        empName: c.empName, 
        score: c.score 
    })),
    status: 'RECOMMENDED',
    timestamp: serverTimestamp()
  });
};

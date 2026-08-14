import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, setLogLevel, collection, getDocs, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth"; 

// Suppress internal non-fatal multi-tab lease warnings (e.g. Backfill Indexes / Apply remote event)
setLogLevel('error');

export const firebaseConfig = {
  apiKey: "AIzaSyDucdRrkYezPjjzZ250pqZUovb3B8MO5lg",
  authDomain: "pyidline2crew-41022.firebaseapp.com",
  projectId: "pyidline2crew-41022",
  storageBucket: "pyidline2crew-41022.firebasestorage.app",
  messagingSenderId: "783173298649",
  appId: "1:783173298649:web:f3283c39f648a6481c51c8",
  measurementId: "G-MZ63RZPQD2"
};

export const app = initializeApp(firebaseConfig);

let firestoreDb;
try {
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch (e) {
  // Fallback to memory local cache if multi-tab IndexedDB persistence is contended or already initialized
  firestoreDb = initializeFirestore(app, {
    localCache: memoryLocalCache()
  });
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

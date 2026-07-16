import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDucdRrkYezPjjzZ250pqZUovb3B8MO5lg",
  authDomain: "pyidline2crew-41022.firebaseapp.com",
  projectId: "pyidline2crew-41022",
  storageBucket: "pyidline2crew-41022.firebasestorage.app",
  messagingSenderId: "783173298649",
  appId: "1:783173298649:web:f3283c39f648a6481c51c8",
  measurementId: "G-MZ63RZPQD2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function run() {
  console.log("=== Querying crew_daily_deployment ===");
  const snapshot = await getDocs(collection(db, "crew_daily_deployment"));
  const docs = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (['01', '02', '1', '2', '03', '04', '3', '4'].includes(String(data.dutyId))) {
      docs.push({ id: doc.id, ...data });
    }
  });
  console.log("Found matches in crew_daily_deployment:");
  console.log(JSON.stringify(docs, null, 2));

  console.log("=== Querying shift_exchanges ===");
  const exSnap = await getDocs(collection(db, "shift_exchanges"));
  const exDocs = [];
  exSnap.forEach(doc => {
    exDocs.push({ id: doc.id, ...doc.data() });
  });
  console.log("Found matches in shift_exchanges:");
  console.log(JSON.stringify(exDocs, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

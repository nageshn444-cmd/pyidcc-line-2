import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({
  projectId: "pyidline2crew-41022"
});
const db = getFirestore();

async function findPyidTerminals() {
  const wttSnap = await db.collection("wtt_final_matrix").get();
  const wttRuns = wttSnap.docs.map(doc => doc.data());
  
  const dnStations = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
  const upStations = ["APTS", "PUTH", "RVR", "NLC", "KGWA", "RJNR", "YPM", "PYID", "NGSA", "BIET"];

  console.log(`Checking ${wttRuns.length} WTT runs...`);
  
  let matches = 0;
  wttRuns.forEach(run => {
    const isDn = run.terminalLoopRoute && run.terminalLoopRoute.includes('DN');
    const stations = isDn ? dnStations : upStations;
    
    let endSt = null;
    let endTime = null;
    for (let i = stations.length - 1; i >= 0; i--) {
      if (run.stations[stations[i]] && run.stations[stations[i]] !== '--') {
        endSt = stations[i];
        endTime = run.stations[stations[i]];
        break;
      }
    }
    
    if (endSt === 'PYID') {
      matches++;
      console.log(`Match ${matches}: Train ${run.trainId} (${run.scheduleType}), Route: ${run.terminalLoopRoute}, EndTime: ${endTime}`);
    }
  });
}

findPyidTerminals().catch(console.error);

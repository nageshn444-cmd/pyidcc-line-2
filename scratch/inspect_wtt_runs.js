import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({
  projectId: "pyidline2crew-41022"
});
const db = getFirestore();

async function inspectWttAndDuty() {
  // Get Duty 11 WEEKDAY
  const dutyDoc = await db.collection("crew_final_links").doc("link_weekday_duty_11").get();
  console.log("Firestore Duty 11 WEEKDAY:");
  console.log(JSON.stringify(dutyDoc.data(), null, 2));

  // Get WTT runs for WEEKDAY
  const wttSnap = await db.collection("wtt_final_matrix")
    .where("scheduleType", "==", "WEEKDAY")
    .get();
  
  const wttRuns = wttSnap.docs.map(doc => doc.data());
  console.log(`\nTotal WEEKDAY WTT runs: ${wttRuns.length}`);

  // Find any run of train 202 or 207
  const runs202 = wttRuns.filter(r => String(r.trainId) === '202');
  console.log(`\nRuns of train 202: ${runs202.length}`);
  runs202.forEach(r => {
    console.log(`Train 202 Route: ${r.terminalLoopRoute}, Stations:`, r.stations);
  });

  const runs207 = wttRuns.filter(r => String(r.trainId) === '207');
  console.log(`\nRuns of train 207: ${runs207.length}`);
  runs207.forEach(r => {
    console.log(`Train 207 Route: ${r.terminalLoopRoute}, Stations:`, r.stations);
  });
}

inspectWttAndDuty().catch(console.error);

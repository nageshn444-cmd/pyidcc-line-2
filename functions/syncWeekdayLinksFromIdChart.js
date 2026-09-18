import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { WEEKDAY_DUTY_LEGS_FROM_ID_CHART } from "../src/data/weekdayReliefIdChartRegistry.js";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({
  projectId: "pyidline2crew-41022"
});
const db = getFirestore();

async function syncWeekdayLinks() {
  console.log("Starting synchronization of crew_final_links using official 03/Sep/2026 ID Chart...");

  const dutyIds = Object.keys(WEEKDAY_DUTY_LEGS_FROM_ID_CHART).sort((a, b) => Number(a) - Number(b));
  console.log(`Found ${dutyIds.length} duties to sync in ID Chart.`);

  const batch = db.batch();
  let count = 0;

  for (const dutyId of dutyIds) {
    const legs = WEEKDAY_DUTY_LEGS_FROM_ID_CHART[dutyId] || [];
    const docId = `link_weekday_duty_${dutyId}`;
    const docRef = db.collection("crew_final_links").doc(docId);

    const leg1 = legs[0] || {};
    const leg2 = legs[1] || {};
    const leg3 = legs[2] || {};
    const leg4 = legs[3] || {};

    const updateData = {
      scheduleType: "WEEKDAY",
      dutyId: String(dutyId),
      trainId: leg1.trainId || "--",
      leg1TrainNo: leg1.trainId || "--",
      leg1TimeFrom: leg1.from ? `${leg1.from}:00` : "--",
      leg1TimeTo: leg1.to ? `${leg1.to}:00` : "--",
      leg2TrainNo: leg2.trainId || "--",
      leg2DepTime: leg2.from ? `${leg2.from}:00` : "--",
      leg2ArrTime: leg2.to ? `${leg2.to}:00` : "--",
      leg3TrainNo: leg3.trainId || "--",
      leg3DepTime: leg3.from ? `${leg3.from}:00` : "--",
      leg3ArrTime: leg3.to ? `${leg3.to}:00` : "--",
      leg4TrainNo: leg4.trainId || "--",
      leg4FinalDepTime: leg4.from ? `${leg4.from}:00` : "--",
      leg4FinalArrTime: leg4.to ? `${leg4.to}:00` : "--",
      rawLegs: {
        l1Train: leg1.trainId || "--",
        l1Start: leg1.from ? `${leg1.from}:00` : "--",
        l1End: leg1.to ? `${leg1.to}:00` : "--",
        l2Train: leg2.trainId || "--",
        l2Start: leg2.from ? `${leg2.from}:00` : "--",
        l2End: leg2.to ? `${leg2.to}:00` : "--",
        l3Train: leg3.trainId || "--",
        l3Start: leg3.from ? `${leg3.from}:00` : "--",
        l3End: leg3.to ? `${leg3.to}:00` : "--",
        l4Train: leg4.trainId || "--",
        l4Start: leg4.from ? `${leg4.from}:00` : "--",
        l4End: leg4.to ? `${leg4.to}:00` : "--"
      },
      idChartSyncDate: "2026-09-03 (BIET-APTS)",
      lastSyncedAt: new Date().toISOString()
    };

    batch.set(docRef, updateData, { merge: true });
    count++;
  }

  await batch.commit();
  console.log(`Successfully synced ${count} crew_final_links documents in Firestore!`);
  process.exit(0);
}

syncWeekdayLinks().catch(err => {
  console.error("Sync error:", err);
  process.exit(1);
});

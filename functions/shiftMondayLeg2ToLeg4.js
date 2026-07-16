import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({
  projectId: "pyidline2crew-41022"
});
const db = getFirestore();

function toSec(tStr) {
  if (!tStr || tStr === '--' || tStr === '-' || tStr === '') return -1;
  const parts = tStr.split(':').map(Number);
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
}

function toTimeStr(sec) {
  if (sec < 0) return '--';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
}

function getLegDuration(depTime, arrTime) {
  const dSec = toSec(depTime);
  const aSec = toSec(arrTime);
  if (dSec < 0 || aSec < 0) return 0;
  let diff = aSec - dSec;
  if (diff < 0) {
    diff += 24 * 3600;
  }
  return diff;
}

async function run() {
  const dutyIds = ["64", "65", "66", "67", "68", "69", "70", "71", "72", "73", "74", "75", "76", "77"];
  
  console.log(`Starting shift for Monday duties 64 to 77...`);

  for (const id of dutyIds) {
    const docId = `link_monday_duty_${id}`;
    const docRef = db.collection("crew_final_links").doc(docId);
    
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      console.warn(`Doc ${docId} not found, skipping.`);
      continue;
    }
    
    const data = docSnap.data();
    
    // Read Leg 2 data
    const leg2DepLoc = data.leg2DepLoc || "--";
    const leg2TrainNo = data.leg2TrainNo || "--";
    const leg2DepTime = data.leg2DepTime || "--";
    const leg2ArrTime = data.leg2ArrTime || "--";
    const leg2TimeTo = data.leg2TimeTo || "--";
    const leg2ArrLoc = data.leg2ArrLoc || "--";
    
    // Target Leg 4 data
    let leg4FinalDepLoc = data.leg4FinalDepLoc || "--";
    let leg4TrainNo = data.leg4TrainNo || "--";
    let leg4FinalDepTime = data.leg4FinalDepTime || "--";
    let leg4FinalArrTime = data.leg4FinalArrTime || "--";
    let leg4TimeTo = data.leg4TimeTo || "--";
    let leg4FinalArrLoc = data.leg4FinalArrLoc || "--";
    
    // Shift Leg 2 to Leg 4 if Leg 2 contains data
    if (leg2TrainNo !== "--") {
      leg4FinalDepLoc = leg2DepLoc;
      leg4TrainNo = leg2TrainNo;
      leg4FinalDepTime = leg2DepTime;
      leg4FinalArrTime = leg2ArrTime;
      leg4TimeTo = leg2TimeTo;
      leg4FinalArrLoc = leg2ArrLoc;
    }
    
    // Clear Leg 2 fields
    const updates = {
      leg2DepLoc: "--",
      leg2TrainNo: "--",
      leg2DepTime: "--",
      leg2ArrTime: "--",
      leg2TimeTo: "--",
      leg2ArrLoc: "--",
      
      leg4FinalDepLoc,
      leg4TrainNo,
      leg4FinalDepTime,
      leg4FinalArrTime,
      leg4TimeTo,
      leg4FinalArrLoc,
      
      lastModified: new Date()
    };
    
    const merged = { ...data, ...updates };
    
    // Recalculate total driving time
    let totalDrivingSec = 0;
    totalDrivingSec += getLegDuration(merged.leg1TimeFrom, merged.leg1TimeTo);
    totalDrivingSec += getLegDuration(merged.leg2DepTime, merged.leg2ArrTime);
    totalDrivingSec += getLegDuration(merged.leg3DepTime, merged.leg3ArrTime);
    totalDrivingSec += getLegDuration(merged.leg4FinalDepTime, merged.leg4FinalArrTime);
    
    updates.remarks = totalDrivingSec > 0 ? toTimeStr(totalDrivingSec) : '--';
    
    // Recalculate total work hours
    const onSec = toSec(merged.signOnTime);
    const offSec = toSec(merged.signOffTime);
    let totalWorkSec = 0;
    if (onSec >= 0 && offSec >= 0) {
      totalWorkSec = offSec - onSec;
      if (totalWorkSec < 0) {
        totalWorkSec += 24 * 3600;
      }
    }
    updates.totalHours = totalWorkSec > 0 ? toTimeStr(totalWorkSec) : '--';
    
    await docRef.update(updates);
    console.log(`Successfully shifted and updated ${docId}. Driving Hours: ${updates.remarks}, Work Hours: ${updates.totalHours}`);
  }
  
  console.log(`Shifting completed successfully!`);
}

run().catch(console.error);

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({
  projectId: "pyidline2crew-41022"
});
const db = getFirestore();

async function checkLeg4() {
  const snap = await db.collection("crew_final_links").get();
  console.log(`Total duties in crew_final_links: ${snap.size}`);
  
  const dutiesWithLeg4 = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (data.leg4TrainNo && data.leg4TrainNo !== "--") {
      dutiesWithLeg4.push({
        id: doc.id,
        dutyId: data.dutyId,
        scheduleType: data.scheduleType,
        remarks: data.remarks,
        leg1: `${data.leg1TimeFrom} -> ${data.leg1TimeTo} (T: ${data.trainId})`,
        leg2: `${data.leg2DepTime} -> ${data.leg2ArrTime} (T: ${data.leg2TrainNo})`,
        leg3: `${data.leg3DepTime} -> ${data.leg3ArrTime} (T: ${data.leg3TrainNo})`,
        leg4: `${data.leg4FinalDepTime} -> ${data.leg4FinalArrTime} (T: ${data.leg4TrainNo})`
      });
    }
  });
  
  console.log(`Found ${dutiesWithLeg4.length} duties with Leg 4:`);
  dutiesWithLeg4.forEach(d => {
    console.log(JSON.stringify(d, null, 2));
  });
}

checkLeg4().catch(console.error);

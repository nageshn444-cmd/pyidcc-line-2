import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({
  projectId: "pyidline2crew-41022"
});
const db = getFirestore();

const docs = [
  "link_weekday_duty_03",
  "link_sunday_duty_03"
];

for (const id of docs) {
  const snap = await db.collection("crew_final_links").doc(id).get();
  console.log(`=== Document ${id} ===`);
  if (snap.exists) {
    console.log(JSON.stringify(snap.data(), null, 2));
  } else {
    console.log("Not found");
  }
}

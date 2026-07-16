import admin from "firebase-admin";
import fs from "fs";
import path from "path";

// Use Application Default Credentials from gcloud config path
process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "pyidline2crew-41022"
  });
}
const db = admin.firestore();

function cleanRow(line) {
  if (!line || !line.includes("|")) return [];
  const parts = line.split("|");
  return parts.slice(1, parts.length - 1).map((cell) => cell.trim());
}

async function executeCrewPipeline() {
  console.log("Beginning authenticated Dual-Table Crew Link injection framework...");
  const sourceFolder = "C:\\Users\\nages\\OneDrive\\Desktop\\all day roster and Time table\\Only links";

  const rosters = [
    {file: "Weekday link csv.csv", type: "WEEKDAY"},
    {file: "monday link roster csv", type: "MONDAY"},
    {file: "sat & GH link roster csv.csv", type: "SATURDAY"},
    {file: "sunday link roster csv.csv", type: "SUNDAY"},
  ];

  console.log("Writing directly to new target collection to bypass read/delete quotas...");

  for (const cfg of rosters) {
    const absolutePath = path.join(sourceFolder, cfg.file);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`? File missing at target path: [${absolutePath}], skipping...`);
      continue;
    }

    console.log(`Processing roster document grid stream: [${cfg.file}]`);
    const content = fs.readFileSync(absolutePath, "utf8");
    const lines = content.split(/\r?\n/);

    let batch = db.batch();
    let entriesAdded = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim() || !line.includes("|")) continue;

      const row = cleanRow(line);
      if (row.length < 15 || row[0].includes("---") || row[0].toLowerCase().includes("duty")) continue;

      let dutyId = row[0];
      if (!dutyId || isNaN(parseInt(dutyId))) continue;
      
      const num = parseInt(dutyId, 10);
      if (num >= 1 && num <= 9) {
        dutyId = '0' + num;
      }

      const docId = `link_${cfg.type.toLowerCase()}_duty_${dutyId}`;
      const docRef = db.collection("crew_final_links").doc(docId);

      // Handle column shifting for night shift rows (where Kms is omitted and columns shift left)
      const hasColonInCol24 = row[24] && row[24].includes(":");
      const totalHours = hasColonInCol24 ? (row[24] || "08:00") : (row[25] || "08:00");
      const remarks = hasColonInCol24 ? (row[26] || "--") : (row[27] || row[row.length - 1] || "Line 2 Special Run");

      batch.set(docRef, {
        scheduleType: cfg.type,
        dutyId: String(dutyId),

        // Leg 1 Base Mapping
        signOnTime: row[1] || "--",
        signOnLocation: row[2] || "PYID",
        trainId: row[3] || "--",
        leg1TimeFrom: row[4] || "--",
        leg1TimeTo: row[5] || "--",
        leg1TripTime: row[6] || "--",
        leg1HandoverLoc: row[7] || "--",

        // Leg 2 Base Mapping
        leg2DepLoc: row[9] || "--",
        leg2TrainNo: row[10] || "--",
        leg2DepTime: row[11] || "--",
        leg2ArrTime: row[12] || "--",
        leg2TimeTo: row[13] || "--",
        leg2ArrLoc: row[14] || "--",

        // Leg 3 Base Mapping
        leg3DepLoc: row[16] || "--",
        leg3TrainNo: row[17] || "--",
        leg3DepTime: row[18] || "--",
        leg3ArrTime: row[19] || "--",
        leg3TimeTo: row[20] || "--",
        leg3ArrLoc: row[21] || "--",

        // Leg 4 Base Mapping (Empty fallback for 3-leg rosters)
        leg4FinalArrLoc: "--",
        leg4FinalArrTime: "--",
        leg4FinalDepLoc: "--",
        leg4FinalDepTime: "--",
        leg4TrainNo: "--",
        leg4TimeTo: "--",

        // Global Structural Closures
        signOffTime: row[22] || "--",
        signOffLocation: row[23] || "PYID",
        totalHours: totalHours,
        remarks: remarks,
        lastModified: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      entriesAdded++;
      if (entriesAdded % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    if (entriesAdded % 400 !== 0) await batch.commit();
    console.log(` ? Complete Sync Complete: Parsed and loaded ${entriesAdded} total duties for ${cfg.type}`);
  }
  console.log("All multi-table operational rosters injected successfully into clean collection path!");
}

executeCrewPipeline().catch(console.error);

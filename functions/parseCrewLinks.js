import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const credentialPath = "C:\\Users\\nages\\pyidcc\\config\\serviceAccount.json";
const keyData = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(keyData), projectId: keyData.project_id });
}
const db = admin.firestore();

function cleanRow(line) {
  if (!line || !line.includes('|')) return [];
  const parts = line.split('|');
  return parts.slice(1, parts.length - 1).map(cell => cell.trim());
}

async function executeCrewPipeline() {
  console.log("Beginning authenticated Dual-Table Crew Link injection framework...");
  const sourceFolder = "C:\\Users\\nages\\OneDrive\\Desktop\\all day roster and Time table\\Only links";
  
  const rosters = [
    { file: 'Weekday link csv.csv', type: 'WEEKDAY' },
    { file: 'monday link roster csv', type: 'MONDAY' },
    { file: 'sat & GH link roster csv.csv', type: 'SATURDAY' },
    { file: 'sunday link roster csv.csv', type: 'SUNDAY' }
  ];

  console.log("Writing directly to new target collection to bypass read/delete quotas...");

  for (const cfg of rosters) {
    const absolutePath = path.join(sourceFolder, cfg.file);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`? File missing at target path: [${absolutePath}], skipping...`);
      continue;
    }

    console.log(`Processing roster document grid stream: [${cfg.file}]`);
    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);
    
    let batch = db.batch();
    let entriesAdded = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim() || !line.includes('|')) continue;

      const row = cleanRow(line);
      if (row.length < 15 || row[0].includes('---') || row[0].toLowerCase().includes('duty')) continue;

      const dutyId = row[0];
      if (!dutyId || isNaN(parseInt(dutyId))) continue; 

      const docId = `link_${cfg.type.toLowerCase()}_duty_${dutyId}`;
      
      // CRITICAL UPGRADE: Pointing directly to the new quota-free destination path
      const docRef = db.collection('crew_final_links').doc(docId);

      batch.set(docRef, {
        scheduleType: cfg.type,
        dutyId: String(dutyId),
        
        // Leg 1 Base Mapping [cite: 10, 11]
        signOnTime: row[1] || "--",
        signOnLocation: row[2] || "PYID",
        trainId: row[3] || "--",
        leg1TimeFrom: row[4] || "--",

        // Leg 2 Base Mapping [cite: 14]
        leg2ArrLoc: row[7] || "--",
        leg2ArrTime: row[5] || "--",
        leg2DepLoc: row[9] || "--",
        leg2DepTime: row[11] || "--",
        leg2TrainNo: row[10] || "--",
        leg2TimeTo: row[6] || "--",

        // Leg 3 Base Mapping [cite: 15]
        leg3HandoverLoc: row[14] || "--",
        leg3HandoverTime: row[12] || "--",
        leg3TakeoverLoc: row[13] || "--", 
        leg3TakeoverTime: row[15] || "--",
        leg3TrainNo: row[11] || "--",
        leg3TimeFrom: row[12] || "--",

        // Leg 4 Base Mapping [cite: 15]
        leg4FinalArrLoc: row[21] || "--",
        leg4FinalArrTime: row[19] || "--",
        leg4FinalDepLoc: "--",
        leg4FinalDepTime: "--",
        leg4TrainNo: "--",
        leg4TimeTo: row[20] || "--",

        // Global Structural Closures [cite: 11]
        signOffTime: row[row.length - 7] || row[row.length - 6] || "--",
        signOffLocation: row[row.length - 6] || "PYID",
        totalHours: row[row.length - 4] || "08:00",
        remarks: row[row.length - 1] || "Line 2 Special Run",
        lastModified: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

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

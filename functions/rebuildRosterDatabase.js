import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({
  projectId: "pyidline2crew-41022"
});
const db = getFirestore();

function parseTime(val) {
  if (val === undefined || val === null) return "--";
  if (typeof val === 'number') {
    if (val >= 0 && val <= 1) {
      const totalSeconds = Math.round(val * 24 * 3600);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
    }
    return String(val);
  }
  const str = String(val).trim();
  if (str === "" || str === "-" || str === "--") return "--";
  return str;
}

function parseTrainId(val) {
  if (val === undefined || val === null) return "--";
  if (typeof val === 'number') {
    return String(Math.round(val));
  }
  const str = String(val).trim();
  if (str === "" || str === "-" || str === "--") return "--";
  return str;
}

function parseText(val) {
  if (val === undefined || val === null) return "--";
  const str = String(val).trim();
  if (str === "" || str === "-" || str === "--") return "--";
  return str;
}

function checkNightShift(row) {
  if (!row || row.length === 0) return false;
  const lastVal = String(row[row.length - 1] || row[29] || row[31] || '').trim();
  if (lastVal.toUpperCase().startsWith('N') && lastVal.length > 1 && !isNaN(parseInt(lastVal.charAt(1)))) {
    return true;
  }
  const signOn = row[1];
  if (typeof signOn === 'number' && signOn >= 0.8) {
    return true;
  }
  return false;
}

async function rebuildDatabase() {
  console.log("Starting database rebuild of crew_final_links using correct Excel parsing mapping...");
  
  const rosters = [
    { file: "Weekday link.xlsx", type: "WEEKDAY" },
    { file: "monday link roster.xlsx", type: "MONDAY" },
    { file: "sat & GH link roster.xlsx", type: "SATURDAY" },
    { file: "sunday link roster.xlsx", type: "SUNDAY" }
  ];

  for (const cfg of rosters) {
    const filePath = path.join(__dirname, '..', cfg.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Excel file missing: ${filePath}, skipping...`);
      continue;
    }

    console.log(`Processing file: ${cfg.file} for scheduleType ${cfg.type}...`);
    const fileBuffer = fs.readFileSync(filePath);
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    let batch = db.batch();
    let entriesAdded = 0;

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row[0]) continue;

      const dutyIdRaw = row[0];
      if (isNaN(parseInt(dutyIdRaw))) continue;

      let dutyId = String(dutyIdRaw).trim();
      const num = parseInt(dutyId, 10);
      if (num >= 1 && num <= 9) {
        dutyId = '0' + num;
      }

      const docId = `link_${cfg.type.toLowerCase()}_duty_${dutyId}`;
      const docRef = db.collection("crew_final_links").doc(docId);

      const isNight = checkNightShift(row);
      const isShiftedNight = isNight && row.length > 35;
      const isCompactNight = isNight && row.length <= 35;

      let payload = {};

      if (isShiftedNight) {
        payload = {
          scheduleType: cfg.type,
          dutyId: String(dutyId),
          signOnTime: parseTime(row[1]),
          signOnLocation: parseText(row[2]),
          trainId: parseTrainId(row[3]),

          // Leg 1
          leg1TimeFrom: parseTime(row[4]),
          leg1TimeTo: parseTime(row[5]),
          leg1TripTime: parseTime(row[6]),
          leg1HandoverLoc: parseText(row[7]),

          // Leg 2
          leg2DepLoc: parseText(row[36]),
          leg2TrainNo: parseTrainId(row[37]),
          leg2DepTime: parseTime(row[38]),
          leg2ArrTime: parseTime(row[39]),
          leg2TimeTo: parseTime(row[40]),
          leg2ArrLoc: parseText(row[41]),

          // Leg 3 (not in shifted night - 2-leg duty)
          leg3DepLoc: "--", leg3TrainNo: "--", leg3DepTime: "--", leg3ArrTime: "--", leg3TimeTo: "--", leg3ArrLoc: "--",
          // Leg 4: omitted so merge:true preserves any manually entered data


          signOffTime: parseTime(row[42]),
          signOffLocation: parseText(row[43]),
          remarks: parseText(row[31]) || "Night Shift",
          lastModified: new Date()
        };
      } else if (isCompactNight) {
        payload = {
          scheduleType: cfg.type,
          dutyId: String(dutyId),
          signOnTime: parseTime(row[1]),
          signOnLocation: parseText(row[2]),
          trainId: parseTrainId(row[3]),

          // Leg 1
          leg1TimeFrom: parseTime(row[4]),
          leg1TimeTo: parseTime(row[5]),
          leg1TripTime: parseTime(row[6]),
          leg1HandoverLoc: parseText(row[7]),

          // Leg 2
          leg2DepLoc: parseText(row[18]),
          leg2TrainNo: parseTrainId(row[19]),
          leg2DepTime: parseTime(row[20]),
          leg2ArrTime: parseTime(row[21]),
          leg2TimeTo: parseTime(row[22]),
          leg2ArrLoc: parseText(row[23]),

          // Leg 3 (not in compact night - 2-leg duty)
          leg3DepLoc: "--", leg3TrainNo: "--", leg3DepTime: "--", leg3ArrTime: "--", leg3TimeTo: "--", leg3ArrLoc: "--",
          // Leg 4: omitted so merge:true preserves any manually entered data


          signOffTime: parseTime(row[24]),
          signOffLocation: parseText(row[25]),
          remarks: parseText(row[31]) || "Compact Night Shift",
          lastModified: new Date()
        };
      } else {
        payload = {
          scheduleType: cfg.type,
          dutyId: String(dutyId),
          signOnTime: parseTime(row[1]),
          signOnLocation: parseText(row[2]),
          trainId: parseTrainId(row[3]),

          // Leg 1
          leg1TimeFrom: parseTime(row[4]),
          leg1TimeTo: parseTime(row[5]),
          leg1TripTime: parseTime(row[6]),
          leg1HandoverLoc: parseText(row[7]),

          // Leg 2
          leg2DepLoc: parseText(row[10]),
          leg2TrainNo: parseTrainId(row[11]),
          leg2DepTime: parseTime(row[12]),
          leg2ArrTime: parseTime(row[13]),
          leg2TimeTo: parseTime(row[14]),
          leg2ArrLoc: parseText(row[15]),

          // Leg 3
          leg3DepLoc: parseText(row[18]),
          leg3TrainNo: parseTrainId(row[19]),
          leg3DepTime: parseTime(row[20]),
          leg3ArrTime: parseTime(row[21]),
          leg3TimeTo: parseTime(row[22]),
          leg3ArrLoc: parseText(row[23]),

          // Leg 4: NOT in Excel - preserved from manual Firestore entry (omitted here so merge:true keeps existing data)

          signOffTime: parseTime(row[24]),
          signOffLocation: parseText(row[25]),
          remarks: parseText(row[29]) || "--",
          lastModified: new Date()
        };
      }

      batch.set(docRef, payload, { merge: true });
      entriesAdded++;

      if (entriesAdded % 400 === 0) {
        await batch.commit();
        batch = db.batch();
      }
    }

    if (entriesAdded % 400 !== 0) {
      await batch.commit();
    }
    console.log(`Successfully parsed and synchronized ${entriesAdded} duties for ${cfg.type}`);
  }
  
  console.log("Database rebuild process completed successfully!");
}

rebuildDatabase().catch(console.error);

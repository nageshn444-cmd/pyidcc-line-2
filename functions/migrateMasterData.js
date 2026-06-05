import admin from 'firebase-admin';
import xlsx from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Verify service authentication context
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "pyid-crew-control"
  });
}
const db = admin.firestore();

/**
 * Normalizes and converts raw Excel timestamps to uniform HH:MM:SS format
 */
function parseExcelTime(timeValue) {
  if (!timeValue) return "00:00:00";
  if (typeof timeValue === 'number') {
    const totalSeconds = Math.round(timeValue * 24 * 3600);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(v => String(v).padStart(2, '0')).join(':');
  }
  return String(timeValue).trim();
}

async function seedMasterOperationalSchedules() {
  console.log("Beginning automated data processing sequence...");
  
  const wttFiles = [
    { name: 'weekday WTT.xlsx', type: 'WEEKDAY' },
    { name: 'monday WTT.xlsx', type: 'MONDAY' },
    { name: 'sat & GH WTT.xlsx', type: 'SAT_GH' },
    { name: 'Sun WTT.xlsx', type: 'SUNDAY' }
  ];

  for (const fileOpt of wttFiles) {
    const filePath = path.join(__dirname, '..', fileOpt.name);
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      
      let writeCount = 0;
      const batch = db.batch();

      // Skip structural headers, isolate train records (TID range 201-223)
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length < 4) continue;

        // Column index 2 typically references the numeric Train ID block
        const trainId = parseInt(row[2]);
        if (trainId >= 201 && trainId <= 223) {
          const tripIndex = i; // Retain sequence integrity index safely
          const docId = `wtt_${fileOpt.type.toLowerCase()}_${trainId}_${tripIndex}`;
          const docRef = db.collection('working_time_table').doc(docId);

          const origin = String(row[3] || '').trim();
          const destination = String(row[11] || '').trim();
          const isShortLoop = origin.includes('NGSA') || destination.includes('PUTH');

          batch.set(docRef, {
            scheduleType: fileOpt.type,
            trainId: trainId,
            tripIndex: tripIndex,
            tripPattern: isShortLoop ? "SHORT_LOOP" : "FULL_LINE",
            terminalLoopRoute: isShortLoop ? "NGSA-PUTH" : "BIET-APTS",
            originStation: origin || "N/A",
            destinationStation: destination || "N/A",
            modeOfOperation: "ATO"
          });
          writeCount++;
        }
      }

      if (writeCount > 0) {
        await batch.commit();
        console.log("Successfully migrated  relational trip links from sheet: " + fileOpt.name);
      }
    } catch (err) {
      console.warn("Skipping structural seed node for " + fileOpt.name + ": Data document not present in working folder path root.");
    }
  }
  console.log("Database baseline migration process finished.");
}

seedMasterOperationalSchedules().catch(console.error);

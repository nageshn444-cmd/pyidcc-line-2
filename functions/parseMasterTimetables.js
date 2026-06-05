import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

const credentialPath = "C:\\Users\\nages\\pyidcc\\config\\serviceAccount.json";
const keyData = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(keyData),
    projectId: keyData.project_id
  });
}
const db = admin.firestore();

function cleanMarkdownRow(line) {
  if (!line || !line.includes('|')) return [];
  const parts = line.split('|');
  return parts.slice(1, parts.length - 1).map(cell => cell.trim());
}

async function executeAdaptiveIngestion() {
  console.log("Connecting to Firebase Cluster: " + keyData.project_id);
  
  // Pointing precisely to your OneDrive timetable storage directory
  const sourceFolder = "C:\\Users\\nages\\OneDrive\\Desktop\\all day roster and Time table\\only WTT";
  
  const filesConfig = [
    { file: "weekday csv WTT.csv", type: "WEEKDAY" },
    { file: "Monday csv WTT.csv", type: "MONDAY" },
    { file: "saturday & GH csv WTT.csv", type: "SATURDAY" },
    { file: "Sun CSV WTT.csv", type: "SUNDAY" }
  ];
  
  const dnStations = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
  const upStations = ["APTS", "PUTH", "RVR", "NLC", "KGWA", "RJNR", "YPM", "PYID", "NGSA", "BIET"];

  console.log("Injecting fresh datasets into clean target collection nodes...");

  for (const cfg of filesConfig) {
    const absolutePath = path.join(sourceFolder, cfg.file);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`? File missing at local path boundary: [${absolutePath}], skipping...`);
      continue;
    }
    
    console.log(`Scanning matrix layout for file: [${cfg.file}]`);
    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);
    
    let headerRowIndex = -1;
    for (let j = 0; j < lines.length; j++) {
      const lowerLine = lines[j].toLowerCase();
      if (lines[j].includes('|') && (lowerLine.includes('biet') || lowerLine.includes("tid's") || lowerLine.includes('down line'))) {
        headerRowIndex = j;
        break;
      }
    }

    if (headerRowIndex === -1) continue;

    let dataStartLine = headerRowIndex + 1;
    if (lines[dataStartLine] && lines[dataStartLine].includes('---')) {
      dataStartLine += 1;
    }

    let batch = db.batch();
    let count = 0;
    
    for (let i = dataStartLine; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim() || !line.includes('|')) continue;
      
      const row = cleanMarkdownRow(line);
      if (row.length < 20) continue;
      
      // A. EXTRACT DOWN LINE SEGMENTS
      const dnTid = row[2] ? row[2].trim() : '';
      if (dnTid && dnTid !== '-' && dnTid !== '' && !dnTid.toLowerCase().startsWith('tid') && !dnTid.toLowerCase().includes('mode')) {
        const stationsMap = {};
        dnStations.forEach((st, sIdx) => {
          let val = row[3 + sIdx] ? row[3 + sIdx].trim() : '--';
          stationsMap[st] = (val === '' || val === '-') ? '--' : val;
        });
        
        const cleanTid = dnTid.replace(/[*#]/g, '');
        const docId = `clean_wtt_${cfg.type.toLowerCase()}_dn_t${cleanTid.replace(/\s+/g, '_')}_row_${i}`;
        const docRef = db.collection('wtt_final_matrix').doc(docId);
        
        batch.set(docRef, {
          scheduleType: cfg.type,
          trainId: cleanTid,
          terminalLoopRoute: `BIET - APTS (DN)`,
          stations: stationsMap,
          lastModified: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        count++;
      }
      
      // B. EXTRACT UP LINE SEGMENTS
      const upTidIndex = 14; 
      const upTid = row[upTidIndex] ? row[upTidIndex].trim() : '';
      
      if (upTid && upTid !== '-' && upTid !== '' && !upTid.toLowerCase().startsWith('tid') && !upTid.toLowerCase().includes('mode')) {
        const stationsMap = {};
        upStations.forEach((st, sIdx) => {
          let val = row[upTidIndex + 1 + sIdx] ? row[upTidIndex + 1 + sIdx].trim() : '--';
          stationsMap[st] = (val === '' || val === '-') ? '--' : val;
        });
        
        const cleanTid = upTid.replace(/[*#]/g, '');
        const docId = `clean_wtt_${cfg.type.toLowerCase()}_up_t${cleanTid.replace(/\s+/g, '_')}_row_${i}`;
        const docRef = db.collection('wtt_final_matrix').doc(docId);
        
        batch.set(docRef, {
          scheduleType: cfg.type,
          trainId: cleanTid,
          terminalLoopRoute: `APTS - BIET (UP)`,
          stations: stationsMap,
          lastModified: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        count++;
      }

      if (count % 400 === 0 && count > 0) {
        await batch.commit();
        batch = db.batch();
      }
    }
    
    if (count % 400 !== 0) {
      await batch.commit();
    }
    console.log(` ? Dynamic Verification Match: Found ${count} operational runs inside [${cfg.file}]`);
  }
  console.log("Master Dynamic Adaptive Ingestion Complete!");
}

executeAdaptiveIngestion().catch(console.error);

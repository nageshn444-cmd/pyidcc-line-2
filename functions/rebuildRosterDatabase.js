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

function cleanSt(name) {
  if (!name || name === '--') return '';
  const base = name.split(/[\s/]+/)[0].trim().toUpperCase();
  if (base.startsWith('DEPO') || base.startsWith('DPO') || base.startsWith('PEENYA')) return 'PYID';
  if (base.startsWith('YELACHENAHALLI') || base === 'YEL') return 'PUTH';
  if (base === 'SILK' || base === 'SILKINSTITUTE') return 'APTS';
  return base;
}

function cleanStName(code) {
  switch (code) {
    case 'PUTH': return 'PUTH';
    case 'NGSA': return 'NGSA';
    case 'TGTP': return 'TGTP';
    case 'KGWA': return 'KGWA';
    case 'RVR': return 'RVR';
    case 'PYID': return 'PYID';
    case 'BIET': return 'BIET';
    case 'APTS': return 'APTS';
    case 'YPM': return 'YPM';
    case 'RJNR': return 'RJNR';
    case 'NLC': return 'NLC';
    default: return code;
  }
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

const dnStations = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
const upStations = ["APTS", "PUTH", "RVR", "NLC", "KGWA", "RJNR", "YPM", "PYID", "NGSA", "BIET"];

function findWttLeg4(wttRuns, trainId, lastArrTime, lastArrLoc, signOffTime) {
  const truns = wttRuns.filter(r => String(r.trainId) === String(trainId));
  if (truns.length === 0) return null;
  
  truns.sort((a, b) => {
    const getMinTime = (stations) => {
      const times = Object.values(stations).filter(t => t && t !== '--').map(t => toSec(t));
      return times.length > 0 ? Math.min(...times) : 999999;
    };
    return getMinTime(a.stations) - getMinTime(b.stations);
  });

  const lastArrSec = toSec(lastArrTime);
  const signOffSec = toSec(signOffTime);

  for (let idx = 0; idx < truns.length; idx++) {
    const run = truns[idx];
    const isDn = run.terminalLoopRoute.includes('DN');
    const stations = isDn ? dnStations : upStations;

    let startSt = null;
    let startTime = null;
    for (let i = 0; i < stations.length; i++) {
      if (run.stations[stations[i]] !== '--') {
        startSt = stations[i];
        startTime = run.stations[stations[i]];
        break;
      }
    }

    let endSt = null;
    let endTime = null;
    for (let i = stations.length - 1; i >= 0; i--) {
      if (run.stations[stations[i]] !== '--') {
        endSt = stations[i];
        endTime = run.stations[stations[i]];
        break;
      }
    }

    if (endSt === 'PYID') {
      const endTimeSec = toSec(endTime);
      const diff = Math.abs(endTimeSec - (signOffSec > 0 ? signOffSec : lastArrSec));
      
      if (diff <= 4500) {
        if (startSt && startSt !== 'PYID') {
          const startSec = toSec(startTime);
          const endSec = toSec(endTime);
          const duration = endSec - startSec;
          if (duration > 0) {
            return {
              leg4TrainNo: String(trainId),
              leg4FinalDepLoc: cleanStName(startSt),
              leg4FinalDepTime: startTime,
              leg4FinalArrLoc: 'PYID',
              leg4FinalArrTime: endTime,
              leg4TimeTo: toTimeStr(duration)
            };
          }
        }
      }
    }
  }
  return null;
}

async function rebuildDatabase() {
  console.log("Starting database rebuild of crew_final_links using correct Excel parsing mapping and total driving hours calculation...");
  
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

    const wttSnapshot = await db.collection("wtt_final_matrix")
      .where("scheduleType", "==", cfg.type)
      .get();
    const wttRuns = wttSnapshot.docs.map(doc => doc.data());
    console.log(`Loaded ${wttRuns.length} WTT runs for ${cfg.type}`);

    const linksSnapshot = await db.collection("crew_final_links")
      .where("scheduleType", "==", cfg.type)
      .get();
    const existingLinks = {};
    linksSnapshot.forEach(doc => {
      existingLinks[doc.id] = doc.data();
    });
    console.log(`Loaded ${Object.keys(existingLinks).length} existing links for ${cfg.type}`);

    let batch = db.batch();
    let entriesAdded = 0;

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row[0]) continue;

      let dutyId = String(row[0]).trim();
      if (dutyId.includes('---') || dutyId.toLowerCase().includes('duty')) continue;
      
      const num = parseInt(dutyId, 10);
      if (isNaN(num)) continue;
      if (num >= 1 && num <= 9) {
        dutyId = '0' + num;
      } else {
        dutyId = String(num);
      }

      const docId = `link_${cfg.type.toLowerCase()}_duty_${dutyId}`;
      const docRef = db.collection("crew_final_links").doc(docId);

      const isNight = checkNightShift(row);
      const isShiftedNight = isNight && row.length > 35;
      const isCompactNight = isNight && row.length <= 35;

      const existingDoc = existingLinks[docId];
      let leg4FinalDepLoc = "--";
      let leg4TrainNo = "--";
      let leg4FinalDepTime = "--";
      let leg4FinalArrTime = "--";
      let leg4TimeTo = "--";
      let leg4FinalArrLoc = "--";

      if (existingDoc && existingDoc.leg4TrainNo && existingDoc.leg4TrainNo !== "--") {
        leg4FinalDepLoc = existingDoc.leg4FinalDepLoc || "--";
        leg4TrainNo = existingDoc.leg4TrainNo || "--";
        leg4FinalDepTime = existingDoc.leg4FinalDepTime || "--";
        leg4FinalArrTime = existingDoc.leg4FinalArrTime || "--";
        leg4TimeTo = existingDoc.leg4TimeTo || "--";
        leg4FinalArrLoc = existingDoc.leg4FinalArrLoc || "--";
      }

      let tempSignOffTime = "--";
      if (isShiftedNight) {
        tempSignOffTime = parseTime(row[row.length - 2]);
      } else if (isCompactNight) {
        tempSignOffTime = parseTime(row[24]);
      } else {
        tempSignOffTime = parseTime(row[24]);
      }

      if (leg4TrainNo === "--") {
        let lastTrainId = "--";
        let lastArrTime = "--";
        let lastArrLoc = "--";

        let tempLeg3TrainNo = "--";
        let tempLeg3DepTime = "--";
        let tempLeg3ArrTime = "--";
        let tempLeg3ArrLoc = "--";
        let tempLeg2TrainNo = "--";
        let tempLeg2DepTime = "--";
        let tempLeg2ArrTime = "--";
        let tempLeg2ArrLoc = "--";

        if (isShiftedNight) {
          tempLeg2TrainNo = parseTrainId(row[row.length - 7]);
          tempLeg2DepTime = parseTime(row[row.length - 6]);
          tempLeg2ArrTime = parseTime(row[row.length - 5]);
          tempLeg2ArrLoc = parseText(row[row.length - 3]);
        } else if (isCompactNight) {
          tempLeg2TrainNo = parseTrainId(row[19]);
          tempLeg2DepTime = parseTime(row[20]);
          tempLeg2ArrTime = parseTime(row[21]);
          tempLeg2ArrLoc = parseText(row[23]);
        } else {
          tempLeg2TrainNo = parseTrainId(row[11]);
          tempLeg2DepTime = parseTime(row[12]);
          tempLeg2ArrTime = parseTime(row[13]);
          tempLeg2ArrLoc = parseText(row[15]);

          tempLeg3TrainNo = parseTrainId(row[19]);
          tempLeg3DepTime = parseTime(row[20]);
          tempLeg3ArrTime = parseTime(row[21]);
          tempLeg3ArrLoc = parseText(row[23]);
        }

        if (tempLeg3TrainNo !== "--") {
          lastTrainId = tempLeg3TrainNo;
          lastArrTime = tempLeg3ArrTime;
          lastArrLoc = tempLeg3ArrLoc;
        } else if (tempLeg2TrainNo !== "--") {
          lastTrainId = tempLeg2TrainNo;
          lastArrTime = tempLeg2ArrTime;
          lastArrLoc = tempLeg2ArrLoc;
        } else {
          lastTrainId = parseTrainId(row[3]);
          lastArrTime = parseTime(row[5]);
          lastArrLoc = parseText(row[7]);
        }

        if (lastTrainId !== "--" && lastTrainId !== "Pilot" && lastTrainId !== "Couns" && lastTrainId !== "PDC") {
          const leg4Result = findWttLeg4(wttRuns, lastTrainId, lastArrTime, lastArrLoc, tempSignOffTime);
          if (leg4Result) {
            leg4FinalDepLoc = leg4Result.leg4FinalDepLoc;
            leg4TrainNo = leg4Result.leg4TrainNo;
            leg4FinalDepTime = leg4Result.leg4FinalDepTime;
            leg4FinalArrTime = leg4Result.leg4FinalArrTime;
            leg4TimeTo = leg4Result.leg4TimeTo;
            leg4FinalArrLoc = leg4Result.leg4FinalArrLoc;
          }
        }
      }

      let payload = {};

      if (isShiftedNight) {
        payload = {
          scheduleType: cfg.type,
          dutyId: String(dutyId),
          signOnTime: parseTime(row[1]),
          signOnLocation: parseText(row[2]),
          trainId: parseTrainId(row[3]),
          leg1TimeFrom: parseTime(row[4]),
          leg1TimeTo: parseTime(row[5]),
          leg1TripTime: parseTime(row[6]),
          leg1HandoverLoc: parseText(row[7]),
          leg2DepLoc: parseText(row[row.length - 8]),
          leg2TrainNo: parseTrainId(row[row.length - 7]),
          leg2DepTime: parseTime(row[row.length - 6]),
          leg2ArrTime: parseTime(row[row.length - 5]),
          leg2TimeTo: parseTime(row[row.length - 4]),
          leg2ArrLoc: parseText(row[row.length - 3]),
          leg3DepLoc: "--", leg3TrainNo: "--", leg3DepTime: "--", leg3ArrTime: "--", leg3TimeTo: "--", leg3ArrLoc: "--",
          leg4FinalDepLoc, leg4TrainNo, leg4FinalDepTime, leg4FinalArrTime, leg4TimeTo, leg4FinalArrLoc,
          signOffTime: tempSignOffTime,
          signOffLocation: parseText(row[row.length - 1]),
          remarks: "--",
          lastModified: new Date()
        };
      } else if (isCompactNight) {
        payload = {
          scheduleType: cfg.type,
          dutyId: String(dutyId),
          signOnTime: parseTime(row[1]),
          signOnLocation: parseText(row[2]),
          trainId: parseTrainId(row[3]),
          leg1TimeFrom: parseTime(row[4]),
          leg1TimeTo: parseTime(row[5]),
          leg1TripTime: parseTime(row[6]),
          leg1HandoverLoc: parseText(row[7]),
          leg2DepLoc: parseText(row[18]),
          leg2TrainNo: parseTrainId(row[19]),
          leg2DepTime: parseTime(row[20]),
          leg2ArrTime: parseTime(row[21]),
          leg2TimeTo: parseTime(row[22]),
          leg2ArrLoc: parseText(row[23]),
          leg3DepLoc: "--", leg3TrainNo: "--", leg3DepTime: "--", leg3ArrTime: "--", leg3TimeTo: "--", leg3ArrLoc: "--",
          leg4FinalDepLoc, leg4TrainNo, leg4FinalDepTime, leg4FinalArrTime, leg4TimeTo, leg4FinalArrLoc,
          signOffTime: tempSignOffTime,
          signOffLocation: parseText(row[25]),
          remarks: "--",
          lastModified: new Date()
        };
      } else {
        payload = {
          scheduleType: cfg.type,
          dutyId: String(dutyId),
          signOnTime: parseTime(row[1]),
          signOnLocation: parseText(row[2]),
          trainId: parseTrainId(row[3]),
          leg1TimeFrom: parseTime(row[4]),
          leg1TimeTo: parseTime(row[5]),
          leg1TripTime: parseTime(row[6]),
          leg1HandoverLoc: parseText(row[7]),
          leg2DepLoc: parseText(row[10]),
          leg2TrainNo: parseTrainId(row[11]),
          leg2DepTime: parseTime(row[12]),
          leg2ArrTime: parseTime(row[13]),
          leg2TimeTo: parseTime(row[14]),
          leg2ArrLoc: parseText(row[15]),
          leg3DepLoc: parseText(row[18]),
          leg3TrainNo: parseTrainId(row[19]),
          leg3DepTime: parseTime(row[20]),
          leg3ArrTime: parseTime(row[21]),
          leg3TimeTo: parseTime(row[22]),
          leg3ArrLoc: parseText(row[23]),
          leg4FinalDepLoc, leg4TrainNo, leg4FinalDepTime, leg4FinalArrTime, leg4TimeTo, leg4FinalArrLoc,
          signOffTime: tempSignOffTime,
          signOffLocation: parseText(row[25]),
          remarks: "--",
          lastModified: new Date()
        };
      }

      let totalDrivingSec = 0;
      totalDrivingSec += getLegDuration(payload.leg1TimeFrom, payload.leg1TimeTo);
      totalDrivingSec += getLegDuration(payload.leg2DepTime, payload.leg2ArrTime);
      totalDrivingSec += getLegDuration(payload.leg3DepTime, payload.leg3ArrTime);
      totalDrivingSec += getLegDuration(payload.leg4FinalDepTime, payload.leg4FinalArrTime);

      payload.remarks = totalDrivingSec > 0 ? toTimeStr(totalDrivingSec) : '--';

      const onSec = toSec(payload.signOnTime);
      const offSec = toSec(payload.signOffTime);
      let totalWorkSec = 0;
      if (onSec >= 0 && offSec >= 0) {
        totalWorkSec = offSec - onSec;
        if (totalWorkSec < 0) {
          totalWorkSec += 24 * 3600;
        }
      }
      payload.totalHours = totalWorkSec > 0 ? toTimeStr(totalWorkSec) : '--';

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

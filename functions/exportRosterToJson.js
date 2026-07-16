// exportRosterToJson.js
// Reads all corrected Excel roster files and saves parsed data to local JSON files.
// No Firestore connection needed. Safe to run at any time.

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Parser helpers (same as rebuildRosterDatabase.js) ──
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
  if (typeof val === 'number') return String(Math.round(val));
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
  if (lastVal.toUpperCase().startsWith('N') && lastVal.length > 1 && !isNaN(parseInt(lastVal.charAt(1)))) return true;
  const signOn = row[1];
  if (typeof signOn === 'number' && signOn >= 0.8) return true;
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

function getLegDuration(depTime, arrTime) {
  const dSec = toSec(depTime);
  const aSec = toSec(arrTime);
  if (dSec < 0 || aSec < 0) return 0;
  let diff = aSec - dSec;
  if (diff < 0) diff += 24 * 3600;
  return diff;
}

// ── Main export ──
function exportRosters() {
  const rosters = [
    { file: "Weekday link.xlsx",        type: "WEEKDAY" },
    { file: "monday link roster.xlsx",  type: "MONDAY" },
    { file: "sat & GH link roster.xlsx", type: "SATURDAY" },
    { file: "sunday link roster.xlsx",  type: "SUNDAY" }
  ];

  const outDir = path.join(__dirname, '..', 'roster_json_backup');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const cfg of rosters) {
    const filePath = path.join(__dirname, '..', cfg.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`Missing Excel file: ${cfg.file}, skipping.`);
      continue;
    }

    console.log(`Parsing ${cfg.file}...`);
    const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

    const records = {};

    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || !row[0]) continue;

      let dutyId = String(row[0]).trim();
      if (dutyId.includes('---') || dutyId.toLowerCase().includes('duty')) continue;

      const num = parseInt(dutyId, 10);
      if (isNaN(num)) continue;
      dutyId = (num >= 1 && num <= 9) ? '0' + num : String(num);

      const docId = `link_${cfg.type.toLowerCase()}_duty_${dutyId}`;
      const isNight = checkNightShift(row);
      const isShiftedNight = isNight && row.length > 35;
      const isCompactNight = isNight && row.length <= 35;

      let payload = {
        scheduleType: cfg.type,
        dutyId: String(dutyId),
        signOnTime: parseTime(row[1]),
        signOnLocation: parseText(row[2]),
        trainId: parseTrainId(row[3]),
        leg4FinalDepLoc: "--", leg4TrainNo: "--",
        leg4FinalDepTime: "--", leg4FinalArrTime: "--",
        leg4TimeTo: "--", leg4FinalArrLoc: "--",
      };

      if (isShiftedNight) {
        Object.assign(payload, {
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
          leg3DepLoc: "--", leg3TrainNo: "--", leg3DepTime: "--",
          leg3ArrTime: "--", leg3TimeTo: "--", leg3ArrLoc: "--",
          signOffTime: parseTime(row[row.length - 2]),
          signOffLocation: parseText(row[row.length - 1]),
        });
      } else if (isCompactNight) {
        Object.assign(payload, {
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
          leg3DepLoc: "--", leg3TrainNo: "--", leg3DepTime: "--",
          leg3ArrTime: "--", leg3TimeTo: "--", leg3ArrLoc: "--",
          signOffTime: parseTime(row[24]),
          signOffLocation: parseText(row[25]),
        });
      } else {
        Object.assign(payload, {
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
          signOffTime: parseTime(row[24]),
          signOffLocation: parseText(row[25]),
        });
      }

      // Calculate driving & work hours
      let drivingSec = 0;
      drivingSec += getLegDuration(payload.leg1TimeFrom, payload.leg1TimeTo);
      drivingSec += getLegDuration(payload.leg2DepTime,  payload.leg2ArrTime);
      drivingSec += getLegDuration(payload.leg3DepTime,  payload.leg3ArrTime);
      drivingSec += getLegDuration(payload.leg4FinalDepTime, payload.leg4FinalArrTime);
      payload.remarks = drivingSec > 0 ? toTimeStr(drivingSec) : '--';

      const onSec = toSec(payload.signOnTime);
      const offSec = toSec(payload.signOffTime);
      let workSec = offSec - onSec;
      if (workSec < 0) workSec += 24 * 3600;
      payload.totalHours = (onSec >= 0 && offSec >= 0 && workSec > 0) ? toTimeStr(workSec) : '--';

      payload.lastModified = new Date().toISOString();
      records[docId] = payload;
    }

    const outPath = path.join(outDir, `${cfg.type.toLowerCase()}_roster.json`);
    fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf8');
    console.log(`✅ Saved ${Object.keys(records).length} duties → ${outPath}`);
  }

  console.log(`\n✅ All roster JSON backups saved to: ${outDir}`);
}

exportRosters();

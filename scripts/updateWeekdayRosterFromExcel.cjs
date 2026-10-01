const fs = require('fs');
const xlsx = require('xlsx');

const excelPath = 'C:\\Users\\nages\\OneDrive\\Desktop\\all day roster and Time table\\Only links\\weekday old link.xlsx';
console.log('Reading Excel from:', excelPath);

const wb = xlsx.readFile(excelPath);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false });

function formatTime(val) {
  if (!val) return '--';
  const str = String(val).trim();
  if (str === '--' || str === '') return '--';
  const parts = str.split(':');
  if (parts.length === 2) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    return hh + ':' + mm + ':00';
  }
  if (parts.length === 3) {
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const ss = parts[2].padStart(2, '0');
    return hh + ':' + mm + ':' + ss;
  }
  return str;
}

function timeToShort(val) {
  if (!val || val === '--') return '--';
  const str = String(val).trim();
  const parts = str.split(':');
  if (parts.length >= 2) {
    return parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
  }
  return str;
}

function timeToFrac(tStr) {
  if (!tStr || tStr === '--') return 0;
  const parts = tStr.split(':').map(Number);
  if (parts.length >= 2) {
    const mins = parts[0] * 60 + parts[1] + (parts[2] ? parts[2] / 60 : 0);
    return mins / 1440;
  }
  return 0;
}

const weekdayMasterLinks = [];
let currentDuty = null;

for (let r = 2; r < 98; r++) {
  const row = data[r];
  if (!row || row.length === 0) continue;
  const dNo = row[0];
  if (dNo && !isNaN(parseInt(dNo))) {
    const dutyNumber = parseInt(dNo, 10);
    const sOnTime = row[1];
    const sOnLoc = String(row[2] || 'PYID').trim();
    
    const isProOrStby = [1, 2, 42, 43, 78, 79].includes(dutyNumber);
    const isNight = dutyNumber >= 64 && dutyNumber <= 79;
    
    let leg1Train = row[3] ? String(row[3]).trim() : '--';
    let leg1From = row[4];
    let leg1To = row[5];
    let leg1Trip = row[6];
    let leg1Handover = row[7] ? String(row[7]).trim() : '--';
    let leg1Break = row[8] ? String(row[8]).trim() : '--';
    
    let leg2Takeover = row[10] ? String(row[10]).trim() : '--';
    let leg2Train = row[11] ? String(row[11]).trim() : '--';
    let leg2From = row[12];
    let leg2To = row[13];
    let leg2Trip = row[14];
    let leg2Handover = row[15] ? String(row[15]).trim() : '--';
    let leg2Break = row[16] ? String(row[16]).trim() : '--';
    
    let leg3Takeover = row[18] ? String(row[18]).trim() : '--';
    let leg3Train = row[19] ? String(row[19]).trim() : '--';
    let leg3From = row[20];
    let leg3To = row[21];
    let leg3Trip = row[22];
    let leg3Handover = row[23] ? String(row[23]).trim() : '--';
    
    let sOffTime = row[24];
    let sOffLoc = row[25] ? String(row[25]).trim() : (isNight && (dutyNumber === 65 || dutyNumber === 72 || dutyNumber === 74 || dutyNumber === 75 || dutyNumber === 76) ? 'KGWA' : (dutyNumber === 48 || dutyNumber === 51 ? 'PUTH' : (dutyNumber === 47 || dutyNumber === 49 || dutyNumber === 50 || dutyNumber === 52 || dutyNumber === 60 || dutyNumber === 63 ? 'KGWA' : (dutyNumber === 7 || dutyNumber === 33 || dutyNumber === 34 || dutyNumber === 36 || dutyNumber === 40 || dutyNumber === 53 || dutyNumber === 57 || dutyNumber === 58 || dutyNumber === 62 || dutyNumber === 70 ? 'Depot' : 'PYID'))));
    let kms = row[26] ? parseInt(row[26], 10) : 0;
    let dutyHrs = row[27] || '--';
    let drivingHrs = row[28] || '00:00';
    let breakTime = row[29] || '--';
    let counselling = row[30] ? String(row[30]).trim() : '--';
    let dutyType = row[31] ? String(row[31]).trim() : '';

    if (dutyNumber >= 64 && dutyNumber <= 77) {
      const nightKms = row[10] ? parseInt(row[10], 10) : 0;
      const mornKms = row[14] ? parseInt(row[14], 10) : 0;
      const pilotComment = row[16] ? String(row[16]).trim() : (row[11] ? String(row[11]).trim() : '--');
      
      currentDuty = {
        dutyNo: String(dutyNumber),
        dutyId: String(dutyNumber).padStart(2, '0'),
        id: 'link_weekday_duty_' + String(dutyNumber).padStart(2, '0'),
        docId: 'link_weekday_duty_' + String(dutyNumber).padStart(2, '0'),
        scheduleType: 'WEEKDAY',
        signOnTime: formatTime(sOnTime),
        signOnLocation: sOnLoc,
        trainId: leg1Train,
        leg1TimeFrom: formatTime(leg1From),
        leg1TimeTo: formatTime(leg1To),
        leg1TripTime: formatTime(leg1Trip),
        leg1HandoverLoc: leg1Handover,
        leg1Km: nightKms || '--',
        leg2DepLoc: leg3Takeover,
        leg2TrainNo: leg3Train,
        leg2DepTime: formatTime(leg3From),
        leg2ArrTime: formatTime(leg3To),
        leg2TimeTo: formatTime(leg3Trip),
        leg2ArrLoc: leg3Handover,
        leg2Km: mornKms || '--',
        leg3DepLoc: '--',
        leg3TrainNo: '--',
        leg3DepTime: '--',
        leg3ArrTime: '--',
        leg3TimeTo: '--',
        leg3ArrLoc: '--',
        leg3Km: '--',
        leg4FinalDepLoc: '--',
        leg4TrainNo: '--',
        leg4FinalDepTime: '--',
        leg4FinalArrTime: '--',
        leg4TimeTo: '--',
        leg4FinalArrLoc: '--',
        leg4Km: '--',
        signOffTime: formatTime(sOffTime),
        signOffLocation: sOffLoc,
        totalHours: formatTime(dutyHrs),
        remarks: dutyType || ('N' + dutyNumber),
        dutyProfile: dutyType || ('N' + dutyNumber),
        totalKm: kms,
        kms: kms,
        drivingHrs: formatTime(drivingHrs),
        breakTime: formatTime(breakTime),
        counselling: pilotComment !== '--' ? pilotComment : '--',
        trips: [
          {
            trainNo: leg1Train,
            timeFrm: formatTime(leg1From),
            timeTo: formatTime(leg1To),
            takeoverLocation: sOnLoc,
            handoverLocation: leg1Handover,
            tripTime: formatTime(leg1Trip),
            calculatedKms: nightKms
          },
          {
            trainNo: leg3Train,
            timeFrm: formatTime(leg3From),
            timeTo: formatTime(leg3To),
            takeoverLocation: leg3Takeover,
            handoverLocation: leg3Handover,
            tripTime: formatTime(leg3Trip),
            calculatedKms: mornKms
          }
        ]
      };
      weekdayMasterLinks.push(currentDuty);
    } else if (isProOrStby) {
      currentDuty = {
        dutyNo: String(dutyNumber),
        dutyId: String(dutyNumber).padStart(2, '0'),
        id: 'link_weekday_duty_' + String(dutyNumber).padStart(2, '0'),
        docId: 'link_weekday_duty_' + String(dutyNumber).padStart(2, '0'),
        scheduleType: 'WEEKDAY',
        signOnTime: formatTime(sOnTime),
        signOnLocation: sOnLoc,
        trainId: leg1Train,
        leg1TimeFrom: formatTime(sOnTime),
        leg1TimeTo: formatTime(sOffTime),
        leg1TripTime: formatTime(dutyHrs),
        leg1HandoverLoc: sOffLoc,
        leg1Km: '--',
        leg2DepLoc: '--',
        leg2TrainNo: '--',
        leg2DepTime: '--',
        leg2ArrTime: '--',
        leg2TimeTo: '--',
        leg2ArrLoc: '--',
        leg2Km: '--',
        leg3DepLoc: '--',
        leg3TrainNo: '--',
        leg3DepTime: '--',
        leg3ArrTime: '--',
        leg3TimeTo: '--',
        leg3ArrLoc: '--',
        leg3Km: '--',
        leg4FinalDepLoc: '--',
        leg4TrainNo: '--',
        leg4FinalDepTime: '--',
        leg4FinalArrTime: '--',
        leg4TimeTo: '--',
        leg4FinalArrLoc: '--',
        leg4Km: '--',
        signOffTime: formatTime(sOffTime),
        signOffLocation: sOffLoc,
        totalHours: formatTime(dutyHrs),
        remarks: dutyType,
        dutyProfile: dutyType,
        totalKm: 0,
        kms: 0,
        drivingHrs: '00:00:00',
        breakTime: '00:00:00',
        counselling: '--',
        trips: [
          {
            trainNo: leg1Train,
            timeFrm: formatTime(sOnTime),
            timeTo: formatTime(sOffTime),
            takeoverLocation: sOnLoc,
            handoverLocation: sOffLoc,
            tripTime: formatTime(dutyHrs),
            calculatedKms: 0
          }
        ]
      };
      weekdayMasterLinks.push(currentDuty);
    } else {
      const trips = [];
      if (leg1Train && leg1Train !== '--') {
        trips.push({
          trainNo: leg1Train,
          timeFrm: formatTime(leg1From),
          timeTo: formatTime(leg1To),
          takeoverLocation: sOnLoc,
          handoverLocation: leg1Handover !== '--' ? leg1Handover : (leg2Takeover !== '--' ? leg2Takeover : 'PYID'),
          tripTime: formatTime(leg1Trip)
        });
      }
      if (leg2Train && leg2Train !== '--') {
        trips.push({
          trainNo: leg2Train,
          timeFrm: formatTime(leg2From),
          timeTo: formatTime(leg2To),
          takeoverLocation: leg2Takeover !== '--' ? leg2Takeover : 'PYID',
          handoverLocation: leg2Handover !== '--' ? leg2Handover : (leg3Takeover !== '--' ? leg3Takeover : 'PYID'),
          tripTime: formatTime(leg2Trip)
        });
      }
      if (leg3Train && leg3Train !== '--') {
        trips.push({
          trainNo: leg3Train,
          timeFrm: formatTime(leg3From),
          timeTo: formatTime(leg3To),
          takeoverLocation: leg3Takeover !== '--' ? leg3Takeover : 'PYID',
          handoverLocation: leg3Handover !== '--' ? leg3Handover : sOffLoc,
          tripTime: formatTime(leg3Trip)
        });
      }
      
      currentDuty = {
        dutyNo: String(dutyNumber),
        dutyId: String(dutyNumber).padStart(2, '0'),
        id: 'link_weekday_duty_' + String(dutyNumber).padStart(2, '0'),
        docId: 'link_weekday_duty_' + String(dutyNumber).padStart(2, '0'),
        scheduleType: 'WEEKDAY',
        signOnTime: formatTime(sOnTime),
        signOnLocation: sOnLoc,
        trainId: leg1Train,
        leg1TimeFrom: formatTime(leg1From),
        leg1TimeTo: formatTime(leg1To),
        leg1TripTime: formatTime(leg1Trip),
        leg1HandoverLoc: leg1Handover,
        leg1Km: '--',
        leg2DepLoc: leg2Takeover,
        leg2TrainNo: leg2Train,
        leg2DepTime: formatTime(leg2From),
        leg2ArrTime: formatTime(leg2To),
        leg2TimeTo: formatTime(leg2Trip),
        leg2ArrLoc: leg2Handover,
        leg2Km: '--',
        leg3DepLoc: leg3Takeover,
        leg3TrainNo: leg3Train,
        leg3DepTime: formatTime(leg3From),
        leg3ArrTime: formatTime(leg3To),
        leg3TimeTo: formatTime(leg3Trip),
        leg3ArrLoc: leg3Handover,
        leg3Km: '--',
        leg4FinalDepLoc: '--',
        leg4TrainNo: '--',
        leg4FinalDepTime: '--',
        leg4FinalArrTime: '--',
        leg4TimeTo: '--',
        leg4FinalArrLoc: '--',
        leg4Km: '--',
        signOffTime: formatTime(sOffTime),
        signOffLocation: sOffLoc,
        totalHours: formatTime(dutyHrs),
        remarks: dutyType,
        dutyProfile: dutyType,
        totalKm: kms,
        kms: kms,
        drivingHrs: formatTime(drivingHrs),
        breakTime: formatTime(breakTime),
        counselling: counselling,
        trips: trips
      };
      weekdayMasterLinks.push(currentDuty);
    }
  } else if (currentDuty && row.some(x => x)) {
    const leg4Takeover = row[18] ? String(row[18]).trim() : '--';
    const leg4Train = row[19] ? String(row[19]).trim() : '--';
    const leg4From = row[20];
    const leg4To = row[21];
    const leg4Trip = row[22];
    const leg4Handover = row[23] ? String(row[23]).trim() : '--';
    
    currentDuty.leg4FinalDepLoc = leg4Takeover;
    currentDuty.leg4TrainNo = leg4Train;
    currentDuty.leg4FinalDepTime = formatTime(leg4From);
    currentDuty.leg4FinalArrTime = formatTime(leg4To);
    currentDuty.leg4TimeTo = formatTime(leg4Trip);
    currentDuty.leg4FinalArrLoc = leg4Handover;
    
    currentDuty.trips.push({
      trainNo: leg4Train,
      timeFrm: formatTime(leg4From),
      timeTo: formatTime(leg4To),
      takeoverLocation: leg4Takeover !== '--' ? leg4Takeover : 'PYID',
      handoverLocation: leg4Handover !== '--' ? leg4Handover : currentDuty.signOffLocation,
      tripTime: formatTime(leg4Trip)
    });
  }
}

console.log('Total duties parsed:', weekdayMasterLinks.length);

// 1. Write src/data/weekdayMasterLinks.js
const weekdayMasterLinksContent = `/**
 * Master Weekday Link Roster Data for BMRCL Line 2 JMD
 * Line 2 WEEKDAY Link WEF 22/Nov/2024 for Time Table Dated 20/Nov/2024 (APTS - BIET)
 * Parsed from: weekday old link.xlsx (79 Duties)
 */

export const WEEKDAY_MASTER_LINKS = ${JSON.stringify(weekdayMasterLinks, null, 2)};
`;

fs.writeFileSync('src/data/weekdayMasterLinks.js', weekdayMasterLinksContent, 'utf8');
console.log('✅ Updated src/data/weekdayMasterLinks.js with 79 duties');

// 2. Build PRELOADED_DUTIES and write src/data/kmcalc/preloadedDuties.js
const preloadedDuties = weekdayMasterLinks.map(d => ({
  dutyNo: d.dutyNo,
  sOnTime: d.signOnTime,
  signOnLocation: d.signOnLocation,
  sOffTime: d.signOffTime,
  signOffLocation: d.signOffLocation,
  kms: d.kms,
  dutyHrs: d.totalHours,
  drivingHrs: d.drivingHrs,
  breakTime: d.breakTime,
  dutyType: d.remarks || d.dutyProfile,
  dutyProfile: d.dutyProfile,
  counselling: d.counselling,
  trips: d.trips.map(t => ({
    trainNo: t.trainNo,
    timeFrm: t.timeFrm,
    timeTo: t.timeTo,
    takeoverLocation: t.takeoverLocation,
    handoverLocation: t.handoverLocation,
    calculatedKms: t.calculatedKms || 0
  }))
}));

const existingPreloaded = fs.readFileSync('src/data/kmcalc/preloadedDuties.js', 'utf8');
const sundayTypesMatch = existingPreloaded.match(/export const SUNDAY_DUTY_TYPES[\s\S]*/);
const trailingTypes = sundayTypesMatch ? sundayTypesMatch[0] : '';

const newPreloadedContent = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Official BMRCL Line 2 WEEKDAY Link WEF 22/Nov/2024 for Time Table Dated 20/Nov/2024 (APTS - BIET)
 * Parsed from: weekday old link.xlsx (79 Duties)
 */

export const PRELOADED_DUTIES = ${JSON.stringify(preloadedDuties, null, 2)};

${trailingTypes}`;

fs.writeFileSync('src/data/kmcalc/preloadedDuties.js', newPreloadedContent, 'utf8');
console.log('✅ Updated src/data/kmcalc/preloadedDuties.js with 79 duties');

// 3. Build DUTY_TEMPLATES_REGISTRY.WEEKDAY and write src/data/dutyTemplatesRegistry.js
const weekdayTemplates = weekdayMasterLinks.map(d => {
  const dutyNumber = parseInt(d.dutyNo, 10);
  let shift = 'A';
  if (dutyNumber === 1 || dutyNumber === 43 || dutyNumber === 78) {
    shift = 'PRO';
  } else if (dutyNumber === 79) {
    shift = 'CC';
  } else if (dutyNumber === 2 || dutyNumber === 42) {
    shift = 'STBY';
  } else if (dutyNumber >= 64 && dutyNumber <= 77) {
    shift = 'N';
  } else if (dutyNumber <= 32) {
    shift = 'A';
  } else {
    shift = 'B';
  }

  const isNight = dutyNumber >= 64 && dutyNumber <= 79;
  const isPinkSuitable = !isNight && (d.kms <= 170 || shift === 'STBY' || shift === 'PRO');

  return {
    id: `Wday_${dutyNumber}`,
    dutyNo: String(dutyNumber),
    dutyCode: d.remarks || d.dutyProfile,
    shift: shift,
    sOnTime: timeToShort(d.signOnTime),
    sOnLoc: d.signOnLocation,
    sOffTime: timeToShort(d.signOffTime),
    sOffLoc: d.signOffLocation,
    sOnTimeFrac: timeToFrac(d.signOnTime),
    sOffTimeFrac: timeToFrac(d.signOffTime),
    trainNo: d.trainId,
    kms: d.kms,
    dutyHrs: timeToShort(d.totalHours),
    drivingHrs: timeToShort(d.drivingHrs),
    isNight: isNight,
    isPinkSuitable: isPinkSuitable
  };
});

const existingDutyTemplates = fs.readFileSync('src/data/dutyTemplatesRegistry.js', 'utf8');
const monIndex = existingDutyTemplates.indexOf('  "MON": [');
if (monIndex !== -1) {
  const topPart = `/* Auto-generated Verified Duty Templates Registry for BMRCL Line 2 (Peenya Depot) */
import { DAY_TYPE_PROFILES } from './dayTypeProfiles.js';

export const DAY_TYPE_CONFIGS = DAY_TYPE_PROFILES;
export { DAY_TYPE_PROFILES };

export const DUTY_TEMPLATES_REGISTRY = {
  "WEEKDAY": ${JSON.stringify(weekdayTemplates, null, 4)},\n`;
  const restPart = existingDutyTemplates.substring(monIndex);
  fs.writeFileSync('src/data/dutyTemplatesRegistry.js', topPart + '  ' + restPart, 'utf8');
  console.log('✅ Updated src/data/dutyTemplatesRegistry.js with 79 WEEKDAY templates');
} else {
  console.error('Could not find MON in dutyTemplatesRegistry.js');
}

// 4. Build WEEKDAY_RELIEF_ID_CHART
const trainReliefMap = {};
function addInterval(train, from, to, duty) {
  if (!train || train === '--' || !from || !to || from === '--' || to === '--') return;
  const tStr = String(train).trim();
  if (!trainReliefMap[tStr]) trainReliefMap[tStr] = [];
  trainReliefMap[tStr].push({ from: timeToShort(from), to: timeToShort(to), duty: String(duty).padStart(2, '0') });
}

weekdayMasterLinks.forEach(d => {
  const dutyNum = parseInt(d.dutyNo, 10);
  if ([1, 2, 42, 43, 78, 79].includes(dutyNum)) return;
  d.trips.forEach(t => {
    addInterval(t.trainNo, t.timeFrm, t.timeTo, dutyNum);
  });
});

Object.keys(trainReliefMap).forEach(trn => {
  trainReliefMap[trn].sort((a, b) => a.from.localeCompare(b.from));
});

const existingRelief = fs.readFileSync('src/data/weekdayReliefIdChartRegistry.js', 'utf8');
const monReliefIndex = existingRelief.indexOf('export const MONDAY_RELIEF_ID_CHART = {');
const topReliefPart = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * Master Reliever ID Chart & Live Train Relief Engine for All Schedule Day Types:
 * - WEEKDAY (WEF 22/Nov/2024 for TT 20/Nov/2024 APTS-BIET, 79 Duties)
 * - MONDAY (WEF 06/Jan/2025 APTS-BIET)
 * - SATURDAY & GH (WEF 15/Mar/2025 APTS-BIET)
 * - SUNDAY (WEF 08/Dec/2024 BIET-APTS)
 * 
 * Synced to Alstom ATS Relief Engine • Verified Reliever-Only Handover System
 */

import { DUTY_TEMPLATES_REGISTRY } from './dutyTemplatesRegistry.js';

// ============================================================================
// 1. WEEKDAY RELIEF ID CHART (TUESDAY - FRIDAY)
// ============================================================================
export const WEEKDAY_RELIEF_ID_CHART = ${JSON.stringify(trainReliefMap, null, 2)};

export const WEEKDAY_RELIEF_ID_CHART_META = {
  title: 'ID CHART for Line 2 WEEKDAY Link WEF 22/Nov/2024 for Time Table Dated 20/Nov/2024 (APTS - BIET)',
  effectiveDate: '22/Nov/2024',
  corridor: 'APTS - BIET',
  depot: 'Peenya Industry Depot Crew Control (PYIDCC)',
  trains: ${JSON.stringify(Object.keys(trainReliefMap).sort())}
};

// ============================================================================
// 2. MONDAY 04:00hrs SERVICE RELIEF ID CHART (WEF 06/Jan/2025 APTS - BIET)
// ============================================================================
`;

if (monReliefIndex !== -1) {
  const restReliefPart = existingRelief.substring(monReliefIndex);
  fs.writeFileSync('src/data/weekdayReliefIdChartRegistry.js', topReliefPart + restReliefPart, 'utf8');
  console.log('✅ Updated src/data/weekdayReliefIdChartRegistry.js with 79-duty train relief chart');
} else {
  console.error('Could not find MONDAY_RELIEF_ID_CHART in weekdayReliefIdChartRegistry.js');
}

// 5. Update DAY_TYPE_PROFILES in src/data/dayTypeProfiles.js
let dayTypeContent = fs.readFileSync('src/data/dayTypeProfiles.js', 'utf8');
dayTypeContent = dayTypeContent.replace(
  /WEEKDAY:\s*\{[\s\S]*?description:\s*"[^"]*"\s*\}/,
  `WEEKDAY: {
    id: "WEEKDAY",
    name: "Weekday (Tue - Fri)",
    totalDuties: 79,
    a: [1, 32],
    b: [33, 63],
    n: [64, 77],
    npro: [78, 79],
    ncrrc: [],
    ntst_unnumbered: false,
    blank: [],
    pro1: 1,
    pro2: 43,
    or1_duty: 2,
    or2_duty: 42,
    or_model: "LADDER",
    type_casing: "MIXED",
    spacers_after: [7, 13, 18, 24, 32, 42, 48, 53, 58, 63, 68, 77],
    or1_times: { on: 0.25, off: 0.58333 },
    or2_times: { on: 0.57292, off: 0.90625 },
    description: "Standard Weekday Timetable Link WEF 22/Nov/2024 (79 duties)"
  }`
);
fs.writeFileSync('src/data/dayTypeProfiles.js', dayTypeContent, 'utf8');
console.log('✅ Updated src/data/dayTypeProfiles.js for 79 duties');

console.log('🎉 Core data files updated successfully!');

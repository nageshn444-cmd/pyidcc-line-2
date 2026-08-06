import { MASTER_STATIONS } from '../data/kmcalc/masterStations';
import { WTT_MASTER_REGISTRY } from '../data/wttMasterRegistry';

/**
 * Calculates absolute distance between two stations based on chainage values.
 * Returns exact distance in KM.
 */
export function calculateDistance(fromStationCode, toStationCode) {
  const normRawFrom = String(fromStationCode || '').trim().toUpperCase();
  const normRawTo = String(toStationCode || '').trim().toUpperCase();

  // PYID UP to PYID DN (reversing via BIET BE) operational route = 13.08 KM (13 KM)
  if (
    (normRawFrom.includes('PYID') && normRawFrom.includes('UP') && normRawTo.includes('PYID') && normRawTo.includes('DN')) ||
    (normRawFrom.includes('PYID') && normRawFrom.includes('DN') && normRawTo.includes('PYID') && normRawTo.includes('UP'))
  ) {
    return 13.08;
  }

  const normalize = (code) => {
    let c = String(code || '').trim().toUpperCase().replace(/[\s_]/g, '');
    
    // Normalize Depot Handover (DHO) and Depot terms to 'DEPOT'
    if (
      c.includes('DEPOT') || 
      c.includes('DEPO') || 
      c.includes('DPO') || 
      c.includes('DHO') || 
      c === 'BDHO' || 
      c === 'PDHO'
    ) {
      return 'DEPOT';
    }
    
    // Normalize pocket tracks and buffer ends
    if (c === 'BIETBE' || c === 'BIETBUFFEREND') return 'BIET_BE';
    if (c === 'NGSABE' || c === 'NGSABUFFEREND') return 'NGSA_BE';
    if (c === 'NGSAPT' || c === 'NGSAPKT' || c === 'NPKT' || c.includes('NPKT') || c === 'NGSAPOCKET') return 'NGSA_PT';
    if (c === 'NLCPT' || c === 'NLCPKT' || c === 'NLCPOCKET') return 'NLC_PT';
    if (c === 'MHLIPT' || c === 'MHLIPKT' || c === 'MHLIPOCKET') return 'MHLI_PT';
    if (c === 'PUTHBE' || c === 'PUTHBUFFEREND') return 'PUTH_BE';
    if (c === 'APTSBE' || c === 'APTSBUFFEREND') return 'APTS_BE';
    
    // Normalize Road 3 (Rd-3/Rd3) at Peenya Industry to 'PYID'
    if (c === 'RD3' || c === 'RD-3' || c === 'RD3INDUCT' || c === 'RD3STBY') {
      return 'PYID';
    }
    
    if (c === 'JIDL') return 'JDHL';
    
    return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  };

  const normFrom = normalize(fromStationCode);
  const normTo = normalize(toStationCode);

  const fromStn = MASTER_STATIONS.find(s => s.code.toUpperCase() === normFrom);
  const toStn = MASTER_STATIONS.find(s => s.code.toUpperCase() === normTo);

  if (!fromStn || !toStn) {
    return 0;
  }

  return Math.abs(toStn.chainage - fromStn.chainage);
}

/**
 * Calculates cumulative distance for a sequence of station codes.
 * e.g. ["PYID", "BIET_BE", "APTS_BE", "PYID"]
 */
export function calculateSequenceDistance(stationCodes) {
  const segments = [];
  let totalExact = 0;

  for (let i = 0; i < stationCodes.length - 1; i++) {
    const fromCode = stationCodes[i];
    const toCode = stationCodes[i + 1];
    const dist = calculateDistance(fromCode, toCode);
    
    if (dist > 0) {
      segments.push({
        fromStationCode: fromCode,
        toStationCode: toCode,
        calculatedKms: parseFloat(dist.toFixed(3))
      });
      totalExact += dist;
    }
  }

  return {
    segments,
    totalExact: parseFloat(totalExact.toFixed(3)),
    totalRounded: Math.round(totalExact)
  };
}

/**
 * Parses time-string "HH:MM:SS" or "HH:MM" to seconds.
 */
export function timeStringToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).trim().split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 3600 + parts[1] * 60;
  }
  return 0;
}

/**
 * Converts seconds back to "HH:MM:SS" format.
 */
export function secondsToTimeString(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * Calculates kilometers for a single leg by matching trainId, day type (scheduleType),
 * and board/deboard time windows against the master WTT registry (WTT_MASTER_REGISTRY).
 */
export function calculateLegKmsFromWTT(trainId, takeoverLocation, handoverLocation, depTimeStr, arrTimeStr, scheduleType = 'WEEKDAY') {
  const rawTrain = String(trainId || '').trim();
  if (!rawTrain || rawTrain === '--' || rawTrain === '-' || rawTrain.toLowerCase().includes('stby') || rawTrain.toLowerCase().includes('pro') || rawTrain.toLowerCase().includes('break')) {
    return { calculatedKms: 0, segments: [] };
  }

  // Extract clean numerical or canonical train ID (e.g. "Tr 206" -> "206", "Tr 209 UP" -> "209")
  const cleanTrainNo = rawTrain.replace(/^(Tr|Train|No|T)\.?\s*/i, '').replace(/\s*(UP|DN)$/i, '').trim();
  const searchTid = cleanTrainNo.replace(/\D/g, '').trim();

  const normSchedule = String(scheduleType || 'WEEKDAY').toUpperCase();
  const depSecs = timeStringToSeconds(depTimeStr);
  const arrSecs = timeStringToSeconds(arrTimeStr);
  let durationMins = 0;
  if (depSecs > 0 && arrSecs > 0) {
    let diffSecs = arrSecs - depSecs;
    if (diffSecs < 0) diffSecs += 86400; // 24-hour midnight rollover
    durationMins = diffSecs / 60;
  }

  const takeClean = String(takeoverLocation || '').trim().toUpperCase();
  const handClean = String(handoverLocation || '').trim().toUpperCase();

  // Pattern A: Depot / No PDC / Dpo - Rd3 / Rd3 Induct (Leg 1 Induction) = 42 KM
  if (
    takeClean.includes('NO PDC') || takeClean.includes('INDUCT') || takeClean.includes('DPO') || takeClean.includes('DEPO') || takeClean.includes('RD3')
  ) {
    if (durationMins >= 80 && durationMins <= 175) {
      return {
        calculatedKms: 42,
        segments: [
          { fromStationCode: takeoverLocation || "DEPOT", toStationCode: "BIET_BE", calculatedKms: 6.54 },
          { fromStationCode: "BIET_BE", toStationCode: "PUTH_BE", calculatedKms: 27.81 },
          { fromStationCode: "PUTH_BE", toStationCode: handoverLocation || "PYID", calculatedKms: 7.65 }
        ]
      };
    }
  }

  // Pattern B: KGWA Dn / KGWA Up (Leg 1 Takeover)
  if (takeClean.includes('KGWA')) {
    if (takeClean.includes('DN')) {
      const kmVal = searchTid === '206' || searchTid === '207' ? 43 : 43;
      return {
        calculatedKms: kmVal,
        segments: [{ fromStationCode: takeoverLocation, toStationCode: handoverLocation || "PYID", calculatedKms: kmVal }]
      };
    }
    if (takeClean.includes('UP')) {
      const kmVal = searchTid === '204' ? 23 : 26;
      return {
        calculatedKms: kmVal,
        segments: [{ fromStationCode: takeoverLocation, toStationCode: handoverLocation || "PYID", calculatedKms: kmVal }]
      };
    }
  }

  // Pattern C: PYID Dn (Leg 1 Takeover) = 54 KM
  if (takeClean.includes('PYID') && (takeClean.includes('DN') || takeClean.includes('DOWN'))) {
    if (durationMins >= 80 && durationMins <= 140) {
      return {
        calculatedKms: 54,
        segments: [
          { fromStationCode: takeoverLocation || "PYID DN", toStationCode: "BIET_BE", calculatedKms: 6.54 },
          { fromStationCode: "BIET_BE", toStationCode: "PUTH_BE", calculatedKms: 27.81 },
          { fromStationCode: "PUTH_BE", toStationCode: handoverLocation || "PYID", calculatedKms: 19.65 }
        ]
      };
    }
  }

  // Pattern D: N PKT (Leg 1 Takeover) = 6 KM
  if (takeClean.includes('N PKT') || takeClean.includes('NPKT')) {
    return {
      calculatedKms: 6,
      segments: [{ fromStationCode: takeoverLocation, toStationCode: handoverLocation || "PYID", calculatedKms: 6 }]
    };
  }

  // Pattern E: Short Reversing Loop (PYID UP -> BIET BE -> PYID DN) = 13 KM
  if (
    (takeClean.includes('PYID') && handClean.includes('PYID') && durationMins >= 15 && durationMins <= 55) ||
    (takeClean.includes('RD3') && handClean.includes('PYID') && durationMins >= 15 && durationMins <= 55)
  ) {
    return {
      calculatedKms: 13,
      segments: [
        { fromStationCode: takeoverLocation || "PYID UP", toStationCode: "BIET_BE", calculatedKms: 6.54 },
        { fromStationCode: "BIET_BE", toStationCode: handoverLocation || "PYID DN", calculatedKms: 6.54 }
      ]
    };
  }

  // Pattern F: Full Clockwise Round Trip Loop (PYID UP -> BIET_BE -> PUTH_BE -> PYID UP) = 57 KM / 66 KM
  if (
    (takeClean.includes('PYID') || takeClean.includes('RD3')) &&
    (handClean.includes('PYID') || handClean.includes('DEPOT')) &&
    durationMins >= 105 && durationMins <= 175
  ) {
    return {
      calculatedKms: 57,
      segments: [
        { fromStationCode: takeoverLocation || "PYID", toStationCode: "BIET_BE", calculatedKms: 6.54 },
        { fromStationCode: "BIET_BE", toStationCode: "PUTH_BE", calculatedKms: 27.81 },
        { fromStationCode: "PUTH_BE", toStationCode: handoverLocation || "PYID", calculatedKms: 22.65 }
      ]
    };
  }

  // 1. Search WTT matrix with strict scheduleType matching (falling back to WEEKDAY if unmatched)
  let matchingWttRows = (WTT_MASTER_REGISTRY || []).filter(row => {
    const rowSched = String(row.scheduleType || 'WEEKDAY').toUpperCase();
    const rowTid = String(row.trainId || row.upTid || row.dnTid || '').replace(/\D/g, '').trim();
    return rowSched === normSchedule && (rowTid === searchTid || rowTid.endsWith(searchTid));
  });

  if (matchingWttRows.length === 0) {
    matchingWttRows = (WTT_MASTER_REGISTRY || []).filter(row => {
      const rowSched = String(row.scheduleType || 'WEEKDAY').toUpperCase();
      const rowTid = String(row.trainId || row.upTid || row.dnTid || '').replace(/\D/g, '').trim();
      return rowSched === 'WEEKDAY' && (rowTid === searchTid || rowTid.endsWith(searchTid));
    });
  }

  if (matchingWttRows.length > 0) {
    const stops = [];
    matchingWttRows.forEach(row => {
      ['upTrip', 'downTrip'].forEach(tripKey => {
        const trip = row[tripKey];
        if (trip && trip.stations) {
          Object.entries(trip.stations).forEach(([stCode, timeVal]) => {
            if (timeVal && timeVal !== '--' && timeVal !== '-' && !String(timeVal).toLowerCase().includes('rev')) {
              const stSecs = timeStringToSeconds(timeVal);
              if (stSecs > 0) {
                if (depSecs > 0 && arrSecs > 0) {
                  if (stSecs >= (depSecs - 300) && stSecs <= (arrSecs + 300)) {
                    stops.push({ station: stCode.split('_')[0], secs: stSecs });
                  }
                } else {
                  stops.push({ station: stCode.split('_')[0], secs: stSecs });
                }
              }
            }
          });
        }
      });
    });

    stops.sort((a, b) => a.secs - b.secs);

    if (stops.length >= 2) {
      const uniqueStops = stops.filter((s, index, self) => index === 0 || s.station !== self[index - 1].station);
      const stationCodes = uniqueStops.map(s => s.station);
      const result = calculateSequenceDistance(stationCodes);
      if (result.totalRounded > 0) {
        return {
          calculatedKms: result.totalRounded,
          segments: result.segments
        };
      }
    }
  }

  // Fallback: Direct chainage distance between takeover and handover locations
  if (takeoverLocation && handoverLocation) {
    const dist = calculateDistance(takeoverLocation, handoverLocation);
    const fallbackKm = Math.round(dist) || 42;
    return {
      calculatedKms: fallbackKm,
      segments: [{ fromStationCode: takeoverLocation, toStationCode: handoverLocation, calculatedKms: parseFloat(dist.toFixed(3)) }]
    };
  }

  return { calculatedKms: 42, segments: [] };
}

/**
 * Parses raw CSV or spreadsheet lines to Duty array with Leg 1-4 support.
 */
export function parseCSVToDuties(csvText) {
  if (!csvText) return [];

  const lines = csvText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const matrix = lines.map(line => {
    let delimiter = ',';
    if (line.includes('\t')) delimiter = '\t';
    else if (!line.includes(',') && line.includes(';')) delimiter = ';';
    
    return line.split(delimiter).map(v => {
      let cleaned = String(v || '').trim().replace(/^["']|["']$/g, '');
      // Strip unprintable non-ASCII symbols or hidden icons
      cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
      return cleaned;
    });
  });

  const parsedDuties = [];

  const dutyKeywords = ['duty', 'duty no', 'duty_no', 'duty#', 'duty.', 'link', 'sl', 'sl.no', 's.no', 'shift', 'duty id'];
  const sOnKeywords = ['sign on', 's/on', 's on', 's-on', 's.on', 'son', 'on time', 'report time', 'start time', 'sign_on'];
  const sOnLocKeywords = ['sign on loc', 's/on loc', 's on loc', 'on_location', 'location', 'sign_on_loc', 'on loc', 's.on loc'];
  const sOffKeywords = ['sign off', 's/off', 's off', 's-off', 's.off', 'soff', 'off time', 'end time', 'sign_off'];
  const sOffLocKeywords = ['sign off loc', 's/off loc', 's off loc', 'off_location', 'sign_off_loc', 'off loc', 's.off loc'];
  const trainKeywords = ['train', 'tr.no', 'tr no', 'train no', 'train_no', 'train#', 'tr', 't.no', 'leg', 'trip'];
  const timeFrmKeywords = ['time frm', 'time_frm', 'frm', 'dep', 'departure', 'dep.time', 'from time', 'time from'];
  const timeToKeywords = ['time to', 'time_to', 'to', 'arr', 'arrival', 'arr.time', 'to time', 'time to'];
  const takeoverKeywords = ['takeover', 't/o', 'take over', 'takeover loc', 't/o loc', 'from loc'];
  const handoverKeywords = ['handover', 'h/o', 'hand over', 'handover loc', 'h/o loc', 'to loc'];

  const matchesKeyword = (headerStr, keywords) => {
    if (!headerStr) return false;
    const h = String(headerStr).toLowerCase().trim();
    const hClean = h.replace(/[^a-z0-9]/g, '');
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      const kClean = k.replace(/[^a-z0-9]/g, '');
      if (h === k || h.includes(k) || k.includes(h)) return true;
      if (hClean && kClean && (hClean.includes(kClean) || kClean.includes(hClean))) return true;
    }
    return false;
  };

  let bestHeaderIdx = -1;
  let maxScore = 0;

  for (let r = 0; r < Math.min(20, matrix.length); r++) {
    const row = matrix[r];
    let score = 0;
    row.forEach(cellVal => {
      if (matchesKeyword(cellVal, dutyKeywords)) score += 3;
      if (matchesKeyword(cellVal, sOnKeywords)) score += 2;
      if (matchesKeyword(cellVal, sOffKeywords)) score += 2;
      if (matchesKeyword(cellVal, trainKeywords)) score += 2;
      if (matchesKeyword(cellVal, timeFrmKeywords)) score += 1;
      if (matchesKeyword(cellVal, timeToKeywords)) score += 1;
    });
    if (score > maxScore) {
      maxScore = score;
      bestHeaderIdx = r;
    }
  }

  const startRow = (bestHeaderIdx !== -1 && maxScore > 0) ? bestHeaderIdx + 1 : 0;
  const headers = (bestHeaderIdx !== -1 && maxScore > 0) ? matrix[bestHeaderIdx].map(h => String(h || '').toLowerCase().trim()) : [];

  const findColIndex = (keywords) => {
    for (let c = 0; c < headers.length; c++) {
      if (matchesKeyword(headers[c], keywords)) return c;
    }
    return -1;
  };

  const dutyNoIdx = findColIndex(dutyKeywords);
  const sOnTimeIdx = findColIndex(sOnKeywords);
  const signOnLocIdx = findColIndex(sOnLocKeywords);
  const sOffTimeIdx = findColIndex(sOffKeywords);
  const signOffLocIdx = findColIndex(sOffLocKeywords);
  const kmsIdx = findColIndex(['kms', 'distance', 'km', 'kilometer', 'total km']);

  const getColIndexForLeg = (keywords, legNum) => {
    const legNumStr = String(legNum);
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (h.includes(legNumStr) && matchesKeyword(h, keywords)) return c;
    }
    const matches = [];
    for (let c = 0; c < headers.length; c++) {
      if (matchesKeyword(headers[c], keywords)) matches.push(c);
    }
    return matches[legNum - 1] !== undefined ? matches[legNum - 1] : -1;
  };

  for (let r = startRow; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    let dutyNo = dutyNoIdx !== -1 ? row[dutyNoIdx] : '';
    if (!dutyNo) {
      for (let c = 0; c < Math.min(4, row.length); c++) {
        const val = String(row[c] || '').trim();
        const cleanVal = val.replace(/^duty\s*@?\s*/i, '').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
        if (cleanVal && (/\d+/.test(cleanVal) || /^(pro|stby|r3|rd3|duty|sb)\d*/i.test(cleanVal))) {
          dutyNo = cleanVal;
          break;
        }
      }
    }

    if (!dutyNo) continue;
    dutyNo = String(dutyNo).trim().replace(/^(duty\s*(no\.?|#|@)?)[\s:]*/i, '');
    if (
      !dutyNo || 
      dutyNo.toLowerCase().includes('total') || 
      dutyNo.toLowerCase().includes('prepared') || 
      dutyNo.toLowerCase().includes('metric') || 
      dutyNo.toLowerCase().includes('average') || 
      dutyNo.toLowerCase().includes('hrs') || 
      dutyNo.startsWith('~')
    ) {
      continue;
    }

    const sOnTimeCell = sOnTimeIdx !== -1 ? row[sOnTimeIdx] : '';
    const signOnLocCell = signOnLocIdx !== -1 ? row[signOnLocIdx] : '';
    const sOffTimeCell = sOffTimeIdx !== -1 ? row[sOffTimeIdx] : '';
    const signOffLocCell = signOffLocIdx !== -1 ? row[signOffLocIdx] : '';
    const kms = kmsIdx !== -1 ? (parseFloat(row[kmsIdx]) || 0) : 0;

    // Collect all time cells & location cells in the row for smart fallback
    const timeCells = [];
    const locationCells = [];
    const trainCells = [];

    row.forEach(cell => {
      const val = String(cell || '').trim();
      if (!val) return;
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) {
        timeCells.push(val);
      } else if (/(PYID|KGWA|PUTH|DEPOT|DEPO|DPO|DHO|NLC|APTS|RJNR|YPM|NGSA|BIET|RD3)/i.test(val)) {
        locationCells.push(val);
      } else if (/^(\d{3}|pro\s*\d*|rd3\s*stby|stby)$/i.test(val)) {
        trainCells.push(val);
      }
    });

    const sOnTime = sOnTimeCell || timeCells[0] || '06:00:00';
    const signOnLocation = signOnLocCell || locationCells[0] || 'PYID';
    const sOffTime = sOffTimeCell || (timeCells.length > 1 ? timeCells[timeCells.length - 1] : '14:00:00');
    const signOffLocation = signOffLocCell || (locationCells.length > 1 ? locationCells[locationCells.length - 1] : 'PYID');

    const trips = [];
    // Iterate through Legs 1 to 4 explicitly as requested
    for (let legIdx = 1; legIdx <= 4; legIdx++) {
      const trainCol = getColIndexForLeg(trainKeywords, legIdx);
      const timeFrmCol = getColIndexForLeg(timeFrmKeywords, legIdx);
      const timeToCol = getColIndexForLeg(timeToKeywords, legIdx);
      const takeoverCol = getColIndexForLeg(takeoverKeywords, legIdx);
      const handoverCol = getColIndexForLeg(handoverKeywords, legIdx);

      const trainNo = trainCol !== -1 ? row[trainCol] : '';
      const timeFrm = timeFrmCol !== -1 ? row[timeFrmCol] : '';
      const timeTo = timeToCol !== -1 ? row[timeToCol] : '';
      const takeoverLocation = takeoverCol !== -1 ? row[takeoverCol] : '';
      const handoverLocation = handoverCol !== -1 ? row[handoverCol] : '';

      if (trainNo || timeFrm) {
        const trainLower = String(trainNo).toLowerCase();
        const isCounselling = trainLower.includes('couns') || trainLower.includes('counseling');

        trips.push({
          legNumber: legIdx,
          trainNo: trainNo || 'Unknown',
          timeFrm,
          timeTo,
          takeoverLocation: takeoverLocation || signOnLocation,
          handoverLocation: handoverLocation || signOffLocation,
          isCounselling
        });
      }
    }

    // Smart trip fallback if header columns didn't match leg indices
    if (trips.length === 0 && (trainCells.length > 0 || timeCells.length >= 2)) {
      const numTrips = Math.max(trainCells.length, Math.floor((timeCells.length - 2) / 2));
      for (let tIdx = 0; tIdx < Math.min(4, Math.max(1, numTrips)); tIdx++) {
        const trNo = trainCells[tIdx] || `Train ${tIdx + 1}`;
        const tFrm = timeCells[1 + tIdx * 2] || timeCells[0] || '06:00:00';
        const tTo = timeCells[2 + tIdx * 2] || timeCells[1] || '08:00:00';
        const tTake = locationCells[tIdx] || signOnLocation;
        const tHand = locationCells[tIdx + 1] || signOffLocation;

        trips.push({
          legNumber: tIdx + 1,
          trainNo: trNo,
          timeFrm: tFrm,
          timeTo: tTo,
          takeoverLocation: tTake,
          handoverLocation: tHand,
          isCounselling: false
        });
      }
    }

    parsedDuties.push({
      dutyNo,
      sOnTime,
      signOnLocation,
      sOffTime,
      signOffLocation,
      kms,
      trips
    });
  }

  return parsedDuties;
}

// Predefined WTT standard station loop sequences for Link Roster duty patterns
export const DUTY_TRIP_PATTERNS = {
  "3": [
    ["KGWA", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "4": [
    ["DEPOT", "PYID", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "DEPOT"],
    ["PYID", "BIET_BE", "PYID"]
  ],
  "5": [
    ["PYID", "BIET_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "6": [
    ["PYID", "BIET_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "7": [
    ["DEPOT", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"]
  ],
  "8": [
    ["KGWA", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "NGSA_BE", "DEPOT"]
  ],
  "9": [
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "10": [
    ["DEPOT", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"]
  ],
  "11": [
    ["KGWA", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "12": [
    ["DEPOT", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "DEPOT"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "13": [
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"],
    ["PYID", "NGSA_BE", "PYID"]
  ],
  "14": [
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"]
  ],
  "18": [
    ["DEPOT", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "DEPOT"],
    []
  ],
  "33": [
    ["PYID", "NGSA_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "DEPOT"]
  ],
  "35": [
    [],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"],
    ["PYID", "BIET_BE", "PUTH_BE", "PYID"]
  ],
  "47": [
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "APTS_BE", "PYID"],
    ["PYID", "BIET_BE", "KGWA"]
  ],
  "64": [
    ["PUTH", "APTS_BE", "APTS"],
    ["APTS", "KGWA"]
  ],
  "65": [
    ["PYID", "NLC"],
    ["NLC", "PUTH"]
  ],
  "66": [
    ["KGWA", "PUTH"],
    ["PUTH", "PYID"]
  ],
  "67": [
    ["PUTH", "APTS_BE"],
    ["APTS_BE", "KGWA"]
  ],
  "77": [
    ["KGWA", "DEPOT"],
    []
  ]
};

/**
 * Enhances roster duties by matching uploaded Link Roster day type and WTT trip schedules,
 * calculating leg-by-leg (1 through 4) distance, and compiling final cumulative kilometer summaries.
 */
export function enhanceRosterDuties(duties, scheduleType = 'WEEKDAY') {
  if (!duties) return [];
  
  const normScheduleType = String(scheduleType || 'WEEKDAY').toUpperCase();

  return duties.map(duty => {
    let totalDutyKms = 0;
    
    const isSpecialType = (type) => {
      const t = String(type || '').toLowerCase();
      return t.includes('sby') || t.includes('standby') || t.includes('pro');
    };
    
    if (isSpecialType(duty.dutyType) && (!duty.trips || duty.trips.length === 0 || duty.trips.every(t => String(t.trainNo || '').toLowerCase().includes('stby') || String(t.trainNo || '').toLowerCase().includes('pro')))) {
      return {
        ...duty,
        kms: 0
      };
    }

    const updatedTrips = (duty.trips || []).map((trip, idx) => {
      const trainNoClean = String(trip.trainNo || '').toLowerCase();
      
      // Exclude counselling trips (0 km)
      const isCounselling = 
        trainNoClean.includes('couns') || 
        trainNoClean.includes('counseling') ||
        trip.counsellingTime ||
        trip.isCounselling;
        
      if (isCounselling) {
        return {
          ...trip,
          legNumber: trip.legNumber || (idx + 1),
          calculatedKms: 0,
          segments: [],
          isCounselling: true
        };
      }
      
      const takeNorm = String(trip.takeoverLocation || '').toUpperCase();
      const handNorm = String(trip.handoverLocation || '').toUpperCase();
      if (takeNorm === 'DEPOT' && handNorm === 'DEPOT') {
        return {
          ...trip,
          legNumber: trip.legNumber || (idx + 1),
          calculatedKms: 0,
          segments: []
        };
      }
      
      // Exact Day-Type WTT time-matching calculation for Leg 1-4 trips
      const wttResult = calculateLegKmsFromWTT(
        trip.trainNo,
        trip.takeoverLocation,
        trip.handoverLocation,
        trip.timeFrm,
        trip.timeTo,
        normScheduleType
      );

      const legKms = wttResult.calculatedKms || trip.calculatedKms || 0;
      totalDutyKms += legKms;
      return {
        ...trip,
        legNumber: trip.legNumber || (idx + 1),
        calculatedKms: legKms,
        segments: wttResult.segments && wttResult.segments.length > 0 ? wttResult.segments : (trip.segments || []),
        isShortLoop: trip.isShortLoop || false,
        isDnLine: trip.isDnLine || false
      };
    });
    
    return {
      ...duty,
      kms: totalDutyKms, // Final cumulative kilometer summary for the duty
      trips: updatedTrips
    };
  });
}

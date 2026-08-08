/**
 * kmCalculator.js
 * ─────────────────────────────────────────────────────────────────────
 * Master High-Precision Distance & Kilometer Engine for BMRCL Line 2 JMD.
 *
 * Provides exact chainage-based kilometer calculations, sequence distances,
 * WTT timetable matching, and CSV link roster parsing.
 * ─────────────────────────────────────────────────────────────────────
 */

import { MASTER_STATIONS, PREDEFINED_TRIPS } from "../data/kmcalc/masterStations.js";
import { WTT_MASTER_REGISTRY } from "../data/wttMasterRegistry.js";
import { CHANGEOVER_TABLE } from "../services/changeoverService.js";

/**
 * Normalizes any station code, name, sub-location or alias to canonical MASTER_STATIONS code.
 */
export function normalizeStationCode(rawCode) {
  if (!rawCode) return "";

  let c = String(rawCode)
    .trim()
    .toUpperCase()
    .replace(/[\s_]/g, "");

  // Depot and Induction sub-locations
  if (
    c.includes("DEPOT") ||
    c.includes("DEPO") ||
    c.includes("DPO") ||
    c.includes("DHO") ||
    c === "BDHO" ||
    c === "PDHO"
  ) {
    return "DEPOT";
  }

  // Pocket tracks & Buffer Ends
  if (c === "BIETBE" || c === "BIETBUFFEREND" || c.includes("BIETBE")) return "BIET_BE";
  if (c === "NGSABE" || c === "NGSABUFFEREND" || c.includes("NGSABE")) return "NGSA_BE";
  if (c === "NGSAPT" || c === "NGSAPKT" || c === "NPKT" || c.includes("NGSAPT") || c.includes("NGSAPOCKET")) return "NGSA_PT";
  if (c === "NLCPT" || c === "NLCPKT" || c.includes("NLCPOCKET")) return "NLC_PT";
  if (c === "MHLIPT" || c === "MHLIPKT" || c.includes("MHLIPOCKET")) return "MHLI_PT";
  if (c === "PUTHBE" || c === "PUTHBUFFEREND" || c.includes("PUTHBE")) return "PUTH_BE";
  if (c === "APTSBE" || c === "APTSBUFFEREND" || c.includes("APTSBE")) return "APTS_BE";

  // Road 3 (Rd-3/Rd3) at Peenya Industry -> 'PYID'
  if (c === "RD3" || c === "RD-3" || c === "RD3INDUCT" || c === "RD3STBY" || c.includes("RD3")) {
    return "PYID";
  }

  // Common station name aliases
  if (c.includes("MADAVARA") || c.includes("MADHAVARA") || c.includes("BIEC")) return "BIET";
  if (c.includes("JINDAL") || c.includes("JIDL")) return "JDHL";
  if (c.includes("MANJUNATHA")) return "MNJN";
  if (c.includes("NAGASANDRA") || c === "NGSA") return "NGSA";
  if (c.includes("DASARAHALLI") || c === "DSH") return "DSH";
  if (c.includes("JALAHALLI") || c === "JLHL") return "JLHL";
  if (c.includes("PEENYA") && !c.includes("INDUSTRY") && c !== "PYID") return "PEYA";
  if (c.includes("PEENYA") || c.includes("PYID")) return "PYID";
  if (c.includes("GORAGUNTE") || c === "YPI") return "YPI";
  if (c.includes("YESHWANT") || c.includes("YPM")) return "YPM";
  if (c.includes("SANDAL") || c === "SSFY") return "SSFY";
  if (c.includes("MAHALAKSHMI") || c === "MHLI") return "MHLI";
  if (c.includes("RAJAJINAGAR") || c === "RJNR") return "RJNR";
  if (c.includes("KUVEMPU") || c === "KVPR") return "KVPR";
  if (c.includes("SRIRAMPURA") || c === "SPRU") return "SPRU";
  if (c.includes("SAMPIGE") || c.includes("SPGD") || c.includes("MANTRI")) return "SPGD";
  if (c.includes("KEMPEGOWDA") || c.includes("KGWA") || c.includes("MAJESTIC") || c === "MJST") return "KGWA";
  if (c.includes("CHIKKAPETE") || c === "CKPE") return "CKPE";
  if (c.includes("MARKET") || c === "KRMT") return "KRMT";
  if (c.includes("NATIONAL") || c.includes("NLC")) return "NLC";
  if (c.includes("LALBAGH") || c === "LBGH") return "LBGH";
  if (c.includes("SOUTHEND") || c === "SECE") return "SECE";
  if (c.includes("JAYANAGAR") || c === "JYN") return "JYN";
  if (c.includes("RVROAD") || c.includes("RVR") || c.includes("R.V.ROAD")) return "RVR";
  if (c.includes("BANASHANKARI") || c === "BSNK") return "BSNK";
  if (c.includes("JPNAGAR") || c === "JPN") return "JPN";
  if (c.includes("YELACHENAHALLI") || c.includes("PUTH") || c.includes("PUTHANTENAHALLI")) return "PUTH";
  if (c.includes("KONANAKUNTE") || c === "APRC") return "APRC";
  if (c.includes("DODDAKALSANDRA") || c === "KLPK") return "KLPK";
  if (c.includes("VAJARAHALLI") || c === "VJRH") return "VJRH";
  if (c.includes("TALAGHATTAPURA") || c === "TGTP") return "TGTP";
  if (c.includes("ANJANAPURA") || c.includes("APTS") || c.includes("SILK")) return "APTS";

  return String(rawCode || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
}

/**
 * Calculates absolute distance between two stations based on chainage values.
 * Returns exact distance in KM (float, rounded to 2 decimal places).
 */
export function calculateDistance(fromStationCode, toStationCode) {
  const rawFromStr = String(fromStationCode || "").trim().toUpperCase();
  const rawToStr = String(toStationCode || "").trim().toUpperCase();

  // PYID UP to PYID DN (reversing via BIET BE) operational terminal loop = 13.08 KM
  if (
    (rawFromStr.includes("PYID") && rawFromStr.includes("UP") && rawToStr.includes("PYID") && rawToStr.includes("DN")) ||
    (rawFromStr.includes("PYID") && rawFromStr.includes("DN") && rawToStr.includes("PYID") && rawToStr.includes("UP"))
  ) {
    return 13.08;
  }

  const normFrom = normalizeStationCode(fromStationCode);
  const normTo = normalizeStationCode(toStationCode);

  if (!normFrom || !normTo || normFrom === normTo) {
    return 0;
  }

  const fromStn = MASTER_STATIONS.find((s) => s.code.toUpperCase() === normFrom);
  const toStn = MASTER_STATIONS.find((s) => s.code.toUpperCase() === normTo);

  if (!fromStn || !toStn) {
    return 0;
  }

  const diff = Math.abs(toStn.chainage - fromStn.chainage);
  return parseFloat(diff.toFixed(2));
}

/**
 * Calculates cumulative distance for a sequence of station codes.
 * e.g. ["PYID", "BIET_BE", "APTS_BE", "PYID"]
 */
export function calculateSequenceDistance(stationCodes) {
  if (!Array.isArray(stationCodes) || stationCodes.length < 2) {
    return { segments: [], totalExact: 0, totalRounded: 0 };
  }

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
        calculatedKms: parseFloat(dist.toFixed(3)),
      });
      totalExact += dist;
    }
  }

  return {
    segments,
    totalExact: parseFloat(totalExact.toFixed(3)),
    totalRounded: Math.round(totalExact),
  };
}

/**
 * Parses time-string "HH:MM:SS" or "HH:MM" (or AM/PM) to total seconds.
 */
export function timeStringToSeconds(timeStr) {
  if (!timeStr) return 0;
  let str = String(timeStr).trim().toUpperCase();

  // Handle 12-hour AM/PM format
  const isPm = str.includes("PM");
  const isAm = str.includes("AM");
  str = str.replace(/(AM|PM|\s)/g, "");

  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return 0;

  let hrs = parts[0] || 0;
  const mins = parts[1] || 0;
  const secs = parts[2] || 0;

  if (isPm && hrs < 12) hrs += 12;
  if (isAm && hrs === 12) hrs = 0;

  return hrs * 3600 + mins * 60 + secs;
}

/**
 * Converts seconds back to "HH:MM:SS" format.
 */
export function secondsToTimeString(totalSeconds) {
  if (totalSeconds < 0 || isNaN(totalSeconds)) return "00:00:00";
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);

  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

const LINE2_STATION_ORDER = [
  "BIET_BE",
  "BIET",
  "JDHL",
  "MNJN",
  "NGSA_BE",
  "NGSA_PT",
  "NGSA",
  "DSH",
  "JLHL",
  "PYID",
  "PEYA",
  "DEPOT",
  "YPI",
  "YPM",
  "SSFY",
  "MHLI",
  "MHLI_PT",
  "RJNR",
  "KVPR",
  "SPRU",
  "SPGD",
  "KGWA",
  "CKPE",
  "KRMT",
  "NLC",
  "NLC_PT",
  "LBGH",
  "SECE",
  "JYN",
  "RVR",
  "BSNK",
  "JPN",
  "PUTH",
  "PUTH_BE",
  "APRC",
  "KLPK",
  "VJRH",
  "TGTP",
  "APTS",
  "APTS_BE",
];

export function expandStationPath(stnList) {
  if (!stnList || stnList.length < 2) return stnList || [];

  const expanded = [stnList[0]];

  for (let i = 0; i < stnList.length - 1; i++) {
    const s1 = normalizeStationCode(stnList[i]);
    const s2 = normalizeStationCode(stnList[i + 1]);

    if (!s1 || !s2 || s1 === s2) continue;

    const idx1 = LINE2_STATION_ORDER.indexOf(s1);
    const idx2 = LINE2_STATION_ORDER.indexOf(s2);

    if (idx1 !== -1 && idx2 !== -1 && Math.abs(idx1 - idx2) > 1) {
      const step = idx2 > idx1 ? 1 : -1;
      for (let k = idx1 + step; k !== idx2; k += step) {
        expanded.push(LINE2_STATION_ORDER[k]);
      }
    }
    expanded.push(s2);
  }
  return expanded;
}

/**
 * Calculates kilometers for a single leg by matching trainId, day type (scheduleType),
 * and board/deboard time windows against master WTT registry or station chainages.
 */
export function calculateLegKmsFromWTT(
  trainId,
  takeoverLocation,
  handoverLocation,
  depTimeStr,
  arrTimeStr,
  scheduleType = "WEEKDAY",
  isShortLoop = false,
  isStartDnLine = false,
  isEndDnLine = false,
) {
  const rawTrain = String(trainId || "").trim();
  const trainLower = rawTrain.toLowerCase();
  const takeLower = String(takeoverLocation || "").toLowerCase();
  const handLower = String(handoverLocation || "").toLowerCase();

  const hasStartDn = isStartDnLine || takeLower.includes(" dn") || takeLower.endsWith("dn");
  const hasEndDn = isEndDnLine || handLower.includes(" dn") || handLower.endsWith("dn");

  const cleanTrainNo = rawTrain
    .replace(/^(Tr|Train|No|T)\.?\s*/i, "")
    .replace(/\s*(UP|DN)$/i, "")
    .trim();
  const searchTid = cleanTrainNo.replace(/\D/g, "").trim();

  // 1. Non-running activity check
  const isStandby =
    trainLower.includes("stby") ||
    trainLower.includes("standby") ||
    trainLower.includes("pro") ||
    takeLower.includes("rd3 stby") ||
    takeLower.includes("rd3-stby") ||
    takeLower.includes("rd-3 stby");

  const nonRunningKeywords = [
    "couns", "counseling", "tgtp", "break", "rest", "lunch", "training",
    "medical", "class", "spare", "reserve", "resv", "sign on", "sign off",
    "pilot", "unknown", "wo", "cl", "el", "nr", "ab", "stbk", "crt", "bo",
    "pme", "or", "rel", "hpl", "pl", "ml", "ms", "--", "-"
  ];

  const isNonRunning =
    !searchTid ||
    isStandby ||
    nonRunningKeywords.some((kw) => trainLower === kw || takeLower === kw || trainLower.includes(kw));

  if (!rawTrain || isNonRunning) {
    return {
      calculatedKms: 0,
      status: "NON RUNNING",
      trainNo: rawTrain || "N/A",
      direction: "N/A",
      boardingStation: "N/A",
      boardingTime: depTimeStr || "N/A",
      alightingStation: "N/A",
      alightingTime: arrTimeStr || "N/A",
      intermediateStations: [],
      segments: [],
    };
  }

  // 2. Direct Station Chainage Fallback if locations are provided
  const normFromStn = normalizeStationCode(takeoverLocation);
  const normToStn = normalizeStationCode(handoverLocation);

  let directKm = 0;
  if (normFromStn && normToStn && normFromStn !== normToStn) {
    directKm = calculateDistance(normFromStn, normToStn);
  }

  // 3. Search WTT for Train ID + Schedule Type
  const normSchedule = String(scheduleType || "WEEKDAY").toUpperCase();
  const depSecs = timeStringToSeconds(depTimeStr);
  const arrSecs = timeStringToSeconds(arrTimeStr);

  let wttRows = (WTT_MASTER_REGISTRY || []).filter((row) => {
    const rowSched = String(row.scheduleType || "WEEKDAY").toUpperCase();
    const rowTid = String(row.trainId || row.upTid || row.dnTid || "")
      .replace(/\D/g, "")
      .trim();
    return rowSched === normSchedule && (rowTid === searchTid || rowTid.endsWith(searchTid));
  });

  if (wttRows.length === 0) {
    wttRows = (WTT_MASTER_REGISTRY || []).filter((row) => {
      const rowTid = String(row.trainId || row.upTid || row.dnTid || "")
        .replace(/\D/g, "")
        .trim();
      return rowTid === searchTid || rowTid.endsWith(searchTid);
    });
  }

  // 4. Assemble WTT Timeline
  const trainTimeline = [];
  wttRows.forEach((row) => {
    ["downTrip", "upTrip"].forEach((tripKey) => {
      const trip = row[tripKey];
      if (!trip || !trip.stations) return;

      Object.entries(trip.stations).forEach(([stCode, timeVal]) => {
        if (
          timeVal &&
          timeVal !== "--" &&
          timeVal !== "-" &&
          !String(timeVal).toLowerCase().includes("rev")
        ) {
          const secs = timeStringToSeconds(timeVal);
          if (secs > 0) {
            trainTimeline.push({
              station: normalizeStationCode(stCode),
              timeStr: String(timeVal).trim(),
              secs: secs,
              tripId: trip.id,
              dir: tripKey === "upTrip" ? "UP" : "DOWN",
            });
          }
        }
      });
    });
  });

  trainTimeline.sort((a, b) => a.secs - b.secs);

  if (trainTimeline.length >= 2) {
    let startIdx = 0;
    let minDepDiff = Infinity;
    trainTimeline.forEach((stop, idx) => {
      const diff = Math.abs(stop.secs - depSecs);
      if (diff < minDepDiff) {
        minDepDiff = diff;
        startIdx = idx;
      }
    });

    let endIdx = trainTimeline.length - 1;
    let minArrDiff = Infinity;
    trainTimeline.forEach((stop, idx) => {
      if (idx >= startIdx) {
        const diff = Math.abs(stop.secs - arrSecs);
        if (diff < minArrDiff) {
          minArrDiff = diff;
          endIdx = idx;
        }
      }
    });

    if (endIdx <= startIdx) {
      endIdx = Math.min(startIdx + 1, trainTimeline.length - 1);
    }

    const bStop = trainTimeline[startIdx];
    const aStop = trainTimeline[endIdx];

    let pathStops = trainTimeline.slice(startIdx, endIdx + 1).map((s) => s.station);
    pathStops = expandStationPath(pathStops);
    const seqResult = calculateSequenceDistance(pathStops);

    if (seqResult.totalRounded > 0) {
      return {
        calculatedKms: seqResult.totalRounded,
        status: "MATCHED",
        trainNo: searchTid,
        direction: bStop.dir,
        boardingStation: `${bStop.station} ${hasStartDn ? "Dn" : "Up"}`,
        boardingTime: bStop.timeStr,
        alightingStation: `${aStop.station} ${hasEndDn ? "Dn" : "Up"}`,
        alightingTime: aStop.timeStr,
        intermediateStations: pathStops,
        segments: seqResult.segments,
      };
    }
  }

  // 5. High-Precision Direct Chainage Fallback for Valid Running Train
  if (directKm > 0) {
    const finalKm = Math.round(directKm);
    return {
      calculatedKms: finalKm,
      status: "MATCHED",
      trainNo: searchTid,
      direction: hasStartDn || hasEndDn ? "DOWN" : "UP",
      boardingStation: takeoverLocation || normFromStn,
      boardingTime: depTimeStr || "N/A",
      alightingStation: handoverLocation || normToStn,
      alightingTime: arrTimeStr || "N/A",
      intermediateStations: [normFromStn, normToStn],
      segments: [
        {
          fromStationCode: normFromStn,
          toStationCode: normToStn,
          calculatedKms: finalKm,
        },
      ],
    };
  }

  return {
    calculatedKms: 0,
    status: "UNMATCHED WTT",
    trainNo: searchTid,
    direction: "UNKNOWN",
    boardingStation: "UNMATCHED",
    boardingTime: depTimeStr,
    alightingStation: "UNMATCHED",
    alightingTime: arrTimeStr,
    intermediateStations: [],
    segments: [],
  };
}

/**
 * Parses raw CSV or spreadsheet lines to Duty array with Leg 1-4 support.
 */
export function parseCSVToDuties(csvText) {
  if (!csvText) return [];

  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const matrix = lines.map((line) => {
    let delimiter = ",";
    if (line.includes("\t")) delimiter = "\t";
    else if (!line.includes(",") && line.includes(";")) delimiter = ";";

    return line.split(delimiter).map((v) => {
      let cleaned = String(v || "")
        .trim()
        .replace(/^["']|["']$/g, "");
      cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "").trim();
      return cleaned;
    });
  });

  const parsedDuties = [];

  const dutyKeywords = ["duty", "duty no", "duty_no", "duty#", "duty.", "link", "sl", "sl.no", "s.no", "shift", "duty id"];
  const sOnKeywords = ["sign on", "s/on", "s on", "s-on", "s.on", "son", "on time", "report time", "start time", "sign_on"];
  const sOnLocKeywords = ["sign on loc", "s/on loc", "s on loc", "on_location", "location", "sign_on_loc", "on loc", "s.on loc"];
  const sOffKeywords = ["sign off", "s/off", "s off", "s-off", "s.off", "soff", "off time", "end time", "sign_off"];
  const sOffLocKeywords = ["sign off loc", "s/off loc", "s off loc", "off_location", "sign_off_loc", "off loc", "s.off loc"];
  const trainKeywords = ["train", "tr.no", "tr no", "train no", "train_no", "train#", "tr", "t.no"];

  const matchesKeyword = (headerStr, keywords) => {
    if (!headerStr) return false;
    const h = String(headerStr).toLowerCase().trim();
    const hClean = h.replace(/[^a-z0-9]/g, "");
    for (const kw of keywords) {
      const k = kw.toLowerCase().trim();
      const kClean = k.replace(/[^a-z0-9]/g, "");
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
    row.forEach((cellVal) => {
      if (matchesKeyword(cellVal, dutyKeywords)) score += 3;
      if (matchesKeyword(cellVal, sOnKeywords)) score += 2;
      if (matchesKeyword(cellVal, sOffKeywords)) score += 2;
      if (matchesKeyword(cellVal, trainKeywords)) score += 2;
    });
    if (score > maxScore) {
      maxScore = score;
      bestHeaderIdx = r;
    }
  }

  const startRow = bestHeaderIdx !== -1 && maxScore > 0 ? bestHeaderIdx + 1 : 0;
  const headers = bestHeaderIdx !== -1 && maxScore > 0
    ? matrix[bestHeaderIdx].map((h) => String(h || "").toLowerCase().trim())
    : [];

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
  const kmsIdx = findColIndex(["kms", "distance", "km", "kilometer", "total km"]);

  let currentDutyObj = null;

  for (let r = startRow; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    let dutyNo = dutyNoIdx !== -1 ? row[dutyNoIdx] : "";
    if (!dutyNo) {
      for (let c = 0; c < Math.min(4, row.length); c++) {
        const val = String(row[c] || "").trim();
        const cleanVal = val.replace(/^duty\s*@?\s*/i, "").replace(/[^a-zA-Z0-9\s-]/g, "").trim();
        if (cleanVal && (/\d+/.test(cleanVal) || /^(pro|stby|r3|rd3|duty|sb)\d*/i.test(cleanVal))) {
          dutyNo = cleanVal;
          break;
        }
      }
    }

    const isSubRow = !dutyNo && currentDutyObj;
    if (!dutyNo && !isSubRow) continue;

    if (!isSubRow) {
      dutyNo = String(dutyNo).trim().replace(/^(duty\s*(no\.?|#|@)?)[\s:]*/i, "");
      if (
        !dutyNo ||
        dutyNo.toLowerCase().includes("total") ||
        dutyNo.toLowerCase().includes("prepared") ||
        dutyNo.toLowerCase().includes("metric") ||
        dutyNo.toLowerCase().includes("average") ||
        dutyNo.toLowerCase().includes("hrs") ||
        dutyNo.startsWith("~")
      ) {
        continue;
      }

      const sOnTimeCell = sOnTimeIdx !== -1 ? row[sOnTimeIdx] : "";
      const signOnLocCell = signOnLocIdx !== -1 ? row[signOnLocIdx] : "";
      const sOffTimeCell = sOffTimeIdx !== -1 ? row[sOffTimeIdx] : "";
      const signOffLocCell = signOffLocIdx !== -1 ? row[signOffLocIdx] : "";
      const kms = kmsIdx !== -1 ? parseFloat(row[kmsIdx]) || 0 : 0;

      const timeCells = [];
      const locationCells = [];
      const trainCells = [];

      row.forEach((cell) => {
        const val = String(cell || "").trim();
        if (!val) return;
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(val)) {
          timeCells.push(val);
        } else if (/(PYID|KGWA|PUTH|DEPOT|DEPO|DPO|DHO|NLC|APTS|RJNR|YPM|NGSA|BIET|RD3)/i.test(val)) {
          locationCells.push(val);
        } else if (/^(\d{3}|pro\s*\d*|rd3\s*stby|stby)$/i.test(val)) {
          trainCells.push(val);
        }
      });

      const sOnTime = sOnTimeCell || timeCells[0] || "06:00:00";
      const signOnLocation = signOnLocCell || locationCells[0] || "PYID";
      const sOffTime = sOffTimeCell || (timeCells.length > 1 ? timeCells[timeCells.length - 1] : "14:00:00");
      const signOffLocation = signOffLocCell || (locationCells.length > 1 ? locationCells[locationCells.length - 1] : "PYID");

      const trips = [];
      if (trainCells.length > 0 || timeCells.length >= 2) {
        const numTrips = Math.max(trainCells.length, Math.floor((timeCells.length - 2) / 2));
        for (let tIdx = 0; tIdx < Math.min(4, Math.max(1, numTrips)); tIdx++) {
          const trNo = trainCells[tIdx] || `Train ${tIdx + 1}`;
          const tFrm = timeCells[1 + tIdx * 2] || timeCells[0] || "06:00:00";
          const tTo = timeCells[2 + tIdx * 2] || timeCells[1] || "08:00:00";
          const tTake = locationCells[tIdx] || signOnLocation;
          const tHand = locationCells[tIdx + 1] || signOffLocation;

          trips.push({
            legNumber: tIdx + 1,
            trainNo: trNo,
            timeFrm: tFrm,
            timeTo: tTo,
            takeoverLocation: tTake,
            handoverLocation: tHand,
            isCounselling: false,
          });
        }
      }

      currentDutyObj = {
        dutyNo,
        sOnTime,
        signOnLocation,
        sOffTime,
        signOffLocation,
        kms,
        trips,
      };
      parsedDuties.push(currentDutyObj);
    }
  }

  return parsedDuties;
}

/**
 * Enhances roster duties by matching uploaded Link Roster day type and WTT trip schedules,
 * calculating leg-by-leg distance, and compiling final cumulative kilometer summaries.
 */
export function expandChangeoverPath(fromRaw, toRaw, targetKm) {
  const s1 = normalizeStationCode(fromRaw) || "PYID";
  const s2 = normalizeStationCode(toRaw) || "PYID";

  let keyStations = [s1, s2];
  if (targetKm >= 60) {
    if (s1 === s2) {
      keyStations = [s1, "APTS", s1];
    } else {
      keyStations = [s1, "BIET", "APTS", s2];
    }
  } else if (s1 === s2 && targetKm > 0) {
    keyStations = [s1, "KGWA", s1];
  }

  const pathList = expandStationPath(keyStations);
  return pathList.length > 0 ? pathList.join(" → ") : `${s1} → ${s2}`;
}

export function enhanceRosterDuties(duties, scheduleType = "WEEKDAY") {
  if (!duties || !Array.isArray(duties)) return [];

  const normScheduleType = String(scheduleType || "WEEKDAY").toUpperCase();

  return duties.map((duty) => {
    let totalDutyKms = 0;
    const dutyNoClean = String(duty.dutyNo || "").replace(/[^0-9]/g, "");

    const isSpecialType = (type) => {
      const t = String(type || "").toLowerCase();
      return t.includes("sby") || t.includes("standby") || t.includes("pro");
    };

    if (
      isSpecialType(duty.dutyType) &&
      (!duty.trips ||
        duty.trips.length === 0 ||
        duty.trips.every((t) => String(t.trainNo || "").toLowerCase().includes("stby") || String(t.trainNo || "").toLowerCase().includes("pro")))
    ) {
      return {
        ...duty,
        kms: 0,
      };
    }

    // Check Changeover Table for Night Duties (e.g. 48-62 on Sunday, 64-77 on Weekday/Saturday)
    const tableKey = normScheduleType === "SUNDAY" ? "SUNDAY__MONDAY" : normScheduleType === "SATURDAY" ? "SATURDAY__SUNDAY" : "WEEKDAY__SATURDAY";
    const changeoverMatch = CHANGEOVER_TABLE[tableKey]?.[dutyNoClean] || CHANGEOVER_TABLE["SUNDAY__MONDAY"]?.[dutyNoClean];

    const isNightDutyNo = (normScheduleType === "SUNDAY" && Number(dutyNoClean) >= 48 && Number(dutyNoClean) <= 62) || (Number(dutyNoClean) >= 64 && Number(dutyNoClean) <= 77);

    if (changeoverMatch && isNightDutyNo) {
      const co = changeoverMatch;
      const coTrips = [];

      // Night Leg 1
      if (co.nightKms > 0 || co.nightTrainNo) {
        coTrips.push({
          legNumber: 1,
          trainNo: co.nightTrainNo || "Night Run",
          timeFrm: co.nightDepTime || "21:30:00",
          timeTo: co.nightArrTime || "00:00:00",
          takeoverLocation: co.signOnLocation || "PYID",
          handoverLocation: co.nightHandoverLoc || "PYID",
          calculatedKms: co.nightKms || 0,
          customPathStr: expandChangeoverPath(co.signOnLocation, co.nightHandoverLoc, co.nightKms),
          status: "VALIDATED",
        });
      }

      // Pilot Leg 2 if pilot movement exists
      if (co.pilotKms > 0) {
        coTrips.push({
          legNumber: coTrips.length + 1,
          trainNo: "PILOT",
          timeFrm: "--",
          timeTo: "--",
          takeoverLocation: co.takeoverLocation || co.nightHandoverLoc || "PILOT",
          handoverLocation: co.takeoverLocation || co.nightHandoverLoc || "PILOT",
          calculatedKms: co.pilotKms,
          customPathStr: expandChangeoverPath(co.takeoverLocation || co.nightHandoverLoc, "PYID", co.pilotKms),
          status: "VALIDATED",
        });
      }

      // Morning Leg 3
      if (co.mornKms > 0 || (co.mornTrainNo && co.mornTrainNo !== "--")) {
        coTrips.push({
          legNumber: coTrips.length + 1,
          trainNo: co.mornTrainNo || "Morn Run",
          timeFrm: co.mornDepTime || "06:00:00",
          timeTo: co.mornArrTime || "07:30:00",
          takeoverLocation: co.takeoverLocation || "PYID",
          handoverLocation: co.mornHandoverLoc || "PYID",
          calculatedKms: co.mornKms || 0,
          customPathStr: expandChangeoverPath(co.takeoverLocation, co.mornHandoverLoc, co.mornKms),
          status: "VALIDATED",
        });
      }

      const finalTotalKms = co.totalKms || (co.nightKms + (co.pilotKms || 0) + (co.mornKms || 0));

      return {
        ...duty,
        kms: finalTotalKms,
        trips: coTrips,
        sOnTime: co.signOnTime || duty.sOnTime,
        signOnLocation: co.signOnLocation || duty.signOnLocation,
        sOffTime: co.signOffTime || duty.sOffTime,
        signOffLocation: co.signOffLocation || duty.signOffLocation,
        drivingHrs: co.drivingHrs || duty.drivingHrs,
        isNight: true,
        validationResult: "VALIDATED",
      };
    }

    const updatedTrips = (duty.trips || []).map((trip, idx) => {
      const trainNoClean = String(trip.trainNo || "").toLowerCase();

      const isCounselling =
        trainNoClean.includes("couns") ||
        trainNoClean.includes("counseling") ||
        trip.counsellingTime ||
        trip.isCounselling;

      if (isCounselling) {
        return {
          ...trip,
          legNumber: trip.legNumber || idx + 1,
          calculatedKms: 0,
          segments: [],
          isCounselling: true,
        };
      }

      const takeNorm = normalizeStationCode(trip.takeoverLocation);
      const handNorm = normalizeStationCode(trip.handoverLocation);
      if (takeNorm === "DEPOT" && handNorm === "DEPOT") {
        return {
          ...trip,
          legNumber: trip.legNumber || idx + 1,
          calculatedKms: 0,
          segments: [],
        };
      }

      const wttResult = calculateLegKmsFromWTT(
        trip.trainNo,
        trip.takeoverLocation,
        trip.handoverLocation,
        trip.timeFrm,
        trip.timeTo,
        normScheduleType,
        Boolean(trip.isShortLoop || trip.isUnderlined),
        Boolean(trip.isStartDnLine || trip.isFrmTimeBold),
        Boolean(trip.isEndDnLine || trip.isToTimeBold),
      );

      const legKms = wttResult.calculatedKms || 0;
      totalDutyKms += legKms;

      return {
        ...trip,
        legNumber: trip.legNumber || idx + 1,
        calculatedKms: legKms,
        status: wttResult.status || "UNMATCHED WTT",
        direction: wttResult.direction || "N/A",
        boardingStation: wttResult.boardingStation || trip.takeoverLocation || "N/A",
        boardingTime: wttResult.boardingTime || trip.timeFrm || "N/A",
        alightingStation: wttResult.alightingStation || trip.handoverLocation || "N/A",
        alightingTime: wttResult.alightingTime || trip.timeTo || "N/A",
        intermediateStations: wttResult.intermediateStations || [],
        segments: wttResult.segments || [],
        wttTripId: wttResult.wttTripId || null,
        isShortLoop: trip.isShortLoop || false,
        isDnLine: trip.isDnLine || false,
      };
    });

    const hasUnmatched = updatedTrips.some((t) => t.status === "UNMATCHED WTT");
    const hasMatched = updatedTrips.some((t) => t.status === "MATCHED");
    const validationResult = hasUnmatched
      ? "MANUAL REVIEW"
      : hasMatched
      ? "VALIDATED"
      : "NON RUNNING";

    return {
      ...duty,
      kms: totalDutyKms,
      trips: updatedTrips,
      validationResult,
    };
  });
}

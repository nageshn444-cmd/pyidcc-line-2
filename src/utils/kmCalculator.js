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
import { CHANGEOVER_TABLE, isPdcTrip } from "../services/changeoverService.js";

/**
 * Normalizes any station code, name, sub-location or alias to canonical MASTER_STATIONS code.
 */
export function normalizeStationCode(rawCode) {
  if (!rawCode) return "";

  let c = String(rawCode)
    .trim()
    .toUpperCase()
    .replace(/[\s_]/g, "");

  // Strip UP/DN boarding direction suffix for normalization
  // e.g. "PYID UP" → "PYID", "PUTH DN" → "PUTH", "KGWA UP" → "KGWA"
  // But keep PYID_UP / PYID_DN as-is for distance special cases (handled in calculateDistance)
  const upDnStripped = c.replace(/(?:UP|DN|PF|PLT|PLATFORM)$/, "").trim();

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
  // NPKT / NGSA PKT / NGSAPKT → NGSA_PT (pocket track)
  if (c === "NGSAPT" || c === "NGSAPKT" || c === "NPKT" || c === "NGSAPOCKET" ||
      c.includes("NGSAPT") || c.includes("NGSAPOCKET") || c.includes("NPKT")) return "NGSA_PT";
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
  // JLHL and JDHL are the same station (Jalahalli)
  if (c.includes("JINDAL") || c.includes("JIDL") || upDnStripped === "JDHL") return "JDHL";
  if (c.includes("JALAHALLI") || c === "JLHL" || upDnStripped === "JLHL") return "JLHL";
  if (c.includes("MANJUNATHA")) return "MNJN";
  if (c.includes("NAGASANDRA") || c === "NGSA" || upDnStripped === "NGSA") return "NGSA";
  if (c.includes("DASARAHALLI") || c === "DSH" || upDnStripped === "DSH") return "DSH";
  if (c.includes("PEENYA") && !c.includes("INDUSTRY") && c !== "PYID" && upDnStripped !== "PYID") return "PEYA";
  if (c.includes("PEENYA") || c.includes("PYID") || upDnStripped === "PYID") return "PYID";
  if (c.includes("GORAGUNTE") || c === "YPI" || upDnStripped === "YPI") return "YPI";
  if (c.includes("YESHWANT") || c.includes("YPM") || upDnStripped === "YPM") return "YPM";
  if (c.includes("SANDAL") || c === "SSFY" || upDnStripped === "SSFY") return "SSFY";
  if (c.includes("MAHALAKSHMI") || c === "MHLI" || upDnStripped === "MHLI") return "MHLI";
  if (c.includes("RAJAJINAGAR") || c === "RJNR" || upDnStripped === "RJNR") return "RJNR";
  if (c.includes("KUVEMPU") || c === "KVPR" || upDnStripped === "KVPR") return "KVPR";
  if (c.includes("SRIRAMPURA") || c === "SPRU" || upDnStripped === "SPRU") return "SPRU";
  if (c.includes("SAMPIGE") || c.includes("SPGD") || c.includes("MANTRI")) return "SPGD";
  if (c.includes("KEMPEGOWDA") || c.includes("KGWA") || c.includes("MAJESTIC") || c === "MJST" || upDnStripped === "KGWA") return "KGWA";
  if (c.includes("CHIKKAPETE") || c === "CKPE" || upDnStripped === "CKPE") return "CKPE";
  if (c.includes("MARKET") || c === "KRMT" || upDnStripped === "KRMT") return "KRMT";
  if (c.includes("NATIONAL") || c.includes("NLC") || upDnStripped === "NLC") return "NLC";
  if (c.includes("LALBAGH") || c === "LBGH" || upDnStripped === "LBGH") return "LBGH";
  if (c.includes("SOUTHEND") || c === "SECE" || upDnStripped === "SECE") return "SECE";
  if (c.includes("JAYANAGAR") || c === "JYN" || upDnStripped === "JYN") return "JYN";
  if (c.includes("RVROAD") || c.includes("RVR") || c.includes("R.V.ROAD") || upDnStripped === "RVR") return "RVR";
  if (c.includes("BANASHANKARI") || c === "BSNK" || upDnStripped === "BSNK") return "BSNK";
  if (c.includes("JPNAGAR") || c === "JPN" || upDnStripped === "JPN") return "JPN";
  if (c.includes("YELACHENAHALLI") || c.includes("PUTH") || c.includes("PUTHANTENAHALLI") || upDnStripped === "PUTH") return "PUTH";
  if (c.includes("KONANAKUNTE") || c === "APRC" || upDnStripped === "APRC") return "APRC";
  if (c.includes("DODDAKALSANDRA") || c === "KLPK" || upDnStripped === "KLPK") return "KLPK";
  if (c.includes("VAJARAHALLI") || c === "VJRH" || upDnStripped === "VJRH") return "VJRH";
  if (c.includes("TALAGHATTAPURA") || c === "TGTP" || upDnStripped === "TGTP") return "TGTP";
  if (c.includes("ANJANAPURA") || c.includes("APTS") || c.includes("SILK") || upDnStripped === "APTS") return "APTS";

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
  // NTEST = same as PRO/PROTECTION (no km, no driving hours)
  // TGTP, STBK, COUNSELLING, RD3 STBY = non-running
  const isStandby =
    trainLower.includes("stby") ||
    trainLower.includes("standby") ||
    trainLower.includes("pro") ||
    trainLower.includes("ntest") ||
    trainLower.includes("protection") ||
    takeLower.includes("rd3 stby") ||
    takeLower.includes("rd3-stby") ||
    takeLower.includes("rd-3 stby") ||
    takeLower.includes("ntest") ||
    takeLower.includes("stbk") ||
    takeLower.includes("tgtp");

  const nonRunningKeywords = [
    "couns", "counseling", "tgtp", "break", "rest", "lunch", "training",
    "medical", "class", "spare", "reserve", "resv", "sign on", "sign off",
    "pilot", "unknown", "wo", "cl", "el", "nr", "ab", "stbk", "crt", "bo",
    "pme", "or", "rel", "hpl", "pl", "ml", "ms", "--", "-",
    "ntest", "n test", "protection"
  ];

  const isPdc = isPdcTrip(rawTrain) || isPdcTrip(takeoverLocation) || isPdcTrip(handoverLocation);

  const isNonRunning =
    !searchTid ||
    isPdc ||
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

  // ── SPECIAL HANDLING: BDHO (B DHO) & PDHO (P DHO) ──────────────────────
  //
  // B DHO (Bt DHO): After the operator's LAST regular trip, the train is
  //   handed over to depot via BIET station. The operator drives FROM their
  //   current position (takeoverLocation) TO BIET_BE (depot entry via BIET).
  //
  //   AWP (Automatic Work Path) for PYID boarding:
  //     PYID UP → BIET_BE (6.54 km) → PYID DN (6.54 km) → DEPOT (1.30 km)
  //     = 14.38 km ≈ 14 km  [per PREDEFINED_TRIPS "PYID Up - Bt DHO (AWP)"]
  //   For other boarding stations: direct chainage boarding_loc → BIET_BE
  //
  const normFromStn = normalizeStationCode(takeoverLocation);
  const normToStn = normalizeStationCode(handoverLocation);
  let directKm = 0;
  if (normFromStn && normToStn && normFromStn !== normToStn) {
    directKm = calculateDistance(normFromStn, normToStn);
  }

  // 1. Search WTT for Train ID + Schedule Type FIRST if departure and arrival times are valid
  const normSchedule = String(scheduleType || "WEEKDAY").toUpperCase();
  const depSecs = timeStringToSeconds(depTimeStr);
  let arrSecs = timeStringToSeconds(arrTimeStr);
  const isOvernight = depSecs > 0 && arrSecs > 0 && arrSecs < depSecs;
  if (isOvernight) {
    arrSecs += 86400; // Overnight shift crossover (e.g. 21:32:00 to 00:15:00 next day)
  }

  if (searchTid && depSecs > 0 && arrSecs > 0) {
    let wttRows = (WTT_MASTER_REGISTRY || []).filter((row) => {
      const rowSched = String(row.scheduleType || "WEEKDAY").toUpperCase();
      const rowTid = String(row.trainId || row.upTid || row.dnTid || "")
        .replace(/\D/g, "").trim();
      return rowSched === normSchedule && (rowTid === searchTid || rowTid.endsWith(searchTid));
    });

    if (wttRows.length === 0) {
      wttRows = (WTT_MASTER_REGISTRY || []).filter((row) => {
        const rowTid = String(row.trainId || row.upTid || row.dnTid || "")
          .replace(/\D/g, "").trim();
        return rowTid === searchTid || rowTid.endsWith(searchTid);
      });
    }

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
              if (secs >= depSecs - 1800 && secs <= arrSecs + 1800) {
                trainTimeline.push({
                  station: normalizeStationCode(stCode),
                  timeStr: String(timeVal).trim(),
                  secs: secs,
                  tripId: trip.id,
                  dir: tripKey === "upTrip" ? "UP" : "DOWN",
                });
              }
              if (isOvernight && (secs + 86400) >= depSecs - 1800 && (secs + 86400) <= arrSecs + 1800) {
                trainTimeline.push({
                  station: normalizeStationCode(stCode),
                  timeStr: String(timeVal).trim(),
                  secs: secs + 86400,
                  tripId: trip.id,
                  dir: tripKey === "upTrip" ? "UP" : "DOWN",
                });
              }
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
      let finalKms = seqResult.totalRounded || 0;

      if (finalKms > 85) {
        const directDist = calculateDistance(bStop.station, aStop.station);
        finalKms = (typeof directDist === "number" && directDist > 0) ? Math.round(directDist) : 35;
      }

      if (finalKms > 0) {
        return {
          calculatedKms: finalKms,
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
  }

  // 2. SPECIAL HANDOVER OVERRIDES & DEPOT SHUNTS (Fallback when WTT search is not matched)
  const rawTrainUpper = rawTrain.toUpperCase();
  const isBDHO = rawTrainUpper.includes("BDHO") || rawTrainUpper.includes("B DHO") ||
                  rawTrainUpper.includes("BT DHO") || rawTrainUpper.includes("BTDHO") ||
                  takeLower.includes("bdho") || handLower.includes("bdho") ||
                  takeLower.includes("b dho") || handLower.includes("b dho");
  const isPDHO = rawTrainUpper.includes("PDHO") || rawTrainUpper.includes("P DHO") ||
                  takeLower.includes("pdho") || handLower.includes("pdho") ||
                  takeLower.includes("p dho") || handLower.includes("p dho");

  if (isBDHO) {
    const fromNorm = normalizeStationCode(takeoverLocation) || "PYID";
    const BDHO_AWP_KM = {
      "PYID": 14, "PEYA": 13, "JLHL": 10, "NGSA": 7, "DSH": 9,
      "KGWA": 17, "PUTH": 27, "APTS": 34, "NLC": 19, "RJNR": 13,
      "YPM": 10, "SPGD": 16,
    };
    const finalKm = BDHO_AWP_KM[fromNorm] !== undefined
      ? BDHO_AWP_KM[fromNorm]
      : Math.round(calculateDistance(fromNorm, "BIET_BE")) || 7;

    return {
      calculatedKms: finalKm,
      status: "MATCHED",
      trainNo: searchTid || rawTrain,
      direction: "UP",
      boardingStation: takeoverLocation || fromNorm,
      boardingTime: depTimeStr || "N/A",
      alightingStation: "BIET_BE (Depot via BIET)",
      alightingTime: arrTimeStr || "N/A",
      intermediateStations: [fromNorm, "BIET", "BIET_BE"],
      segments: [{ fromStationCode: fromNorm, toStationCode: "BIET_BE", calculatedKms: finalKm }],
      notes: `B DHO (AWP): ${fromNorm} → BIET_BE (Depot) = ${finalKm} km`,
    };
  }

  if (isPDHO) {
    const fromNorm = normalizeStationCode(takeoverLocation) || "PYID";
    const PDHO_FIXED_KM = 2;
    return {
      calculatedKms: PDHO_FIXED_KM,
      status: "MATCHED",
      trainNo: searchTid || rawTrain,
      direction: "DN",
      boardingStation: takeoverLocation || fromNorm,
      boardingTime: depTimeStr || "N/A",
      alightingStation: "DEPOT (via PYID Rd3)",
      alightingTime: arrTimeStr || "N/A",
      intermediateStations: [fromNorm, "PYID", "DEPOT"],
      segments: [{ fromStationCode: fromNorm, toStationCode: "DEPOT", calculatedKms: PDHO_FIXED_KM }],
      notes: "P DHO: Depot handover via PYID Rd3 = 2 km (fixed)",
    };
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
    let tableKey = "WEEKDAY__SATURDAY";
    if (normScheduleType === "SUNDAY") tableKey = "SUNDAY__MONDAY";
    else if (normScheduleType === "SATURDAY") tableKey = "SATURDAY__SUNDAY";
    else if (normScheduleType === "MONDAY") tableKey = "SUNDAY__MONDAY";
    else if (normScheduleType === "GH" || normScheduleType === "MONDAY_GH") tableKey = "SUNDAY__MONDAY_GH";

    const changeoverMatch =
      CHANGEOVER_TABLE[tableKey]?.[dutyNoClean] ||
      CHANGEOVER_TABLE["WEEKDAY__SATURDAY"]?.[dutyNoClean] ||
      CHANGEOVER_TABLE["SUNDAY__MONDAY"]?.[dutyNoClean];

    const isNightDutyNo =
      (normScheduleType === "SUNDAY" && Number(dutyNoClean) >= 48 && Number(dutyNoClean) <= 62) ||
      (Number(dutyNoClean) >= 64 && Number(dutyNoClean) <= 77);

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
      const isMornPdc = isPdcTrip(co.mornTrainNo) || isPdcTrip(co.takeoverLocation);
      const mornKmsVal = isMornPdc ? 0 : (co.mornKms || 0);

      if (mornKmsVal > 0 || (co.mornTrainNo && co.mornTrainNo !== "--")) {
        coTrips.push({
          legNumber: coTrips.length + 1,
          trainNo: co.mornTrainNo || "Morn Run",
          timeFrm: co.mornDepTime || "06:00:00",
          timeTo: co.mornArrTime || "07:30:00",
          takeoverLocation: co.takeoverLocation || "PYID",
          handoverLocation: co.mornHandoverLoc || "PYID",
          calculatedKms: mornKmsVal,
          customPathStr: expandChangeoverPath(co.takeoverLocation, co.mornHandoverLoc, mornKmsVal),
          status: "VALIDATED",
        });
      }

      const computedLegs = computeDutyLegKms({ ...duty, ...co }, normScheduleType);
      const finalTotalKms = co.totalKms || computedLegs.totalKm || (co.nightKms + (co.pilotKms || 0) + mornKmsVal);

      return {
        ...duty,
        kms: finalTotalKms,
        totalKm: finalTotalKms,
        totalKms: finalTotalKms,
        nightKms: co.nightKms || 0,
        mornKms: mornKmsVal,
        leg1Km: computedLegs.leg1Km || co.nightKms || 0,
        leg2Km: computedLegs.leg2Km || co.pilotKms || 0,
        leg3Km: computedLegs.leg3Km || mornKmsVal,
        leg4Km: computedLegs.leg4Km || 0,
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
      const tripTrainLower = String(trip.trainNo || "").toLowerCase();

      // Non-running activities — NTEST / PRO / PROTECTION / STBY / TGTP / STBK / COUNSELLING / PDC
      const isNonRunningActivity =
        tripTrainLower.includes("ntest") ||
        tripTrainLower.includes("n test") ||
        tripTrainLower.includes("protection") ||
        tripTrainLower.includes("couns") ||
        tripTrainLower.includes("tgtp") ||
        tripTrainLower.includes("stbk") ||
        tripTrainLower.includes("stby") ||
        isPdcTrip(trip.trainNo) ||
        isPdcTrip(trip.takeoverLocation) ||
        tripTrainLower === "pro" ||
        tripTrainLower === "--" ||
        tripTrainLower === "-";

      if (isNonRunningActivity) {
        return {
          ...trip,
          legNumber: trip.legNumber || idx + 1,
          calculatedKms: 0,
          segments: [],
          status: "NON RUNNING",
          notes: "Non-running: NTEST/PRO/STBY/TGTP/STBK/Counselling/PDC — no km or driving hours",
        };
      }

      // True depot-to-depot yard movement with no real running train — 0 km
      const hasRealTrainNo = /^\d+$/.test(String(trip.trainNo || "").replace(/[^0-9]/g, "")) &&
        !tripTrainLower.includes("stby") &&
        !tripTrainLower.includes("pro") &&
        !tripTrainLower.includes("ntest") &&
        !tripTrainLower.includes("pdc");

      if (takeNorm === "DEPOT" && handNorm === "DEPOT" && !hasRealTrainNo) {
        return {
          ...trip,
          legNumber: trip.legNumber || idx + 1,
          calculatedKms: 0,
          segments: [],
          status: "NON RUNNING",
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

    const computedLegs = computeDutyLegKms(duty, normScheduleType);
    const finalKms = computedLegs.totalKm > 0 ? computedLegs.totalKm : totalDutyKms;

    return {
      ...duty,
      kms: finalKms,
      totalKm: finalKms,
      totalKms: finalKms,
      leg1Km: computedLegs.leg1Km,
      leg2Km: computedLegs.leg2Km,
      leg3Km: computedLegs.leg3Km,
      leg4Km: computedLegs.leg4Km,
      trips: updatedTrips,
      validationResult,
    };
  });
}

/**
 * Calculates kilometers for each leg (Leg 1, Leg 2, Leg 3, Leg 4) and total kilometers
 * for a Link Roster duty object using BMRCL Green Line Dual Parallel Tracks chainage engine.
 */
export function computeDutyLegKms(duty, scheduleType = 'WEEKDAY') {
  if (!duty) return { leg1Km: 0, leg2Km: 0, leg3Km: 0, leg4Km: 0, totalKm: 0 };

  const normSchedule = String(scheduleType || 'WEEKDAY').toUpperCase();
  const dutyNoClean = String(duty.dutyNo || duty.dutyId || duty.dutyType || '').replace(/\D/g, '');

  const isNightDutyNo =
    (normSchedule === "SUNDAY" && Number(dutyNoClean) >= 48 && Number(dutyNoClean) <= 62) ||
    (Number(dutyNoClean) >= 64 && Number(dutyNoClean) <= 77);

  if (dutyNoClean && isNightDutyNo) {
    let tableKey = "WEEKDAY__SATURDAY";
    if (normSchedule === "SUNDAY") tableKey = "SUNDAY__MONDAY";
    else if (normSchedule === "SATURDAY") tableKey = "SATURDAY__SUNDAY";
    else if (normSchedule === "MONDAY") tableKey = "SUNDAY__MONDAY";
    else if (normSchedule === "GH" || normSchedule === "MONDAY_GH") tableKey = "SUNDAY__MONDAY_GH";

    const coMatch = CHANGEOVER_TABLE[tableKey]?.[dutyNoClean] ||
                    CHANGEOVER_TABLE["SUNDAY__MONDAY"]?.[dutyNoClean] ||
                    CHANGEOVER_TABLE["WEEKDAY__SATURDAY"]?.[dutyNoClean];

    if (coMatch) {
      const isMornPdc = isPdcTrip(coMatch.mornTrainNo) || isPdcTrip(coMatch.takeoverLocation);
      const mornKmsVal = isMornPdc ? 0 : (coMatch.mornKms || 0);
      const nightKmVal = coMatch.nightKms || 0;
      const pilotKmVal = coMatch.pilotKms || 0;
      const totalKmsVal = coMatch.totalKms || (nightKmVal + pilotKmVal + mornKmsVal);

      return {
        leg1Km: nightKmVal,
        leg2Km: pilotKmVal,
        leg3Km: mornKmsVal,
        leg4Km: 0,
        totalKm: totalKmsVal
      };
    }
  }

  const getLegKm = (trainNo, fromLoc, toLoc, depTime, arrTime) => {
    const rawTrain = String(trainNo || "").trim();
    const trainLower = rawTrain.toLowerCase();
    const fromLower = String(fromLoc || "").trim().toLowerCase();
    const toLower = String(toLoc || "").trim().toLowerCase();

    // 1. NON-RUNNING EXCLUSIONS (return 0 KM)
    // Non-running: counselling, counseling, reserv, resv, ntest, n test, rd3 stby, rd3-stby, pro, protection, standby, stby, spare, reserve
    const nonRunningKeywords = [
      "couns", "counseling", "reserv", "resv", "ntest", "n test",
      "rd3 stby", "rd3-stby", "rd-3 stby", "pro", "protection",
      "standby", "stby", "spare", "reserve", "training", "medical", "class"
    ];

    const isPdc = isPdcTrip(rawTrain) || isPdcTrip(fromLoc) || isPdcTrip(toLoc);

    const isNonRunning = isPdc || nonRunningKeywords.some(
      (kw) => trainLower.includes(kw) || fromLower.includes(kw) || toLower.includes(kw)
    );

    if (isNonRunning || trainLower === "--" || trainLower === "-" || (!rawTrain && !depTime && !arrTime)) {
      return 0;
    }

    // 2. SPECIAL HANDOVER OVERRIDES
    // BDHO (train handed over to depot from BIET-JLHL-depot after completion of all trips) = 6 km
    if (fromLower.includes("bdho") || toLower.includes("bdho")) return 6;
    // PDHO (train handed over to depot from PYID UP-depot after completion of all trips) = 2 km
    if (fromLower.includes("pdho") || toLower.includes("pdho")) return 2;
    // DEPOT-RD3 / DPO-RD3 = 2 km (only for pure depot positioning, NOT for active driving runs like Dpo-Rd3/No PDC)
    const isNoPdcLocation = fromLower.includes("no pdc") || fromLower.includes("nopdc") || fromLower.includes("no-pdc") || fromLower.includes("no_pdc") ||
                            toLower.includes("no pdc") || toLower.includes("nopdc") || toLower.includes("no-pdc") || toLower.includes("no_pdc");

    if (!isNoPdcLocation && (fromLower.includes("dpo-rd3") || toLower.includes("dpo-rd3") || fromLower.includes("depot-rd3") || toLower.includes("depot-rd3"))) return 2;

    // 3. WTT TIMETABLE SEARCH
    const wttRes = calculateLegKmsFromWTT(rawTrain, fromLoc, toLoc, depTime, arrTime, normSchedule);
    if (wttRes && typeof wttRes.calculatedKms === "number" && wttRes.calculatedKms > 0) {
      return Number(wttRes.calculatedKms.toFixed(2));
    }

    // 4. CHAINAGE DISTANCE FALLBACK IF LOCATIONS VALID
    if (fromLoc && fromLoc !== "--" && toLoc && toLoc !== "--") {
      const distRes = calculateDistance(fromLoc, toLoc);
      if (typeof distRes === "number" && distRes > 0) {
        return Number(distRes.toFixed(2));
      }
      if (distRes && typeof distRes.calculatedKms === "number" && distRes.calculatedKms > 0) {
        return Number(distRes.calculatedKms.toFixed(2));
      }
    }

    return 0;
  };

  const parseStoredKm = (val) => {
    if (typeof val === 'number' && val > 0) return val;
    if (typeof val === 'string' && val.trim() !== '' && val.trim() !== '--') {
      const n = parseFloat(val.replace(/[^0-9.]/g, ''));
      if (!isNaN(n) && n > 0) return n;
    }
    return 0;
  };

  const cleanLoc = (loc) => {
    if (!loc) return '';
    const s = String(loc).trim();
    return (s === '--' || s === '-') ? '' : s;
  };

  const trips = Array.isArray(duty.trips) ? duty.trips : [];
  const rawL = duty.rawLegs || {};

  // Leg 1
  const t1 = trips[0] || {};
  const l1Train = t1.trainNo || t1.train || duty.trainId || duty.leg1TrainNo || duty.leg1Train || duty.l1Train || rawL.l1Train;
  const l1From = cleanLoc(t1.takeoverLocation || t1.fromLoc || t1.from || duty.signOnLocation || duty.leg1DepLoc || duty.leg1BoardLoc);
  const l1To = cleanLoc(t1.handoverLocation || t1.toLoc || t1.to || duty.leg1HandoverLoc || duty.leg1ArrLoc || duty.leg1DeboardLoc);
  const l1DepTime = t1.timeFrm || t1.depTime || duty.leg1TimeFrom || duty.signOnTime || duty.l1Start || rawL.l1Start;
  const l1ArrTime = t1.timeTo || t1.arrTime || duty.leg1TimeTo || duty.leg1ArrTime || duty.l1End || rawL.l1End;

  const stored1 = parseStoredKm(t1.calculatedKms || t1.legKm || duty.leg1Km || duty.nightKms);
  const calc1 = getLegKm(l1Train, l1From, l1To, l1DepTime, l1ArrTime);

  // Leg 2
  const t2 = trips[1] || {};
  const l2Train = t2.trainNo || t2.train || duty.leg2TrainNo || duty.leg2Train || duty.l2Train || duty.trainNo2 || duty.train2 || rawL.l2Train;
  const l2From = cleanLoc(t2.takeoverLocation || t2.fromLoc || t2.from || duty.leg2DepLoc || duty.leg2BoardLoc || duty.leg2FromLoc || duty.l2DepLoc || duty.l2From) || l1To;
  const l2To = cleanLoc(t2.handoverLocation || t2.toLoc || t2.to || duty.leg2ArrLoc || duty.leg2DeboardLoc || duty.leg2ToLoc || duty.leg2HandoverLoc || duty.l2ArrLoc || duty.l2To);
  const l2DepTime = t2.timeFrm || t2.depTime || duty.leg2DepTime || duty.leg2TimeFrom || duty.leg2BoardTime || duty.l2Start || rawL.l2Start;
  const l2ArrTime = t2.timeTo || t2.arrTime || duty.leg2ArrTime || duty.leg2TimeTo || duty.leg2DeboardTime || duty.l2End || rawL.l2End;

  const stored2 = parseStoredKm(t2.calculatedKms || t2.legKm || duty.leg2Km);
  const calc2 = getLegKm(l2Train, l2From, l2To, l2DepTime, l2ArrTime);

  // Leg 3
  const t3 = trips[2] || {};
  const l3Train = t3.trainNo || t3.train || duty.leg3TrainNo || duty.leg3Train || duty.l3Train || duty.trainNo3 || duty.train3 || rawL.l3Train;
  const l3From = cleanLoc(t3.takeoverLocation || t3.fromLoc || t3.from || duty.leg3DepLoc || duty.leg3BoardLoc || duty.leg3FromLoc || duty.l3DepLoc || duty.l3From) || l2To || l1To;
  const l3To = cleanLoc(t3.handoverLocation || t3.toLoc || t3.to || duty.leg3ArrLoc || duty.leg3DeboardLoc || duty.leg3ToLoc || duty.leg3HandoverLoc || duty.l3ArrLoc || duty.l3To);
  const l3DepTime = t3.timeFrm || t3.depTime || duty.leg3DepTime || duty.leg3TimeFrom || duty.leg3BoardTime || duty.l3Start || rawL.l3Start;
  const l3ArrTime = t3.timeTo || t3.arrTime || duty.leg3ArrTime || duty.leg3TimeTo || duty.leg3DeboardTime || duty.l3End || rawL.l3End;

  const stored3 = parseStoredKm(t3.calculatedKms || t3.legKm || duty.leg3Km || duty.mornKms);
  const calc3 = getLegKm(l3Train, l3From, l3To, l3DepTime, l3ArrTime);

  // Leg 4
  const t4 = trips[3] || {};
  const l4Train = t4.trainNo || t4.train || duty.leg4TrainNo || duty.leg4Train || duty.l4Train || duty.trainNo4 || duty.train4 || rawL.l4Train;
  const l4From = cleanLoc(t4.takeoverLocation || t4.fromLoc || t4.from || duty.leg4FinalDepLoc || duty.leg4DepLoc || duty.leg4BoardLoc || duty.leg4FromLoc || duty.l4DepLoc || duty.l4From) || l3To || l2To || l1To;
  const l4To = cleanLoc(t4.handoverLocation || t4.toLoc || t4.to || duty.leg4FinalArrLoc || duty.leg4ArrLoc || duty.leg4DeboardLoc || duty.leg4ToLoc || duty.leg4HandoverLoc || duty.l4ArrLoc || duty.l4To);
  const l4DepTime = t4.timeFrm || t4.depTime || duty.leg4FinalDepTime || duty.leg4DepTime || duty.leg4TimeFrom || duty.leg4BoardTime || duty.l4Start || rawL.l4Start;
  const l4ArrTime = t4.timeTo || t4.arrTime || duty.leg4FinalArrTime || duty.leg4ArrTime || duty.leg4TimeTo || duty.leg4DeboardTime || duty.l4End || rawL.l4End;

  const stored4 = parseStoredKm(t4.calculatedKms || t4.legKm || duty.leg4Km);
  const calc4 = getLegKm(l4Train, l4From, l4To, l4DepTime, l4ArrTime);

  const nightKms = parseStoredKm(duty.nightKms);
  const mornKms = parseStoredKm(duty.mornKms);
  const storedTotal = parseStoredKm(duty.totalKm || duty.kms || duty.totalKms);
  const officialTotal = parseStoredKm(duty.kms || duty.totalKms || duty.totalKm);

  let leg1Km = calc1 > 0 ? calc1 : stored1;
  let leg2Km = calc2 > 0 ? calc2 : stored2;
  let leg3Km = calc3 > 0 ? calc3 : stored3;
  let leg4Km = calc4 > 0 ? calc4 : stored4;

  if (nightKms > 0) leg1Km = nightKms;
  if (mornKms > 0) {
    if (leg2Km > 0 && leg3Km === 0) leg2Km = mornKms;
    else leg3Km = mornKms;
  }

  const calculatedTotal = Number((leg1Km + leg2Km + leg3Km + leg4Km).toFixed(2));
  const totalKm = calculatedTotal > 0 ? calculatedTotal : (officialTotal > 0 ? officialTotal : storedTotal);

  return { leg1Km, leg2Km, leg3Km, leg4Km, totalKm };
}


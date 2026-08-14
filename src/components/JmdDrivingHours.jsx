import { collection, doc, onSnapshot } from "firebase/firestore";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Cpu,
  Download,
  Eye,
  Plus,
  Radio,
  Save,
  Search,
  ShieldCheck,
  Tag,
  Zap,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import { useAuth } from "../context/AuthContext";
import { useOperationalEngine } from "../context/OperationalEngine";
import { PRELOADED_DUTIES } from "../data/kmcalc/preloadedDuties";
import { db } from "../firebase";
import { CHANGEOVER_TABLE } from "../services/changeoverService";
import { calculateDistance, calculateLegKmsFromWTT, computeDutyLegKms, normalizeStationCode } from "../utils/kmCalculator";
import { WTT_MASTER_REGISTRY } from "../data/wttMasterRegistry";
import { secondsToHHMMSS, timeToSeconds } from "../utils/timeHelpers";
import MultiDayKMCalculator from "./MultiDayKMCalculator";
import ChangeoverLink from "./admin/ChangeoverLink";

/* ── Standard Operational & Roster Status Codes ───────────────────── */
export const ROSTER_STATUS_CODES = {
  WO: { code: "WO", label: "WEEKLY OFF", color: "emerald" },
  CL: { code: "CL", label: "CASUAL LEAVE", color: "amber" },
  EL: { code: "EL", label: "EARNED LEAVE", color: "sky" },
  NR: { code: "NR", label: "NO ROSTER", color: "slate" },
  AB: { code: "AB", label: "ABSENT", color: "rose" },
  STBK: { code: "STBK", label: "STANDBY PEENYA", color: "indigo" },
  CRT: { code: "CRT", label: "CRT PEENYA", color: "purple" },
  BMRTI: { code: "BMRTI", label: "BMRTI TRAINING", color: "cyan" },
  REL: { code: "REL", label: "RELIEF / RELIEVER", color: "teal" },
  PME: { code: "PME", label: "PERIODIC MEDICAL EXAM", color: "pink" },
  LRD: { code: "LRD", label: "LEAVE REST DAY", color: "amber" },
  BO: { code: "BO", label: "BOOK OFF", color: "rose" },
  TRAINING: { code: "TRAINING", label: "TRAINING", color: "blue" },
  OR: { code: "OR", label: "OTHER REST", color: "zinc" },
  HPL: { code: "HPL", label: "HALF PAY LEAVE", color: "orange" },
  PL: { code: "PL", label: "PATERNITY LEAVE", color: "violet" },
  ML: { code: "ML", label: "MATERNITY LEAVE", color: "fuchsia" },
  MS: { code: "MS", label: "MEDICAL SICK", color: "red" },
};

/* ── Schedule-Specific Roster Total KM Master Registry ───────────── */
export const SCHEDULE_ROSTER_KM_REGISTRY = {
  SUNDAY: {
    "1": 0, "01": 0, "2": 0, "02": 0,
    "3": 174, "03": 174,
    "4": 175, "04": 175,
    "5": 133, "05": 133,
    "6": 186, "06": 186,
    "7": 186, "07": 186,
    "8": 163, "08": 163,
    "9": 142, "09": 142,
    "10": 176, "11": 158, "12": 168, "13": 174, "14": 131, "15": 176, "015": 176,
  },
  SATURDAY: {
    "1": 0, "01": 0, "2": 0, "02": 0,
    "3": 157, "03": 157,
    "4": 92, "04": 92,
    "5": 174, "05": 174,
    "6": 180, "06": 180,
    "7": 168, "07": 168,
    "8": 175, "08": 175,
    "9": 174, "09": 174,
    "10": 180, "11": 121, "12": 168, "13": 174, "14": 131, "15": 104,
  },
  MONDAY: {
    "1": 0, "01": 0, "2": 0, "02": 0,
    "3": 180, "03": 180,
    "4": 110, "04": 110,
    "5": 161, "05": 161,
    "6": 131, "06": 131,
    "7": 163, "07": 163,
    "8": 114, "08": 114,
    "9": 191, "09": 191,
    "10": 180, "11": 160, "12": 110, "13": 180, "14": 131, "15": 181,
  },
  WEEKDAY: {
    "1": 0, "01": 0, "2": 0, "02": 0,
    "3": 180, "03": 180,
    "4": 156, "04": 156,
    "5": 161, "05": 161,
    "6": 156, "06": 156,
    "7": 163, "07": 163,
    "8": 156, "08": 156,
    "9": 156, "09": 156,
    "10": 156, "11": 160, "12": 156, "13": 156, "14": 131, "15": 181,
  }
};

// ── LOCAL DATE FORMATTER HELPER (Prevents UTC Timezone Shift Bugs) ──
export function formatLocalDateStr(dateInput) {
  if (!dateInput) return "";
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function nextDateStrHelper(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return "";
  const d = new Date(parts[0], parts[1] - 1, parts[2] + 1, 12, 0, 0);
  return formatLocalDateStr(d);
}

export function getLegDurationSecs(depStr, arrStr) {
  const dSecs = timeToSeconds(depStr);
  const aSecs = timeToSeconds(arrStr);
  if (dSecs <= 0 || aSecs <= 0) return 0;
  let diff = aSecs - dSecs;
  if (diff < 0) diff += 86400; // Account for midnight crossing (24h = 86400s)
  return diff;
}

export function sanitizeSchedTypeForChangeover(st) {
  if (!st) return "WEEKDAY";
  const str = String(st).toUpperCase();
  if (str.includes("SATURDAY") || str.includes("GH")) return "SATURDAY";
  if (str.includes("SUNDAY")) return "SUNDAY";
  if (str.includes("MONDAY")) return "MONDAY";
  return "WEEKDAY";
}

// ── 4. DAY TYPE RESOLUTION HELPER ──
export function getOperationalDayType(dateInput, holidays = []) {
  const dateObj =
    typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(dateObj.getTime())) return "WEEKDAY";

  const dateStr = formatLocalDateStr(dateObj);
  if (holidays.includes(dateStr)) {
    return "SATURDAY"; // GH / Holiday schedule
  }

  const dayOfWeek = dateObj.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue, 3 = Wed, 4 = Thu, 5 = Fri, 6 = Sat
  if (dayOfWeek === 1) return "MONDAY";
  if (dayOfWeek === 0) return "SUNDAY";
  if (dayOfWeek === 6) return "SATURDAY";
  return "WEEKDAY";
}

// ── 5. NORMALIZE DUTY ID HELPER ──
export function normalizeDutyId(dutyId) {
  if (dutyId === undefined || dutyId === null) return "";
  const s = String(dutyId).trim().toUpperCase();
  const numericMatch = s.match(/\d+/);
  if (numericMatch) {
    return String(parseInt(numericMatch[0], 10));
  }
  return s;
}

// ── SCHEDULE TYPE NORMALIZER: SATURDAY & GH → SATURDAY (treated identically) ──
export function normalizeScheduleType(rawSched) {
  if (!rawSched) return "WEEKDAY";
  const s = String(rawSched).toUpperCase().trim();
  // Treat all Saturday/GH variants as canonical "SATURDAY"
  if (s.includes("SATURDAY") || s.includes("SAT") || s.includes("GH")) return "SATURDAY";
  if (s.includes("SUNDAY") || s === "SUN") return "SUNDAY";
  if (s.includes("MONDAY") || s === "MON") return "MONDAY";
  return "WEEKDAY";
}

// ── 5B. DAY-SPECIFIC DUTY LIST HELPER ──
export function getAvailableDutiesForDayType(dayType) {
  const dt = normalizeScheduleType(dayType);
  if (dt === "SUNDAY") return Array.from({ length: 62 }, (_, i) => String(i + 1));
  if (dt === "SATURDAY") return Array.from({ length: 72 }, (_, i) => String(i + 1));
  if (dt === "MONDAY") return Array.from({ length: 79 }, (_, i) => String(i + 1));
  return Array.from({ length: 80 }, (_, i) => String(i + 1)); // WEEKDAY
}

export function parseDutyTokens(rawVal) {
  if (Array.isArray(rawVal)) {
    return rawVal.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof rawVal === "string" && rawVal.trim()) {
    return rawVal
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== "--");
  }
  return [];
}

// ── UPGRADED EXACT WTT LEG MATCHER — MERGED WITH SATURDAY & GH FIX ──
// • Counselling / non-train legs detected & short-circuited (0 KM, no error)
// • Always searches Firestore wttMatrix PLUS static WTT_MASTER_REGISTRY
//   so SATURDAY entries are found even if Firestore collection is empty
// • normalizeScheduleType() collapses "SATURDAY & GH" → "SATURDAY"
// • Pass 1: exact schedule match; Pass 2: WEEKDAY fallback only when needed
// • Flexible station matching: exact code → time-window → first/last stop
// • Direct-distance fallback when WTT has no row for the train at all
export function findExactWttLeg({
  trainId,
  stationFrom,
  stationTo,
  depTime,
  arrTime,
  wttMatrix,
  scheduleType,
}) {
  const cleanTid = String(trainId || '').trim();
  // Normalize: SATURDAY & GH → SATURDAY (they share the same WTT timetable)
  const normSched = normalizeScheduleType(scheduleType);
  const normFrom = normalizeStationCode(stationFrom);
  const normTo   = normalizeStationCode(stationTo);
  const targetDepSecs = timeToSeconds(depTime);
  const targetArrSecs = timeToSeconds(arrTime);

  // ── 0. Short-circuit: counselling / non-train operational legs ──
  const isCounselling =
    cleanTid.toLowerCase().includes('couns') ||
    String(stationFrom).toLowerCase().includes('couns') ||
    String(stationTo).toLowerCase().includes('couns');

  if (isCounselling) {
    return {
      matched: true,
      isCounselling: true,
      priority: 0,
      fromStation: normFrom || 'PYID',
      toStation: normTo || 'PYID',
      depSecs: targetDepSecs,
      arrSecs: targetArrSecs,
      depTimeStr: depTime || '--',
      arrTimeStr: arrTime || '--',
      calculatedKms: 0,
    };
  }

  // ── 1. Merge Firestore wttMatrix + static WTT_MASTER_REGISTRY ──
  // Firestore may not have SATURDAY rows uploaded; static registry is authoritative
  const firestoreRows = Array.isArray(wttMatrix) ? wttMatrix : [];
  const staticRows    = Array.isArray(WTT_MASTER_REGISTRY) ? WTT_MASTER_REGISTRY : [];
  const firestoreIds  = new Set(firestoreRows.map(r => r.id).filter(Boolean));
  const mergedMatrix  = [
    ...firestoreRows,
    ...staticRows.filter(r => !firestoreIds.has(r.id)),
  ];

  // ── 2. Pass 1: Exact schedule match (SATURDAY → SATURDAY, etc.) ──
  let matchingRows = mergedMatrix.filter(row => {
    const rowSched = normalizeScheduleType(row.scheduleType);
    if (rowSched !== normSched) return false;
    const rowTid = String(row.trainId || row.upTid || row.dnTid || '').trim();
    return rowTid === cleanTid;
  });

  // ── 3. Pass 2: Explicit WEEKDAY fallback (only when Pass 1 returns nothing) ──
  if (matchingRows.length === 0 && normSched !== 'WEEKDAY') {
    matchingRows = mergedMatrix.filter(row => {
      const rowSched = normalizeScheduleType(row.scheduleType);
      if (rowSched !== 'WEEKDAY') return false;
      const rowTid = String(row.trainId || row.upTid || row.dnTid || '').trim();
      return rowTid === cleanTid;
    });
  }

  // ── 4. No WTT rows at all → direct-distance fallback on valid station codes ──
  if (matchingRows.length === 0) {
    if (stationFrom && stationTo && stationFrom !== '--' && stationTo !== '--') {
      try {
        const fallbackDist = calculateDistance(normFrom || stationFrom, normTo || stationTo);
        if (fallbackDist > 0) {
          return {
            matched: true,
            priority: 4,
            fromStation: normFrom || stationFrom,
            toStation: normTo || stationTo,
            depSecs: targetDepSecs,
            arrSecs: targetArrSecs || (targetDepSecs + 3600),
            depTimeStr: depTime  || '--',
            arrTimeStr: arrTime  || '--',
            calculatedKms: Math.round(fallbackDist),
          };
        }
      } catch (_) {}
    }
    return { matched: false, reason: 'WTT LEG NOT FOUND' };
  }

  // ── 5. Scan matching rows for best station-pair + time match ──
  let bestMatch = null;
  let minScore  = Infinity;

  matchingRows.forEach(row => {
    ['upTrip', 'downTrip'].forEach(tripKey => {
      const trip = row[tripKey];
      if (!trip || !trip.stations) return;

      const stops = [];
      Object.entries(trip.stations).forEach(([stCode, timeStr]) => {
        if (
          timeStr &&
          timeStr !== '--' &&
          timeStr !== '-' &&
          !String(timeStr).toLowerCase().includes('rev') &&
          !String(timeStr).toLowerCase().includes('pilot')
        ) {
          const cleanSt = normalizeStationCode(stCode.split('_')[0]);
          const secVal  = timeToSeconds(timeStr);
          if (secVal > 0) stops.push({ station: cleanSt, secVal, rawTime: timeStr });
        }
      });

      if (stops.length < 2) return;

      // Strategy A: exact station-code lookup in the stop list
      let fromIndex = normFrom && normFrom !== 'DEPOT'
        ? stops.findIndex(s => s.station === normFrom)
        : -1;
      let toIndex = normTo && normTo !== 'DEPOT'
        ? stops.findIndex(s => s.station === normTo && s.secVal > (fromIndex >= 0 ? stops[fromIndex].secVal : 0))
        : -1;

      // Strategy B: fall back to time-window matching when codes are ambiguous
      if ((fromIndex === -1 || toIndex === -1) && targetDepSecs > 0 && targetArrSecs > 0) {
        let bestDep = Infinity, bestArr = Infinity;
        stops.forEach((s, idx) => {
          const dDiff = Math.abs(s.secVal - targetDepSecs);
          const aDiff = Math.abs(s.secVal - targetArrSecs);
          if (dDiff < bestDep) { bestDep = dDiff; fromIndex = idx; }
          if (aDiff < bestArr && s.secVal > (stops[fromIndex]?.secVal ?? 0)) {
            bestArr = aDiff; toIndex = idx;
          }
        });
      }

      // Strategy C: first/last stops as ultimate fallback (covers depot-to-depot legs)
      if (fromIndex === -1) fromIndex = 0;
      if (toIndex  === -1 || toIndex <= fromIndex) toIndex = stops.length - 1;

      if (toIndex > fromIndex) {
        const matchedFrom = stops[fromIndex];
        const matchedTo   = stops[toIndex];

        const depDiff  = targetDepSecs > 0 ? Math.abs(matchedFrom.secVal - targetDepSecs) : 0;
        const arrDiff  = targetArrSecs > 0 ? Math.abs(matchedTo.secVal   - targetArrSecs) : 0;
        const total    = depDiff + arrDiff;

        if (total < minScore) {
          minScore  = total;
          // Assign priority tier for debug display
          const priority = depDiff <= 300 && arrDiff <= 300 ? 1
                         : depDiff <= 900 && arrDiff <= 900 ? 2
                         : 3;
          bestMatch = {
            matched: true,
            priority,
            fromStation: matchedFrom.station,
            toStation:   matchedTo.station,
            depSecs:     matchedFrom.secVal,
            arrSecs:     matchedTo.secVal,
            depTimeStr:  matchedFrom.rawTime,
            arrTimeStr:  matchedTo.rawTime,
          };
        }
      }
    });
  });

  return bestMatch && bestMatch.matched
    ? bestMatch
    : { matched: false, reason: 'WTT LEG NOT FOUND' };
}


// ── 15. MONTHLY OPERATOR CALCULATION ENGINE WITH CHANGEOVER LINK & GH OVERRIDE INTEGRATION ──
export function getAutoChangeoverTableKey(dayType, nextDayType) {
  const currentUpper = String(dayType || "").toUpperCase().trim();
  const nextUpper = String(nextDayType || "").toUpperCase().trim();

  if (currentUpper.includes("MONDAY_GH") || (currentUpper.includes("MONDAY") && currentUpper.includes("GH"))) {
    return "MONDAY_GH__WEEKDAY";
  }
  if (currentUpper.includes("SUNDAY") && (nextUpper.includes("MONDAY_GH") || nextUpper.includes("GH"))) {
    return "SUNDAY__MONDAY_GH";
  }

  if (currentUpper.includes("SATURDAY") || currentUpper.includes("SAT") || currentUpper.includes("GH")) {
    if (nextUpper.includes("SUNDAY") || nextUpper.includes("SUN")) {
      return "SATURDAY__SUNDAY";
    }
    return "SATURDAY__WEEKDAY";
  }

  if (currentUpper.includes("SUNDAY") || currentUpper.includes("SUN")) {
    return "SUNDAY__MONDAY";
  }

  if (currentUpper.includes("MONDAY") || currentUpper.includes("MON")) {
    return "MONDAY__WEEKDAY";
  }

  return "WEEKDAY__SATURDAY";
}

// ── SINGLE DUTY CALCULATION HELPER ──
export function calculateSingleDutyRecord({
  rawDutyNo,
  dayType,
  nextDayType,
  linksByDayTypeAndDuty,
  linkRoster,
  changeoverMappings,
}) {
  const cleanCode = String(rawDutyNo || "").trim().toUpperCase();

  // Check status code override (e.g. WO, CL, EL, NR, AB, STBK, CRT, etc.)
  if (ROSTER_STATUS_CODES[cleanCode]) {
    const stObj = ROSTER_STATUS_CODES[cleanCode];
    return {
      dutyId: stObj.code,
      signOn: "--",
      signOff: "--",
      totalDutySeconds: 0,
      drivingSeconds: 0,
      kilometers: 0,
      status: `STATUS CODE (${stObj.code})`,
      warnings: [stObj.label],
      legsDetails: [],
    };
  }

  const normDId = normalizeDutyId(rawDutyNo);
  const paddedDId = normDId.padStart(2, "0");

  if (!normDId || normDId === "--" || normDId === "UNASSIGNED") {
    return {
      dutyId: "--",
      signOn: "--",
      signOff: "--",
      totalDutySeconds: 0,
      drivingSeconds: 0,
      kilometers: 0,
      status: "NO DUTY ASSIGNED",
      warnings: ["No duty assigned for date"],
      legsDetails: [],
    };
  }

  // Check Night Changeover Link Integration
  const autoTableKey = getAutoChangeoverTableKey(dayType, nextDayType);
  const staticCoTable = CHANGEOVER_TABLE?.[autoTableKey] || CHANGEOVER_TABLE?.["SUNDAY__MONDAY"] || CHANGEOVER_TABLE?.["SATURDAY__SUNDAY"] || {};
  const firestoreCoTable = changeoverMappings?.[autoTableKey] || {};
  const coTable = {
    ...staticCoTable,
    ...firestoreCoTable,
  };

  const changeoverRow =
    coTable[paddedDId] ||
    coTable[normDId] ||
    coTable[String(Number(normDId))];

  const staticRow =
    staticCoTable[paddedDId] ||
    staticCoTable[normDId] ||
    staticCoTable[String(Number(normDId))];

  // Standard Day / Night Duty Link Roster Lookup
  const normalizedDayTypeKey = normalizeScheduleType(dayType);
  const rawDayTypeUpper = String(dayType || "").toUpperCase().trim();
  const dayTypeLinks = {
    ...(linksByDayTypeAndDuty[rawDayTypeUpper] || {}),
    ...(linksByDayTypeAndDuty[normalizedDayTypeKey] || {}),
    ...(linksByDayTypeAndDuty[dayType] || {}),
  };
  let linkDuty =
    dayTypeLinks[normDId] ||
    dayTypeLinks[paddedDId] ||
    dayTypeLinks[String(Number(normDId))];

  if (!linkDuty && Array.isArray(linkRoster)) {
    const targetSched = normalizeScheduleType(dayType);
    linkDuty = linkRoster.find((l) => {
      const lDId = normalizeDutyId(l.dutyId);
      const lSched = normalizeScheduleType(l.scheduleType);
      return (lDId === normDId || lDId === paddedDId) && (lSched === targetSched || String(l.scheduleType).toUpperCase().includes(targetSched));
    });
  }

  const preloadedDuty = PRELOADED_DUTIES.find(
    (p) => p.dutyNo === paddedDId || p.dutyNo === normDId,
  );

  const checkSignOnStr =
    changeoverRow?.signOnTime ||
    linkDuty?.signOnTime ||
    linkDuty?.signOn ||
    linkDuty?.sOnTime ||
    preloadedDuty?.sOnTime ||
    "";
  const checkSignOnSecs = timeToSeconds(checkSignOnStr);
  const isSignOnNightShift = checkSignOnSecs >= 20 * 3600; // >= 20:00:00 hrs

  const numDuty = Number(normDId);
  const sType = sanitizeSchedTypeForChangeover(dayType);
  const isNightDuty =
    isSignOnNightShift ||
    (sType === "SUNDAY" && numDuty >= 48 && numDuty <= 62) ||
    (sType === "SATURDAY" && numDuty >= 59 && numDuty <= 72) ||
    (sType === "WEEKDAY" && numDuty >= 64 && numDuty <= 79) ||
    (sType === "MONDAY" && numDuty >= 64 && numDuty <= 79) ||
    (sType === "GH" && numDuty >= 48 && numDuty <= 62) ||
    Boolean(changeoverRow && (changeoverRow.nightKms !== undefined || changeoverRow.mornKms !== undefined));

  if (isNightDuty) {
    const nightKms =
      Number(changeoverRow?.nightKms) ||
      Number(staticRow?.nightKms) ||
      Number(linkDuty?.nightKms) ||
      Number(linkDuty?.leg1Km) ||
      0;
    const pilotKms =
      Number(changeoverRow?.pilotKms) ||
      Number(staticRow?.pilotKms) ||
      0;
    let mornKms =
      Number(changeoverRow?.mornKms) ||
      Number(staticRow?.mornKms) ||
      Number(linkDuty?.mornKms) ||
      Number(linkDuty?.leg2Km) ||
      0;

    const coTotalKms = Math.max(
      Number(changeoverRow?.totalKms) || 0,
      Number(staticRow?.totalKms) || 0,
      nightKms + pilotKms + mornKms,
      nightKms + mornKms
    );

    let totalKms =
      coTotalKms > 0
        ? coTotalKms
        : Number(linkDuty?.totalKm || linkDuty?.kms) ||
          preloadedDuty?.kms ||
          0;

    if (coTotalKms > 0 && coTotalKms > nightKms + mornKms) {
      mornKms = coTotalKms - nightKms;
    }

    const signOnStr =
      changeoverRow?.signOnTime ||
      linkDuty?.signOnTime ||
      linkDuty?.signOn ||
      preloadedDuty?.sOnTime ||
      "21:00:00";
    const signOffStr =
      changeoverRow?.signOffTime ||
      linkDuty?.signOffTime ||
      linkDuty?.signOff ||
      preloadedDuty?.sOffTime ||
      "07:00:00";

    const sSecs = timeToSeconds(signOnStr);
    let eSecs = timeToSeconds(signOffStr);
    if (eSecs < sSecs) eSecs += 24 * 3600;
    const dutySecs = Math.max(0, eSecs - sSecs);

    const nightDriveSecs = getLegDurationSecs(
      changeoverRow?.nightDepTime || linkDuty?.leg1DepTime,
      changeoverRow?.nightArrTime || linkDuty?.leg1ArrTime,
    );
    const mornDriveSecs = getLegDurationSecs(
      changeoverRow?.mornDepTime || linkDuty?.leg2DepTime,
      changeoverRow?.mornArrTime || linkDuty?.leg2ArrTime,
    );
    const totalDriveSecs =
      nightDriveSecs + mornDriveSecs > 0
        ? nightDriveSecs + mornDriveSecs
        : timeToSeconds(changeoverRow?.drivingHrs) ||
          timeToSeconds(linkDuty?.drivingHrs) ||
          timeToSeconds(preloadedDuty?.drivingHrs) ||
          Math.round(dutySecs * 0.55);

    const transitionLabel = autoTableKey.replace("__", " ➔ ");

    return {
      dutyId: paddedDId,
      signOn: signOnStr,
      signOff: signOffStr,
      totalDutySeconds: dutySecs,
      drivingSeconds: Math.min(totalDriveSecs, dutySecs),
      kilometers: totalKms,
      status: `CALCULATED (CHANGEOVER LINK)`,
      warnings: [`Night Changeover Link (${transitionLabel})`],
      legsDetails: [
        {
          legNumber: 1,
          shiftType: `🌙 NIGHT SHIFT (LEG 1) — Duty ${paddedDId}`,
          trainId: changeoverRow?.nightTrainNo || linkDuty?.train1 || linkDuty?.leg1TrainNo || "--",
          from: changeoverRow?.signOnLocation || linkDuty?.signOnLocation || "Depot",
          to: changeoverRow?.nightHandoverLoc || linkDuty?.leg1StationTo || "Handover Loc",
          depTime: changeoverRow?.nightDepTime || linkDuty?.leg1DepTime || "--",
          arrTime: changeoverRow?.nightArrTime || linkDuty?.leg1ArrTime || "--",
          drivingSeconds: nightDriveSecs,
          kilometers: nightKms,
          status: "NIGHT SHIFT (LEG 1)",
        },
        {
          legNumber: 2,
          shiftType: `☀️ MORNING SHIFT (LEG 2) — Duty ${paddedDId}`,
          trainId: changeoverRow?.mornTrainNo || linkDuty?.train2 || linkDuty?.leg2TrainNo || "--",
          from: changeoverRow?.takeoverLocation || linkDuty?.leg2StationFrom || "Takeover Loc",
          to: changeoverRow?.signOffLocation || linkDuty?.signOffLocation || "Depot",
          depTime: changeoverRow?.mornDepTime || linkDuty?.leg2DepTime || "--",
          arrTime: changeoverRow?.mornArrTime || linkDuty?.leg2ArrTime || "--",
          drivingSeconds: mornDriveSecs,
          kilometers: mornKms,
          status: "MORNING SHIFT (LEG 2)",
        },
      ],
    };
  }

  // Standard Day Duty Link Roster Lookup
  const parseValKm = (v) => {
    if (typeof v === "number" && v > 0) return v;
    if (typeof v === "string" && v.trim() !== "" && v.trim() !== "--") {
      const n = parseFloat(v.replace(/[^0-9.]/g, ""));
      if (!isNaN(n) && n > 0) return n;
    }
    return 0;
  };

  const staticSchedKm =
    SCHEDULE_ROSTER_KM_REGISTRY[normalizedDayTypeKey]?.[normDId] ||
    SCHEDULE_ROSTER_KM_REGISTRY[normalizedDayTypeKey]?.[paddedDId] ||
    SCHEDULE_ROSTER_KM_REGISTRY[rawDayTypeUpper]?.[normDId] ||
    0;

  const signOnStr =
    linkDuty?.signOnTime ||
    linkDuty?.signOn ||
    preloadedDuty?.sOnTime ||
    "06:00:00";
  const signOffStr =
    linkDuty?.signOffTime ||
    linkDuty?.signOff ||
    preloadedDuty?.sOffTime ||
    "";

  const signOnSecs = timeToSeconds(signOnStr);
  let signOffSecs = timeToSeconds(signOffStr);
  if (signOffSecs < signOnSecs) {
    signOffSecs += 24 * 3600; // Midnight crossing
  }
  const totalDutySeconds = Math.max(0, signOffSecs - signOnSecs);

  const explicitRosterKm = linkDuty
    ? parseValKm(
        linkDuty.kms ||
          linkDuty.totalKm ||
          linkDuty.totalKms ||
          linkDuty.totalDistance ||
          linkDuty.km ||
          linkDuty.kilometers ||
          linkDuty.totalKM ||
          linkDuty.kmTotal ||
          linkDuty.totalKilometers ||
          linkDuty.totKm ||
          linkDuty.shiftKm ||
          linkDuty.shiftKms ||
          linkDuty.total_km ||
          linkDuty.total_kms ||
          linkDuty.kmsTotal ||
          linkDuty.dutyKm ||
          linkDuty.dutyKms,
      )
    : 0;

  let linkLegsKmSum = 0;
  if (linkDuty) {
    if (Array.isArray(linkDuty.trips) && linkDuty.trips.length > 0) {
      linkLegsKmSum = linkDuty.trips.reduce(
        (sum, t) => sum + parseValKm(t.kms || t.legKm || t.calculatedKms),
        0,
      );
    }
    if (linkLegsKmSum === 0) {
      for (let i = 1; i <= 6; i++) {
        linkLegsKmSum += parseValKm(
          linkDuty[`leg${i}Km`] || linkDuty[`leg${i}Kms`],
        );
      }
    }
  }

  const rosterTotalKm = explicitRosterKm > 0 ? explicitRosterKm : linkLegsKmSum;

  let preloadedLegsSum = 0;
  if (preloadedDuty && Array.isArray(preloadedDuty.trips)) {
    preloadedLegsSum = preloadedDuty.trips.reduce(
      (sum, t) => sum + (parseValKm(t.kms || t.legKm || t.calculatedKms) || 0),
      0,
    );
  }

  const preloadedTotalKm = preloadedDuty
    ? parseValKm(
        preloadedDuty.kms ||
          preloadedDuty.totalKm ||
          preloadedDuty.totalKms ||
          preloadedDuty.totalDistance ||
          preloadedDuty.km,
      ) || preloadedLegsSum
    : 0;

  const finalDutyKm =
    rosterTotalKm > 0
      ? rosterTotalKm
      : staticSchedKm > 0
        ? staticSchedKm
        : preloadedTotalKm > 0
          ? preloadedTotalKm
          : 0;

  const explicitDrivingSecs = timeToSeconds(
    linkDuty?.drivingHrs || linkDuty?.steeringHrs || preloadedDuty?.drivingHrs,
  );
  let totalDrivingSeconds = explicitDrivingSecs > 0 ? explicitDrivingSecs : 0;

  const legsDetails = [];
  const warnings = [];
  let calculatedTripDrivingSecs = 0;

  const rawTrips =
    linkDuty?.trips && linkDuty.trips.length > 0
      ? linkDuty.trips
      : preloadedDuty?.trips && preloadedDuty.trips.length > 0
        ? preloadedDuty.trips
        : [];

  if (rawTrips.length > 0) {
    rawTrips.forEach((t, idx) => {
      const legNum = t.legNumber || idx + 1;
      const storedLegKm = parseValKm(
        linkDuty?.[`leg${legNum}Km`] ||
          linkDuty?.[`leg${legNum}Kms`] ||
          t.calculatedKms ||
          t.legKm ||
          t.kms,
      );
      const legKm =
        storedLegKm > 0 ? storedLegKm : parseValKm(t.legKm || t.kms) || 0;
      const legDrivingSecs = Math.max(
        0,
        timeToSeconds(t.timeTo) - timeToSeconds(t.timeFrm),
      );
      calculatedTripDrivingSecs += legDrivingSecs;

      legsDetails.push({
        legNumber: legNum,
        shiftType: `DAY SHIFT (LEG ${legNum}) — Duty ${paddedDId}`,
        trainId: t.trainNo || t.trainId || linkDuty?.trainNo || "--",
        from: t.stationFrm || t.stationFrom || "--",
        to: t.stationTo || "--",
        depTime: t.timeFrm || t.depTime || "--",
        arrTime: t.timeTo || t.arrTime || "--",
        drivingSeconds: legDrivingSecs,
        kilometers: legKm,
        status: "LINK ROSTER TRIP",
      });
    });
  }

  if (totalDrivingSeconds === 0 && calculatedTripDrivingSecs > 0) {
    totalDrivingSeconds = calculatedTripDrivingSecs;
  }
  if (totalDrivingSeconds === 0) {
    totalDrivingSeconds = Math.round(totalDutySeconds * 0.55);
  }

  return {
    dutyId: paddedDId,
    signOn: signOnStr,
    signOff: signOffStr,
    totalDutySeconds,
    drivingSeconds: Math.min(totalDrivingSeconds, totalDutySeconds),
    kilometers: finalDutyKm,
    status: linkDuty ? "CALCULATED (LINK ROSTER)" : "CALCULATED",
    warnings,
    legsDetails,
  };
}

export function calculateOperatorMonthlyDuties({
  employeeId,
  month,
  year,
  deployments,
  linkRoster,
  wttMatrix,
  dutyOverrides = {},
  dayTypeOverrides = {},
  ghDates = [],
  holidays = [],
  changeoverMappings = {},
}) {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10) - 1; // 0-indexed (e.g. 7 = August, 8 = September)
  // Dynamic number of days strictly as per month (28, 29, 30, or 31 days)
  const totalDays = new Date(yearNum, monthNum + 1, 0).getDate();

  // Index link rosters by normalized schedule type AND raw schedule type and normalized duty ID
  // Index link rosters strictly by schedule type without cross-contaminating different schedules
  const linksByDayTypeAndDuty = {};
  (linkRoster || []).forEach((link) => {
    const rawSched = String(link.scheduleType || "WEEKDAY").toUpperCase().trim();
    const normSched = normalizeScheduleType(link.scheduleType);
    const dId = normalizeDutyId(link.dutyId);

    const sKeys = new Set([rawSched, normSched]);
    if (rawSched.includes("SATURDAY") || rawSched.includes("GH")) {
      sKeys.add("SATURDAY");
      sKeys.add("SATURDAY & GH");
    }
    if (rawSched.includes("WEEKDAY")) {
      sKeys.add("WEEKDAY");
      sKeys.add("WEEKDAY SCHEDULE");
    }

    sKeys.forEach((sKey) => {
      if (sKey) {
        if (!linksByDayTypeAndDuty[sKey]) linksByDayTypeAndDuty[sKey] = {};
        linksByDayTypeAndDuty[sKey][dId] = link;
        linksByDayTypeAndDuty[sKey][dId.padStart(2, "0")] = link;
        linksByDayTypeAndDuty[sKey][String(Number(dId))] = link;
      }
    });
  });

  const deploymentsByDateAndEmployee = {};
  (deployments || []).forEach((dep) => {
    const rawDate =
      dep.date || (dep.timestamp?.toDate ? dep.timestamp.toDate() : null);
    const dDate = rawDate ? formatLocalDateStr(rawDate) : null;
    const eId = String(dep.employeeId || dep.empId || dep.id || "").trim();
    if (dDate && eId) {
      if (!deploymentsByDateAndEmployee[dDate])
        deploymentsByDateAndEmployee[dDate] = {};
      deploymentsByDateAndEmployee[dDate][eId] = dep;
    }
  });

  const dailyRecords = [];

  for (let day = 1; day <= totalDays; day++) {
    // Noon local time avoids DST/timezone shifts
    const currentDate = new Date(yearNum, monthNum, day, 12, 0, 0);
    const dateStr = formatLocalDateStr(currentDate); // Exact YYYY-MM-DD
    const nextDateStr = nextDateStrHelper(dateStr);
    const dayName = currentDate.toLocaleDateString("en-US", {
      weekday: "short",
    });

    // Check Day Type & GH Override for selected date
    const ghMatch = (ghDates || []).find((g) => g.date === dateStr);
    const overriddenDayType =
      dayTypeOverrides[dateStr] || (ghMatch ? ghMatch.overrideSchedule : null);
    const dayType =
      overriddenDayType ||
      (holidays.includes(dateStr)
        ? "SATURDAY"
        : getOperationalDayType(currentDate, holidays));

    const nextGhMatch = (ghDates || []).find((g) => g.date === nextDateStr);
    const overriddenNextDayType =
      dayTypeOverrides[nextDateStr] ||
      (nextGhMatch ? nextGhMatch.overrideSchedule : null);
    const nextDayType =
      overriddenNextDayType ||
      (holidays.includes(nextDateStr)
        ? "SATURDAY"
        : getOperationalDayType(nextDateStr, holidays));

    // 1. Check Auto Deployment & Manual Overrides
    const dateDeployments = deploymentsByDateAndEmployee[dateStr] || {};
    const depRecord = dateDeployments[String(employeeId).trim()];
    const empName =
      depRecord?.employeeName || depRecord?.empName || "TRAIN OPERATOR";

    const overriddenDuty = dutyOverrides[dateStr];
    const rawDutyNo =
      overriddenDuty !== undefined
        ? overriddenDuty
        : depRecord?.dutyId || depRecord?.dutyNo || "";

    const dutyTokens = parseDutyTokens(rawDutyNo);

    if (dutyTokens.length === 0) {
      dailyRecords.push({
        date: dateStr,
        dayName,
        dayType,
        employeeId: String(employeeId),
        employeeName: empName,
        dutyId: "--",
        signOn: "--",
        signOff: "--",
        totalDutySeconds: 0,
        drivingSeconds: 0,
        kilometers: 0,
        status: "NO DUTY ASSIGNED",
        warnings: ["No duty assigned for date"],
        legsDetails: [],
        rawDutyNo: "--",
        dutyTokens: [],
      });
      continue;
    }

    const calculatedResults = dutyTokens.map((token) =>
      calculateSingleDutyRecord({
        rawDutyNo: token,
        dayType,
        nextDayType,
        linksByDayTypeAndDuty,
        linkRoster,
        changeoverMappings,
      })
    );

    let combinedDutySecs = 0;
    let combinedDrivingSecs = 0;
    let combinedKms = 0;
    const combinedLegs = [];
    const combinedWarnings = [];
    let firstSignOn = "--";
    let lastSignOff = "--";
    const combinedDutyIds = [];

    calculatedResults.forEach((res, idx) => {
      combinedDutySecs += res.totalDutySeconds;
      combinedDrivingSecs += res.drivingSeconds;
      combinedKms += res.kilometers;
      if (res.legsDetails) combinedLegs.push(...res.legsDetails);
      if (res.warnings) combinedWarnings.push(...res.warnings);

      if (idx === 0) firstSignOn = res.signOn;
      lastSignOff = res.signOff;

      if (res.dutyId && res.dutyId !== "--") {
        combinedDutyIds.push(ROSTER_STATUS_CODES[res.dutyId] ? res.dutyId : `Duty ${res.dutyId}`);
      }
    });

    const displayDutyId = combinedDutyIds.join(", ") || "--";
    const statusText =
      dutyTokens.length > 1
        ? `CALCULATED (${dutyTokens.length} DUTIES: ${dutyTokens.join(", ")})`
        : calculatedResults[0]?.status || "CALCULATED";

    dailyRecords.push({
      date: dateStr,
      dayName,
      dayType,
      employeeId: String(employeeId),
      employeeName: empName,
      dutyId: displayDutyId,
      rawDutyNo,
      dutyTokens,
      signOn: firstSignOn,
      signOff: lastSignOff,
      totalDutySeconds: combinedDutySecs,
      drivingSeconds: Math.min(combinedDrivingSecs, combinedDutySecs > 0 ? combinedDutySecs : combinedDrivingSecs),
      kilometers: combinedKms,
      status: statusText,
      warnings: combinedWarnings,
      legsDetails: combinedLegs,
    });
  }

  return dailyRecords;
}

// ── MAIN JMD DRIVING HOURS COMPONENT ──
export default function JmdDrivingHours() {
  const { userProfile } = useAuth();
  const opEngine = useOperationalEngine();

  // Default to CURRENT calendar month and year
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(
    String(now.getMonth() + 1),
  );
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [selectedOperatorId, setSelectedOperatorId] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Sync selected employee from global cross-navigation context
  useEffect(() => {
    if (opEngine?.selectedEmployee?.employeeId) {
      setSelectedOperatorId(String(opEngine.selectedEmployee.employeeId));
    }
  }, [opEngine?.selectedEmployee]);

  // Manual duty & day type overrides states
  const [dutyOverrides, setDutyOverrides] = useState({});
  const [dayTypeOverrides, setDayTypeOverrides] = useState({});

  // General Holiday (GH) Date Selection State
  const [ghDateInput, setGhDateInput] = useState("2026-08-08");
  const [ghOverrideSchedule, setGhOverrideSchedule] = useState("SATURDAY");
  const [ghDates, setGhDates] = useState([
    { date: "2026-08-15", overrideSchedule: "SATURDAY" },
    { date: "2026-10-02", overrideSchedule: "SATURDAY" },
    { date: "2026-11-01", overrideSchedule: "SATURDAY" },
    { date: "2026-12-25", overrideSchedule: "SATURDAY" },
  ]);

  const [holidays, setHolidays] = useState([
    "2026-01-26",
    "2026-08-15",
    "2026-10-02",
    "2026-11-01",
    "2026-12-25",
  ]);

  const handleAddGhDate = () => {
    if (!ghDateInput) return;
    if (ghDates.some((g) => g.date === ghDateInput)) return;
    setGhDates((prev) => [
      ...prev,
      { date: ghDateInput, overrideSchedule: ghOverrideSchedule },
    ]);
  };

  const handleRemoveGhDate = (dateToRemove) => {
    setGhDates((prev) => prev.filter((g) => g.date !== dateToRemove));
  };

  // ── Firestore Data States ──
  const [linkRoster, setLinkRoster] = useState([]);
  const [wttMatrix, setWttMatrix] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [changeoverMappings, setChangeoverMappings] = useState({});

  // ── UI Navigation State ──
  const [activeTab, setActiveTab] = useState("MONTHLY_CALCULATOR"); // MONTHLY_CALCULATOR, MULTI_DAY, CHANGEOVER_OVERRIDES, GRAPHS
  const [inspectingDuty, setInspectingDuty] = useState(null); // Debug details modal state
  const [dutyPickerModal, setDutyPickerModal] = useState(null); // { dateStr, dayType, dayName, currentDuties }
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedPickerDuties, setSelectedPickerDuties] = useState([]);

  // ── Real-Time Firestore Synchronization ──
  useEffect(() => {
    const unsubLinks = onSnapshot(
      collection(db, "crew_final_links"),
      (snap) => {
        setLinkRoster(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
    );
    const unsubWtt = onSnapshot(collection(db, "wtt_final_matrix"), (snap) => {
      setWttMatrix(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    const unsubDeploy = onSnapshot(
      collection(db, "crew_daily_deployment"),
      (snap) => {
        setDeployments(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      },
    );
    const unsubChangeovers = onSnapshot(
      doc(db, "system_settings", "changeover_mappings"),
      (snap) => {
        if (snap.exists()) {
          setChangeoverMappings(snap.data());
        }
      },
    );

    return () => {
      unsubLinks();
      unsubWtt();
      unsubDeploy();
      unsubChangeovers();
    };
  }, []);

  // Available operational duty numbers for dropdown selector
  const availableDutiesList = useMemo(() => {
    const set = new Set(
      Array.from({ length: 79 }, (_, i) => String(i + 1).padStart(2, "0")),
    );
    if (Array.isArray(linkRoster)) {
      linkRoster.forEach(
        (l) => l.dutyId && set.add(normalizeDutyId(l.dutyId).padStart(2, "0")),
      );
    }
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [linkRoster]);

  // Extract unique active operators list from deployments for the operator dropdown
  const uniqueOperatorsList = useMemo(() => {
    const map = new Map();
    (deployments || []).forEach((dep) => {
      const eId = String(dep.employeeId || dep.empId || "").trim();
      const eName = String(
        dep.employeeName || dep.empName || "TRAIN OPERATOR",
      ).trim();
      if (eId && eId !== "--") {
        map.set(eId, { employeeId: eId, employeeName: eName });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.employeeId.localeCompare(b.employeeId),
    );
  }, [deployments]);

  // Default selectedOperatorId to logged in user or first operator in depot list
  useEffect(() => {
    if (uniqueOperatorsList.length > 0 && !selectedOperatorId) {
      const defaultEmp =
        userProfile?.empId &&
        uniqueOperatorsList.some((o) => o.employeeId === userProfile.empId)
          ? userProfile.empId
          : uniqueOperatorsList[0].employeeId;
      setSelectedOperatorId(defaultEmp);
    }
  }, [uniqueOperatorsList, userProfile, selectedOperatorId]);

  // Active single operator target
  const activeOpId = useMemo(() => {
    if (selectedOperatorId) return selectedOperatorId;
    return uniqueOperatorsList[0]?.employeeId || "20787";
  }, [selectedOperatorId, uniqueOperatorsList]);

  // Handle duty assignment override per date row
  const handleAssignDutyForDate = (dateStr, newDuty) => {
    setDutyOverrides((prev) => ({
      ...prev,
      [dateStr]: newDuty,
    }));
  };

  // Handle operational day type / GH override per date row
  const handleOverrideDayTypeForDate = (dateStr, newDayType) => {
    setDayTypeOverrides((prev) => ({
      ...prev,
      [dateStr]: newDayType,
    }));
  };

  // ── Calculate Monthly Duties for Target Single Operator (Exact Days for Selected Month) ──
  const monthlyCalculatedData = useMemo(() => {
    if (!activeOpId) return [];

    const opRecords = calculateOperatorMonthlyDuties({
      employeeId: activeOpId,
      month: selectedMonth,
      year: selectedYear,
      deployments,
      linkRoster,
      wttMatrix,
      dutyOverrides,
      dayTypeOverrides,
      ghDates,
      holidays,
      changeoverMappings,
    });

    return opRecords;
  }, [
    activeOpId,
    selectedMonth,
    selectedYear,
    deployments,
    linkRoster,
    wttMatrix,
    dutyOverrides,
    dayTypeOverrides,
    ghDates,
    holidays,
    changeoverMappings,
  ]);

  // Filtered rows based on search & status filter
  const filteredMonthlyRows = useMemo(() => {
    let result = [...monthlyCalculatedData];

    if (filterStatus !== "ALL") {
      result = result.filter((r) => r.status === filterStatus);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.employeeId.toLowerCase().includes(q) ||
          r.employeeName.toLowerCase().includes(q) ||
          r.dutyId.toLowerCase().includes(q) ||
          r.date.includes(q) ||
          r.dayType.toLowerCase().includes(q),
      );
    }

    return result;
  }, [monthlyCalculatedData, filterStatus, searchQuery]);

  // ── Monthly Aggregate Summaries ──
  const monthlySummaryTotals = useMemo(() => {
    let totalDutySecs = 0;
    let totalDrivingSecs = 0;
    let totalKms = 0;
    let calculatedDays = 0;
    let missingDutyDays = 0;
    let wttErrorDays = 0;

    monthlyCalculatedData.forEach((r) => {
      totalDutySecs += r.totalDutySeconds;
      totalDrivingSecs += r.drivingSeconds;
      totalKms += r.kilometers;

      if (r.status.includes("CALCULATED")) calculatedDays++;
      else if (r.status === "NO DUTY ASSIGNED") missingDutyDays++;
      else if (r.status.includes("WTT") || r.status.includes("INVALID"))
        wttErrorDays++;
    });

    const count = monthlyCalculatedData.length || 1;

    return {
      monthlyTotalDutyStr: secondsToHHMMSS(totalDutySecs),
      monthlyDrivingStr: secondsToHHMMSS(totalDrivingSecs),
      monthlyKilometers: totalKms,
      totalDutiesChecked: count,
      calculatedDays,
      missingDutyDays,
      wttErrorDays,
      averageDrivingStr: secondsToHHMMSS(Math.round(totalDrivingSecs / count)),
      averageDutyStr: secondsToHHMMSS(Math.round(totalDutySecs / count)),
      averageKilometers: Math.round(totalKms / count),
    };
  }, [monthlyCalculatedData]);

  // Export Monthly Report to Excel
  const handleExportMonthlyExcel = () => {
    const exportRows = filteredMonthlyRows.map((r, idx) => ({
      "Sl No": idx + 1,
      Date: r.date,
      Day: r.dayName,
      "Day Type": r.dayType,
      "Employee ID": r.employeeId,
      "Operator Name": r.employeeName,
      "Duty No": r.dutyId,
      "Sign On": r.signOn,
      "Sign Off": r.signOff,
      "Total Duty Hours": secondsToHHMMSS(r.totalDutySeconds),
      "Driving Hours": secondsToHHMMSS(r.drivingSeconds),
      "Kilometers (KM)": r.kilometers,
      Status: r.status,
      Warnings: (r.warnings || []).join("; "),
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monthly_JMD_Driving_Hours");
    XLSX.writeFile(
      wb,
      `BMRCL_Monthly_JMD_Report_${activeOpId}_${selectedYear}_Month_${selectedMonth}.xlsx`,
    );
  };

  return (
    <div className="bg-slate-955 min-h-[85vh] p-6 rounded-2xl border border-slate-800 font-mono text-slate-200 shadow-2xl space-y-6">
      {/* ── HEADER & MONTH CONTROLS ── */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end border-b border-slate-850 pb-5 gap-4">
        <div>
          <h2 className="text-cyan-400 font-black flex items-center gap-2 text-xl tracking-wider uppercase">
            <Clock className="h-6 w-6" /> JMD TO's Monthly Driving Hours & KM
            Engine
          </h2>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest leading-relaxed">
            Exact Calendar Month ({monthlyCalculatedData.length} Days) → Day
            Type / GH Override → GCC Dispatch Gate Sync → Night Changeover Link Integration → WTT Engine
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800 shadow-inner">
          {/* Operator Dropdown */}
          <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
            <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
              Select Operator:
            </span>
            <select
              value={selectedOperatorId}
              onChange={(e) => setSelectedOperatorId(e.target.value)}
              className="bg-slate-955 border border-slate-700 text-xs rounded px-3 py-1.5 focus:outline-none text-cyan-300 font-bold cursor-pointer"
            >
              {uniqueOperatorsList.map((op) => (
                <option key={op.employeeId} value={op.employeeId}>
                  #{op.employeeId} - {op.employeeName}
                </option>
              ))}
            </select>
          </div>

          {/* Month Dropdown (Default Current Month) */}
          <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
            <Calendar className="h-4 w-4 text-cyan-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-955 border border-slate-700 text-xs rounded px-2.5 py-1 focus:outline-none text-slate-300 font-bold"
            >
              <option value="1">January (31 Days)</option>
              <option value="2">February (28/29 Days)</option>
              <option value="3">March (31 Days)</option>
              <option value="4">April (30 Days)</option>
              <option value="5">May (31 Days)</option>
              <option value="6">June (30 Days)</option>
              <option value="7">July (31 Days)</option>
              <option value="8">August (31 Days)</option>
              <option value="9">September (30 Days)</option>
              <option value="10">October (31 Days)</option>
              <option value="11">November (30 Days)</option>
              <option value="12">December (31 Days)</option>
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-slate-955 border border-slate-700 text-xs rounded px-2.5 py-1 focus:outline-none text-slate-300 font-bold"
            >
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          <button
            onClick={handleExportMonthlyExcel}
            className="bg-emerald-600 hover:bg-emerald-500 text-slate-955 font-black px-4 py-1.5 rounded text-xs tracking-wider uppercase transition flex items-center gap-1.5 shadow-lg"
          >
            <Download className="h-4 w-4" /> Export Report Excel
          </button>
        </div>
      </div>

      {/* ── MONTHLY SUMMARY METRIC CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5">
          <span className="text-[9px] text-cyan-400 font-black uppercase tracking-widest">
            Monthly Steering Hours
          </span>
          <div className="text-xl font-bold text-cyan-400">
            {monthlySummaryTotals.monthlyDrivingStr}
          </div>
          <span className="text-[9.5px] text-slate-500 block">
            Avg: {monthlySummaryTotals.averageDrivingStr} / day
          </span>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5">
          <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
            Monthly Total Duty Hours
          </span>
          <div className="text-xl font-bold text-slate-200">
            {monthlySummaryTotals.monthlyTotalDutyStr}
          </div>
          <span className="text-[9.5px] text-slate-500 block">
            Avg: {monthlySummaryTotals.averageDutyStr} / day
          </span>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5">
          <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">
            Monthly Kilometers
          </span>
          <div className="text-xl font-bold text-emerald-400">
            {monthlySummaryTotals.monthlyKilometers} KM
          </div>
          <span className="text-[9.5px] text-slate-500 block">
            Avg: {monthlySummaryTotals.averageKilometers} KM / day
          </span>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5">
          <span className="text-[9px] text-indigo-400 font-black uppercase tracking-widest">
            Calculation Status
          </span>
          <div className="text-xl font-bold text-indigo-400 flex items-center gap-2">
            <span>{monthlySummaryTotals.calculatedDays} Valid Days</span>
            {monthlySummaryTotals.wttErrorDays > 0 && (
              <span className="text-xs text-rose-400 font-bold">
                ({monthlySummaryTotals.wttErrorDays} WTT Errors)
              </span>
            )}
          </div>
          <span className="text-[9.5px] text-slate-500 block">
            {monthlySummaryTotals.missingDutyDays} Unassigned Days
          </span>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div className="flex border-b border-slate-855 pb-3 gap-2 overflow-x-auto custom-scrollbar">
        {[
          {
            id: "MONTHLY_CALCULATOR",
            label: `1. Monthly JMD Driving Hours & KM Table (${filteredMonthlyRows.length} Days)`,
          },
          { id: "MULTI_DAY", label: "2. Multi-Day Calculator" },
          { id: "CHANGEOVER_OVERRIDES", label: "3. Changeover Overrides" },
          { id: "GRAPHS", label: "4. Analytics & Graphs" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[10px] font-bold rounded-lg transition border whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-cyan-955 text-cyan-400 border-cyan-855/60 shadow-md"
                : "bg-slate-900/60 border-transparent text-slate-400 hover:bg-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: MONTHLY CALCULATOR VIEW (WITH GH SELECTION PANEL & ROW OVERRIDES) ── */}
      {activeTab === "MONTHLY_CALCULATOR" && (
        <div className="space-y-4">
          {/* ── GENERAL HOLIDAY (GH) & CUSTOM SCHEDULE OVERRIDE SELECTION PANEL ── */}
          <div className="bg-slate-900/70 border border-amber-900/40 rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="text-amber-400 font-bold text-sm tracking-wider uppercase">
                    General Holiday (GH) & Custom Schedule Override Selection
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Select GH dates to dynamically update Day Transition
                    Changeovers (e.g. Friday ➔ GH Saturday schedule)
                  </p>
                </div>
              </div>
              <Tag className="h-4 w-4 text-amber-400/70 hidden sm:block" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-955/80 p-3.5 rounded-lg border border-slate-800 items-end">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                  Select GH Date
                </label>
                <input
                  type="date"
                  value={ghDateInput}
                  onChange={(e) => setGhDateInput(e.target.value)}
                  className="w-full bg-slate-900 border border-amber-700/50 rounded px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                  Override Schedule Type
                </label>
                <select
                  value={ghOverrideSchedule}
                  onChange={(e) => setGhOverrideSchedule(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 font-bold focus:outline-none focus:border-amber-400 font-mono cursor-pointer"
                >
                  <option value="SATURDAY">SATURDAY & GH</option>
                  <option value="SUNDAY">SUNDAY</option>
                  <option value="WEEKDAY">WEEKDAY</option>
                  <option value="MONDAY">MONDAY</option>
                </select>
              </div>

              <div>
                <button
                  onClick={handleAddGhDate}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-600/50 px-3 py-1.5 rounded text-xs font-bold uppercase transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add GH Override Date
                </button>
              </div>
            </div>

            {/* GH Dates Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Active GH Dates:
              </span>
              {ghDates.map((g) => (
                <div
                  key={g.date}
                  className="flex items-center gap-1.5 bg-amber-955 text-amber-300 border border-amber-800/80 px-2.5 py-1 rounded text-[10px] font-bold"
                >
                  <span>{g.date}</span>
                  <span className="text-amber-400/80">
                    (
                    {g.overrideSchedule === "SATURDAY"
                      ? "SATURDAY & GH"
                      : g.overrideSchedule}
                    )
                  </span>
                  <button
                    onClick={() => handleRemoveGhDate(g.date)}
                    className="text-amber-400/60 hover:text-amber-200 ml-1 font-extrabold"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Search & Filters Bar */}
          <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search Duty, Date, Status..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-955 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase">
                Status Filter:
              </span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-slate-955 border border-slate-700 text-xs rounded px-3 py-1.5 focus:outline-none text-slate-200 font-bold"
              >
                <option value="ALL">ALL STATUSES</option>
                <option value="CALCULATED">CALCULATED</option>
                <option value="CALCULATED (CHANGEOVER LINK)">
                  CALCULATED (CHANGEOVER LINK)
                </option>
                <option value="PARTIAL WTT MATCH">PARTIAL WTT MATCH</option>
                <option value="NO DUTY ASSIGNED">NO DUTY ASSIGNED</option>
                <option value="INVALID DUTY TIME">INVALID DUTY TIME</option>
              </select>
            </div>
          </div>

          {/* Monthly Table */}
          <div className="bg-slate-955 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] sticky top-0 border-b border-slate-800 z-10">
                  <tr>
                    <th className="p-3">Date & Day</th>
                    <th className="p-3 text-cyan-300">
                      Day Type (GH Override)
                    </th>
                    <th className="p-3">Employee ID - Name</th>
                    <th className="p-3 text-emerald-300">
                      Duty No (Auto / Manual Select)
                    </th>
                    <th className="p-3">Total Duty Hours</th>
                    <th className="p-3 text-cyan-400">Driving Hours</th>
                    <th className="p-3 text-emerald-400">Kilometers</th>
                    <th className="p-3 text-center">
                      Status / Changeover Link
                    </th>
                    <th className="p-3 text-right">Debug / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {filteredMonthlyRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan="9"
                        className="p-8 text-center text-slate-500 italic"
                      >
                        No monthly duty records found for the selected
                        operator/filters.
                      </td>
                    </tr>
                  ) : (
                    filteredMonthlyRows.map((r, idx) => (
                      <tr
                        key={`${r.date}-${r.employeeId}-${idx}`}
                        className="hover:bg-slate-900/50 transition-colors"
                      >
                        <td className="p-3 font-bold text-white">
                          {r.date}{" "}
                          <span className="text-[10px] text-cyan-400 font-bold">
                            ({r.dayName})
                          </span>
                        </td>
                        <td className="p-3">
                          <select
                            value={r.dayType}
                            onChange={(e) =>
                              handleOverrideDayTypeForDate(
                                r.date,
                                e.target.value,
                              )
                            }
                            className={`text-[9px] px-2 py-1 rounded font-black uppercase cursor-pointer border focus:outline-none shadow-inner ${
                              r.dayType === "MONDAY"
                                ? "bg-purple-955 text-purple-300 border-purple-800"
                                : r.dayType === "SUNDAY"
                                  ? "bg-rose-955 text-rose-300 border-rose-800"
                                  : r.dayType === "SATURDAY"
                                    ? "bg-amber-955 text-amber-300 border-amber-800"
                                    : "bg-emerald-955 text-emerald-300 border-emerald-800"
                            }`}
                          >
                            <option
                              value="WEEKDAY"
                              className="bg-slate-900 text-emerald-300 font-bold"
                            >
                              WEEKDAY
                            </option>
                            <option
                              value="SATURDAY"
                              className="bg-slate-900 text-amber-300 font-bold"
                            >
                              SATURDAY & GH
                            </option>
                            <option
                              value="SUNDAY"
                              className="bg-slate-900 text-rose-300 font-bold"
                            >
                              SUNDAY
                            </option>
                            <option
                              value="MONDAY"
                              className="bg-slate-900 text-purple-300 font-bold"
                            >
                              MONDAY
                            </option>
                          </select>
                        </td>
                        <td className="p-3 font-bold text-cyan-300">
                          #{r.employeeId} - {r.employeeName}
                        </td>
                        <td className="p-3 font-bold">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={
                                (r.dutyTokens || []).length > 1
                                  ? "MULTI"
                                  : ROSTER_STATUS_CODES[r.dutyId]
                                    ? r.dutyId
                                    : (r.dutyTokens && r.dutyTokens[0]) || r.dutyId.replace("Duty ", "").trim()
                              }
                              onChange={(e) => {
                                if (e.target.value === "MULTI") {
                                  setDutyPickerModal({
                                    dateStr: r.date,
                                    dayType: r.dayType,
                                    dayName: r.dayName,
                                    currentDuties: r.dutyTokens || [],
                                  });
                                  setSelectedPickerDuties(r.dutyTokens || []);
                                  setPickerSearch("");
                                } else {
                                  handleAssignDutyForDate(r.date, e.target.value);
                                }
                              }}
                              className="bg-slate-900 border border-slate-700 text-emerald-300 font-extrabold rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-400 cursor-pointer shadow-inner max-w-[150px] truncate"
                            >
                              {(r.dutyTokens || []).length > 1 && (
                                <option value="MULTI">⚡ {r.dutyId}</option>
                              )}
                              <option value="--">-- Select / No Duty --</option>
                              <optgroup label={`Operational Duties (${r.dayType})`}>
                                {getAvailableDutiesForDayType(r.dayType).map((dNo) => (
                                  <option key={`op-dty-${dNo}`} value={dNo}>
                                    Duty {dNo}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label="Leave & Roster Status Codes">
                                {Object.values(ROSTER_STATUS_CODES).map((st) => (
                                  <option
                                    key={`st-dty-${st.code}`}
                                    value={st.code}
                                  >
                                    {st.code} - {st.label}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            <button
                              onClick={() => {
                                setDutyPickerModal({
                                  dateStr: r.date,
                                  dayType: r.dayType,
                                  dayName: r.dayName,
                                  currentDuties: r.dutyTokens || [],
                                });
                                setSelectedPickerDuties(r.dutyTokens || []);
                                setPickerSearch("");
                              }}
                              title="Multi-Duty & Leave Selector"
                              className="bg-cyan-955 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/70 px-2 py-1 rounded text-[10px] font-black uppercase transition flex items-center gap-1 shrink-0 shadow-sm"
                            >
                              <Plus className="h-3 w-3" /> Multi
                            </button>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-slate-300">
                          {secondsToHHMMSS(r.totalDutySeconds)}
                        </td>
                        <td className="p-3 font-mono font-bold text-cyan-400">
                          {secondsToHHMMSS(r.drivingSeconds)}
                        </td>
                        <td className="p-3 font-mono font-bold text-emerald-400">
                          {r.kilometers} KM
                        </td>
                        <td className="p-3 text-center">
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-black uppercase flex items-center justify-center gap-1 ${
                              r.status.includes("CHANGEOVER")
                                ? "bg-cyan-955 text-cyan-300 border border-cyan-700"
                                : r.status === "CALCULATED"
                                  ? "bg-emerald-955 text-emerald-400 border border-emerald-800"
                                  : r.status === "PARTIAL WTT MATCH"
                                    ? "bg-amber-955 text-amber-400 border border-amber-800"
                                    : "bg-rose-955 text-rose-400 border border-rose-800"
                            }`}
                          >
                            {r.status.includes("CHANGEOVER") && (
                              <Zap className="h-3 w-3 text-cyan-400" />
                            )}
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => setInspectingDuty(r)}
                            className="bg-slate-800 hover:bg-slate-700 text-cyan-300 px-2.5 py-1 rounded text-[10px] font-bold uppercase transition inline-flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" /> Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── OTHER TABS ── */}
      {activeTab === "MULTI_DAY" && (
        <MultiDayKMCalculator linkRoster={linkRoster} dutiesByDayType={{}} />
      )}
      {activeTab === "CHANGEOVER_OVERRIDES" && <ChangeoverLink />}
      {activeTab === "GRAPHS" && (
        <div className="bg-slate-900/40 border border-slate-850 p-6 rounded-xl space-y-4">
          <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">
            Monthly Steering Hours Analytics
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredMonthlyRows.slice(0, 15).map((r) => ({
                  name: r.date,
                  "Driving Hours": Number((r.drivingSeconds / 3600).toFixed(2)),
                }))}
              >
                <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                <YAxis stroke="#64748b" fontSize={9} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#090d16",
                    border: "1px solid #1e293b",
                  }}
                />
                <Bar dataKey="Driving Hours" fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── DEBUG / INSPECTION MODAL ── */}
      {inspectingDuty && (
        <div className="fixed inset-0 bg-slate-955/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-cyan-500/60 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 font-mono text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Calculation Debug Inspector —{" "}
                  {inspectingDuty.date} ({inspectingDuty.dayName})
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Operator:{" "}
                  <strong className="text-white">
                    #{inspectingDuty.employeeId} - {inspectingDuty.employeeName}
                  </strong>{" "}
                  | Duty:{" "}
                  <strong className="text-amber-400">
                    {inspectingDuty.dutyId}
                  </strong>{" "}
                  | Day Type:{" "}
                  <strong className="text-emerald-400">
                    {inspectingDuty.dayType}
                  </strong>
                </p>
              </div>
              <button
                onClick={() => setInspectingDuty(null)}
                className="text-slate-400 hover:text-white p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-slate-955 border border-slate-800 p-3 rounded-lg grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 text-[10px] block uppercase">
                    Sign On / Off
                  </span>
                  <strong className="text-slate-200">
                    {inspectingDuty.signOn} - {inspectingDuty.signOff}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block uppercase">
                    Total Duty Time
                  </span>
                  <strong className="text-cyan-400">
                    {secondsToHHMMSS(inspectingDuty.totalDutySeconds)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] block uppercase">
                    Total Steering Time
                  </span>
                  <strong className="text-emerald-400">
                    {secondsToHHMMSS(inspectingDuty.drivingSeconds)}
                  </strong>
                </div>
              </div>

              {inspectingDuty.warnings &&
                inspectingDuty.warnings.length > 0 && (
                  <div className="bg-amber-955/40 border border-amber-500/30 p-3 rounded-lg space-y-1">
                    <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-amber-400" /> Operational & Changeover Info:
                    </span>
                    {inspectingDuty.warnings.map((w, idx) => (
                      <p key={idx} className="text-xs text-amber-200 font-semibold">
                        • {w}
                      </p>
                    ))}
                  </div>
                )}

              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="text-xs font-black text-slate-200 uppercase tracking-wider">
                    Train Leg Breakdown & Shift Data ({inspectingDuty.legsDetails?.length || 0} Legs)
                  </span>
                  {inspectingDuty.status?.includes("CHANGEOVER LINK") && (
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[9.5px] px-2 py-0.5 rounded font-bold uppercase">
                      🌙 Night Changeover Transition
                    </span>
                  )}
                </div>

                {inspectingDuty.legsDetails?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-955 rounded">
                    No train legs processed for this duty.
                  </p>
                ) : (
                  inspectingDuty.legsDetails.map((leg, idx) => {
                    const isNightLeg = leg.legNumber === 1 && inspectingDuty.status?.includes("CHANGEOVER LINK");
                    const isMornLeg = leg.legNumber === 2 && inspectingDuty.status?.includes("CHANGEOVER LINK");

                    // Compute inter-leg rest break between leg 1 arr and leg 2 dep
                    let interLegBreakStr = null;
                    if (idx === 0 && inspectingDuty.legsDetails.length >= 2) {
                      const nextLeg = inspectingDuty.legsDetails[1];
                      if (leg.arrTime && nextLeg.depTime && leg.arrTime !== '--' && nextLeg.depTime !== '--') {
                        const breakSecs = getLegDurationSecs(leg.arrTime, nextLeg.depTime);
                        if (breakSecs > 0) {
                          interLegBreakStr = secondsToHHMMSS(breakSecs);
                        }
                      }
                    }

                    return (
                      <React.Fragment key={idx}>
                        <div
                          className={`border p-3.5 rounded-xl text-xs space-y-2 transition-all ${
                            isNightLeg
                              ? 'bg-blue-955/20 border-blue-800/60'
                              : isMornLeg
                              ? 'bg-amber-955/20 border-amber-800/50'
                              : 'bg-slate-955 border-slate-800'
                          }`}
                        >
                          <div className="flex justify-between items-center text-slate-200 font-bold border-b border-slate-800/80 pb-1.5">
                            <span className="flex items-center gap-1.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase ${
                                isNightLeg ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' :
                                isMornLeg ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                                'bg-slate-800 text-slate-300'
                              }`}>
                                {leg.shiftType || `LEG #${leg.legNumber}`}
                              </span>
                              <span>— Train ID: <strong className="text-cyan-400 font-mono text-xs">{leg.trainId}</strong></span>
                            </span>
                            <span
                              className={`text-[9.5px] px-2 py-0.5 rounded font-black uppercase ${
                                leg.status?.includes("NIGHT")
                                  ? "bg-blue-955 text-blue-300 border border-blue-700/50"
                                  : leg.status?.includes("MORNING")
                                  ? "bg-amber-955 text-amber-300 border border-amber-700/50"
                                  : leg.status?.includes("MATCHED")
                                  ? "bg-emerald-955 text-emerald-400"
                                  : "bg-slate-800 text-slate-300"
                              }`}
                            >
                              {leg.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] pt-1">
                            <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                              <span className="text-slate-500 text-[9.5px] block uppercase font-bold">Route / Stations</span>
                              <strong className="text-slate-200 font-mono">
                                {leg.from} ➔ {leg.to}
                              </strong>
                            </div>
                            <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                              <span className="text-slate-500 text-[9.5px] block uppercase font-bold">Timestamps</span>
                              <strong className="text-slate-200 font-mono">
                                {leg.depTime} ➔ {leg.arrTime}
                              </strong>
                            </div>
                            <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                              <span className="text-slate-500 text-[9.5px] block uppercase font-bold">Driving Hours</span>
                              <strong className="text-cyan-300 font-mono">
                                {secondsToHHMMSS(leg.drivingSeconds)}
                              </strong>
                            </div>
                            <div className="bg-slate-900/60 p-2 rounded border border-slate-800">
                              <span className="text-slate-500 text-[9.5px] block uppercase font-bold">Leg Kilometers</span>
                              <strong className="text-emerald-400 font-mono">
                                {leg.kilometers} KM
                              </strong>
                            </div>
                          </div>
                        </div>

                        {/* Inter-Leg Rest Break Indicator */}
                        {interLegBreakStr && (
                          <div className="flex items-center justify-center gap-2 py-1.5 px-3 bg-slate-955 border border-dashed border-slate-700 rounded-lg text-[10px] text-slate-400 font-mono">
                            <span>☕ Inter-Leg Rest Break at <strong className="text-slate-200">{leg.to}</strong> ({leg.arrTime} ➔ {inspectingDuty.legsDetails[1].depTime}):</span>
                            <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">{interLegBreakStr}</span>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 text-right">
              <button
                onClick={() => setInspectingDuty(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded text-xs font-bold uppercase transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Multi-Duty & Leave Status Selector Modal */}
      {dutyPickerModal && (
        <div className="fixed inset-0 bg-slate-955/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-cyan-500/60 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 font-mono text-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <Zap className="h-4 w-4" /> Multi-Duty & Roster Status Selector
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Date: <strong className="text-white">{dutyPickerModal.dateStr} ({dutyPickerModal.dayName})</strong> | Schedule: <strong className="text-emerald-400">{dutyPickerModal.dayType}</strong>
                </p>
              </div>
              <button
                onClick={() => setDutyPickerModal(null)}
                className="text-slate-400 hover:text-white font-black text-lg p-1"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter duty number or leave code..."
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                className="w-full bg-slate-955 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Selected Duties Pills Preview */}
            <div className="bg-slate-955 p-2.5 rounded-lg border border-slate-800 flex flex-wrap items-center gap-1.5 min-h-[40px]">
              <span className="text-[10px] text-slate-400 font-bold uppercase mr-1">
                Selected ({selectedPickerDuties.length}):
              </span>
              {selectedPickerDuties.length === 0 ? (
                <span className="text-[10px] text-slate-500 italic">No duties selected (No Duty Assigned)</span>
              ) : (
                selectedPickerDuties.map((dToken) => (
                  <span
                    key={`pill-${dToken}`}
                    className="bg-emerald-955 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded text-[10px] font-black flex items-center gap-1"
                  >
                    {ROSTER_STATUS_CODES[dToken.toUpperCase()] ? dToken : `Duty ${dToken}`}
                    <button
                      onClick={() => setSelectedPickerDuties(prev => prev.filter(x => x !== dToken))}
                      className="text-emerald-400 hover:text-white font-bold ml-1"
                    >
                      ✕
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Section 1: Operational Duties matching Day Type */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center justify-between">
                <span>Operational Duties for {dutyPickerModal.dayType} ({getAvailableDutiesForDayType(dutyPickerModal.dayType).length} Max Duties)</span>
              </h4>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto custom-scrollbar bg-slate-955 p-2 rounded-lg border border-slate-800">
                {getAvailableDutiesForDayType(dutyPickerModal.dayType)
                  .filter((dNo) => !pickerSearch || `duty ${dNo}`.toLowerCase().includes(pickerSearch.toLowerCase()) || dNo.includes(pickerSearch))
                  .map((dNo) => {
                    const isChecked = selectedPickerDuties.includes(dNo);
                    return (
                      <button
                        key={`pick-duty-${dNo}`}
                        onClick={() => {
                          setSelectedPickerDuties(prev =>
                            prev.includes(dNo) ? prev.filter(x => x !== dNo) : [...prev.filter(x => !ROSTER_STATUS_CODES[x.toUpperCase()]), dNo]
                          );
                        }}
                        className={`px-2 py-1 rounded text-[11px] font-black border transition flex items-center justify-between ${
                          isChecked
                            ? "bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-900/50 scale-[1.02]"
                            : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800"
                        }`}
                      >
                        <span>Duty {dNo}</span>
                        {isChecked && <CheckCircle2 className="h-3 w-3 shrink-0 ml-0.5" />}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Section 2: Leave & Roster Status Codes */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                Leave & Roster Status Codes (18 Official BMRCL Codes)
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto custom-scrollbar bg-slate-955 p-2 rounded-lg border border-slate-800">
                {Object.values(ROSTER_STATUS_CODES)
                  .filter((st) => !pickerSearch || st.code.toLowerCase().includes(pickerSearch.toLowerCase()) || st.label.toLowerCase().includes(pickerSearch.toLowerCase()))
                  .map((st) => {
                    const isChecked = selectedPickerDuties.includes(st.code);
                    return (
                      <button
                        key={`pick-st-${st.code}`}
                        onClick={() => {
                          setSelectedPickerDuties([st.code]);
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-bold border transition text-left truncate flex items-center justify-between ${
                          isChecked
                            ? "bg-amber-600 text-white border-amber-400 shadow-md"
                            : "bg-slate-900 hover:bg-slate-800 text-amber-300/90 border-slate-800"
                        }`}
                      >
                        <span className="truncate">{st.code} - {st.label}</span>
                        {isChecked && <CheckCircle2 className="h-3 w-3 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex justify-between items-center border-t border-slate-800 pt-3">
              <button
                onClick={() => setSelectedPickerDuties([])}
                className="text-slate-400 hover:text-rose-400 text-xs font-bold uppercase transition"
              >
                Clear Selection (No Duty)
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDutyPickerModal(null)}
                  className="px-3 py-1.5 rounded text-xs font-bold uppercase bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleAssignDutyForDate(dutyPickerModal.dateStr, selectedPickerDuties.join(", "));
                    setDutyPickerModal(null);
                  }}
                  className="px-4 py-1.5 rounded text-xs font-bold uppercase bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/40 transition flex items-center gap-1"
                >
                  <Save className="h-3.5 w-3.5" /> Apply Selection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

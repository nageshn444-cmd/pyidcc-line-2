/**
 * MultiDayKMCalculator.jsx
 * ─────────────────────────────────────────────────────────────────────
 * High-precision Multi-Day Driving Hours & KM Calculator for BMRCL Line 2 JMD.
 *
 * Features:
 *  1. GCC Automated Dispatch Gate Live Roster Sync via Firestore (`crew_daily_deployment`)
 *  2. Full support for Leave & Roster Status Codes:
 *     WO, CL, EL, NR, AB, STBK, TRAINING, CRT, BO, PME, OR, REL, HPL, PL, ML, MS
 *  3. Dynamic Day Transition Changeover Calculation & Changeover Link Status Indicators
 *  4. General Holiday (GH) Date Selection & Custom Schedule Override Manager
 *  5. Per-row Schedule Override & Changeover Link Toggle Switches
 *  6. Export Monthly Roster to Excel & CSV
 * ─────────────────────────────────────────────────────────────────────
 */

import { collection, onSnapshot } from "firebase/firestore";
import {
  Calendar,
  FileSpreadsheet,
  FileText,
  MapPin,
  Plus,
  Tag,
  TrendingUp,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { BMRCL_CREW_REGISTRY } from "../data/bmrclCrewRegistry";
import { PRELOADED_DUTIES } from "../data/kmcalc/preloadedDuties";
import { db } from "../firebase";
import { CHANGEOVER_TABLE } from "../services/changeoverService";
import { calculateDistance, normalizeStationCode } from "../utils/kmCalculator";

/* ─── Standard Operational & Roster Status Codes ───────────────────── */
export const ROSTER_STATUS_CODES = {
  WO: { code: "WO", label: "WEEKLY OFF", color: "emerald" },
  CL: { code: "CL", label: "CASUAL LEAVE", color: "amber" },
  EL: { code: "EL", label: "EARNED LEAVE", color: "amber" },
  NR: { code: "NR", label: "NO REPORT / REST", color: "slate" },
  AB: { code: "AB", label: "ABSENT", color: "rose" },
  STBK: { code: "STBK", label: "STEP-BACK RELIEF", color: "cyan" },
  TRAINING: { code: "TRAINING", label: "TRAINING", color: "indigo" },
  CRT: { code: "CRT", label: "CREW REFRESHER TRAINING", color: "indigo" },
  BO: { code: "BO", label: "BOOKED OFF", color: "rose" },
  PME: { code: "PME", label: "PERIODIC MEDICAL EXAM", color: "violet" },
  OR: { code: "OR", label: "OFFICIAL REST", color: "blue" },
  REL: { code: "REL", label: "RELIEF DUTY", color: "cyan" },
  HPL: { code: "HPL", label: "HALF PAY LEAVE", color: "amber" },
  PL: { code: "PL", label: "PRIVILEGE LEAVE", color: "amber" },
  ML: { code: "ML", label: "MEDICAL LEAVE", color: "amber" },
  MS: { code: "MS", label: "MEDICAL SICK", color: "rose" },
};

/* ─── Helpers ───────────────────────────────────────────────────────── */
const parseSecs = (tStr) => {
  if (!tStr || tStr === "--" || tStr === "-" || tStr === "") return -1;
  const parts = String(tStr).split(":").map(Number);
  if (parts.some(isNaN)) return -1;
  return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
};

const secsToHHMMSS = (secs) => {
  if (secs < 0 || isNaN(secs)) return "00:00:00";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const legDurationSecs = (from, to, isNight = false) => {
  const s = parseSecs(from),
    e = parseSecs(to);
  if (s < 0 || e < 0) return 0;
  let diff = e - s;
  if (diff < 0) {
    if (isNight || s >= 19 * 3600) {
      diff += 86400; // overnight night duty
    } else {
      diff += 43200; // 12-hour AM/PM format correction
      if (diff < 0 || diff > 14400) diff = Math.abs(e - s) % 14400;
    }
  }
  if (diff > 14400 && !isNight && s < 19 * 3600) {
    diff = Math.min(diff, 14400);
  }
  return Math.max(0, diff);
};

const tryKmFromStations = (fromLoc, toLoc, depTime, arrTime) => {
  if (!fromLoc || !toLoc || fromLoc === "--" || toLoc === "--") return 0;
  const normFrom = normalizeStationCode(fromLoc);
  const normTo = normalizeStationCode(toLoc);

  if (normFrom && normTo && normFrom === normTo) {
    const durSecs = legDurationSecs(depTime, arrTime);
    if (durSecs >= 5400) return 67.46; // Full round trip (APTS <-> BIET loop)
    if (durSecs >= 2700) return 33.88; // Short loop trip
    if (durSecs > 0) return 13.08;     // Buffer / Siding loop
    return 0;
  }

  try {
    const d = calculateDistance(fromLoc, toLoc);
    return Math.round(d);
  } catch {
    return 0;
  }
};

/* Resolve default schedule type from a date string "YYYY-MM-DD" considering GH overrides */
const resolveDefaultScheduleType = (dateStr, ghDates = []) => {
  const ghMatch = ghDates.find((g) => g.date === dateStr);
  if (ghMatch) return ghMatch.overrideSchedule || "SATURDAY";
  if (!dateStr) return "WEEKDAY";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return "WEEKDAY";
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  const day = d.getDay();
  if (day === 0) return "SUNDAY";
  if (day === 1) return "MONDAY";
  if (day === 6) return "SATURDAY";
  return "WEEKDAY";
};

/* Next date string using pure local date arithmetic */
const nextDate = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d + 1);
  const ny = dateObj.getFullYear();
  const nm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const nd = String(dateObj.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
};

/* All dates in range inclusive (Capped to 31 Days) */
const generateDateRange = (from, to) => {
  if (!from || !to) return [];
  const startStr = from < to ? from : to;
  const endStr = from < to ? to : from;
  const dates = [];
  let cur = startStr;
  let limit = 0;
  while (cur <= endStr && limit < 31) {
    dates.push(cur);
    cur = nextDate(cur);
    limit++;
  }
  return dates;
};

/* Short Day Name using pure local date */
const getDayName = (dateStr) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return "";
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return d.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase();
};

/* Sanitize schedule type for changeover matrix lookup */
const sanitizeSchedTypeForChangeover = (st) => {
  if (!st) return "WEEKDAY";
  const str = String(st).toUpperCase();
  if (str.includes("SATURDAY") || str.includes("GH")) return "SATURDAY";
  if (str.includes("SUNDAY")) return "SUNDAY";
  if (str.includes("MONDAY")) return "MONDAY";
  return "WEEKDAY";
};

/* Compute calculation record for one day and one duty */
function computeDayDutyRecord(
  dateStr,
  dutyNo,
  dayConfigs,
  ghDates,
  dutiesByDayType,
) {
  const cleanCode = String(dutyNo || "")
    .trim()
    .toUpperCase();
  const customConfig = dayConfigs[dateStr] || {};
  const schedType =
    customConfig.scheduleType || resolveDefaultScheduleType(dateStr, ghDates);
  const nextDateStr = nextDate(dateStr);
  const nextCustomConfig = dayConfigs[nextDateStr] || {};
  const nextSchedType =
    nextCustomConfig.scheduleType ||
    resolveDefaultScheduleType(nextDateStr, ghDates);

  // ── 0. NON-DUTY STATUS CODES ──
  if (ROSTER_STATUS_CODES[cleanCode]) {
    const statusObj = ROSTER_STATUS_CODES[cleanCode];
    return {
      dateStr,
      dayName: getDayName(dateStr),
      schedType,
      nextSchedType,
      dutyNo: statusObj.code,
      isNight: false,
      isChangeover: false,
      changeoverKey: "N/A",
      changeoverStatus: "Status Code",
      isStatusCode: true,
      statusLabel: statusObj.label,
      statusColor: statusObj.color,
      signOn: "--",
      signOff: "--",
      signOnLoc: "--",
      signOffLoc: "--",
      legs: [],
      nightKm: 0,
      mornKm: 0,
      totalKm: 0,
      drivingSecs: 0,
      dutySecs: 0,
      breakSecs: 0,
      source: "STATUS_CODE",
    };
  }

  const padded = cleanCode.padStart(2, "0");
  const dayDuties =
    dutiesByDayType[schedType] || dutiesByDayType["WEEKDAY"] || [];
  const dutyObj = dayDuties.find(
    (d) => String(d.dutyId) === padded || String(d.dutyId) === String(dutyNo),
  );
  const rawLink = dutyObj?.rawLink || null;
  const preloadedDuty = PRELOADED_DUTIES.find(
    (p) => p.dutyNo === padded || p.dutyNo === String(dutyNo),
  );

  const sType = sanitizeSchedTypeForChangeover(schedType);
  const nType = sanitizeSchedTypeForChangeover(nextSchedType);
  const tableKey = `${sType}__${nType}`;

  let table =
    CHANGEOVER_TABLE[tableKey] || CHANGEOVER_TABLE["WEEKDAY__SATURDAY"];
  const changeoverRow = table?.[padded] || table?.[String(dutyNo)];
  const hasTableMatch = Boolean(changeoverRow);

  const numDuty = Number(padded);
  const signOnSecs = parseSecs(
    rawLink?.signOnTime || rawLink?.signOn || preloadedDuty?.sOnTime,
  );
  const isNightDuty =
    (!isNaN(numDuty) && numDuty >= 48 && numDuty <= 77) ||
    (signOnSecs >= 0 && signOnSecs >= 19 * 3600);

  const isChangeoverAuto = customConfig.isChangeover === undefined;
  const isChangeoverActive =
    customConfig.isChangeover !== undefined
      ? customConfig.isChangeover
      : (hasTableMatch || isNightDuty);

  // ── 1. CHANGEOVER NIGHT DUTY ──
  if (isChangeoverActive && changeoverRow) {
    const nightKms = Number(changeoverRow.nightKms) || 0;
    const mornKms = Number(changeoverRow.mornKms) || 0;
    const totalKms = Number(changeoverRow.totalKms) || (nightKms + mornKms);

    return {
      dateStr,
      dayName: getDayName(dateStr),
      schedType,
      nextSchedType,
      dutyNo: padded,
      isNight: true,
      isChangeover: true,
      isChangeoverAuto,
      changeoverKey: tableKey,
      changeoverStatus: isChangeoverAuto
        ? `Auto-Linked (${sType} ➔ ${nType})`
        : `Manual Link (${sType} ➔ ${nType})`,
      isStatusCode: false,
      signOn:
        changeoverRow.signOnTime ||
        rawLink?.signOnTime ||
        preloadedDuty?.sOnTime ||
        "--",
      signOff: changeoverRow.signOffTime || preloadedDuty?.sOffTime || "--",
      signOnLoc:
        changeoverRow.signOnLocation ||
        rawLink?.signOnLocation ||
        preloadedDuty?.signOnLocation ||
        "--",
      signOffLoc:
        changeoverRow.signOffLocation ||
        rawLink?.signOffLocation ||
        preloadedDuty?.signOffLocation ||
        "--",
      nightKm: nightKms,
      mornKm: mornKms,
      totalKm: totalKms,
      drivingSecs: Math.max(
        0,
        parseSecs(changeoverRow.drivingHrs) >= 0
          ? parseSecs(changeoverRow.drivingHrs)
          : 0,
      ),
      dutySecs: Math.max(
        0,
        parseSecs(changeoverRow.dutyHrs) >= 0
          ? parseSecs(changeoverRow.dutyHrs)
          : 0,
      ),
      source: "CHANGEOVER_TABLE",
      legs: [
        {
          legNum: 1,
          train: changeoverRow.nightTrainNo || "--",
          dep: changeoverRow.nightDepTime || "--",
          arr: changeoverRow.nightArrTime || "--",
          km: nightKms,
          from: changeoverRow.signOnLocation || "Night Depot",
          to: changeoverRow.nightHandoverLoc || "Station",
        },
        {
          legNum: 2,
          train: changeoverRow.mornTrainNo || "--",
          dep: changeoverRow.mornDepTime || "--",
          arr: changeoverRow.mornArrTime || "--",
          km: mornKms,
          from: changeoverRow.takeoverLocation || "Station",
          to: changeoverRow.signOffLocation || "Depot",
        },
      ],
    };
  }

  // ── 2. DYNAMIC / UPLOADED LINK ROSTER (rawLink / dutyObj) ──
  if (rawLink || dutyObj) {
    const activeLink = rawLink || dutyObj.rawLink || dutyObj;

    let legs = [];
    if (Array.isArray(dutyObj?.legs) && dutyObj.legs.length > 0) {
      legs = dutyObj.legs.map((l, idx) => ({
        legNum: idx + 1,
        train: l.trainId || l.train || "--",
        dep: l.depTime || l.dep || "--",
        arr: l.arrTime || l.arr || "--",
        from: l.stationFrom || l.from || "--",
        to: l.stationTo || l.to || "--",
        km: Number(l.km || l.calculatedKms) || tryKmFromStations(l.stationFrom || l.from, l.stationTo || l.to, l.depTime || l.dep, l.arrTime || l.arr),
      }));
    } else {
      legs = [
        {
          legNum: 1,
          train: activeLink.trainId,
          dep: activeLink.leg1TimeFrom,
          arr: activeLink.leg1TimeTo,
          from: activeLink.signOnLocation,
          to: activeLink.leg1HandoverLoc,
        },
        {
          legNum: 2,
          train: activeLink.leg2TrainNo,
          dep: activeLink.leg2DepTime,
          arr: activeLink.leg2ArrTime,
          from: activeLink.leg2DepLoc,
          to: activeLink.leg2ArrLoc,
        },
        {
          legNum: 3,
          train: activeLink.leg3TrainNo,
          dep: activeLink.leg3DepTime,
          arr: activeLink.leg3ArrTime,
          from: activeLink.leg3DepLoc,
          to: activeLink.leg3ArrLoc,
        },
        {
          legNum: 4,
          train: activeLink.leg4TrainNo,
          dep: activeLink.leg4FinalDepTime,
          arr: activeLink.leg4FinalArrTime,
          from: activeLink.leg4FinalDepLoc,
          to: activeLink.leg4FinalArrLoc,
        },
      ]
        .filter((l) => l.train && l.train !== "--")
        .map((l, idx) => ({
          ...l,
          legNum: idx + 1,
          km: tryKmFromStations(l.from, l.to, l.dep, l.arr),
        }));
    }

    const calculatedLegKm = legs.reduce((acc, l) => acc + (l.km || 0), 0);
    const directKm = Number(dutyObj?.kilometers || dutyObj?.kms || activeLink?.kms || activeLink?.totalKms || activeLink?.totalKm) || 0;
    const fallbackPreloadedKm = Number(preloadedDuty?.kms) || 0;

    let totalDriving = legs.length > 0
      ? legs.reduce((acc, l) => acc + legDurationSecs(l.dep, l.arr, isNightDuty), 0)
      : (dutyObj?.drivingSeconds || 0);

    const sOn = parseSecs(activeLink.signOnTime || activeLink.signOn || dutyObj?.signOn || preloadedDuty?.sOnTime);
    const sOff = parseSecs(activeLink.signOffTime || dutyObj?.signOff || preloadedDuty?.sOffTime);
    let dutyS = dutyObj?.totalDutySeconds || (sOn >= 0 && sOff >= 0 ? sOff - sOn + (sOff < sOn ? 86400 : 0) : 0);

    if (dutyS <= 0 && preloadedDuty?.dutyHrs) {
      dutyS = parseSecs(preloadedDuty.dutyHrs);
    }

    if (totalDriving <= 0 && preloadedDuty?.drivingHrs) {
      totalDriving = parseSecs(preloadedDuty.drivingHrs);
    }

    // Operational safety constraint: Driving hours CANNOT exceed total duty hours
    if (dutyS > 0 && totalDriving > dutyS) {
      totalDriving = Math.min(totalDriving, dutyS);
    }

    // Pick maximum authoritative distance between station leg sum, direct roster km, and preloaded benchmark km
    let resolvedTotalKm = Math.max(calculatedLegKm, directKm, fallbackPreloadedKm);

    if (resolvedTotalKm === 0 && totalDriving > 0 && legs.length > 0) {
      // High-precision speed calculation (BMRCL commercial speed ~32.5 km/h)
      resolvedTotalKm = Math.round((totalDriving / 3600) * 32.5);
    }

    return {
      dateStr,
      dayName: getDayName(dateStr),
      schedType,
      nextSchedType,
      dutyNo: padded,
      isNight: isNightDuty,
      isChangeover: false,
      changeoverKey: tableKey,
      changeoverStatus: "Standard Single-Day",
      isStatusCode: false,
      signOn: activeLink.signOnTime || activeLink.signOn || dutyObj?.signOn || "--",
      signOff: activeLink.signOffTime || dutyObj?.signOff || "--",
      signOnLoc: activeLink.signOnLocation || dutyObj?.signOnLoc || "--",
      signOffLoc: activeLink.signOffLocation || dutyObj?.signOffLoc || "--",
      legs,
      nightKm: 0,
      mornKm: 0,
      totalKm: resolvedTotalKm,
      drivingSecs: totalDriving,
      dutySecs: dutyS,
      source: "LINK_ROSTER",
    };
  }

  // ── 3. PRELOADED BENCHMARK FALLBACK ──
  if (preloadedDuty) {
    const legs = (preloadedDuty.trips || []).map((t, idx) => ({
      legNum: idx + 1,
      train: t.trainNo || "--",
      dep: t.timeFrm || "--",
      arr: t.timeTo || "--",
      from: t.takeoverLocation || "--",
      to: t.handoverLocation || "--",
      km: tryKmFromStations(t.takeoverLocation, t.handoverLocation, t.timeFrm, t.timeTo),
    }));

    const calculatedLegKm = legs.reduce((acc, l) => acc + (l.km || 0), 0);
    const resolvedTotalKm = Math.max(calculatedLegKm, Number(preloadedDuty.kms) || 0);

    const sOn = parseSecs(preloadedDuty.sOnTime);
    const sOff = parseSecs(preloadedDuty.sOffTime);
    let dutyS = Math.max(0, sOn >= 0 && sOff >= 0 ? sOff - sOn + (sOff < sOn ? 86400 : 0) : parseSecs(preloadedDuty.dutyHrs));

    let totalDriving = legs.length > 0
      ? legs.reduce((acc, l) => acc + legDurationSecs(l.dep, l.arr, isNightDuty), 0)
      : Math.max(0, parseSecs(preloadedDuty.drivingHrs));

    if (dutyS > 0 && totalDriving > dutyS) {
      totalDriving = Math.min(totalDriving, dutyS);
    }

    return {
      dateStr,
      dayName: getDayName(dateStr),
      schedType,
      nextSchedType,
      dutyNo: padded,
      isNight: isNightDuty,
      isChangeover: false,
      changeoverKey: tableKey,
      changeoverStatus: "Standard Single-Day",
      isStatusCode: false,
      signOn: preloadedDuty.sOnTime || "--",
      signOff: preloadedDuty.sOffTime || "--",
      signOnLoc: preloadedDuty.signOnLocation || "--",
      signOffLoc: preloadedDuty.signOffLocation || "--",
      legs,
      nightKm: 0,
      mornKm: 0,
      totalKm: resolvedTotalKm,
      drivingSecs: totalDriving,
      dutySecs: dutyS,
      source: "PRELOADED_DUTY",
    };
  }

  // ── 3. LINK ROSTER ──
  if (!rawLink) {
    return {
      dateStr,
      dayName: getDayName(dateStr),
      schedType,
      nextSchedType,
      dutyNo: padded,
      isNight: false,
      isChangeover: false,
      changeoverKey: tableKey,
      changeoverStatus: "No Roster Data",
      isStatusCode: false,
      signOn: "--",
      signOff: "--",
      signOnLoc: "--",
      signOffLoc: "--",
      legs: [],
      nightKm: 0,
      mornKm: 0,
      totalKm: 0,
      drivingSecs: 0,
      dutySecs: 0,
      source: "NO_DATA",
    };
  }

  const legs = [
    {
      n: 1,
      train: rawLink.trainId,
      dep: rawLink.leg1TimeFrom,
      arr: rawLink.leg1TimeTo,
      from: rawLink.signOnLocation,
      to: rawLink.leg1HandoverLoc,
    },
    {
      n: 2,
      train: rawLink.leg2TrainNo,
      dep: rawLink.leg2DepTime,
      arr: rawLink.leg2ArrTime,
      from: rawLink.leg2DepLoc,
      to: rawLink.leg2ArrLoc,
    },
    {
      n: 3,
      train: rawLink.leg3TrainNo,
      dep: rawLink.leg3DepTime,
      arr: rawLink.leg3ArrTime,
      from: rawLink.leg3DepLoc,
      to: rawLink.leg3ArrLoc,
    },
    {
      n: 4,
      train: rawLink.leg4TrainNo,
      dep: rawLink.leg4FinalDepTime,
      arr: rawLink.leg4FinalArrTime,
      from: rawLink.leg4FinalDepLoc,
      to: rawLink.leg4FinalArrLoc,
    },
  ]
    .filter((l) => l.train && l.train !== "--")
    .map((l) => ({ ...l, km: tryKmFromStations(l.from, l.to) }));

  const totalKm = legs.reduce((acc, l) => acc + l.km, 0);
  const totalDriving = legs.reduce(
    (acc, l) => acc + legDurationSecs(l.dep, l.arr),
    0,
  );
  const sOn = parseSecs(rawLink.signOnTime || rawLink.signOn);
  const sOff = parseSecs(rawLink.signOffTime);
  let dutyS = sOn >= 0 && sOff >= 0 ? sOff - sOn + (sOff < sOn ? 86400 : 0) : 0;

  return {
    dateStr,
    dayName: getDayName(dateStr),
    schedType,
    nextSchedType,
    dutyNo: padded,
    isNight: isNightDuty,
    isChangeover: false,
    changeoverKey: tableKey,
    changeoverStatus: "Standard Single-Day",
    isStatusCode: false,
    signOn: rawLink.signOnTime || rawLink.signOn || "--",
    signOff: rawLink.signOffTime || "--",
    signOnLoc: rawLink.signOnLocation || "--",
    signOffLoc: rawLink.signOffLocation || "--",
    legs,
    nightKm: 0,
    mornKm: 0,
    totalKm,
    drivingSecs: totalDriving,
    dutySecs: dutyS,
    source: "LINK_ROSTER",
  };
}

/* Badge Component */
const Badge = ({ children, color = "slate" }) => {
  const colorMap = {
    blue: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    amber: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    violet: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    rose: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    cyan: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    indigo: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    slate: "bg-slate-700/50 text-slate-300 border-slate-600/30",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${colorMap[color] || colorMap.slate}`}
    >
      {children}
    </span>
  );
};

export default function MultiDayKMCalculator({
  linkRoster,
  dutiesByDayType = {},
}) {
  const today = new Date().toISOString().split("T")[0];

  const formatLocalDate = (dObj) => {
    const ny = dObj.getFullYear();
    const nm = String(dObj.getMonth() + 1).padStart(2, "0");
    const nd = String(dObj.getDate()).padStart(2, "0");
    return `${ny}-${nm}-${nd}`;
  };

  const getCurrentMonthRange = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return {
      firstDay: formatLocalDate(new Date(y, m, 1)),
      lastDay: formatLocalDate(new Date(y, m + 1, 0)),
    };
  };

  const initialRange = getCurrentMonthRange();
  const [fromDate, setFromDate] = useState(initialRange.firstDay);
  const [toDate, setToDate] = useState(initialRange.lastDay);
  const [selectedMonthStr, setSelectedMonthStr] = useState(
    initialRange.firstDay.substring(0, 7),
  );
  const [selectedOperatorEmpId, setSelectedOperatorEmpId] = useState("");
  const [isLiveGccSyncActive, setIsLiveGccSyncActive] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const crewList = useMemo(() => {
    if (!Array.isArray(BMRCL_CREW_REGISTRY)) return [];
    const seen = new Set();
    const list = [];
    BMRCL_CREW_REGISTRY.forEach((c) => {
      const empId = String(c.id || c.employeeId || "").trim();
      const name = String(c.name || "").trim();
      if (empId && name && !seen.has(empId)) {
        seen.add(empId);
        list.push({
          empId,
          name,
          designation: c.designation || "Train Operator",
        });
      }
    });
    return list;
  }, []);

  /* ── General Holiday (GH) Date Override Management ── */
  const [ghDateInput, setGhDateInput] = useState(today);
  const [ghOverrideSchedule, setGhOverrideSchedule] = useState("SATURDAY");
  const [ghDates, setGhDates] = useState([
    { date: "2026-08-15", overrideSchedule: "SATURDAY" },
    { date: "2026-10-02", overrideSchedule: "SATURDAY" },
    { date: "2026-11-01", overrideSchedule: "SATURDAY" },
    { date: "2026-12-25", overrideSchedule: "SATURDAY" },
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

  const [dailyDutyAssignments, setDailyDutyAssignments] = useState({});
  const [dayConfigs, setDayConfigs] = useState({});

  const datesInRange = useMemo(
    () => generateDateRange(fromDate, toDate),
    [fromDate, toDate],
  );

  useEffect(() => {
    if (!isLiveGccSyncActive) return;
    const unsub = onSnapshot(
      collection(db, "crew_daily_deployment"),
      (snap) => {
        const updates = {};
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const empId = String(data.empId || data.employeeId || "").trim();
          const empName = String(data.empName || data.name || "")
            .trim()
            .toLowerCase();
          const dutyId = String(data.dutyId || data.dutyNo || "").trim();
          const dateStr = data.date || data.selectedDate || data.targetDate;
          const selectedEmp = crewList.find(
            (c) => c.empId === selectedOperatorEmpId,
          );
          const selectedName = selectedEmp
            ? selectedEmp.name.toLowerCase()
            : "";
          const isMatch = selectedOperatorEmpId
            ? empId === selectedOperatorEmpId ||
              (selectedName && empName.includes(selectedName))
            : true;

          if (isMatch && dutyId && dateStr && datesInRange.includes(dateStr)) {
            updates[dateStr] = dutyId;
          }
        });
        if (Object.keys(updates).length > 0) {
          setDailyDutyAssignments((prev) => ({ ...prev, ...updates }));
          setLastSyncTime(new Date().toLocaleTimeString());
        }
      },
    );
    return () => unsub();
  }, [selectedOperatorEmpId, isLiveGccSyncActive, datesInRange, crewList]);

  useEffect(() => {
    const newConfigs = { ...dayConfigs };
    datesInRange.forEach((d) => {
      if (!newConfigs[d]) {
        newConfigs[d] = {
          scheduleType: resolveDefaultScheduleType(d, ghDates),
          isChangeover: undefined,
        };
      }
    });
    setDayConfigs(newConfigs);
  }, [datesInRange, ghDates]);

  const handleUpdateDayConfig = (dateStr, field, value) => {
    setDayConfigs((prev) => ({
      ...prev,
      [dateStr]: {
        ...(prev[dateStr] || {}),
        [field]: value,
      },
    }));
  };

  const results = useMemo(() => {
    return datesInRange.map((d) =>
      computeDayDutyRecord(
        d,
        dailyDutyAssignments[d] || "",
        dayConfigs,
        ghDates,
        dutiesByDayType,
      ),
    );
  }, [
    datesInRange,
    dailyDutyAssignments,
    dayConfigs,
    ghDates,
    dutiesByDayType,
  ]);

  const totalsSummary = useMemo(() => {
    if (!results || results.length === 0)
      return {
        totalKm: 0,
        nightKm: 0,
        mornKm: 0,
        drivingSecs: 0,
        dutySecs: 0,
        changeovers: 0,
        validDays: 0,
      };
    return results.reduce(
      (acc, r) => ({
        totalKm: acc.totalKm + r.totalKm,
        nightKm: acc.nightKm + (r.nightKm || 0),
        mornKm: acc.mornKm + (r.mornKm || 0),
        drivingSecs: acc.drivingSecs + r.drivingSecs,
        dutySecs: acc.dutySecs + r.dutySecs,
        changeovers: acc.changeovers + (r.isChangeover ? 1 : 0),
        validDays:
          acc.validDays + (!r.isStatusCode && r.source !== "NO_DATA" ? 1 : 0),
      }),
      {
        totalKm: 0,
        nightKm: 0,
        mornKm: 0,
        drivingSecs: 0,
        dutySecs: 0,
        changeovers: 0,
        validDays: 0,
      },
    );
  }, [results]);

  const availableDutiesList = useMemo(() => {
    const set = new Set(
      Array.from({ length: 79 }, (_, i) => String(i + 1).padStart(2, "0")),
    );
    if (Array.isArray(linkRoster))
      linkRoster.forEach(
        (l) => l.dutyId && set.add(String(l.dutyId).padStart(2, "0")),
      );
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [linkRoster]);

  const handleAssignDutyForDate = (dateStr, newDutyNo) => {
    setDailyDutyAssignments((prev) => ({ ...prev, [dateStr]: newDutyNo }));
  };

  const [expandedRowKey, setExpandedRowKey] = useState(null);

  /* ── Export Handlers ── */
  const exportToExcel = () => {
    const data = results.map((r) => ({
      Date: r.dateStr,
      Day: r.dayName,
      "Duty / Status": r.dutyNo,
      "Schedule Type": r.schedType,
      "Changeover Link Status": r.isChangeover
        ? r.changeoverStatus
        : r.isStatusCode
          ? "N/A"
          : "Standard Duty",
      "Sign On Location": r.signOnLoc,
      "Sign On Time": r.signOn,
      "Sign Off Time": r.signOff,
      "Sign Off Location": r.signOffLoc,
      "Total Duty Hours": secsToHHMMSS(r.dutySecs),
      "TO Driving Hours": secsToHHMMSS(r.drivingSecs),
      "Steering (%)":
        r.dutySecs > 0
          ? `${Math.round((r.drivingSecs / r.dutySecs) * 100)}%`
          : "0%",
      "Distance (KM)": r.totalKm,
      "Legs Count": r.legs ? r.legs.length : 0,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Monthly Roster & Driving Hrs",
    );
    XLSX.writeFile(
      workbook,
      `Monthly_TO_Roster_${selectedMonthStr || "Report"}.xlsx`,
    );
  };

  const exportToCsv = () => {
    const headers = [
      "Date",
      "Day",
      "Duty / Status",
      "Schedule Type",
      "Changeover Link Status",
      "Sign On Loc",
      "Sign On Time",
      "Sign Off Time",
      "Sign Off Loc",
      "Total Duty Hours",
      "TO Driving Hours",
      "Steering (%)",
      "Distance (KM)",
    ];
    const rows = results.map((r) => [
      r.dateStr,
      r.dayName,
      r.dutyNo,
      r.schedType,
      r.isChangeover
        ? r.changeoverStatus
        : r.isStatusCode
          ? "N/A"
          : "Standard Duty",
      r.signOnLoc,
      r.signOn,
      r.signOff,
      r.signOffLoc,
      secsToHHMMSS(r.dutySecs),
      secsToHHMMSS(r.drivingSecs),
      r.dutySecs > 0
        ? `${Math.round((r.drivingSecs / r.dutySecs) * 100)}%`
        : "0%",
      r.totalKm,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Monthly_TO_Roster_${selectedMonthStr || "Report"}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-mono text-slate-200">
      {/* ── CARD 0: GCC LIVE ROSTER AUTO-SYNC HEADER ── */}
      <div className="bg-slate-900/80 border border-cyan-800/60 rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-cyan-400 animate-pulse" />
            <div>
              <h3 className="text-cyan-400 font-bold text-sm tracking-wider uppercase">
                GCC Automated Dispatch Gate Live Roster Sync
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Auto-syncs assigned duties & status codes (WO, CL, EL, NR, AB,
                STBK, TRAINING, CRT, BO, PME, OR, REL, HPL, PL, ML, MS) for
                whole month
              </p>
            </div>
          </div>
          <span className="text-[10px] text-emerald-400 bg-emerald-955/60 border border-emerald-800 px-2.5 py-1 rounded-full font-bold">
            {lastSyncTime ? `Live Synced (${lastSyncTime})` : "Live Listening"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-955/80 p-4 rounded-lg border border-slate-800">
          <div>
            <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">
              Select Train Operator for Roster Sync
            </label>
            <select
              value={selectedOperatorEmpId}
              onChange={(e) => setSelectedOperatorEmpId(e.target.value)}
              className="w-full bg-slate-900 border border-cyan-600/50 rounded px-3 py-2 text-xs text-cyan-300 font-bold shadow-inner cursor-pointer"
            >
              <option value="">-- All Operators / GCC Global Sync --</option>
              {crewList.map((c, idx) => (
                <option key={`op-sync-${c.empId}-${idx}`} value={c.empId}>
                  {c.empId} - {c.name} ({c.designation})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-lg border border-slate-800">
            <div>
              <span className="text-[10px] text-slate-300 font-bold block uppercase">
                Automated Dispatch Gate Binding
              </span>
              <span className="text-[9px] text-slate-500">
                Auto-calculates driving hours & KMs upon GCC Roster Upload
              </span>
            </div>
            <button
              onClick={() => setIsLiveGccSyncActive(!isLiveGccSyncActive)}
              className={`px-3 py-1.5 rounded text-xs font-bold font-mono uppercase transition ${
                isLiveGccSyncActive
                  ? "bg-cyan-955 text-cyan-300 border border-cyan-700 hover:bg-cyan-900"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {isLiveGccSyncActive ? "Sync Active" : "Sync Paused"}
            </button>
          </div>
        </div>
      </div>

      {/* ── CARD 1: GENERAL HOLIDAY (GH) & SCHEDULE OVERRIDE SELECTOR ── */}
      <div className="bg-slate-900/70 border border-amber-900/40 rounded-xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-amber-400" />
            <div>
              <h3 className="text-amber-400 font-bold text-sm tracking-wider uppercase">
                General Holiday (GH) & Custom Schedule Override Selection
              </h3>
              <p className="text-[10px] text-slate-400">
                Select GH dates to dynamically update Day Transition Changeovers
                (e.g. Friday ➔ GH Saturday schedule)
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
          <span className="text-[10px] text-slate-500 font-bold uppercase">
            Active GH Dates:
          </span>
          {ghDates.map((g) => (
            <span
              key={g.date}
              className="inline-flex items-center gap-1.5 bg-amber-955/80 border border-amber-800/80 text-amber-300 px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm"
            >
              <Calendar className="h-3 w-3 text-amber-400" />
              <span>{g.date}</span>
              <span className="text-[9px] text-amber-400/80">
                (
                {g.overrideSchedule === "SATURDAY"
                  ? "SATURDAY & GH"
                  : g.overrideSchedule}
                )
              </span>
              <button
                onClick={() => handleRemoveGhDate(g.date)}
                className="hover:text-rose-400 transition ml-0.5"
                title="Remove GH Override"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* ── CARD 2: MONTHLY TRAIN OPERATOR ROSTER & DRIVING HOURS CALCULATOR ── */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <div>
              <h3 className="text-emerald-400 font-bold text-sm tracking-wider uppercase">
                Monthly Train Operator Roster & Driving Hours ({results.length}{" "}
                Days in Month)
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Automated Dispatch Gate Roster Binding + Changeover Link Status
                + Manual Overrides
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportToExcel}
              className="flex items-center gap-1.5 bg-emerald-955 text-emerald-300 border border-emerald-800 px-3 py-1.5 rounded text-xs font-bold hover:bg-emerald-900 transition"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Export Excel
            </button>
            <button
              onClick={exportToCsv}
              className="flex items-center gap-1.5 bg-slate-800 text-slate-200 border border-slate-700 px-3 py-1.5 rounded text-xs font-bold hover:bg-slate-700 transition"
            >
              <FileText className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Date Range & Month Controls */}
        <div className="space-y-3 bg-slate-955/60 p-4 rounded-lg border border-slate-800">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                Select Month (Auto 1-31)
              </label>
              <input
                type="month"
                value={selectedMonthStr}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setSelectedMonthStr(e.target.value);
                  const [year, month] = e.target.value.split("-").map(Number);
                  setFromDate(formatLocalDate(new Date(year, month - 1, 1)));
                  setToDate(formatLocalDate(new Date(year, month, 0)));
                }}
                className="w-full bg-slate-900 border border-emerald-600/50 rounded px-3 py-2 text-xs text-emerald-300 font-bold focus:outline-none focus:border-emerald-400 font-mono cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                To Date (Capped to 31 Days)
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Header Summary KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-955 border border-slate-850 p-3.5 rounded-lg space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase">
              Total Monthly KM
            </span>
            <div className="text-lg font-bold text-emerald-400">
              {totalsSummary.totalKm} KM
            </div>
          </div>
          <div className="bg-slate-955 border border-slate-850 p-3.5 rounded-lg space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase">
              TO Driving Hours
            </span>
            <div className="text-lg font-bold text-cyan-400">
              {secsToHHMMSS(totalsSummary.drivingSecs)}
            </div>
          </div>
          <div className="bg-slate-955 border border-slate-850 p-3.5 rounded-lg space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase">
              Total Duty Hours
            </span>
            <div className="text-lg font-bold text-violet-400">
              {secsToHHMMSS(totalsSummary.dutySecs)}
            </div>
          </div>
          <div className="bg-slate-955 border border-slate-850 p-3.5 rounded-lg space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase">
              Avg Steering (%)
            </span>
            <div className="text-lg font-bold text-amber-400">
              {totalsSummary.dutySecs > 0
                ? Math.round(
                    (totalsSummary.drivingSecs / totalsSummary.dutySecs) * 100,
                  )
                : 0}
              %
            </div>
          </div>
          <div className="bg-slate-955 border border-slate-850 p-3.5 rounded-lg space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase">
              Night Changeovers
            </span>
            <div className="text-lg font-bold text-rose-400">
              {totalsSummary.changeovers}
            </div>
          </div>
          <div className="bg-slate-955 border border-slate-850 p-3.5 rounded-lg space-y-1">
            <span className="text-[9px] text-slate-500 font-bold uppercase">
              Active Roster Days
            </span>
            <div className="text-lg font-bold text-blue-400">
              {totalsSummary.validDays} Days
            </div>
          </div>
        </div>

        {/* Date-wise Results Table with Changeover Link Status */}
        <div className="overflow-x-auto border border-slate-850 rounded-lg custom-scrollbar">
          <table className="w-full text-left text-[11px] font-mono border-collapse">
            <thead className="bg-slate-955 text-slate-400 uppercase text-[9.5px]">
              <tr>
                <th className="px-2 py-2.5 border-b border-slate-800 text-center w-8">
                  Select
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800">
                  Date & Day
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800 font-bold text-slate-200">
                  Duty Number / Status Code
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800">
                  Schedule & Overrides
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800">
                  Changeover Link Status
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800">
                  Sign On / Off
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800 text-right text-violet-400">
                  Total Duty Hours
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800 text-right text-cyan-400">
                  TO Driving Hours
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800 text-right text-amber-400 font-bold">
                  Steering (%)
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800 text-right text-emerald-400 font-bold">
                  Distance (Kms)
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800 text-center">
                  Trips
                </th>
                <th className="px-3 py-2.5 border-b border-slate-800 text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {results.map((r) => {
                const rowKey = `${r.dateStr}_${r.dutyNo}`;
                const isExpanded = expandedRowKey === rowKey;
                const steeringPct =
                  r.dutySecs > 0
                    ? Math.round((r.drivingSecs / r.dutySecs) * 100)
                    : 0;
                const numLegs = r.legs ? r.legs.length : 0;
                const currentConfig = dayConfigs[r.dateStr] || {};

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      className={`hover:bg-slate-850/60 transition ${
                        r.isStatusCode
                          ? "bg-slate-950/40 border-l-2 border-amber-500/50"
                          : r.isChangeover
                            ? "bg-emerald-955/15 border-l-2 border-emerald-500"
                            : ""
                      }`}
                    >
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          className="rounded accent-emerald-500 h-3.5 w-3.5 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-slate-300 font-bold">
                        <div className="flex items-center gap-1.5">
                          <span>{r.dateStr}</span>
                          <span className="text-[10px] text-cyan-400">
                            ({r.dayName})
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-100 text-xs">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={r.dutyNo}
                            onChange={(e) =>
                              handleAssignDutyForDate(r.dateStr, e.target.value)
                            }
                            className="bg-slate-955 border border-slate-700 text-emerald-300 font-extrabold rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer shadow-inner"
                          >
                            <optgroup label="Operational Duties">
                              {availableDutiesList.map((dNo) => (
                                <option key={dNo} value={dNo}>
                                  Duty {dNo}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Leave & Roster Status Codes">
                              {Object.values(ROSTER_STATUS_CODES).map((st) => (
                                <option key={st.code} value={st.code}>
                                  {st.code} - {st.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>

                          <input
                            type="text"
                            placeholder="Manual"
                            value={r.dutyNo}
                            onChange={(e) =>
                              handleAssignDutyForDate(r.dateStr, e.target.value)
                            }
                            className="w-16 bg-slate-955 border border-slate-700 text-slate-200 text-[10px] font-bold rounded px-1.5 py-1 focus:border-cyan-400 focus:outline-none"
                            title="Type custom Duty Number or Status Code manually"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.isStatusCode ? (
                          <Badge color={r.statusColor || "amber"}>
                            {r.statusLabel}
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={r.schedType}
                              onChange={(e) =>
                                handleUpdateDayConfig(
                                  r.dateStr,
                                  "scheduleType",
                                  e.target.value,
                                )
                              }
                              className="bg-slate-955 border border-slate-700 text-slate-200 text-[10px] font-bold rounded px-1.5 py-1 focus:border-amber-400 focus:outline-none cursor-pointer"
                            >
                              <option value="WEEKDAY">WEEKDAY</option>
                              <option value="SATURDAY">SATURDAY & GH</option>
                              <option value="SUNDAY">SUNDAY</option>
                              <option value="MONDAY">MONDAY</option>
                            </select>
                          </div>
                        )}
                      </td>

                      {/* Changeover Link Status Badge & Control */}
                      <td className="px-3 py-2">
                        {r.isStatusCode ? (
                          <span className="text-[10px] text-slate-500 italic">
                            N/A
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {r.isChangeover ? (
                              <span
                                className={`inline-flex items-center gap-1 border px-2 py-0.5 rounded text-[10px] font-bold shadow-inner ${
                                  r.isChangeoverAuto
                                    ? "bg-emerald-955 text-emerald-300 border-emerald-700"
                                    : "bg-amber-955 text-amber-300 border-amber-700"
                                }`}
                              >
                                <Zap
                                  className={`h-3 w-3 ${
                                    r.isChangeoverAuto
                                      ? "text-emerald-400 animate-pulse"
                                      : "text-amber-400"
                                  }`}
                                />
                                {r.changeoverStatus}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">
                                Single-Day
                              </span>
                            )}

                            {/* Manual Changeover Override Toggle */}
                            <label
                              className="flex items-center gap-1 cursor-pointer"
                              title="Check to manually override and force enable/disable night changeover link logic for this row"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  currentConfig.isChangeover !== undefined
                                    ? currentConfig.isChangeover
                                    : r.isChangeover
                                }
                                onChange={(e) =>
                                  handleUpdateDayConfig(
                                    r.dateStr,
                                    "isChangeover",
                                    e.target.checked,
                                  )
                                }
                                className="rounded accent-cyan-500 h-3 w-3 cursor-pointer"
                              />
                              <span className="text-[9px] text-slate-500">
                                Link
                              </span>
                            </label>
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2 text-slate-300">
                        {r.isStatusCode ? (
                          <span className="text-[10px] text-slate-500 italic">
                            No Sign On / Off Required
                          </span>
                        ) : (
                          <div className="text-[10px] space-y-0.5">
                            <div>
                              <span className="text-emerald-400 font-bold">
                                {r.signOnLoc}
                              </span>{" "}
                              @ {r.signOn}
                            </div>
                            <div>
                              <span className="text-amber-400 font-bold">
                                {r.signOffLoc}
                              </span>{" "}
                              @ {r.signOff}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-violet-400">
                        {secsToHHMMSS(r.dutySecs)}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-cyan-400">
                        {secsToHHMMSS(r.drivingSecs)}
                      </td>
                      <td className="px-3 py-2 text-right font-black">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            steeringPct > 100
                              ? "bg-amber-955 text-amber-300 border border-amber-800"
                              : steeringPct > 0
                                ? "bg-emerald-955 text-emerald-300 border border-emerald-800"
                                : "text-slate-500"
                          }`}
                        >
                          {steeringPct}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-extrabold text-emerald-400 text-xs">
                        {r.totalKm} km
                      </td>
                      <td className="px-3 py-2 text-center text-slate-300">
                        <span className="px-2 py-0.5 bg-slate-955 border border-slate-800 rounded text-[10px] font-bold text-slate-300">
                          {numLegs} Legs
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() =>
                            setExpandedRowKey(isExpanded ? null : rowKey)
                          }
                          disabled={r.isStatusCode || numLegs === 0}
                          className={`px-2 py-1 rounded text-[10px] font-bold uppercase border transition-colors ${
                            r.isStatusCode || numLegs === 0
                              ? "bg-slate-900 border-slate-800 text-slate-600 cursor-not-allowed"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                          }`}
                        >
                          {isExpanded ? "Hide" : "Trips ▶"}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Legs Breakdown */}
                    {isExpanded && r.legs && r.legs.length > 0 && (
                      <tr className="bg-slate-955/90 border-b border-slate-800">
                        <td colSpan={12} className="px-4 py-3">
                          <div className="space-y-2 text-xs font-mono">
                            <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <div className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                                Leg Breakdown for Duty #{r.dutyNo} on{" "}
                                {r.dateStr}:
                              </div>
                              {r.isChangeover && (
                                <span className="text-emerald-400 font-bold bg-emerald-955 border border-emerald-800 px-2 py-0.5 rounded">
                                  Changeover Key: {r.changeoverKey}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {r.legs.map((leg, lIdx) => (
                                <div
                                  key={lIdx}
                                  className="bg-slate-900 border border-slate-800 rounded p-2.5 space-y-1"
                                >
                                  <div className="flex justify-between items-center text-xs font-bold text-slate-200">
                                    <span>
                                      Leg {leg.legNum}: Train {leg.train}
                                    </span>
                                    <span className="text-emerald-400">
                                      {leg.km} KM
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400">
                                    {leg.dep} → {leg.arr} ({leg.from} → {leg.to}
                                    )
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

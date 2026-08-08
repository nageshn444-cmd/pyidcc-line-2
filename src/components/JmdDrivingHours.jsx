import { collection, onSnapshot } from "firebase/firestore";
import {
  Calendar,
  Clock,
  Cpu,
  Download,
  Eye,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Tag,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { calculateDistance, normalizeStationCode } from "../utils/kmCalculator";
import { secondsToHHMMSS, timeToSeconds } from "../utils/timeHelpers";
import MultiDayKMCalculator from "./MultiDayKMCalculator";
import ChangeoverLink from "./admin/ChangeoverLink";
import AutomatedDispatchGate from "./AutomatedDispatchGate";

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
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  const dateObj = new Date(y, m - 1, d + 1, 12, 0, 0);
  return formatLocalDateStr(dateObj);
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

// ── 10. EXACT STATION / TIME MATCHING WTT HELPER ──
export function findExactWttLeg({
  trainId,
  stationFrom,
  stationTo,
  depTime,
  arrTime,
  wttMatrix,
  scheduleType,
}) {
  const cleanTid = String(trainId || "").trim();
  const normSched = String(scheduleType || "WEEKDAY").toUpperCase();
  const normFrom = normalizeStationCode(stationFrom);
  const normTo = normalizeStationCode(stationTo);
  const targetDepSecs = timeToSeconds(depTime);
  const targetArrSecs = timeToSeconds(arrTime);

  // Filter WTT entries matching schedule and trainId
  const matchingRows = (wttMatrix || []).filter((row) => {
    const rowSched = String(row.scheduleType || "WEEKDAY").toUpperCase();
    if (rowSched !== normSched && rowSched !== "WEEKDAY") return false;
    const rowTid = String(row.trainId || row.upTid || row.dnTid || "").trim();
    return rowTid === cleanTid;
  });

  if (matchingRows.length === 0) {
    return { matched: false, reason: "WTT LEG NOT FOUND" };
  }

  let bestMatch = null;
  let minScore = Infinity;

  matchingRows.forEach((row) => {
    ["upTrip", "downTrip"].forEach((tripKey) => {
      const trip = row[tripKey];
      if (trip && trip.stations) {
        const stops = [];
        Object.entries(trip.stations).forEach(([stCode, timeStr]) => {
          if (
            timeStr &&
            timeStr !== "--" &&
            timeStr !== "-" &&
            !String(timeStr).toLowerCase().includes("rev")
          ) {
            const cleanSt = normalizeStationCode(stCode.split("_")[0]);
            const secVal = timeToSeconds(timeStr);
            if (secVal > 0) {
              stops.push({ station: cleanSt, secVal, rawTime: timeStr });
            }
          }
        });

        // Find indices for from and to stations
        const fromIndex = stops.findIndex((s) => s.station === normFrom);
        const toIndex = stops.findIndex(
          (s) =>
            s.station === normTo &&
            s.secVal > (fromIndex >= 0 ? stops[fromIndex].secVal : 0),
        );

        if (fromIndex !== -1 && toIndex !== -1 && toIndex > fromIndex) {
          const matchedFromStop = stops[fromIndex];
          const matchedToStop = stops[toIndex];

          const depDiff = Math.abs(matchedFromStop.secVal - targetDepSecs);
          const arrDiff = Math.abs(matchedToStop.secVal - targetArrSecs);
          const totalDiff = depDiff + arrDiff;

          // Priority 1: Exact or very close time match (+/- 300 seconds buffer)
          if (depDiff <= 300 && arrDiff <= 300 && totalDiff < minScore) {
            minScore = totalDiff;
            bestMatch = {
              matched: true,
              priority: 1,
              fromStation: matchedFromStop.station,
              toStation: matchedToStop.station,
              depSecs: matchedFromStop.secVal,
              arrSecs: matchedToStop.secVal,
              depTimeStr: matchedFromStop.rawTime,
              arrTimeStr: matchedToStop.rawTime,
            };
          } else if (minScore === Infinity && totalDiff < minScore) {
            // Priority 2: Closest available time pair if exact window misses
            minScore = totalDiff;
            bestMatch = {
              matched: true,
              priority: 2,
              fromStation: matchedFromStop.station,
              toStation: matchedToStop.station,
              depSecs: matchedFromStop.secVal,
              arrSecs: matchedToStop.secVal,
              depTimeStr: matchedFromStop.rawTime,
              arrTimeStr: matchedToStop.rawTime,
            };
          }
        }
      }
    });
  });

  if (bestMatch && bestMatch.matched) {
    return bestMatch;
  }

  return { matched: false, reason: "WTT LEG NOT FOUND" };
}

// ── 15. MONTHLY OPERATOR CALCULATION ENGINE WITH CHANGEOVER LINK & GH OVERRIDE INTEGRATION ──
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
}) {
  const yearNum = parseInt(year, 10);
  const monthNum = parseInt(month, 10) - 1; // 0-indexed (e.g. 7 = August, 8 = September)
  // Dynamic number of days strictly as per month (28, 29, 30, or 31 days)
  const totalDays = new Date(yearNum, monthNum + 1, 0).getDate();

  // Lookup maps without React hooks
  const linksByDayTypeAndDuty = {};
  (linkRoster || []).forEach((link) => {
    const sched = String(link.scheduleType || "WEEKDAY").toUpperCase();
    const dId = normalizeDutyId(link.dutyId);
    if (!linksByDayTypeAndDuty[sched]) linksByDayTypeAndDuty[sched] = {};
    linksByDayTypeAndDuty[sched][dId] = link;
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

    const cleanCode = String(rawDutyNo || "")
      .trim()
      .toUpperCase();

    // Check status code override (e.g. WO, CL, EL, NR, AB)
    if (ROSTER_STATUS_CODES[cleanCode]) {
      const stObj = ROSTER_STATUS_CODES[cleanCode];
      dailyRecords.push({
        date: dateStr,
        dayName,
        dayType,
        employeeId: String(employeeId),
        employeeName: empName,
        dutyId: stObj.code,
        signOn: "--",
        signOff: "--",
        totalDutySeconds: 0,
        drivingSeconds: 0,
        kilometers: 0,
        status: `STATUS CODE (${stObj.code})`,
        warnings: [stObj.label],
        legsDetails: [],
      });
      continue;
    }

    const normDId = normalizeDutyId(rawDutyNo);
    const paddedDId = normDId.padStart(2, "0");

    if (!normDId || normDId === "--" || normDId === "UNASSIGNED") {
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
      });
      continue;
    }

    // 2. Check Night Changeover Link Integration
    const sType = sanitizeSchedTypeForChangeover(dayType);
    const nType = sanitizeSchedTypeForChangeover(nextDayType);
    const tableKey = `${sType}__${nType}`;

    const coTable =
      CHANGEOVER_TABLE?.[tableKey] ||
      CHANGEOVER_TABLE?.["WEEKDAY__SATURDAY"] ||
      {};
    const changeoverRow =
      coTable[paddedDId] ||
      coTable[normDId] ||
      coTable[String(Number(normDId))];
    const preloadedDuty = PRELOADED_DUTIES.find(
      (p) => p.dutyNo === paddedDId || p.dutyNo === normDId,
    );

    const numDuty = Number(normDId);
    const isNightDuty =
      (!isNaN(numDuty) && numDuty >= 48 && numDuty <= 77) ||
      Boolean(changeoverRow);

    if (isNightDuty && changeoverRow) {
      const nightKms = Number(changeoverRow.nightKms) || 0;
      const mornKms = Number(changeoverRow.mornKms) || 0;
      const totalKms =
        Number(changeoverRow.totalKms) ||
        nightKms + mornKms ||
        preloadedDuty?.kms ||
        0;

      const signOnStr =
        changeoverRow.signOnTime || preloadedDuty?.sOnTime || "21:00:00";
      const signOffStr =
        changeoverRow.signOffTime || preloadedDuty?.sOffTime || "07:00:00";

      const sSecs = timeToSeconds(signOnStr);
      let eSecs = timeToSeconds(signOffStr);
      if (eSecs < sSecs) eSecs += 24 * 3600;
      const dutySecs = Math.max(0, eSecs - sSecs);

      const nightDriveSecs = Math.max(
        0,
        timeToSeconds(changeoverRow.nightArrTime) -
          timeToSeconds(changeoverRow.nightDepTime),
      );
      const mornDriveSecs = Math.max(
        0,
        timeToSeconds(changeoverRow.mornArrTime) -
          timeToSeconds(changeoverRow.mornDepTime),
      );
      const totalDriveSecs =
        nightDriveSecs + mornDriveSecs > 0
          ? nightDriveSecs + mornDriveSecs
          : timeToSeconds(preloadedDuty?.drivingHrs) ||
            Math.round(dutySecs * 0.55);

      dailyRecords.push({
        date: dateStr,
        dayName,
        dayType,
        employeeId: String(employeeId),
        employeeName: empName,
        dutyId: paddedDId,
        signOn: signOnStr,
        signOff: signOffStr,
        totalDutySeconds: dutySecs,
        drivingSeconds: Math.min(totalDriveSecs, dutySecs),
        kilometers: totalKms,
        status: `CALCULATED (CHANGEOVER LINK)`,
        warnings: [`Changeover Link (${sType} ➔ ${nType})`],
        legsDetails: [
          {
            legNumber: 1,
            trainId: changeoverRow.nightTrainNo || "--",
            from: changeoverRow.signOnLocation || "Depot",
            to: changeoverRow.nightHandoverLoc || "Station",
            depTime: changeoverRow.nightDepTime || "--",
            arrTime: changeoverRow.nightArrTime || "--",
            drivingSeconds: nightDriveSecs,
            kilometers: nightKms,
            status: "NIGHT LEG",
          },
          {
            legNumber: 2,
            trainId: changeoverRow.mornTrainNo || "--",
            from: changeoverRow.takeoverLocation || "Station",
            to: changeoverRow.signOffLocation || "Depot",
            depTime: changeoverRow.mornDepTime || "--",
            arrTime: changeoverRow.mornArrTime || "--",
            drivingSeconds: mornDriveSecs,
            kilometers: mornKms,
            status: "MORNING LEG",
          },
        ],
      });
      continue;
    }

    // 3. Standard Day Duty Link Roster Lookup
    const dayTypeLinks = linksByDayTypeAndDuty[dayType] || {};
    const linkDuty =
      dayTypeLinks[normDId] ||
      dayTypeLinks[paddedDId] ||
      dayTypeLinks[String(Number(normDId))];

    if (!linkDuty && !preloadedDuty) {
      dailyRecords.push({
        date: dateStr,
        dayName,
        dayType,
        employeeId: String(employeeId),
        employeeName: empName,
        dutyId: normDId,
        signOn: "--",
        signOff: "--",
        totalDutySeconds: 0,
        drivingSeconds: 0,
        kilometers: 0,
        status: "INVALID LINK ROSTER",
        warnings: [`Duty ${normDId} not found in ${dayType} Link Roster`],
        legsDetails: [],
      });
      continue;
    }

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

    // 4. Leg Processing & WTT Matching
    let totalDrivingSeconds = 0;
    let totalKm = 0;
    const legsDetails = [];
    const warnings = [];

    if (linkDuty) {
      for (let i = 1; i <= 4; i++) {
        const trainId =
          linkDuty[`leg${i}TrainNo`] ||
          linkDuty[`train${i}`] ||
          linkDuty[`leg${i}Train`];
        const stationFrom =
          linkDuty[`leg${i}StationFrom`] ||
          linkDuty[`leg${i}DepLoc`] ||
          linkDuty[`from${i}`];
        const stationTo =
          linkDuty[`leg${i}StationTo`] ||
          linkDuty[`leg${i}ArrLoc`] ||
          linkDuty[`to${i}`];
        const depTime =
          linkDuty[`leg${i}DepTime`] ||
          linkDuty[`leg${i}TimeFrom`] ||
          linkDuty[`dep${i}`];
        const arrTime =
          linkDuty[`leg${i}ArrTime`] ||
          linkDuty[`leg${i}TimeTo`] ||
          linkDuty[`arr${i}`];

        if (
          trainId &&
          trainId !== "--" &&
          trainId !== "-" &&
          stationFrom &&
          stationTo
        ) {
          const wttMatch = findExactWttLeg({
            trainId,
            stationFrom,
            stationTo,
            depTime,
            arrTime,
            wttMatrix,
            scheduleType: dayType,
          });

          if (wttMatch.matched) {
            const legDrivingSecs = Math.max(
              0,
              wttMatch.arrSecs - wttMatch.depSecs,
            );
            totalDrivingSeconds += legDrivingSecs;

            let legKm = 0;
            try {
              legKm = Math.round(
                calculateDistance(wttMatch.fromStation, wttMatch.toStation),
              );
            } catch (e) {
              legKm = 0;
            }
            totalKm += legKm;

            legsDetails.push({
              legNumber: i,
              trainId,
              from: wttMatch.fromStation,
              to: wttMatch.toStation,
              depTime: wttMatch.depTimeStr,
              arrTime: wttMatch.arrTimeStr,
              drivingSeconds: legDrivingSecs,
              kilometers: legKm,
              status: "MATCHED",
            });
          } else {
            const dSecs = Math.max(
              0,
              timeToSeconds(arrTime) - timeToSeconds(depTime),
            );
            totalDrivingSeconds += dSecs;
            let legKm = 0;
            try {
              legKm = Math.round(calculateDistance(stationFrom, stationTo));
            } catch (e) {
              legKm = 0;
            }
            totalKm += legKm;

            warnings.push(`Leg ${i} (Train ${trainId}): ${wttMatch.reason}`);
            legsDetails.push({
              legNumber: i,
              trainId,
              from: stationFrom,
              to: stationTo,
              depTime: depTime || "--",
              arrTime: arrTime || "--",
              drivingSeconds: dSecs,
              kilometers: legKm,
              status: wttMatch.reason,
            });
          }
        }
      }
    } else if (preloadedDuty) {
      totalKm = preloadedDuty.kms || 0;
      totalDrivingSeconds = timeToSeconds(preloadedDuty.drivingHrs) || 0;
      (preloadedDuty.trips || []).forEach((t, idx) => {
        const dSecs = Math.max(
          0,
          timeToSeconds(t.timeTo) - timeToSeconds(t.timeFrm),
        );
        legsDetails.push({
          legNumber: idx + 1,
          trainId: t.trainNo,
          from: t.takeoverLocation,
          to: t.handoverLocation,
          depTime: t.timeFrm,
          arrTime: t.timeTo,
          drivingSeconds: dSecs,
          kilometers: Math.round(
            totalKm / Math.max(1, preloadedDuty.trips.length),
          ),
          status: "PRELOADED DATA",
        });
      });
    }

    // Fallback to preloaded dataset if calculated distance or driving time is missing
    if (totalKm === 0 && preloadedDuty?.kms) {
      totalKm = preloadedDuty.kms;
    }
    if (totalDrivingSeconds === 0 && preloadedDuty?.drivingHrs) {
      totalDrivingSeconds = timeToSeconds(preloadedDuty.drivingHrs);
    }

    const calcStatus = warnings.length > 0 ? "PARTIAL WTT MATCH" : "CALCULATED";

    dailyRecords.push({
      date: dateStr,
      dayName,
      dayType,
      employeeId: String(employeeId),
      employeeName: empName,
      dutyId: normDId,
      signOn: signOnStr,
      signOff: signOffStr,
      totalDutySeconds,
      drivingSeconds: Math.min(totalDrivingSeconds, totalDutySeconds),
      kilometers: totalKm,
      status: calcStatus,
      warnings,
      legsDetails,
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

  // ── UI Navigation State ──
  const [activeTab, setActiveTab] = useState("MONTHLY_CALCULATOR"); // MONTHLY_CALCULATOR, MULTI_DAY, CHANGEOVER_OVERRIDES, GRAPHS, DISPATCH_GATE
  const [inspectingDuty, setInspectingDuty] = useState(null); // Debug details modal state

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

    return () => {
      unsubLinks();
      unsubWtt();
      unsubDeploy();
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

      {/* ── GCC AUTOMATED DISPATCH GATE LIVE SYNC STATUS BANNER ── */}
      <div className="bg-slate-900/90 border border-cyan-700/60 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Cpu className="h-5 w-5 text-cyan-400" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                GCC Automated Dispatch Gate: LIVE SYNC ACTIVE
              </span>
              <span className="bg-emerald-955 text-emerald-400 border border-emerald-800 text-[9px] px-2 py-0.5 rounded font-black uppercase">
                Firestore Realtime
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Auto-synchronizing daily deployments from <code className="text-cyan-400 font-bold">crew_daily_deployment</code> ({deployments.length} Active Records)
            </p>
          </div>
        </div>
        <button
          onClick={() => setActiveTab("DISPATCH_GATE")}
          className="bg-cyan-955 hover:bg-cyan-900 text-cyan-300 border border-cyan-700 px-3 py-1.5 rounded text-xs font-bold uppercase transition flex items-center gap-1.5 shadow"
        >
          <Zap className="h-3.5 w-3.5 text-cyan-400" /> Open Dispatch Gate Control
        </button>
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
          { id: "DISPATCH_GATE", label: "5. ⚡ GCC Automated Dispatch Gate Live" },
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
                    <th className="p-3">Sign On / Off</th>
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
                        colSpan="10"
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
                          <select
                            value={r.dutyId}
                            onChange={(e) =>
                              handleAssignDutyForDate(r.date, e.target.value)
                            }
                            className="bg-slate-900 border border-slate-700 text-emerald-300 font-extrabold rounded px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-400 cursor-pointer shadow-inner"
                          >
                            <option value="--">-- Select / No Duty --</option>
                            <optgroup label="Operational Duties">
                              {availableDutiesList.map((dNo) => (
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
                        </td>
                        <td className="p-3 font-mono text-slate-400 text-[11px]">
                          {r.signOn} - {r.signOff}
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
      {activeTab === "DISPATCH_GATE" && (
        <AutomatedDispatchGate />
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
                  <div className="bg-rose-955/50 border border-rose-800 p-3 rounded-lg space-y-1">
                    <span className="text-[10px] text-rose-400 font-black uppercase">
                      Warnings / Changeover Info:
                    </span>
                    {inspectingDuty.warnings.map((w, idx) => (
                      <p key={idx} className="text-xs text-rose-300">
                        • {w}
                      </p>
                    ))}
                  </div>
                )}

              <div className="space-y-2">
                <span className="text-xs font-black text-slate-300 uppercase block border-b border-slate-800 pb-1">
                  Train Leg Breakdown & WTT Station Matching (
                  {inspectingDuty.legsDetails?.length || 0} Legs)
                </span>

                {inspectingDuty.legsDetails?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-955 rounded">
                    No train legs processed for this duty.
                  </p>
                ) : (
                  inspectingDuty.legsDetails.map((leg, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-955 border border-slate-800 p-3 rounded-lg text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center text-slate-300 font-bold border-b border-slate-855 pb-1">
                        <span>
                          Leg #{leg.legNumber} — Train ID:{" "}
                          <span className="text-cyan-400">{leg.trainId}</span>
                        </span>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${leg.status.includes("MATCHED") || leg.status.includes("LEG") ? "bg-emerald-955 text-emerald-400" : "bg-rose-955 text-rose-400"}`}
                        >
                          {leg.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                        <div>
                          <span className="text-slate-500">Route:</span>{" "}
                          <strong className="text-slate-200">
                            {leg.from} → {leg.to}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Timestamps:</span>{" "}
                          <strong className="text-slate-200">
                            {leg.depTime} → {leg.arrTime}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Driving Time:</span>{" "}
                          <strong className="text-cyan-400">
                            {secondsToHHMMSS(leg.drivingSeconds)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Station KM:</span>{" "}
                          <strong className="text-emerald-400">
                            {leg.kilometers} KM
                          </strong>
                        </div>
                      </div>
                    </div>
                  ))
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
    </div>
  );
}

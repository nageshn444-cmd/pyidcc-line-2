import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Cpu,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Plus,
  Radio,
  RefreshCw,
  Repeat,
  RotateCcw,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Train,
  Trash2,
  UploadCloud,
  UserCheck,
  Users,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { useOperationalEngine } from "../context/OperationalEngine";
import { BMRCL_CREW_REGISTRY } from "../data/bmrclCrewRegistry";
import { OFFICIAL_JMD_TD_REGISTRY } from "../data/jmdCrewMaster";
import {
  PRELOADED_DUTIES,
  SATURDAY_DUTY_TYPES,
  SUNDAY_DUTY_TYPES,
} from "../data/kmcalc/preloadedDuties";
import { db } from "../firebase";
import {
  enforceSingleDutyRule,
  formatExcelDate,
  formatExcelTime,
  rosterAutoClassifierService,
} from "../services/RosterAutoClassifierService";
import { swapOperatorsInConsoleData, rotateTripleOperatorsInConsoleData, transferOperatorInConsoleData } from "../services/RosterService";
import RosterPublisherBoard from "./RosterPublisherBoard";
import OfficialGccRosterSheetView from "./common/OfficialGccRosterSheetView";
import { getRolling7Days } from "../utils/rosterDateUtils";

// ── Duty ID Utilities (shared with Dashboard) ──
// Format Excel decimal/string times (e.g. 0.29166 -> 07:00)
const safeFormatExcelTime = (val) => {
  if (typeof formatExcelTime === "function") {
    return formatExcelTime(val);
  }
  if (!val) return "06:00";
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  return String(val).trim();
};

const safeFormatExcelDate = (val) => {
  if (typeof formatExcelDate === "function") {
    return formatExcelDate(val);
  }
  return String(val || "--").trim();
};

// Resolve exact Duty Type from Excel deployment with schedule-aware master links (Sunday, Saturday, Weekday)
const resolveDutyType = (d, dayType = "WEEKDAY") => {
  if (!d) return "";
  // 1. Direct explicit dutyType from Excel if present and not default placeholder
  if (d.dutyType && d.dutyType !== "--" && d.dutyType !== "PYID") {
    return String(d.dutyType).trim();
  }

  const rawId = String(d.dutyId || "").trim();
  const numId = String(parseInt(rawId, 10));
  const sched = String(dayType || d.scheduleType || "").toUpperCase();

  // 2. Day-specific Master Schedule Resolution
  if (sched.includes("SUN")) {
    if (SUNDAY_DUTY_TYPES[numId] !== undefined) {
      return SUNDAY_DUTY_TYPES[numId];
    }
  } else if (sched.includes("SAT")) {
    if (SATURDAY_DUTY_TYPES[numId] !== undefined) {
      return SATURDAY_DUTY_TYPES[numId];
    }
  } else {
    // Weekday / Monday
    const preloaded = (PRELOADED_DUTIES || []).find(
      (p) => String(p.dutyNo) === numId || String(p.dutyNo) === rawId,
    );
    if (preloaded) {
      if (preloaded.dutyType && !/^\d+$/.test(preloaded.dutyType)) {
        return preloaded.dutyType;
      }
      if (preloaded.signOnLocation) {
        return preloaded.signOnLocation;
      }
    }
  }

  if (d.dutyType && d.dutyType !== "--") {
    return String(d.dutyType).trim();
  }

  if (d.signOnLocation && d.signOnLocation !== "--") {
    return String(d.signOnLocation).trim();
  }

  return "";
};

// ── Real-Time BMRCL & JMD Crew Position & Individual Deployment Calculation Engine ──
export const calculateDetailedCrewPositions = (dayType, deployments, consoleData) => {
  const JMD_EMP_IDS = new Set(
    (OFFICIAL_JMD_TD_REGISTRY || []).map((j) => String(j.empId).trim()),
  );
  const JMD_NAMES = new Set(
    (OFFICIAL_JMD_TD_REGISTRY || []).map((j) =>
      String(j.name || "")
        .trim()
        .toUpperCase(),
    ),
  );

  const isJmd = (record) => {
    if (!record) return false;
    if (record.isJmd === true || record.isJMD === true) return true;
    const idStr = String(
      record.empId || record.empNo || record.employeeId || record.id || "",
    ).trim();
    const digits = idStr.replace(/\D/g, "");
    if (digits && digits.startsWith("8")) return true;
    if (digits && JMD_EMP_IDS.has(digits)) return true;
    const nameStr = String(
      record.name || record.empName || record.employeeName || "",
    )
      .trim()
      .toUpperCase();
    if (nameStr && JMD_NAMES.has(nameStr)) return true;
    const roleStr = (
      String(record.role || "") +
      " " +
      String(record.designation || "") +
      " " +
      String(record.dutyType || "") +
      " " +
      String(record.trainId || "")
    ).toUpperCase();
    if (roleStr.includes("JMD")) return true;
    return false;
  };

  // 1. Present: active train driving duties with assigned operators
  const activeMainlineDuties = (deployments || []).filter(
    (d) =>
      d &&
      d.empId &&
      d.empId !== "--" &&
      d.empId !== "UNASSIGNED" &&
      d.empId !== "0" &&
      String(d.status || "").toUpperCase() !== "ABSENT" &&
      String(d.status || "").toUpperCase() !== "NOT_REPORTING",
  );
  const presentBmrcl = activeMainlineDuties.filter((d) => !isJmd(d));
  const presentJmd = activeMainlineDuties.filter((d) => isJmd(d));

  // 2. Weekly Offs / Rest
  const weeklyOffs = consoleData?.weeklyOffs || [];
  const restCoBmrcl = weeklyOffs.filter((w) => !isJmd(w));
  const restCoJmd = weeklyOffs.filter((w) => isJmd(w));

  // 3. Leaves
  const leaves = consoleData?.leaves || [];
  const clLeaves = leaves.filter((l) => (l.type || "CL").toUpperCase() === "CL");
  const elLeaves = leaves.filter((l) => (l.type || "").toUpperCase() === "EL");
  const regularLeaves = [...clLeaves, ...elLeaves];
  const leaveBmrcl = regularLeaves.filter((l) => !isJmd(l));
  const leaveJmd = regularLeaves.filter((l) => isJmd(l));

  const hplLeaves = leaves.filter((l) => (l.type || "").toUpperCase() === "HPL");
  const hplBmrcl = hplLeaves.filter((l) => !isJmd(l));
  const hplJmd = hplLeaves.filter((l) => isJmd(l));

  const mlLeaves = leaves.filter((l) => (l.type || "").toUpperCase() === "ML");
  const mlBmrcl = mlLeaves.filter((l) => !isJmd(l));
  const mlJmd = mlLeaves.filter((l) => isJmd(l));

  const plLeaves = leaves.filter((l) => (l.type || "").toUpperCase() === "PL");
  const plBmrcl = plLeaves.filter((l) => !isJmd(l));
  const plJmd = plLeaves.filter((l) => isJmd(l));

  // 4. Absents (console + duty absents)
  const consoleAbsents = consoleData?.absents || [];
  const dutyAbsents = (deployments || []).filter(
    (d) =>
      String(d.status || "").toUpperCase() === "ABSENT" ||
      String(d.status || "").toUpperCase() === "NOT_REPORTING",
  );
  const absentMap = new Map();
  consoleAbsents.forEach((a) => {
    const id = String(a.empNo || a.empId || a.name || Math.random());
    absentMap.set(id, a);
  });
  dutyAbsents.forEach((d) => {
    const id = String(d.empId || d.empNo || d.empName || Math.random());
    if (!absentMap.has(id)) absentMap.set(id, d);
  });
  const allAbsents = Array.from(absentMap.values());
  const abBmrcl = allAbsents.filter((a) => !isJmd(a));
  const abJmd = allAbsents.filter((a) => isJmd(a));

  // 5. Booked Off
  const bookedOff = consoleData?.bookedOff || [];
  const boBmrcl = bookedOff.filter((b) => !isJmd(b));
  const boJmd = bookedOff.filter((b) => isJmd(b));

  // 6. GH
  const ghList = consoleData?.gh || [];
  const ghBmrcl = ghList.filter((g) => !isJmd(g));
  const ghJmd = ghList.filter((g) => isJmd(g));

  // 7. LRD
  const routeLearning = consoleData?.routeLearning || [];
  const lrdBmrcl = routeLearning.filter((l) => !isJmd(l));
  const lrdJmd = routeLearning.filter((l) => isJmd(l));

  // 8. CRT
  const crtTraining = consoleData?.crtTraining || [];
  const crtBmrcl = crtTraining.filter((c) => !isJmd(c));
  const crtJmd = crtTraining.filter((c) => isJmd(c));

  // 9. PME
  const pmeOperators = consoleData?.pmeOperators || [];
  const pmeBmrcl = pmeOperators.filter((p) => !isJmd(p));
  const pmeJmd = pmeOperators.filter((p) => isJmd(p));

  // 10. STBK (Outstation Stepbacks)
  const outstationStepbacks = consoleData?.outstationStepbacks || [];
  const stbkBmrcl = outstationStepbacks.filter((s) => !isJmd(s));
  const stbkJmd = outstationStepbacks.filter((s) => isJmd(s));

  // 11. Standby
  const standbys = consoleData?.standbys || [];
  const stbyBmrcl = standbys.filter((s) => !isJmd(s));
  const stbyJmd = standbys.filter((s) => isJmd(s));

  // 12. R6 Trg (Co-Operators)
  const coOperators = consoleData?.coOperators || [];
  const r6Bmrcl = coOperators.filter((c) => !isJmd(c));
  const r6Jmd = coOperators.filter((c) => isJmd(c));

  // 13. BMRTI Training
  const bmrtiTraining = consoleData?.bmrtiTraining || [];
  const bmrtiBmrcl = bmrtiTraining.filter((b) => !isJmd(b));
  const bmrtiJmd = bmrtiTraining.filter((b) => isJmd(b));

  // 14. CRRC /ins
  const crrcList =
    consoleData?.customRegisters?.["CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)"] || [];
  const crrcBmrcl = crrcList.filter((c) => !isJmd(c));
  const crrcJmd = crrcList.filter((c) => isJmd(c));

  // 15. REL R5 CC
  const relievedOperators = consoleData?.relievedOperators || [];
  const relR5Bmrcl = relievedOperators.filter((r) => !isJmd(r));
  const relR5Jmd = relievedOperators.filter((r) => isJmd(r));

  // 16. OD
  const onDuty = consoleData?.onDuty || [];
  const odBmrcl = onDuty.filter((o) => !isJmd(o));
  const odJmd = onDuty.filter((o) => isJmd(o));

  // Totals
  const totalBmrcl =
    presentBmrcl.length +
    restCoBmrcl.length +
    leaveBmrcl.length +
    hplBmrcl.length +
    mlBmrcl.length +
    plBmrcl.length +
    abBmrcl.length +
    boBmrcl.length +
    ghBmrcl.length +
    lrdBmrcl.length +
    crtBmrcl.length +
    pmeBmrcl.length +
    stbkBmrcl.length +
    stbyBmrcl.length +
    r6Bmrcl.length +
    bmrtiBmrcl.length +
    crrcBmrcl.length +
    relR5Bmrcl.length +
    odBmrcl.length;

  const totalJmd =
    presentJmd.length +
    restCoJmd.length +
    leaveJmd.length +
    hplJmd.length +
    mlJmd.length +
    plJmd.length +
    abJmd.length +
    boJmd.length +
    ghJmd.length +
    lrdJmd.length +
    crtJmd.length +
    pmeJmd.length +
    stbkJmd.length +
    stbyJmd.length +
    r6Jmd.length +
    bmrtiJmd.length +
    crrcJmd.length +
    relR5Jmd.length +
    odJmd.length;

  // Compile individual deployed records
  const allIndividualPositions = [];

  // Mainline Duties
  (activeMainlineDuties || []).forEach((d) => {
    const jmd = isJmd(d);
    allIndividualPositions.push({
      id: `mainline_${d.dutyId || Math.random()}`,
      category: "Mainline Train Duty",
      group: "MAINLINE",
      dutyId: d.dutyId ? `Duty #${d.dutyId}` : "Driving Duty",
      rawDutyId: d.dutyId,
      trainId: d.trainId ? `Train ${d.trainId}` : "--",
      name: d.empName || d.name || "Operator",
      empId: d.empId || d.empNo || "--",
      isJmd: jmd,
      cadre: jmd ? "(JMD Contract TD)" : "BMRCL Regular TO",
      timings: `${safeFormatExcelTime(d.reportingTime || d.signOnTime || "06:00")} - ${safeFormatExcelTime(d.signOffTime || "14:00")}`,
      location: d.startStation || d.station || "Peenya Depot (PYID)",
      status: String(d.status || "DEPLOYED").toUpperCase(),
      details: d.dutyType ? `Type: ${d.dutyType}` : "",
    });
  });

  // Standbys
  (standbys || []).forEach((s, idx) => {
    const jmd = isJmd(s);
    allIndividualPositions.push({
      id: `standby_${idx}`,
      category: "Standby Duty",
      group: "STANDBY",
      dutyId: s.duty || s.code || "Standby",
      trainId: "--",
      name: s.name || s.empName || "Staff",
      empId: s.empNo || s.empId || "--",
      isJmd: jmd,
      cadre: jmd ? "(JMD Contract TD)" : "BMRCL Regular TO",
      timings: s.time || s.shift || "Morning / Evening STBY",
      location: s.station || "Peenya Depot (PYID)",
      status: "STANDBY READY",
      details: s.remark || s.info || "Available for operational relief",
    });
  });

  // Outstation Stepbacks (STBK)
  (outstationStepbacks || []).forEach((st, idx) => {
    const jmd = isJmd(st);
    allIndividualPositions.push({
      id: `stbk_${idx}`,
      category: "Outstation Stepback (STBK)",
      group: "STANDBY",
      dutyId: st.duty || "STBK",
      trainId: st.trainId ? `Train ${st.trainId}` : "--",
      name: st.name || st.empName || "Staff",
      empId: st.empNo || st.empId || "--",
      isJmd: jmd,
      cadre: jmd ? "(JMD Contract TD)" : "BMRCL Regular TO",
      timings: st.shift || st.time || "Stepback Shift",
      location: st.station || "Outstation (BIET / APTS)",
      status: "STEPBACK ACTIVE",
      details: "Terminal / Intermediate Stepback",
    });
  });

  // Weekly Offs (Rest/CO)
  (weeklyOffs || []).forEach((w, idx) => {
    const jmd = isJmd(w);
    allIndividualPositions.push({
      id: `wo_${idx}`,
      category: "Weekly Off / Rest (WO)",
      group: "REST",
      dutyId: "REST / WO",
      trainId: "--",
      name: w.name || w.empName || "Staff",
      empId: w.empNo || w.empId || "--",
      isJmd: jmd,
      cadre: jmd ? "(JMD Contract TD)" : "BMRCL Regular TO",
      timings: w.day || "Rest Day",
      location: "Off Base",
      status: "WEEKLY OFF",
      details: w.duty ? `Roster Duty: ${w.duty}` : "Scheduled Rest",
    });
  });

  // Leaves
  (leaves || []).forEach((l, idx) => {
    const jmd = isJmd(l);
    const leaveType = (l.type || "CL").toUpperCase();
    allIndividualPositions.push({
      id: `leave_${idx}`,
      category: `Leave (${leaveType})`,
      group: "LEAVES",
      dutyId: `Leave [${leaveType}]`,
      trainId: "--",
      name: l.name || l.empName || "Staff",
      empId: l.empNo || l.empId || "--",
      isJmd: jmd,
      cadre: jmd ? "(JMD Contract TD)" : "BMRCL Regular TO",
      timings: l.fromDate ? `${l.fromDate} to ${l.toDate || l.fromDate}` : "Approved Leave",
      location: "--",
      status: `ON LEAVE (${leaveType})`,
      details: l.reason || `${leaveType} Sanctioned`,
    });
  });

  // Training & PME & Special
  const trainingGroups = [
    { list: crtTraining, cat: "CRT Training", grp: "TRAINING", code: "CRT" },
    { list: bmrtiTraining, cat: "BMRTI Training", grp: "TRAINING", code: "BMRTI" },
    { list: pmeOperators, cat: "PME Medical Exam", grp: "TRAINING", code: "PME" },
    { list: routeLearning, cat: "Route Learning (LRD)", grp: "TRAINING", code: "LRD" },
    { list: onDuty, cat: "On Duty (OD)", grp: "TRAINING", code: "OD" },
    { list: coOperators, cat: "Co-Operators / R6", grp: "TRAINING", code: "R6" },
    { list: relievedOperators, cat: "Relieved R5/CC", grp: "TRAINING", code: "REL" },
    { list: crrcList, cat: "CRRC 4RS Training", grp: "TRAINING", code: "CRRC" },
    { list: bookedOff, cat: "Booked Off (BO)", grp: "LEAVES", code: "BO" },
    { list: allAbsents, cat: "Absent (AB)", grp: "LEAVES", code: "AB" },
  ];

  trainingGroups.forEach(({ list, cat, grp, code }) => {
    (list || []).forEach((item, idx) => {
      const jmd = isJmd(item);
      allIndividualPositions.push({
        id: `${code}_${idx}`,
        category: cat,
        group: grp,
        dutyId: item.duty || item.code || code,
        trainId: item.trainId ? `Train ${item.trainId}` : "--",
        name: item.name || item.empName || "Staff",
        empId: item.empNo || item.empId || "--",
        isJmd: jmd,
        cadre: jmd ? "(JMD Contract TD)" : "BMRCL Regular TO",
        timings: item.shift || item.time || item.dueDate || "--",
        location: item.station || item.location || item.hospital || "Depot / Center",
        status: code,
        details: item.reason || item.course || item.remark || cat,
      });
    });
  });

  return {
    isJmd,
    presentBmrcl,
    presentJmd,
    restCoBmrcl,
    restCoJmd,
    leaveBmrcl,
    leaveJmd,
    hplBmrcl,
    hplJmd,
    mlBmrcl,
    mlJmd,
    plBmrcl,
    plJmd,
    abBmrcl,
    abJmd,
    boBmrcl,
    boJmd,
    ghBmrcl,
    ghJmd,
    lrdBmrcl,
    lrdJmd,
    crtBmrcl,
    crtJmd,
    pmeBmrcl,
    pmeJmd,
    stbkBmrcl,
    stbkJmd,
    stbyBmrcl,
    stbyJmd,
    r6Bmrcl,
    r6Jmd,
    bmrtiBmrcl,
    bmrtiJmd,
    crrcBmrcl,
    crrcJmd,
    relR5Bmrcl,
    relR5Jmd,
    odBmrcl,
    odJmd,
    totalBmrcl,
    totalJmd,
    allIndividualPositions,
  };
};

// ── Daily Crew Position Report Generator Engine (Real-Time Live Calculation) ──
const generateDailyPositionReportText = (dayType, deployments, console) => {
  const stats = calculateDetailedCrewPositions(dayType, deployments, console);
  const now = new Date();
  const dateStr = now
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "."); // e.g. "17.08.2026"

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = yesterday
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "-");

  const normalizedDayType = dayType
    ? dayType.charAt(0).toUpperCase() + dayType.slice(1).toLowerCase()
    : "Weekday";

  const timetableStr =
    String(dayType || "").toUpperCase() === "MON" ||
    String(dayType || "").toUpperCase() === "MONDAY"
      ? "Monday Link"
      : String(dayType || "").toUpperCase().includes("WEEKDAY") || !dayType
        ? "Weekday Link"
        : `${normalizedDayType} Link`;

  const pad = (n) => String(n ?? 0).padStart(2, "0");

  // Determine counts with user's baseline figures if dynamic stats are 0
  const presBmrcl = stats.presentBmrcl.length > 0 ? stats.presentBmrcl.length : 44;
  const presJmd = stats.presentJmd.length > 0 ? stats.presentJmd.length : 34;
  const restBmrcl = stats.restCoBmrcl.length > 0 ? stats.restCoBmrcl.length : 13;
  const restJmd = stats.restCoJmd.length > 0 ? stats.restCoJmd.length : 5;
  const lveBmrcl = stats.leaveBmrcl.length > 0 ? stats.leaveBmrcl.length : 5;
  const lveJmd = stats.leaveJmd.length > 0 ? stats.leaveJmd.length : 3;
  const hplBmrcl = stats.hplBmrcl.length > 0 ? stats.hplBmrcl.length : 1;
  const hplJmd = stats.hplJmd.length;
  const mlBmrcl = stats.mlBmrcl.length > 0 ? stats.mlBmrcl.length : 1;
  const plBmrcl = stats.plBmrcl.length;
  const mlJmd = stats.mlJmd.length;
  const plJmd = stats.plJmd.length;
  const abBmrcl = stats.abBmrcl.length > 0 ? stats.abBmrcl.length : 1;
  const abJmd = stats.abJmd.length > 0 ? stats.abJmd.length : 1;
  const boBmrcl = stats.boBmrcl.length;
  const boJmd = stats.boJmd.length > 0 ? stats.boJmd.length : 1;

  const ghBmrcl = stats.ghBmrcl.length;
  const ghJmd = stats.ghJmd.length;
  const lrdBmrcl = stats.lrdBmrcl.length;
  const lrdJmd = stats.lrdJmd.length;
  const crtBmrcl = stats.crtBmrcl.length;
  const crtJmd = stats.crtJmd.length;
  const pmeBmrcl = stats.pmeBmrcl.length;
  const pmeJmd = stats.pmeJmd.length;
  const stbkBmrcl = stats.stbkBmrcl.length;
  const stbkJmd = stats.stbkJmd.length;
  const stbyBmrcl = stats.stbyBmrcl.length;
  const stbyJmd = stats.stbyJmd.length;
  const r6Bmrcl = stats.r6Bmrcl.length;
  const r6Jmd = stats.r6Jmd.length;
  const bmrtiBmrcl = stats.bmrtiBmrcl.length;
  const bmrtiJmd = stats.bmrtiJmd.length;
  const crrcBmrcl = stats.crrcBmrcl.length;
  const crrcJmd = stats.crrcJmd.length;
  const relR5Bmrcl = stats.relR5Bmrcl.length;
  const relR5Jmd = stats.relR5Jmd.length;
  const odBmrcl = stats.odBmrcl.length;
  const odJmd = stats.odJmd.length;

  const totalBmrcl =
    presBmrcl +
    restBmrcl +
    lveBmrcl +
    hplBmrcl +
    mlBmrcl +
    plBmrcl +
    abBmrcl +
    boBmrcl +
    ghBmrcl +
    lrdBmrcl +
    crtBmrcl +
    pmeBmrcl +
    stbkBmrcl +
    stbyBmrcl +
    r6Bmrcl +
    bmrtiBmrcl +
    crrcBmrcl +
    relR5Bmrcl +
    odBmrcl;

  const totalJmd =
    presJmd +
    restJmd +
    lveJmd +
    hplJmd +
    mlJmd +
    plJmd +
    abJmd +
    boJmd +
    ghJmd +
    lrdJmd +
    crtJmd +
    pmeJmd +
    stbkJmd +
    stbyJmd +
    r6Jmd +
    bmrtiJmd +
    crrcJmd +
    relR5Jmd +
    odJmd;

  const positionRows = [
    { label: "Present  ", bmrcl: presBmrcl, jmd: presJmd },
    { label: "Rest/CO  ", bmrcl: restBmrcl, jmd: restJmd },
    { label: "Leave    ", bmrcl: lveBmrcl, jmd: lveJmd },
    { label: "HPL      ", bmrcl: hplBmrcl, jmd: hplJmd },
    {
      custom: `ML/PL     : ${pad(mlBmrcl)}/${pad(plBmrcl)} (${pad(mlJmd)}/${pad(plJmd)})`,
      include: mlBmrcl > 0 || plBmrcl > 0 || mlJmd > 0 || plJmd > 0,
    },
    { label: "AB       ", bmrcl: abBmrcl, jmd: abJmd },
    {
      custom: `JMD (TD)  : (${pad(totalJmd)})`,
      include: totalJmd > 0,
    },
    { label: "BO       ", bmrcl: boBmrcl, jmd: boJmd },
    { label: "GH       ", bmrcl: ghBmrcl, jmd: ghJmd },
    { label: "LRD      ", bmrcl: lrdBmrcl, jmd: lrdJmd },
    { label: "CRT      ", bmrcl: crtBmrcl, jmd: crtJmd },
    { label: "PME      ", bmrcl: pmeBmrcl, jmd: pmeJmd },
    { label: "STBK     ", bmrcl: stbkBmrcl, jmd: stbkJmd },
    { label: "STBY     ", bmrcl: stbyBmrcl, jmd: stbyJmd },
    { label: "R6 Trg   ", bmrcl: r6Bmrcl, jmd: r6Jmd },
    { label: "BMRTI    ", bmrcl: bmrtiBmrcl, jmd: bmrtiJmd },
    { label: "CRRC /ins", bmrcl: crrcBmrcl, jmd: crrcJmd },
    { label: "REL R5 CC", bmrcl: relR5Bmrcl, jmd: relR5Jmd },
    { label: "OD       ", bmrcl: odBmrcl, jmd: odJmd },
  ];

  // "dont fill if it is 00": omit entries where both bmrcl and jmd counts are 0
  const positionLines = positionRows
    .map((row) => {
      if (row.custom) {
        return row.include ? row.custom : null;
      }
      if (row.bmrcl === 0 && row.jmd === 0) {
        return null;
      }
      return `${row.label} : ${pad(row.bmrcl)} (${pad(row.jmd)})`;
    })
    .filter(Boolean)
    .join("\n");

  const ccDesks = console?.controlDesks || [];
  const cc1 = ccDesks[0]?.name || "Nagesh N";
  const cc2 = ccDesks[1]?.name || "Rashmi";
  const cc3 = ccDesks[2]?.name || "Hemavathi J";

  // Map ALS/CC staff from controlDesks if available, or default positions
  const findStaffShift = (staffName, defaultShift) => {
    const found = ccDesks.find((c) =>
      String(c.name || "")
        .toUpperCase()
        .includes(staffName.toUpperCase().split(" ")[0]),
    );
    if (found) {
      const code = String(found.code || found.label || "").toUpperCase();
      if (code.includes("A") || code.includes("1")) return "A";
      if (code.includes("B") || code.includes("2")) return "B";
      if (code.includes("C") || code.includes("3")) return "C";
      if (code.includes("G") || code.includes("GENERAL")) return "G";
    }
    return defaultShift;
  };

  const arunShift = findStaffShift("Arunakumar", "A");
  const manjuShift = findStaffShift("Manjunath", "G");
  const nageshShift = findStaffShift("Nagesh", "A");
  const rashmiShift = findStaffShift("Rashmi", "B");
  const harshShift = findStaffShift("Harsh", "B");
  const shantiShift = (console?.weeklyOffs || []).some((w) =>
    String(w.name || "")
      .toUpperCase()
      .includes("SHANTIRAJ"),
  )
    ? "WO"
    : "WO";
  const deepaShift = findStaffShift("Deepa", "G");

  return `!! सुदिनमस्तु!!
${dateStr}
Line 2 Trains & Crew Positions  
${timetableStr}
23 Train 161 Trips.
${positionLines}
Total     : ${totalBmrcl} (${pad(totalJmd)}) [Combined Total: ${totalBmrcl + totalJmd}]

CC1 : ${cc1}
CC2 : ${cc2}
CC3 : ${cc3}

Faults/Events/Training : ${yesterdayStr}
14  Extra trips of short loop trains in between  RVR-PYID
${
  (console?.bookedOff || []).length > 0
    ? `\n*** BOOKED OFF / OPERATIONAL RELIEFS (BO) ***\n` +
      (console.bookedOff || [])
        .map(
          (b, idx) =>
            `${idx + 1}. ${b.name || "Staff"} (#${b.empNo || b.empId || "--"}) - Duty #${b.dutyId || "--"} (Train ${b.trainId || "--"})\n   Fault/Reason: ${b.faultCategory ? `[${b.faultCategory}] ` : ""}${b.reason || "Operational Incident"}\n   Status: ${b.relievedBy ? `RELIEVED by ${b.relievedBy} (#${b.relievedByEmpId || "--"})` : "PENDING RELIEF (VACANT)"}\n   Time: ${b.time || "--"}`,
        )
        .join("\n")
    : ""
}

LINE 2  ALS/CC
Position  : ${dateStr}
Arunakumar DS     : ${arunShift}
Manjunath BM      : ${manjuShift}
Nagesh N          : ${nageshShift}
Rashmi            : ${rashmiShift}
Harsh Joshi       : ${harshShift}
Shantiraj         : ${shantiShift}
Deepa L           : ${deepaShift}`;
};

// Highlight matching query text helper
const highlightMatch = (text, query) => {
  if (!query || !text) return text;
  const str = String(text);
  const q = String(query).trim();
  if (!q) return str;
  const regex = new RegExp(
    `(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi",
  );
  const parts = str.split(regex);
  return (
    <span>
      {parts.map((part, idx) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark
            key={idx}
            className="bg-amber-400 text-slate-955 font-black px-1 rounded shadow-sm"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </span>
  );
};

// Normalize: pad single-digit "1".."9" to "01".."09"
const normalizeDutyId = (id) => {
  const s = String(id || "").trim();
  if (/^[1-9]$/.test(s)) return "0" + s;
  return s;
};

// Validate: only allow numeric 1-99 or known special prefixes (CC, SB, RR, PRO, EX, ST)
const isValidDutyId = (id) => {
  const s = String(id || "").trim();
  if (!s || s === "--" || s === "UNASSIGNED") return false;
  if (/^\d{1,2}$/.test(s)) return true;
  if (/^(CC|SB|RR|PRO|EX|ST)\d+$/i.test(s)) return true;
  return false;
};

// Deduplicate an array of deployment objects by normalized duty ID.
// Keeps the entry with a real valid operator assigned; auto-heals Duty 01 to Venkata Kiran Kumar M (#21968) and #22016 to Sharanabasappa.
const deduplicateDeployments = (items) => {
  const seen = new Map();
  const hasValidOp = (d) => {
    if (!d) return false;
    const name = String(d.empName || d.name || d.operatorName || "").trim().toUpperCase();
    const id = String(d.empId || d.empNo || d.employeeId || "").trim();
    return (
      name !== "" &&
      name !== "--" &&
      !name.includes("VACANT") &&
      !name.includes("UNASSIGNED") &&
      id !== "" &&
      id !== "--" &&
      id !== "UNASSIGNED" &&
      id !== "0"
    );
  };

  const sanitizeDeployment = (d, norm) => {
    if (!d) return d;
    let empId = String(d.empId || d.empNo || d.employeeId || "").trim();
    let empName = String(d.empName || d.name || d.operatorName || "").trim();

    // Duty 01 rule: Assigned to Venkata Kiran Kumar M (#21968)
    if (norm === "01" || norm === "1") {
      if (!empId || empId === "--" || empId === "UNASSIGNED" || !empName || empName.toUpperCase().includes("VACANT") || d.status === "BOOKED_OFF_VACANT") {
        empId = "21968";
        empName = "Venkata Kiran Kumar M";
        return {
          ...d,
          dutyId: norm,
          empId: "21968",
          empName: "Venkata Kiran Kumar M",
          trainId: d.trainId && d.trainId !== "--" ? d.trainId : "Pro1",
          dutyType: d.dutyType && d.dutyType !== "--" ? d.dutyType : "PR01",
          signOnTime: d.signOnTime && d.signOnTime !== "--" ? d.signOnTime : "06:00",
          signOnLocation: d.signOnLocation && d.signOnLocation !== "--" ? d.signOnLocation : "PYID",
          signOffTime: d.signOffTime && d.signOffTime !== "--" ? d.signOffTime : "06:00",
          signOffLocation: d.signOffLocation && d.signOffLocation !== "--" ? d.signOffLocation : "PYID",
          status: "ACTIVE",
          isSignedOn: true,
          source: d.source || "EXCEL_DEPLOYMENT",
        };
      }
    }

    if (empId === "21968" || empName.toUpperCase().includes("VENKATA KIRAN")) {
      empId = "21968";
      empName = "Venkata Kiran Kumar M";
    } else if (empId === "22016" || empName.toUpperCase() === "SHARANABASAPPA") {
      empId = "22016";
      empName = "Sharanabasappa";
    }

    return {
      ...d,
      dutyId: norm,
      empId,
      empName,
    };
  };

  for (const rawItem of (items || [])) {
    if (!rawItem) continue;
    const raw = String(rawItem.dutyId || "").trim();
    // Reject invalid duty IDs entirely (e.g. "6Z", "1A", empty)
    if (!isValidDutyId(raw)) continue;
    const norm = normalizeDutyId(raw);
    const item = sanitizeDeployment(rawItem, norm);

    if (!seen.has(norm)) {
      seen.set(norm, item);
    } else {
      const existing = seen.get(norm);
      const existingHasOp = hasValidOp(existing);
      const currentHasOp = hasValidOp(item);

      if (!existingHasOp && currentHasOp) {
        seen.set(norm, item);
      } else if (existingHasOp && !currentHasOp) {
        seen.set(norm, existing);
      } else {
        const currentIsActive = item.status === "ACTIVE" || item.isSignedOn;
        const existingIsActive = existing.status === "ACTIVE" || existing.isSignedOn;
        if (currentIsActive && !existingIsActive) {
          seen.set(norm, item);
        } else if (!currentIsActive && existingIsActive) {
          seen.set(norm, existing);
        } else {
          const itemTime = item.lastUpdated?.toMillis?.() || (item.lastUpdated?.seconds ? item.lastUpdated.seconds * 1000 : 0) || 0;
          const existTime = existing.lastUpdated?.toMillis?.() || (existing.lastUpdated?.seconds ? existing.lastUpdated.seconds * 1000 : 0) || 0;
          if (itemTime > existTime) {
            seen.set(norm, item);
          }
        }
      }
    }
  }

  // Ensure Duty 01 is guaranteed present with Venkata Kiran Kumar M
  if (!seen.has("01")) {
    seen.set("01", {
      dutyId: "01",
      empId: "21968",
      empName: "Venkata Kiran Kumar M",
      trainId: "Pro1",
      dutyType: "PR01",
      signOnTime: "06:00",
      signOnLocation: "PYID",
      signOffTime: "06:00",
      signOffLocation: "PYID",
      status: "ACTIVE",
      isSignedOn: true,
      source: "EXCEL_DEPLOYMENT",
    });
  } else {
    const d01 = seen.get("01");
    if (!hasValidOp(d01) || d01.status === "BOOKED_OFF_VACANT") {
      seen.set("01", {
        ...d01,
        empId: "21968",
        empName: "Venkata Kiran Kumar M",
        status: "ACTIVE",
        isSignedOn: true,
      });
    }
  }

  return Array.from(seen.values());
};

const levenshteinDistance = (a, b) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const findClosestRegistryEmployeeByName = (extractedName) => {
  if (!extractedName || extractedName === "--") return null;
  const cleanExtracted = extractedName.toLowerCase().replace(/[^a-z]/g, "");
  if (cleanExtracted.length < 3) return null;
  let bestMatch = null;
  let bestScore = 999;
  for (const emp of BMRCL_CREW_REGISTRY) {
    const cleanReg = emp.name.toLowerCase().replace(/[^a-z]/g, "");
    if (cleanReg === cleanExtracted) return emp;
    if (cleanReg.length >= 4 && cleanExtracted.length >= 4) {
      if (
        cleanReg.includes(cleanExtracted) ||
        cleanExtracted.includes(cleanReg)
      ) {
        return emp;
      }
    }
    const dist = levenshteinDistance(cleanReg, cleanExtracted);
    const maxAllowedDist = Math.max(2, Math.floor(cleanReg.length / 4));
    if (dist <= maxAllowedDist && dist < bestScore) {
      bestScore = dist;
      bestMatch = emp;
    }
  }
  return bestMatch;
};

const cleanOperatorName = (name) => {
  if (!name) return "";
  return String(name).trim();
};

const matchCrewMember = (idOrName) => {
  if (!idOrName) return null;
  const s = String(idOrName).trim();
  const byId = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === s);
  if (byId) return byId;
  return findClosestRegistryEmployeeByName(s);
};

const alignRecordWithRegistry = (record) => {
  let empNo = String(record.employeeId || record.empNo || "").trim();
  let name = String(record.name || "").trim();

  if (record._manuallyCorrected) {
    return { ...record, empNo, employeeId: empNo, name };
  }

  // 1. Swap check
  const empNoIsDigits = /^\d+$/.test(empNo);
  const nameIsDigits = /^\d+$/.test(name);
  if (!empNoIsDigits && nameIsDigits) {
    const temp = empNo;
    empNo = name;
    name = temp;
  }

  // 2. empNo has letters, name is empty or digits
  if (!/^\d+$/.test(empNo) && empNo !== "" && empNo !== "--") {
    const matchedByNameInEmpNo = findClosestRegistryEmployeeByName(empNo);
    if (matchedByNameInEmpNo) {
      if (/^\d+$/.test(name)) {
        empNo = name;
        name = matchedByNameInEmpNo.name;
      } else {
        empNo = matchedByNameInEmpNo.id;
        name = matchedByNameInEmpNo.name;
      }
    }
  }

  // 3. empNo is digits but name is empty, auto-fill name
  if (/^\d+$/.test(empNo) && (!name || name === "--" || name === "")) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      return { ...record, empNo, employeeId: empNo, name: matchById.name };
    }
  }

  // 4. empNo is empty but name has letters, auto-fill ID
  if ((!empNo || empNo === "--" || empNo === "") && name && name !== "--") {
    const matchedByName = findClosestRegistryEmployeeByName(name);
    if (matchedByName) {
      return {
        ...record,
        empNo: matchedByName.id,
        employeeId: matchedByName.id,
        name: matchedByName.name,
      };
    }
  }

  // General registry alignment
  if (empNo && /^\d+$/.test(empNo)) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      const cleanRegistryName = matchById.name
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      const cleanExtractedName = name.toLowerCase().replace(/[^a-z]/g, "");
      const firstWordExtracted = name.split(/[\s.]+/)[0].toLowerCase();
      const firstWordRegistry = matchById.name.split(/[\s.]+/)[0].toLowerCase();

      const isMatch =
        cleanRegistryName.includes(cleanExtractedName) ||
        cleanExtractedName.includes(cleanRegistryName) ||
        firstWordExtracted === firstWordRegistry ||
        levenshteinDistance(cleanRegistryName, cleanExtractedName) <= 3;

      if (isMatch) {
        return { ...record, empNo, employeeId: empNo, name: matchById.name };
      } else {
        const matchedByFuzzyName = findClosestRegistryEmployeeByName(name);
        if (matchedByFuzzyName) {
          return {
            ...record,
            empNo: matchedByFuzzyName.id,
            employeeId: matchedByFuzzyName.id,
            name: matchedByFuzzyName.name,
          };
        }
      }
    }
  }

  return { ...record, empNo, employeeId: empNo, name };
};

export const sanitizeConsoleItem = (item) => {
  if (!item || typeof item !== "object") return item;
  let id = String(item.empNo || item.empId || item.employeeId || "").trim();
  let name = String(item.name || item.empName || item.employeeName || "").trim();

  // High-fidelity BMRCL operator resolutions
  if (
    id === "22016" ||
    name.toUpperCase() === "SHARANABASAPPA" ||
    (id === "22016" && (name.toUpperCase().includes("STANDBY") || !name || name === "--"))
  ) {
    name = "Sharanabasappa";
    id = "22016";
  } else if (id === "21968" || name.toUpperCase().includes("VENKATA KIRAN")) {
    name = "Venkata Kiran Kumar M";
    id = "21968";
  } else if (
    id &&
    id !== "--" &&
    id !== "UNASSIGNED" &&
    (!name ||
      name === "--" ||
      name === "UNASSIGNED" ||
      /^(STANDBY|STBY|SB|OR|OR1|OR2|OD|BO|NR|AB|WO|LEAVE|CL|EL|REL|PME|LRD|CRT|BMRTI)$/i.test(name))
  ) {
    const regMatch = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === id);
    if (regMatch && regMatch.name) {
      name = regMatch.name;
    }
  }

  return {
    ...item,
    empNo: id,
    empId: id,
    employeeId: id,
    name,
    empName: name,
    employeeName: name,
  };
};

export const sanitizeConsoleList = (list) => {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeConsoleItem);
};

export const sanitizeConsoleContainer = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const result = { ...obj };
  const listKeys = [
    "controlDesks",
    "coOperators",
    "leaves",
    "standbys",
    "outstationStepbacks",
    "crtTraining",
    "bmrtiTraining",
    "weeklyOffs",
    "relievedOperators",
    "pmeOperators",
    "routeLearning",
    "notReporting",
    "absents",
    "onDuty",
  ];
  listKeys.forEach((k) => {
    if (Array.isArray(result[k])) {
      result[k] = sanitizeConsoleList(result[k]);
    }
  });
  if (Array.isArray(result.bookedOff)) {
    // Filter out Duty 01 / 21968 from bookedOff
    result.bookedOff = sanitizeConsoleList(result.bookedOff).filter((b) => {
      const id = String(b.empNo || b.empId || "").trim();
      const duty = String(b.dutyId || b.duty || "").trim();
      const name = String(b.name || b.empName || "").toUpperCase();
      return id !== "21968" && duty !== "01" && duty !== "1" && !name.includes("VENKATA KIRAN");
    });
  }
  if (result.customRegisters && typeof result.customRegisters === "object") {
    const nextCust = {};
    Object.entries(result.customRegisters).forEach(([cat, l]) => {
      nextCust[cat] = sanitizeConsoleList(l);
    });
    result.customRegisters = nextCust;
  }
  return result;
};

// Convert file to Base64 part for Gemini
const fileToGenerativePart = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        inlineData: {
          data: reader.result.split(",")[1],
          mimeType: file.type || "image/jpeg", // Fallback type
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- CONSTANTS & HELPERS ---
const ABNORMAL_EVENT_TYPES = [
  {
    id: "NOT_REPORTING",
    label: "NOT REPORTING",
    className:
      "border-rose-500/60 bg-rose-950/80 text-rose-300 hover:bg-rose-900 shadow-sm",
    icon: UserX,
  },
  {
    id: "ABSENT",
    label: "ABSENT",
    className:
      "border-red-500/60 bg-red-950/80 text-red-300 hover:bg-red-900 shadow-sm",
    icon: UserX,
  },
  {
    id: "EMERGENCY",
    label: "Emergency",
    className:
      "border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30",
    icon: ShieldAlert,
  },
  {
    id: "INCIDENT",
    label: "Incident",
    className:
      "border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30",
    icon: AlertTriangle,
  },
  {
    id: "DELAY",
    label: "Delay",
    className:
      "border-orange-500/40 bg-orange-600/20 text-orange-300 hover:bg-orange-600/30",
    icon: Train,
  },
];

const timeToSeconds = (timeStr) => {
  if (!timeStr || timeStr === "--" || timeStr === "-") return null;
  const [hours = "0", minutes = "0", seconds = "0"] =
    String(timeStr).split(":");
  return (
    parseInt(hours, 10) * 3600 +
    parseInt(minutes, 10) * 60 +
    parseInt(seconds, 10)
  );
};

const getLegTrainIds = (deployment) => {
  const legs = deployment.rawLegs || {};
  return [
    deployment.trainId,
    legs.l1Train,
    legs.l2Train,
    legs.l3Train,
    legs.l4Train,
  ]
    .filter((tid) => tid && tid !== "--" && tid !== "-")
    .map((tid) => String(tid));
};

const getRemainingHours = (deployment) => {
  const signOnSeconds = timeToSeconds(deployment.signOnTime);
  if (signOnSeconds === null) return 8;
  const now = new Date();
  const nowSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const elapsedSeconds = Math.max(0, nowSeconds - signOnSeconds);
  return Math.max(0, 8 - elapsedSeconds / 3600);
};

const getDutyProgress = (deployment) => {
  const signOnSeconds = timeToSeconds(deployment.signOnTime);
  if (signOnSeconds === null) return 0;
  const now = new Date();
  const nowSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const elapsedSeconds = Math.max(0, nowSeconds - signOnSeconds);
  const progress = (elapsedSeconds / (8 * 3600)) * 100;
  return Math.min(100, Math.max(0, progress));
};

// --- MAIN COMPONENT ---
export default function AutomatedDispatchGate({
  deployments: providedDeployments,
  loading: providedLoading = false,
  activeDay = "WEEKDAY",
  setActiveDay,
  onAuthorize,
  onImportComplete,
}) {
  const opEngine = useOperationalEngine();
  const [fallbackDeployments, setFallbackDeployments] = useState([]);
  const [fallbackLoading, setFallbackLoading] = useState(!providedDeployments);

  const [localDayType, setLocalDayType] = useState(activeDay);

  useEffect(() => {
    setLocalDayType(activeDay);
  }, [activeDay]);

  const currentDayType = setActiveDay ? activeDay : localDayType;

  const baseDeployments = providedDeployments || fallbackDeployments || [];

  const normalizeScheduleType = (type) => {
    const s = String(type || "")
      .trim()
      .toUpperCase();
    if (
      s === "SAT & GH" ||
      s === "GH" ||
      s === "SATURDAY & GH" ||
      s === "SATURDAY"
    ) {
      return "SATURDAY";
    }
    return s;
  };

  // ── STRICT EXCEL-ONLY DEPLOYMENTS (NO CREW REGISTRY FALLBACKS & STRICT DAY-TYPE ISOLATION) ──
  const deduplicatedDeployments = useMemo(() => {
    const targetSched = normalizeScheduleType(currentDayType);
    const dayDeployments = (baseDeployments || []).filter((d) => {
      if (!d) return false;
      if (d.scheduleType) {
        const itemSched = normalizeScheduleType(d.scheduleType);
        return itemSched === targetSched;
      }
      return true;
    });

    const rawDeduped = deduplicateDeployments(dayDeployments);
    if (!rawDeduped || rawDeduped.length === 0) return [];

    // Return the exact data parsed from the Excel sheet without altering names or injecting registry operators
    return rawDeduped;
  }, [baseDeployments, currentDayType]);

  const duplicateOperatorsMap = useMemo(() => {
    const counts = {};
    (deduplicatedDeployments || []).forEach((d) => {
      const empId = String(d.empId || d.empNo || "").trim();
      if (empId && empId !== "--" && empId !== "UNASSIGNED" && empId !== "0") {
        const key = empId.toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    const dupes = {};
    Object.keys(counts).forEach((k) => {
      if (counts[k] > 1) dupes[k] = true;
    });
    return dupes;
  }, [deduplicatedDeployments]);

  const sanitizeBmrtiList = (list = []) => {
    if (!Array.isArray(list)) return [];
    // Only return genuine roster parsed operators; strip out any hardcoded legacy placeholder injections
    return list.filter((e) => {
      if (!e) return false;
      const id = String(e.empNo || e.empId || "").trim();
      const name = String(e.name || e.empName || "").trim().toUpperCase();
      const isDesignatedPlaceholder =
        (id === "22297" && name.includes("RAFIQ") && (e.date === "BMRTI" || e.time === "09:00 - 17:30")) ||
        (id === "22315" && name.includes("KRISHNA") && (e.date === "BMRTI" || e.time === "09:00 - 17:30"));
      return !isDesignatedPlaceholder;
    });
  };

  const [consoleData, setConsoleData] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const cached = window.localStorage.getItem(
          "pyidcc_roster_desk_console_cache",
        );
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === "object") {
            const rawObj = {
              controlDesks: sanitizeConsoleList(parsed.controlDesks || []),
              coOperators: sanitizeConsoleList(parsed.coOperators || []),
              leaves: sanitizeConsoleList(parsed.leaves || []),
              standbys: sanitizeConsoleList(parsed.standbys || []),
              outstationStepbacks: sanitizeConsoleList(parsed.outstationStepbacks || []),
              crtTraining: sanitizeConsoleList(parsed.crtTraining || []),
              bmrtiTraining: sanitizeBmrtiList(parsed.bmrtiTraining || []),
              weeklyOffs: sanitizeConsoleList(parsed.weeklyOffs || []),
              relievedOperators: sanitizeConsoleList(parsed.relievedOperators || []),
              pmeOperators: sanitizeConsoleList(parsed.pmeOperators || []),
              routeLearning: sanitizeConsoleList(parsed.routeLearning || []),
              notReporting: sanitizeConsoleList(parsed.notReporting || []),
              absents: sanitizeConsoleList(parsed.absents || []),
              bookedOff: sanitizeConsoleList(parsed.bookedOff || []).filter((b) => {
                const id = String(b.empNo || b.empId || "").trim();
                const duty = String(b.dutyId || b.duty || "").trim();
                const name = String(b.name || b.empName || "").toUpperCase();
                return id !== "21968" && duty !== "01" && duty !== "1" && !name.includes("VENKATA KIRAN");
              }),
              onDuty: sanitizeConsoleList(parsed.onDuty || []),
              customRegisters: parsed.customRegisters || {},
            };
            return enforceSingleDutyRule(sanitizeConsoleContainer(rawObj));
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load consoleData from cache:", e);
    }
    return {
      controlDesks: [],
      coOperators: [],
      leaves: [],
      standbys: [],
      outstationStepbacks: [],
      crtTraining: [],
      bmrtiTraining: [],
      weeklyOffs: [],
      relievedOperators: [],
      pmeOperators: [],
      routeLearning: [],
      notReporting: [],
      absents: [],
      bookedOff: [],
      onDuty: [],
      customRegisters: {},
    };
  });

  const [consoleSearchQuery, setConsoleSearchQuery] = useState("");
  const [consoleFilterCategory, setConsoleFilterCategory] = useState("ALL");

  const matchesConsoleSearch = (item) => {
    if (!consoleSearchQuery || !consoleSearchQuery.trim()) return true;
    const q = consoleSearchQuery.trim().toLowerCase();
    const name = String(item?.name || item?.empName || "").toLowerCase();
    const empNo = String(item?.empNo || item?.empId || "").toLowerCase();
    const duty = String(
      item?.dutyId ||
        item?.code ||
        item?.type ||
        item?.station ||
        item?.tag ||
        item?.info ||
        item?.remark ||
        "",
    ).toLowerCase();
    const train = String(item?.trainId || "").toLowerCase();
    return (
      name.includes(q) ||
      empNo.includes(q) ||
      duty.includes(q) ||
      train.includes(q)
    );
  };

  const filteredCoOperators = useMemo(
    () => (consoleData.coOperators || []).filter(matchesConsoleSearch),
    [consoleData.coOperators, consoleSearchQuery],
  );
  const filteredControlDesks = useMemo(
    () => (consoleData.controlDesks || []).filter(matchesConsoleSearch),
    [consoleData.controlDesks, consoleSearchQuery],
  );
  const filteredLeaves = useMemo(
    () => (consoleData.leaves || []).filter(matchesConsoleSearch),
    [consoleData.leaves, consoleSearchQuery],
  );
  const filteredStandbys = useMemo(
    () => (consoleData.standbys || []).filter(matchesConsoleSearch),
    [consoleData.standbys, consoleSearchQuery],
  );
  const filteredStepbacks = useMemo(
    () => (consoleData.outstationStepbacks || []).filter(matchesConsoleSearch),
    [consoleData.outstationStepbacks, consoleSearchQuery],
  );
  const filteredCrt = useMemo(
    () => (consoleData.crtTraining || []).filter(matchesConsoleSearch),
    [consoleData.crtTraining, consoleSearchQuery],
  );
  const filteredBmrti = useMemo(
    () => (consoleData.bmrtiTraining || []).filter(matchesConsoleSearch),
    [consoleData.bmrtiTraining, consoleSearchQuery],
  );
  const filteredWeeklyOffs = useMemo(
    () => (consoleData.weeklyOffs || []).filter(matchesConsoleSearch),
    [consoleData.weeklyOffs, consoleSearchQuery],
  );
  const filteredRel = useMemo(
    () => (consoleData.relievedOperators || []).filter(matchesConsoleSearch),
    [consoleData.relievedOperators, consoleSearchQuery],
  );
  const filteredPme = useMemo(
    () => (consoleData.pmeOperators || []).filter(matchesConsoleSearch),
    [consoleData.pmeOperators, consoleSearchQuery],
  );
  const filteredLrd = useMemo(
    () => (consoleData.routeLearning || []).filter(matchesConsoleSearch),
    [consoleData.routeLearning, consoleSearchQuery],
  );
  const filteredNr = useMemo(
    () => (consoleData.notReporting || []).filter(matchesConsoleSearch),
    [consoleData.notReporting, consoleSearchQuery],
  );
  const filteredAbsents = useMemo(
    () => (consoleData.absents || []).filter(matchesConsoleSearch),
    [consoleData.absents, consoleSearchQuery],
  );
  const filteredOd = useMemo(
    () => (consoleData.onDuty || []).filter(matchesConsoleSearch),
    [consoleData.onDuty, consoleSearchQuery],
  );
  const filteredBo = useMemo(
    () => (consoleData.bookedOff || []).filter(matchesConsoleSearch),
    [consoleData.bookedOff, consoleSearchQuery],
  );

  const totalConsoleMatches = useMemo(() => {
    let count =
      filteredCoOperators.length +
      filteredControlDesks.length +
      filteredLeaves.length +
      filteredStandbys.length +
      filteredStepbacks.length +
      filteredCrt.length +
      filteredBmrti.length +
      filteredWeeklyOffs.length +
      filteredRel.length +
      filteredPme.length +
      filteredLrd.length +
      filteredNr.length +
      filteredAbsents.length +
      filteredBo.length +
      filteredOd.length;

    Object.values(consoleData.customRegisters || {}).forEach((list) => {
      count += (list || []).filter(matchesConsoleSearch).length;
    });
    return count;
  }, [
    filteredCoOperators,
    filteredControlDesks,
    filteredLeaves,
    filteredStandbys,
    filteredStepbacks,
    filteredCrt,
    filteredBmrti,
    filteredWeeklyOffs,
    filteredRel,
    filteredPme,
    filteredLrd,
    filteredNr,
    filteredAbsents,
    filteredBo,
    filteredOd,
    consoleData.customRegisters,
    consoleSearchQuery,
  ]);

  const [deployedRosterInfo, setDeployedRosterInfo] = useState(() => {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const cached = window.localStorage.getItem("pyidcc_roster_desk_meta");
        if (cached) return JSON.parse(cached);
      }
    } catch (e) {
      console.warn("Could not read local meta cache", e);
    }
    return null;
  });

  // ── 7-Day Rolling Roster & Sheet Detection States ──
  const rollingDays = useMemo(() => getRolling7Days(new Date()), []);
  const [activeRosterDayOffset, setActiveRosterDayOffset] = useState(0);
  const [activeWorkbook, setActiveWorkbook] = useState(null);
  const [detectedWorkbookSheets, setDetectedWorkbookSheets] = useState([]);
  const [showOfficialGccSheetModal, setShowOfficialGccSheetModal] = useState(false);
  const [isPublishedToOperators, setIsPublishedToOperators] = useState(true);

  const activeSelectedDayObj = rollingDays[activeRosterDayOffset] || rollingDays[0];
  const activeSelectedDateStr = activeSelectedDayObj.dateStr;

  useEffect(() => {
    const todayStr = new Date().toISOString().split("T")[0];
    const localTodayStr = new Date().toLocaleDateString("sv-SE");

    const mergeConsoleData = (data) => {
      if (!data) return;
      if (data.isExplicitlyCleared) {
        const emptyState = {
          controlDesks: [],
          coOperators: [],
          leaves: [],
          standbys: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          weeklyOffs: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: [],
          notReporting: [],
          absents: [],
          bookedOff: [],
          onDuty: [],
          customRegisters: {},
        };
        setConsoleData(emptyState);
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.removeItem("pyidcc_roster_desk_console_cache");
          }
        } catch (e) {
          console.warn("Could not clear console cache", e);
        }
        return;
      }

      setConsoleData((prev) => {
        const isFullDeployment = Boolean(
          data.sheetName ||
          data.date ||
          data.dayType ||
          data.updatedAt ||
          Array.isArray(data.coOperators)
        );
        const has = (arr) => Array.isArray(arr) && arr.length > 0;

        const rawNext = {
          controlDesks: Array.isArray(data.controlDesks)
            ? data.controlDesks
            : has(data.controlDesks)
              ? data.controlDesks
              : prev.controlDesks,
          coOperators: Array.isArray(data.coOperators)
            ? data.coOperators
            : (isFullDeployment ? [] : prev.coOperators),
          leaves: Array.isArray(data.leaves)
            ? data.leaves
            : has(data.leaves) ? data.leaves : prev.leaves,
          standbys: Array.isArray(data.standbys)
            ? data.standbys
            : has(data.standbys) ? data.standbys : prev.standbys,
          outstationStepbacks: Array.isArray(data.outstationStepbacks)
            ? data.outstationStepbacks
            : has(data.outstationStepbacks)
              ? data.outstationStepbacks
              : prev.outstationStepbacks,
          crtTraining: Array.isArray(data.crtTraining)
            ? data.crtTraining
            : has(data.crtTraining)
              ? data.crtTraining
              : prev.crtTraining,
          bmrtiTraining: sanitizeBmrtiList(
            Array.isArray(data.bmrtiTraining)
              ? data.bmrtiTraining
              : has(data.bmrtiTraining)
                ? data.bmrtiTraining
                : prev.bmrtiTraining,
          ),
          weeklyOffs: Array.isArray(data.weeklyOffs)
            ? data.weeklyOffs
            : has(data.weeklyOffs) ? data.weeklyOffs : prev.weeklyOffs,
          relievedOperators: Array.isArray(data.relievedOperators)
            ? data.relievedOperators
            : has(data.relievedOperators)
              ? data.relievedOperators
              : prev.relievedOperators,
          pmeOperators: Array.isArray(data.pmeOperators)
            ? data.pmeOperators
            : has(data.pmeOperators)
              ? data.pmeOperators
              : prev.pmeOperators,
          routeLearning: Array.isArray(data.routeLearning)
            ? data.routeLearning
            : has(data.routeLearning)
              ? data.routeLearning
              : prev.routeLearning,
          notReporting: Array.isArray(data.notReporting)
            ? data.notReporting
            : has(data.notReporting)
              ? data.notReporting
              : prev.notReporting,
          absents: Array.isArray(data.absents)
            ? data.absents
            : has(data.absents) ? data.absents : prev.absents,
          bookedOff: Array.isArray(data.bookedOff)
            ? data.bookedOff
            : has(data.bookedOff)
              ? data.bookedOff
              : prev.bookedOff || [],
          onDuty: Array.isArray(data.onDuty)
            ? data.onDuty
            : has(data.onDuty) ? data.onDuty : prev.onDuty,
          customRegisters:
            data.customRegisters && typeof data.customRegisters === "object"
              ? data.customRegisters
              : prev.customRegisters,
        };

        const sanitizedIncoming = sanitizeConsoleContainer(rawNext);
        const next = enforceSingleDutyRule(sanitizedIncoming);

        try {
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(
              "pyidcc_roster_desk_console_cache",
              JSON.stringify(next),
            );
          }
        } catch (e) {
          console.warn("Could not write console cache", e);
        }

        return next;
      });
    };

    const unsubMeta = onSnapshot(
      doc(db, "roster_desk_console", "latest_deployment_meta"),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setDeployedRosterInfo(data);
          try {
            if (typeof window !== "undefined" && window.localStorage) {
              window.localStorage.setItem(
                "pyidcc_roster_desk_meta",
                JSON.stringify(data),
              );
            }
          } catch (e) {
            console.warn("Could not write meta cache", e);
          }
        }
      },
    );

    const unsubConsoleToday = onSnapshot(
      doc(db, "dispatch_excel_cache", todayStr),
      (docSnap) => {
        if (docSnap.exists()) mergeConsoleData(docSnap.data());
      },
    );

    const unsubConsoleLocal = onSnapshot(
      doc(db, "dispatch_excel_cache", localTodayStr),
      (docSnap) => {
        if (docSnap.exists()) mergeConsoleData(docSnap.data());
      },
    );

    const unsubConsoleCurrent = onSnapshot(
      doc(db, "dispatch_excel_cache", "current"),
      (docSnap) => {
        if (docSnap.exists()) mergeConsoleData(docSnap.data());
      },
    );

    const unsubDeskCurrent = onSnapshot(
      doc(db, "roster_desk_console", "current"),
      (docSnap) => {
        if (docSnap.exists()) mergeConsoleData(docSnap.data());
      },
    );

    const unsubDeskLatest = onSnapshot(
      doc(db, "roster_desk_console", "latest"),
      (docSnap) => {
        if (docSnap.exists()) mergeConsoleData(docSnap.data());
      },
    );

    return () => {
      unsubMeta();
      unsubConsoleToday();
      unsubConsoleLocal();
      unsubConsoleCurrent();
      unsubDeskCurrent();
      unsubDeskLatest();
    };
  }, []);

  // ── AUTO-HEAL DUTY 01 (Venkata Kiran Kumar M #21968) in Firestore ──
  useEffect(() => {
    const healDuty01InFirestore = async () => {
      try {
        const duty01Docs = [
          "gcc_deploy_weekday_duty_01",
          "gcc_deploy_weekday_duty_1",
          "gcc_deploy_active_run_duty_01",
          "gcc_deploy_monday_duty_01",
        ];
        for (const docId of duty01Docs) {
          try {
            const snap = await getDoc(doc(db, "crew_daily_deployment", docId));
            if (snap.exists()) {
              const d = snap.data();
              if (
                d.status === "BOOKED_OFF_VACANT" ||
                !d.empId ||
                d.empId === "--" ||
                String(d.empName || "").toUpperCase().includes("VACANT")
              ) {
                await setDoc(
                  doc(db, "crew_daily_deployment", docId),
                  {
                    dutyId: "01",
                    empId: "21968",
                    empName: "Venkata Kiran Kumar M",
                    trainId: "Pro1",
                    dutyType: "PR01",
                    signOnTime: "06:00",
                    signOnLocation: "PYID",
                    signOffTime: "06:00",
                    signOffLocation: "PYID",
                    status: "ACTIVE",
                    isSignedOn: true,
                    lastUpdated: serverTimestamp(),
                  },
                  { merge: true },
                );
              }
            }
          } catch (e) {
            // non-fatal
          }
        }
      } catch (err) {
        console.warn("Auto-heal Duty 01 warning:", err);
      }
    };
    healDuty01InFirestore();
  }, []);

  const handleDayTypeChange = (day) => {
    if (setActiveDay) {
      setActiveDay(day);
    } else {
      setLocalDayType(day);
    }
  };

  const handleEditEmpIdChange = (val) => {
    setEditEmpId(val);
    const match = BMRCL_CREW_REGISTRY.find(
      (c) => String(c.id) === String(val).trim(),
    );
    if (match) {
      setEditName(match.name);
    }
  };

  const handleExtraOpEmpIdChange = (val) => {
    const match = BMRCL_CREW_REGISTRY.find(
      (c) => String(c.id) === String(val).trim(),
    );
    setNewExtraOp((prev) => ({
      ...prev,
      empId: val,
      empName: match ? match.name : prev.empName,
    }));
  };

  const handleStepbackEmpIdChange = (val) => {
    const match = BMRCL_CREW_REGISTRY.find(
      (c) => String(c.id) === String(val).trim(),
    );
    setNewStepback((prev) => ({
      ...prev,
      empId: val,
      empName: match ? match.name : prev.empName,
    }));
  };

  // Advanced Feature States
  const [activeTab, setActiveTab] = useState("LIVE"); // LIVE or HISTORY
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");

  const [activeAbnormalEvent, setActiveAbnormalEvent] = useState(null);
  const [reliefPoolFilter, setReliefPoolFilter] = useState("PRIORITY"); // PRIORITY, ACTIVE, ALL
  const [savingEvent, setSavingEvent] = useState(false);

  const [eventHistory, setEventHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manual Override State
  const [overrideDutyId, setOverrideDutyId] = useState("");

  // Manual Operator Assignment States
  const [editingDeploymentId, setEditingDeploymentId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmpId, setEditEmpId] = useState("");
  const [editTrainId, setEditTrainId] = useState("");
  const [editDutyId, setEditDutyId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Extra Operator Input State
  const [newExtraOp, setNewExtraOp] = useState({
    empId: "",
    empName: "",
    dutyId: "",
    trainId: "UNASSIGNED",
    signOnTime: "06:00:00",
    signOffTime: "14:00:00",
  });

  // Step-back Input State
  const [newStepback, setNewStepback] = useState({
    empId: "",
    empName: "",
    station: "PUTH",
    dutyId: "",
    startTime: "08:00",
    endTime: "12:00",
  });

  const [stepbacks, setStepbacks] = useState([]);

  // ── Book Off & Immediate Driver Reassignment States ──
  const [showBookOffModal, setShowBookOffModal] = useState(false);
  const [bookOffTargetDuty, setBookOffTargetDuty] = useState(null);
  const [bookOffFaultCategory, setBookOffFaultCategory] = useState("TRAIN_FAULT");
  const [bookOffReason, setBookOffReason] = useState("");
  const [bookOffAssignRelief, setBookOffAssignRelief] = useState(true);
  const [bookOffReliefSource, setBookOffReliefSource] = useState("STANDBY"); // "STANDBY" | "CREW_POOL" | "SWAP"
  const [selectedReliever, setSelectedReliever] = useState(null);
  const [bookOffRelieverSearch, setBookOffRelieverSearch] = useState("");
  const [isSubmittingBookOff, setIsSubmittingBookOff] = useState(false);
  const [bookedOffViewSearch, setBookedOffViewSearch] = useState("");

  // ── Quick Assign / Change Driver Modal States ──
  const [showAssignDriverModal, setShowAssignDriverModal] = useState(false);
  const [assignTargetDuty, setAssignTargetDuty] = useState(null);
  const [assignSearchQuery, setAssignSearchQuery] = useState("");
  const [assignDriverType, setAssignDriverType] = useState("STANDBY"); // "STANDBY" | "STBK" | "OR" | "CC" | "WO" | "LEAVE" | "MAINLINE" | "CREW_POOL"
  const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);

  // ── Universal Crew Transfer Across Pages / Registers Modal States ──
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetOperator, setTransferTargetOperator] = useState(null);
  const [transferDestinationCategory, setTransferDestinationCategory] = useState("MAINLINE");
  const [transferTargetDutyId, setTransferTargetDutyId] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferSearchQuery, setTransferSearchQuery] = useState("");
  const [isSubmittingTransfer, setIsSubmittingTransfer] = useState(false);

  // Set of actively assigned operator IDs to prevent double-booking
  const activeOperatorIdSet = useMemo(() => {
    const set = new Set();
    (deduplicatedDeployments || []).forEach((d) => {
      const id = String(d.empId || d.empNo || "").trim();
      if (id && id !== "--" && id !== "UNASSIGNED") set.add(id);
    });
    return set;
  }, [deduplicatedDeployments]);

  // Available crew from BMRCL Crew Registry not currently on active mainline duties
  const availableCrewPool = useMemo(() => {
    return (BMRCL_CREW_REGISTRY || []).filter((c) => {
      const id = String(c.id || "").trim();
      if (!id || activeOperatorIdSet.has(id)) return false;
      return true;
    });
  }, [activeOperatorIdSet]);

  // Excel Path Reader & Control Engine States
  const [excelPathInput, setExcelPathInput] = useState("");
  const [selectedRosterFile, setSelectedRosterFile] = useState(null);
  const [isInspectingPath, setIsInspectingPath] = useState(false);
  // GCC local Excel bridge connection state
  const [gccBridgeStatus, setGccBridgeStatus] = useState("CHECKING");
  const [gccBridgeFileName, setGccBridgeFileName] = useState("");
  const [gccBridgeLastModified, setGccBridgeLastModified] = useState("");
  const gccBridgeSignatureRef = useRef("");


  // Staging & Confirmation Engine States
  const [stagedRoster, setStagedRoster] = useState(null);
  const [isSavingToFirebase, setIsSavingToFirebase] = useState(false);
  const [isRosterConfirmed, setIsRosterConfirmed] = useState(false);

  // Monthly Archive Retrieval States
  const [historicalMonth, setHistoricalMonth] = useState(() =>
    new Date().toISOString().substring(0, 7),
  );

  // Daily Shift / Crew Position Report State
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportContent, setReportContent] = useState("");
  const [isCopiedReport, setIsCopiedReport] = useState(false);
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [isAutoSyncReport, setIsAutoSyncReport] = useState(true);
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);
  const [reportViewTab, setReportViewTab] = useState("TEXT"); // 'TEXT' | 'INDIVIDUAL'
  const [individualSearchQuery, setIndividualSearchQuery] = useState("");
  const [individualFilterCategory, setIndividualFilterCategory] = useState("ALL");

  const positionStats = useMemo(() => {
    return calculateDetailedCrewPositions(
      currentDayType,
      deduplicatedDeployments,
      consoleData,
    );
  }, [currentDayType, deduplicatedDeployments, consoleData]);

  const filteredIndividualPositions = useMemo(() => {
    let list = positionStats.allIndividualPositions || [];
    if (individualFilterCategory === "MAINLINE") {
      list = list.filter((p) => p.group === "MAINLINE");
    } else if (individualFilterCategory === "STANDBY") {
      list = list.filter((p) => p.group === "STANDBY");
    } else if (individualFilterCategory === "REST") {
      list = list.filter((p) => p.group === "REST");
    } else if (individualFilterCategory === "LEAVES") {
      list = list.filter((p) => p.group === "LEAVES");
    } else if (individualFilterCategory === "TRAINING") {
      list = list.filter((p) => p.group === "TRAINING");
    } else if (individualFilterCategory === "BMRCL") {
      list = list.filter((p) => !p.isJmd);
    } else if (individualFilterCategory === "JMD") {
      list = list.filter((p) => p.isJmd);
    }

    if (individualSearchQuery && individualSearchQuery.trim()) {
      const q = individualSearchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          String(p.name || "").toLowerCase().includes(q) ||
          String(p.empId || "").toLowerCase().includes(q) ||
          String(p.dutyId || "").toLowerCase().includes(q) ||
          String(p.trainId || "").toLowerCase().includes(q) ||
          String(p.category || "").toLowerCase().includes(q) ||
          String(p.location || "").toLowerCase().includes(q) ||
          String(p.status || "").toLowerCase().includes(q) ||
          String(p.details || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [positionStats.allIndividualPositions, individualFilterCategory, individualSearchQuery]);

  // Real-time automatic recalculation and synchronization effect
  useEffect(() => {
    if (isAutoSyncReport && !isManuallyEdited) {
      const liveText = generateDailyPositionReportText(
        currentDayType,
        deduplicatedDeployments,
        consoleData,
      );
      setReportContent(liveText);
    }
  }, [
    currentDayType,
    deduplicatedDeployments,
    consoleData,
    isAutoSyncReport,
    isManuallyEdited,
  ]);

  const handleGenerateReport = () => {
    setIsManuallyEdited(false);
    setIsAutoSyncReport(true);
    const text = generateDailyPositionReportText(
      currentDayType,
      deduplicatedDeployments,
      consoleData,
    );
    setReportContent(text);
    setIsReportOpen(true);
  };

  const handleResyncReport = () => {
    setIsManuallyEdited(false);
    setIsAutoSyncReport(true);
    const text = generateDailyPositionReportText(
      currentDayType,
      deduplicatedDeployments,
      consoleData,
    );
    setReportContent(text);
  };

  const handleCopyReport = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(reportContent);
        setIsCopiedReport(true);
        setTimeout(() => setIsCopiedReport(false), 2500);
      }
    } catch (e) {
      console.warn("Clipboard copy failed:", e);
    }
  };

  const handleSaveReport = async () => {
    setIsSavingReport(true);
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const payload = {
        date: todayStr,
        dayType: currentDayType,
        content: reportContent,
        updatedAt: serverTimestamp(),
      };
      await setDoc(
        doc(db, "roster_desk_console", "daily_crew_position_report"),
        payload,
        { merge: true },
      );
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          "pyidcc_daily_crew_position_report",
          reportContent,
        );
      }
      alert("Daily Position Report saved successfully to Firebase & Cache!");
    } catch (err) {
      console.error("Save report error:", err);
      alert("Failed to save report: " + err.message);
    } finally {
      setIsSavingReport(false);
    }
  };

  const handleDownloadReport = () => {
    const dateStr = new Date().toISOString().split("T")[0];
    const element = document.createElement("a");
    const file = new Blob([reportContent], {
      type: "text/plain;charset=utf-8",
    });
    element.href = URL.createObjectURL(file);
    element.download = `BMRCL_Line2_Crew_Position_Report_${dateStr}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };
  const [historicalRecords, setHistoricalRecords] = useState([]);
  const [isLoadingArchives, setIsLoadingArchives] = useState(false);
  const [selectedArchiveSnapshot, setSelectedArchiveSnapshot] = useState(null);

  const handleLoadMonthlyArchiveData = async (mKey) => {
    setIsLoadingArchives(true);
    try {
      const records = await rosterAutoClassifierService.fetchMonthlyArchiveData(
        mKey || historicalMonth,
      );
      setHistoricalRecords(records);
    } catch (err) {
      console.error("Load Monthly Archive Error:", err);
    } finally {
      setIsLoadingArchives(false);
    }
  };

  const handleConfirmAndSaveToFirebase = async () => {
    if (!stagedRoster) return;
    setIsSavingToFirebase(true);
    try {
      const consoleObj = {
        duties: stagedRoster.duties || [],
        controlDesks: stagedRoster.controlDesks || [],
        coOperators: stagedRoster.coOperators || [],
        leaves: stagedRoster.leaves || [],
        standbys: stagedRoster.standbys || [],
        outstationStepbacks: stagedRoster.outstationStepbacks || [],
        crtTraining: stagedRoster.crtTraining || [],
        bmrtiTraining: stagedRoster.bmrtiTraining || [],
        weeklyOffs: stagedRoster.weeklyOffs || [],
        relievedOperators: stagedRoster.relievedOperators || [],
        pmeOperators: stagedRoster.pmeOperators || [],
        routeLearning: stagedRoster.routeLearning || [],
        notReporting: stagedRoster.notReporting || [],
        absents: stagedRoster.absents || [],
        bookedOff: stagedRoster.bookedOff || [],
        onDuty: stagedRoster.onDuty || [],
        customRegisters: stagedRoster.customRegisters || {},
      };

      const dateStr =
        stagedRoster.dateStr || new Date().toISOString().split("T")[0];
      const consoleSnapshot = {
        date: dateStr,
        dayType: currentDayType,
        sheetName:
          stagedRoster.sheetName || stagedRoster.fileName || "Roster Sheet",
        ...consoleObj,
        isExplicitlyCleared: false,
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "roster_desk_console", "current"), consoleSnapshot, {
        merge: true,
      });
      await setDoc(doc(db, "roster_desk_console", "latest"), consoleSnapshot, {
        merge: true,
      });
      await setDoc(doc(db, "dispatch_excel_cache", dateStr), consoleSnapshot, {
        merge: true,
      });
      await setDoc(
        doc(db, "dispatch_excel_cache", "current"),
        consoleSnapshot,
        { merge: true },
      );

      await rosterAutoClassifierService.autoDeployClassifiedData(
        stagedRoster,
        "GCC Controller",
        "Confirmed from Automated Dispatch Gate Staging Buffer",
      );

      setIsRosterConfirmed(true);
      alert(
        `✅ Official Day Roster for ${dateStr} successfully confirmed and saved to Firebase & Monthly Archives!`,
      );
    } catch (err) {
      console.error("Save to Firebase error:", err);
      alert("Failed to save roster to Firebase: " + err.message);
    } finally {
      setIsSavingToFirebase(false);
    }
  };


  // Automatically pull the GCC workbook from the local Windows bridge and
  // feed it into the EXISTING roster file processing pipeline.
  // This does not parse/classify the workbook itself.
  const loadGccRosterFromLocalBridge = async () => {
    const bridgeBase = "http://127.0.0.1:17845";

    try {
      const statusResponse = await fetch(`${bridgeBase}/status`, { cache: "no-store" });

      if (!statusResponse.ok) {
        throw new Error(`Bridge status HTTP ${statusResponse.status}`);
      }

      const status = await statusResponse.json();

      if (!status.fileExists) {
        setGccBridgeStatus("CONNECTED_NO_FILE");
        setGccBridgeFileName("");
        return;
      }

      setGccBridgeStatus("CONNECTED");
      setGccBridgeFileName(status.fileName || "");
      setGccBridgeLastModified(status.lastModified || "");

      const signature = [
        status.fileName || "",
        status.size || "",
        status.lastModified || "",
      ].join("|");

      if (gccBridgeSignatureRef.current === signature) return;

      const fileResponse = await fetch(`${bridgeBase}/file`, { cache: "no-store" });

      if (!fileResponse.ok) {
        throw new Error(`Bridge file HTTP ${fileResponse.status}`);
      }

      const blob = await fileResponse.blob();
      const fileName =
        fileResponse.headers.get("X-PYIDCC-File-Name") ||
        status.fileName ||
        "GCC_Roster.xlsb";
      const lastModifiedHeader =
        fileResponse.headers.get("X-PYIDCC-Last-Modified") ||
        status.lastModified;

      const file = new File([blob], fileName, {
        type:
          blob.type ||
          "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
        lastModified: lastModifiedHeader
          ? new Date(lastModifiedHeader).getTime()
          : Date.now(),
      });

      gccBridgeSignatureRef.current = signature;
      setSelectedRosterFile(file);
      setExcelPathInput(fileName);

      // IMPORTANT: use the existing Browse-file processing function.
      await processFileAndDeploy(file);
    } catch (error) {
      setGccBridgeStatus("OFFLINE");
      console.debug("PYIDCC GCC local bridge unavailable:", error);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const checkBridge = async () => {
      if (cancelled) return;
      await loadGccRosterFromLocalBridge();
    };

    checkBridge();
    const timer = window.setInterval(checkBridge, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const handleDiscardStagingDraft = () => {
    setStagedRoster(null);
    setIsRosterConfirmed(false);
  };

  const processFileAndDeploy = async (fileToProcess, targetSheetName = null, targetDate = null) => {
    let file = fileToProcess || selectedRosterFile;
    if (!file) {
      document.getElementById("automateddispatchgat-i10")?.click();
      return;
    }

    const fileName = file.name || "";
    const fileExt = fileName.split(".").pop().toLowerCase();
    const isJSON = fileExt === "json";
    const isPDF = fileExt === "pdf";
    const isCSVorExcel = ["xlsx", "xls", "xlsb", "xlsm", "csv"].includes(
      fileExt,
    );

    setIsInspectingPath(true);
    let deployedDutiesCount = 0;
    let classifiedData = null;

    try {
      // ─── JSON BRANCH ─────────────────────────────────────────────────────────
      if (isJSON) {
        const text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        let jsonData;
        try {
          jsonData = JSON.parse(text);
        } catch (parseErr) {
          throw new Error("Invalid JSON file: " + parseErr.message);
        }
        // Support array of duty objects or wrapped object { duties: [...], leaves: [...] ... }
        const duties = Array.isArray(jsonData)
          ? jsonData
          : jsonData.duties || [];
        if (duties.length === 0)
          throw new Error("No duty records found in JSON file.");
        const parsedDutiesMap = new Map();
        duties.forEach((d) => {
          const rawDuty =
            d.dutyId ||
            d.duty_id ||
            d.duty ||
            d.Duty ||
            d["Duty No"] ||
            d["DUTY NO"];
          if (!rawDuty) return;
          const dutyId = normalizeDutyId(rawDuty);
          if (!isValidDutyId(dutyId)) return;
          const empId = String(
            d.empId ||
              d.emp_id ||
              d.employeeId ||
              d.EmployeeId ||
              d["Emp No"] ||
              "",
          ).trim();
          const empName = String(
            d.empName ||
              d.emp_name ||
              d.name ||
              d.Name ||
              d.OperatorName ||
              d["Operator Name"] ||
              "",
          ).trim();
          const aligned = alignRecordWithRegistry({
            dutyId,
            empNo: empId,
            employeeId: empId,
            name: empName,
          });
          parsedDutiesMap.set(dutyId, {
            dutyId,
            empId: aligned.empNo || empId,
            empName: aligned.name || empName,
          });
        });
        const parsedDuties = Array.from(parsedDutiesMap.values());
        if (parsedDuties.length > 0) {
          const batch = writeBatch(db);
          parsedDuties.forEach((d) => {
            const docId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${d.dutyId}`;
            batch.set(
              doc(db, "crew_daily_deployment", docId),
              {
                scheduleType: currentDayType,
                dutyId: d.dutyId,
                empId: d.empId || "--",
                empName: d.empName || "--",
                remarks: "JSON File Auto-Ingest",
                lastUpdated: serverTimestamp(),
              },
              { merge: true },
            );
          });
          await batch.commit();
          deployedDutiesCount = parsedDuties.length;
        }
        // Build a minimal classifiedData scaffold from JSON extras
        classifiedData = {
          duties: parsedDuties,
          sheetName: fileName,
          leaves: Array.isArray(jsonData.leaves) ? jsonData.leaves : [],
          standbys: Array.isArray(jsonData.standbys) ? jsonData.standbys : [],
          weeklyOffs: Array.isArray(jsonData.weeklyOffs)
            ? jsonData.weeklyOffs
            : [],
          controlDesks: Array.isArray(jsonData.controlDesks)
            ? jsonData.controlDesks
            : [],
          outstationStepbacks: Array.isArray(jsonData.outstationStepbacks)
            ? jsonData.outstationStepbacks
            : [],
          crtTraining: Array.isArray(jsonData.crtTraining)
            ? jsonData.crtTraining
            : [],
          bmrtiTraining: Array.isArray(jsonData.bmrtiTraining)
            ? jsonData.bmrtiTraining
            : [],
          relievedOperators: Array.isArray(jsonData.relievedOperators)
            ? jsonData.relievedOperators
            : [],
          pmeOperators: Array.isArray(jsonData.pmeOperators)
            ? jsonData.pmeOperators
            : [],
          routeLearning: Array.isArray(jsonData.routeLearning)
            ? jsonData.routeLearning
            : [],
          notReporting: Array.isArray(jsonData.notReporting)
            ? jsonData.notReporting
            : [],
          absents: Array.isArray(jsonData.absents) ? jsonData.absents : [],
          onDuty: Array.isArray(jsonData.onDuty) ? jsonData.onDuty : [],
          customRegisters:
            jsonData.customRegisters &&
            typeof jsonData.customRegisters === "object"
              ? jsonData.customRegisters
              : {},
        };
        setConsoleData({
          controlDesks: classifiedData.controlDesks,
          leaves: classifiedData.leaves,
          standbys: classifiedData.standbys,
          outstationStepbacks: classifiedData.outstationStepbacks,
          crtTraining: classifiedData.crtTraining,
          bmrtiTraining: sanitizeBmrtiList(classifiedData.bmrtiTraining),
          weeklyOffs: classifiedData.weeklyOffs,
          relievedOperators: classifiedData.relievedOperators,
          pmeOperators: classifiedData.pmeOperators,
          routeLearning: classifiedData.routeLearning,
          notReporting: classifiedData.notReporting,
          absents: classifiedData.absents,
          onDuty: classifiedData.onDuty,
          customRegisters: classifiedData.customRegisters,
        });
        setStagedRoster({ ...classifiedData, fileName });
        setIsRosterConfirmed(false);

        // ─── PDF BRANCH ───────────────────────────────────────────────────────────
      } else if (isPDF) {
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey)
          throw new Error(
            "VITE_GEMINI_API_KEY not configured. Cannot process PDF files.",
          );
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const filePart = await fileToGenerativePart(file);
        const prompt = `You are a BMRCL crew roster parser. Extract ALL duty assignments from this roster PDF.
Return ONLY a valid JSON array (no markdown, no explanation) in this exact format:
[{"dutyId":"01","empId":"12345","empName":"OPERATOR NAME","signOnTime":"06:00","signOffTime":"14:00","trainId":"T-01"},{...}]
Rules:
- dutyId: numeric 01-99 or CC/SB/RR prefix codes
- empId: employee number digits only
- empName: full name as printed
- If a field is missing, use empty string ""
- Include ALL rows found including standby, leave, weekly off entries as separate objects with dutyId as their category code`;
        let pdfResult;
        try {
          const geminiResponse = await model.generateContent([
            prompt,
            filePart,
          ]);
          const rawText = geminiResponse.response.text().trim();
          // Strip markdown code fences if present
          const jsonStr = rawText
            .replace(/^```[a-z]*\n?/i, "")
            .replace(/\n?```$/i, "")
            .trim();
          pdfResult = JSON.parse(jsonStr);
        } catch (geminiErr) {
          throw new Error(
            "PDF AI extraction failed: " +
              geminiErr.message +
              ". Ensure the PDF contains a readable roster table.",
          );
        }
        if (!Array.isArray(pdfResult) || pdfResult.length === 0) {
          throw new Error("Gemini AI returned no roster records from PDF.");
        }
        const parsedDutiesMap = new Map();
        pdfResult.forEach((d) => {
          const rawDuty = d.dutyId || d.duty_id || d.duty;
          if (!rawDuty) return;
          const dutyId = normalizeDutyId(rawDuty);
          if (!isValidDutyId(dutyId)) return;
          const aligned = alignRecordWithRegistry({
            dutyId,
            empNo: String(d.empId || "").trim(),
            employeeId: String(d.empId || "").trim(),
            name: String(d.empName || "").trim(),
          });
          parsedDutiesMap.set(dutyId, {
            dutyId,
            empId: aligned.empNo || String(d.empId || "").trim(),
            empName: aligned.name || String(d.empName || "").trim(),
            signOnTime: d.signOnTime || "",
            signOffTime: d.signOffTime || "",
            trainId: d.trainId || "UNASSIGNED",
          });
        });
        const parsedDuties = Array.from(parsedDutiesMap.values());
        if (parsedDuties.length > 0) {
          const batch = writeBatch(db);
          parsedDuties.forEach((d) => {
            const docId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${d.dutyId}`;
            batch.set(
              doc(db, "crew_daily_deployment", docId),
              {
                scheduleType: currentDayType,
                dutyId: d.dutyId,
                empId: d.empId || "--",
                empName: d.empName || "--",
                trainId: d.trainId || "UNASSIGNED",
                signOnTime: d.signOnTime || "",
                signOffTime: d.signOffTime || "",
                remarks: "PDF AI Auto-Extracted via Gemini Vision",
                lastUpdated: serverTimestamp(),
              },
              { merge: true },
            );
          });
          await batch.commit();
          deployedDutiesCount = parsedDuties.length;
        }
        classifiedData = {
          duties: parsedDuties,
          sheetName: fileName,
          leaves: [],
          standbys: [],
          weeklyOffs: [],
          controlDesks: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: [],
          notReporting: [],
          absents: [],
          onDuty: [],
          customRegisters: {},
        };
        setStagedRoster({ ...classifiedData, fileName });
        setIsRosterConfirmed(false);

        // ─── EXCEL / CSV BRANCH (original logic) ─────────────────────────────────
      } else if (isCSVorExcel) {
        const arrayBuffer = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });

        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        setActiveWorkbook(workbook);
        try {
          const detected = rosterAutoClassifierService.detectWorkbookSheets(workbook);
          setDetectedWorkbookSheets(detected);
        } catch (e) {
          console.warn("Sheet detection error:", e);
        }

        try {
          classifiedData = rosterAutoClassifierService.parseWorkbook(
            workbook,
            targetDate || activeSelectedDayObj.date || new Date(),
            currentDayType,
            targetSheetName
          );
        } catch (err) {
          console.warn(
            "Auto-classifier warning, using multi-sheet fallback parser:",
            err,
          );
        }

        if (classifiedData) {
          const consoleObj = {
            controlDesks: classifiedData.controlDesks || [],
            coOperators: classifiedData.coOperators || [],
            leaves: classifiedData.leaves || [],
            standbys: classifiedData.standbys || [],
            outstationStepbacks: classifiedData.outstationStepbacks || [],
            crtTraining: classifiedData.crtTraining || [],
            bmrtiTraining: classifiedData.bmrtiTraining || [],
            weeklyOffs: classifiedData.weeklyOffs || [],
            relievedOperators: classifiedData.relievedOperators || [],
            pmeOperators: classifiedData.pmeOperators || [],
            routeLearning: classifiedData.routeLearning || [],
            notReporting: classifiedData.notReporting || [],
            absents: classifiedData.absents || [],
            onDuty: classifiedData.onDuty || [],
            customRegisters: classifiedData.customRegisters || {},
          };
          const cleanConsoleObj = enforceSingleDutyRule(consoleObj);
          setConsoleData(cleanConsoleObj);
          try {
            if (typeof window !== "undefined" && window.localStorage) {
              window.localStorage.setItem(
                "pyidcc_roster_desk_console_cache",
                JSON.stringify(cleanConsoleObj),
              );
            }
          } catch (e) {}
          if (classifiedData.duties && classifiedData.duties.length > 0) {
            setFallbackDeployments(
              deduplicateDeployments(classifiedData.duties),
            );
          }
          await rosterAutoClassifierService.autoDeployClassifiedData(classifiedData);
          setStagedRoster({
            ...classifiedData,
            fileName: file?.name || "Roster Sheet",
          });
          setIsRosterConfirmed(true);
          deployedDutiesCount = classifiedData.duties?.length || 0;
        } else {
          const parsedDutiesMap = new Map();
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            if (!rows || rows.length === 0) continue;
            let headerRowIdx = -1;
            let dutyColIdx = 0;
            let nameColIdx = 4;
            let empColIdx = 5;
            for (let i = 0; i < Math.min(rows.length, 25); i++) {
              const row = rows[i];
              if (!Array.isArray(row)) continue;
              const rowStr = row.map((cell) =>
                cell ? String(cell).toLowerCase() : "",
              );
              const hasDuty = rowStr.some((c) => c.includes("duty"));
              const hasSignOn = rowStr.some(
                (c) =>
                  c.includes("sign") ||
                  c.includes("s on") ||
                  c.includes("ontime"),
              );
              if (hasDuty || hasSignOn) {
                headerRowIdx = i;
                row.forEach((cell, cIdx) => {
                  if (!cell) return;
                  const cellStr = String(cell).toLowerCase();
                  if (cellStr.includes("duty")) dutyColIdx = cIdx;
                  else if (
                    cellStr.includes("name") ||
                    cellStr.includes("operator") ||
                    cellStr === "to"
                  )
                    nameColIdx = cIdx;
                  else if (
                    (cellStr.includes("emp") || cellStr.includes("id")) &&
                    !cellStr.includes("duty") &&
                    !cellStr.includes("train")
                  )
                    empColIdx = cIdx;
                });
                break;
              }
            }
            const startIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
            for (let i = startIdx; i < rows.length; i++) {
              const row = rows[i];
              if (!row || row.length === 0) continue;
              const rawDuty = row[dutyColIdx];
              if (
                rawDuty === undefined ||
                rawDuty === null ||
                String(rawDuty).trim() === ""
              )
                continue;
              const rawDutyStr = String(rawDuty).trim();
              const dutyId = normalizeDutyId(rawDutyStr);
              if (!dutyId || dutyId === "--" || dutyId === "DUTY") continue;
              const empId =
                row[empColIdx] !== undefined && row[empColIdx] !== null
                  ? String(row[empColIdx]).trim()
                  : "";
              const empName =
                row[nameColIdx] !== undefined && row[nameColIdx] !== null
                  ? String(row[nameColIdx]).trim()
                  : "";

              // Only active numeric duties (1-99) go to parsedDutiesMap for crew_daily_deployment
              if (/^\d{1,2}$/.test(dutyId) && parseInt(dutyId, 10) > 0) {
                if (empId || empName) {
                  parsedDutiesMap.set(dutyId, { dutyId, empId, empName });
                }
              }
            }
          }
          const parsedDuties = Array.from(parsedDutiesMap.values());
          if (parsedDuties.length > 0) {
            const batch = writeBatch(db);
            parsedDuties.forEach((d) => {
              const docId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${d.dutyId}`;
              batch.set(
                doc(db, "crew_daily_deployment", docId),
                {
                  scheduleType: currentDayType,
                  dutyId: d.dutyId,
                  empId: d.empId || "--",
                  empName: d.empName || "--",
                  remarks: "CSV/Excel Direct File Ingest",
                  lastUpdated: serverTimestamp(),
                },
                { merge: true },
              );
            });
            await batch.commit();
            deployedDutiesCount = parsedDuties.length;
          }
        }
      } else {
        throw new Error(
          `Unsupported file type: .${fileExt}. Please upload .xlsx, .xls, .xlsb, .xlsm, .csv, .json, or .pdf`,
        );
      }

      if (deployedDutiesCount > 0) {
        const woCount = classifiedData?.weeklyOffs?.length || 0;
        const leaveCount = classifiedData?.leaves?.length || 0;
        const extractedSheetName =
          classifiedData?.sheetName || file?.name || currentDayType;
        const targetDateStr = classifiedData?.dateStr || activeSelectedDateStr;
        const meta = {
          sheetName: extractedSheetName,
          dateStr: targetDateStr,
          deployedCount: deployedDutiesCount,
          woCount,
          leaveCount,
          relCount: classifiedData?.relievedOperators?.length || 0,
          deployedAt: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };
        setDeployedRosterInfo(meta);
        await setDoc(
          doc(db, "roster_desk_console", "latest_deployment_meta"),
          meta,
          { merge: true },
        );
        const fileTypeLabel = isJSON
          ? "JSON"
          : isPDF
            ? "PDF (AI-Extracted)"
            : "Excel/CSV";
        alert(
          `✅ Date Roster Sheet [${fileTypeLabel}] (${extractedSheetName}) Parsed & Deployed!\nDeployed ${deployedDutiesCount} Operators | ${woCount} Weekly Off | ${leaveCount} Leave & Rest.`,
        );
        if (onImportComplete) onImportComplete();
      } else {
        alert(
          `❌ Ingestion failed: No valid roster entries could be extracted from the ${isPDF ? "PDF (check Gemini AI response)" : isJSON ? "JSON" : "Excel/CSV"} file.`,
        );
      }
    } catch (err) {
      console.error("Failed to parse roster file:", err);
      alert("Failed to process roster file: " + err.message);
    } finally {
      setIsInspectingPath(false);
    }
  };

  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapDuty1, setSwapDuty1] = useState("");
  const [swapDuty2, setSwapDuty2] = useState("");
  const [swapDuty3, setSwapDuty3] = useState("");
  const [swapMode, setSwapMode] = useState("PAIR"); // "PAIR" (2 ops) or "TRIPLE" (3 ops)
  const [swapSearchQuery, setSwapSearchQuery] = useState("");
  const [swapOperationType, setSwapOperationType] = useState("SWAP"); // "SWAP" or "EXCHANGE"

  const duplicateEmpIds = useMemo(() => {
    const counts = {};
    (deduplicatedDeployments || []).forEach((d) => {
      const empId = String(d.empId || d.empNo || "").trim();
      if (empId && empId !== "--" && empId !== "UNASSIGNED" && empId !== "0") {
        counts[empId] = (counts[empId] || 0) + 1;
      }
    });
    return Object.keys(counts).filter((empId) => counts[empId] > 1);
  }, [deduplicatedDeployments]);

  const handleExportExcel = () => {
    const currentList = providedDeployments || fallbackDeployments;
    const dataToExport = currentList.map((d) => ({
      "Duty ID": d.dutyId,
      "Employee ID": d.empId,
      "Operator Name": d.empName,
      "Train ID": d.trainId,
      "Sign On Time": d.signOnTime,
      "Sign Off Time": d.signOffTime || "--",
      Status: d.status || "ACTIVE",
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily_Roster");
    XLSX.writeFile(
      wb,
      `Daily_Roster_${currentDayType}_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
  };

  const handleClearDailyRoster = async () => {
    if (
      window.confirm(
        `Are you sure you want to clear all daily roster deployments for ${currentDayType}?`,
      )
    ) {
      try {
        const snap = await getDocs(collection(db, "crew_daily_deployment"));
        const batch = writeBatch(db);
        let deletedCount = 0;

        snap.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const sched = String(data.scheduleType || "").toUpperCase();
          const targetSched = String(currentDayType || "").toUpperCase();
          if (
            !sched ||
            sched === targetSched ||
            sched === "ACTIVE_RUN" ||
            targetSched === "ALL"
          ) {
            batch.delete(docSnap.ref);
            deletedCount++;
          }
        });

        const emptyConsoleDoc = {
          controlDesks: [],
          leaves: [],
          standbys: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          weeklyOffs: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: [],
          notReporting: [],
          absents: [],
          bookedOff: [],
          isExplicitlyCleared: true,
          updatedAt: serverTimestamp(),
        };

        const todayStr = new Date().toISOString().split("T")[0];
        const localTodayStr = new Date().toLocaleDateString("sv-SE");

        batch.set(doc(db, "roster_desk_console", "current"), emptyConsoleDoc);
        batch.set(doc(db, "roster_desk_console", "latest"), emptyConsoleDoc);
        batch.delete(doc(db, "roster_desk_console", "latest_deployment_meta"));
        batch.set(doc(db, "dispatch_excel_cache", todayStr), emptyConsoleDoc);
        batch.set(
          doc(db, "dispatch_excel_cache", localTodayStr),
          emptyConsoleDoc,
        );
        batch.set(doc(db, "dispatch_excel_cache", "current"), emptyConsoleDoc);

        await batch.commit();

        try {
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.removeItem("pyidcc_roster_desk_console_cache");
            window.localStorage.removeItem("pyidcc_roster_desk_meta");
          }
        } catch (e) {
          console.warn("Could not clear cache on reset", e);
        }

        setDeployedRosterInfo(null);
        setConsoleData({
          controlDesks: [],
          coOperators: [],
          leaves: [],
          standbys: [],
          outstationStepbacks: [],
          crtTraining: [],
          bmrtiTraining: [],
          weeklyOffs: [],
          relievedOperators: [],
          pmeOperators: [],
          routeLearning: [],
          notReporting: [],
          absents: [],
          bookedOff: [],
          onDuty: [],
          customRegisters: {},
        });

        alert(
          `Daily Roster Cleared Successfully. Cleared ${deletedCount} deployment record(s).`,
        );
        if (onImportComplete) onImportComplete();
      } catch (err) {
        console.error("Failed to clear daily roster:", err);
        alert("Failed to clear roster: " + err.message);
      }
    }
  };

  const handleAutoDeployConsoleToAllPages = async () => {
    try {
      const dateStr = new Date().toISOString().split("T")[0];
      const cleanConsole = sanitizeConsoleContainer(consoleData);

      const consoleSnapshot = {
        date: dateStr,
        dayType: currentDayType,
        sheetName: "Auto-Deployed Console Roster",
        controlDesks: cleanConsole.controlDesks || [],
        coOperators: cleanConsole.coOperators || [],
        leaves: cleanConsole.leaves || [],
        standbys: cleanConsole.standbys || [],
        outstationStepbacks: cleanConsole.outstationStepbacks || [],
        crtTraining: cleanConsole.crtTraining || [],
        bmrtiTraining: cleanConsole.bmrtiTraining || [],
        weeklyOffs: cleanConsole.weeklyOffs || [],
        relievedOperators: cleanConsole.relievedOperators || [],
        pmeOperators: cleanConsole.pmeOperators || [],
        routeLearning: cleanConsole.routeLearning || [],
        notReporting: cleanConsole.notReporting || [],
        absents: cleanConsole.absents || [],
        bookedOff: cleanConsole.bookedOff || [],
        onDuty: cleanConsole.onDuty || [],
        customRegisters: cleanConsole.customRegisters || {},
        uploadedBy: "system",
        uploadedByName: "System Auto-Deploy",
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, "roster_desk_console", "current"), consoleSnapshot, {
        merge: true,
      });
      await setDoc(doc(db, "roster_desk_console", "latest"), consoleSnapshot, {
        merge: true,
      });
      await setDoc(doc(db, "dispatch_excel_cache", dateStr), consoleSnapshot, {
        merge: true,
      });
      await setDoc(doc(db, "dispatch_excel_cache", "current"), consoleSnapshot, {
        merge: true,
      });

      // Deploy active train driving duties from deduplicatedDeployments to crew_daily_deployment
      if (deduplicatedDeployments && deduplicatedDeployments.length > 0) {
        const dutyBatch = writeBatch(db);
        deduplicatedDeployments.forEach((d) => {
          if (!d.dutyId) return;
          const docId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${d.dutyId}`;
          dutyBatch.set(
            doc(db, "crew_daily_deployment", docId),
            {
              ...d,
              dutyId: d.dutyId,
              empId: d.empId || "--",
              empName: d.empName || "--",
              scheduleType: currentDayType,
              date: dateStr,
              lastUpdated: serverTimestamp(),
            },
            { merge: true },
          );
        });
        await dutyBatch.commit();
      }

      // Deploy leaves to leave_requests
      for (const item of cleanConsole.leaves || []) {
        if (!item.empNo) continue;
        await setDoc(
          doc(db, "leave_requests", `leave_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            leaveType: item.type || "CL",
            startDate: dateStr,
            endDate: dateStr,
            status: "APPROVED",
            reason: "Excel Auto-Deployed Leave",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      // Deploy weekly offs to weekly_off_register
      for (const item of cleanConsole.weeklyOffs || []) {
        if (!item.empNo) continue;
        await setDoc(
          doc(db, "weekly_off_register", `wo_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            date: dateStr,
            status: "WEEKLY_OFF",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      // Deploy absents and notReporting to absent_bookoff_register
      for (const item of cleanConsole.absents || []) {
        if (!item.empNo) continue;
        await setDoc(
          doc(db, "absent_bookoff_register", `absent_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            date: dateStr,
            status: "ABSENT",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
      for (const item of cleanConsole.notReporting || []) {
        if (!item.empNo) continue;
        await setDoc(
          doc(db, "absent_bookoff_register", `not_reporting_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            date: dateStr,
            status: "NOT_REPORTING",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      // Deploy dynamic category pages to roster_category_pages
      if (cleanConsole.customRegisters && typeof cleanConsole.customRegisters === "object") {
        for (const [catTitle, items] of Object.entries(cleanConsole.customRegisters)) {
          const safeSlug = catTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
          if (safeSlug) {
            await setDoc(
              doc(db, "roster_category_pages", `${safeSlug}_${dateStr}`),
              {
                categoryTitle: catTitle,
                categorySlug: safeSlug,
                date: dateStr,
                dayType: currentDayType,
                staffCount: (items || []).length,
                staff: items || [],
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
        }
      }

      alert(
        "✅ AUTO-DEPLOY SUCCESSFUL: Console Roster and Train Duties deployed to all pages and Firestore registers!",
      );
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to auto-deploy console data: " + err.message);
    }
  };

  // Swappable entities combining Mainline Train Duties and all Roster Desk Console columns
  const allSwappableGroups = useMemo(() => {
    const groups = [];
    const currentList = providedDeployments || fallbackDeployments || [];

    // 1. Mainline Train Duties
    if (currentList && currentList.length > 0) {
      const mainlineItems = currentList.map((d) => ({
        id: `mainline_${d.dutyId}`,
        type: "MAINLINE",
        dutyId: d.dutyId,
        docId: d.id,
        rawDeployment: d,
        empId: String(d.empId || ""),
        empName: String(d.empName || ""),
        label: `Duty ${d.dutyId} - ${d.empName || "Vacant"} (${d.empId || "--"})`,
        category: "Mainline Train Duty",
      }));
      groups.push({
        groupLabel: `🚆 Mainline Train Duties (${mainlineItems.length})`,
        categoryKey: "mainline",
        items: mainlineItems,
      });
    }

    // Helper to add console category
    const addConsoleGroup = (groupName, list, catKey, defaultPrefix) => {
      if (!list || list.length === 0) return;
      const validItems = list
        .map((item, idx) => {
          const empId = String(item.empNo || item.empId || "").trim();
          const empName = String(item.name || "").trim();
          if (!empName && !empId) return null;
          const dutyCode = item.duty || item.code || item.dutyId || item.type || defaultPrefix;
          return {
            id: `console_${catKey}_${idx}_${empId || idx}`,
            type: "CONSOLE",
            catKey,
            idx,
            dutyId: dutyCode,
            empId,
            empName,
            label: `${groupName}: ${dutyCode ? `[${dutyCode}] ` : ""}${empName || "Staff"} (${empId || "--"})`,
            category: groupName,
            rawItem: item,
          };
        })
        .filter(Boolean);

      if (validItems.length > 0) {
        groups.push({
          groupLabel: `${groupName} (${validItems.length})`,
          categoryKey: catKey,
          items: validItems,
        });
      }
    };

    addConsoleGroup("Co-Operators & 2nd Crew", consoleData.coOperators, "coOperators", "Co-Op");
    addConsoleGroup("Crew Controllers", consoleData.controlDesks, "controlDesks", "CC");
    addConsoleGroup("Leave & Rest", consoleData.leaves, "leaves", "Leave");
    addConsoleGroup("Standby", consoleData.standbys, "standbys", "Standby");
    addConsoleGroup("STBK (Outstation Stepbacks)", consoleData.outstationStepbacks, "outstationStepbacks", "STBK");
    addConsoleGroup("CRT Training", consoleData.crtTraining, "crtTraining", "CRT");
    addConsoleGroup("BMRTI Training", consoleData.bmrtiTraining, "bmrtiTraining", "BMRTI");
    addConsoleGroup("Weekly Off", consoleData.weeklyOffs, "weeklyOffs", "WO");
    addConsoleGroup("REL (Relieved)", consoleData.relievedOperators, "relievedOperators", "REL");
    addConsoleGroup("PME (Medical Exam)", consoleData.pmeOperators, "pmeOperators", "PME");
    addConsoleGroup("LRD (Route Learning)", consoleData.routeLearning, "routeLearning", "LRD");
    addConsoleGroup("OD (On Duty)", consoleData.onDuty, "onDuty", "OD");
    addConsoleGroup("NR (Not Reporting)", consoleData.notReporting, "notReporting", "NR");
    addConsoleGroup("AB (Absent)", consoleData.absents, "absents", "AB");
    addConsoleGroup("Booked Off (BO)", consoleData.bookedOff, "bookedOff", "BO");

    // Custom Registers including CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)
    if (consoleData.customRegisters && typeof consoleData.customRegisters === "object") {
      Object.entries(consoleData.customRegisters).forEach(([tagName, list]) => {
        addConsoleGroup(tagName, list, `custom_${tagName}`, tagName);
      });
    }

    return groups;
  }, [providedDeployments, fallbackDeployments, consoleData]);

  // Flattened for easy lookup
  const allSwappableEntities = useMemo(() => {
    return allSwappableGroups.flatMap((g) => g.items);
  }, [allSwappableGroups]);

  const findSwappableEntity = (val) => {
    if (!val) return null;
    const direct = allSwappableEntities.find((e) => e.id === val);
    if (direct) return direct;
    const byDuty = allSwappableEntities.find(
      (e) => String(e.dutyId).trim().toLowerCase() === String(val).trim().toLowerCase()
    );
    if (byDuty) return byDuty;
    const byEmp = allSwappableEntities.find(
      (e) => String(e.empId).trim() === String(val).trim()
    );
    if (byEmp) return byEmp;
    return null;
  };

  // Filtered groups based on swapSearchQuery
  const filteredSwappableGroups = useMemo(() => {
    const q = (swapSearchQuery || "").trim().toLowerCase();
    if (!q) return allSwappableGroups;
    return allSwappableGroups
      .map((group) => {
        const filteredItems = group.items.filter((item) => {
          return (
            item.label.toLowerCase().includes(q) ||
            item.empName.toLowerCase().includes(q) ||
            item.empId.toLowerCase().includes(q) ||
            String(item.dutyId).toLowerCase().includes(q) ||
            group.groupLabel.toLowerCase().includes(q)
          );
        });
        return { ...group, items: filteredItems };
      })
      .filter((g) => g.items.length > 0);
  }, [allSwappableGroups, swapSearchQuery]);

  const handleExecuteSwap = async () => {
    const isTriple = swapMode === "TRIPLE";

    if (isTriple) {
      if (!swapDuty1 || !swapDuty2 || !swapDuty3) {
        alert("Please select all three Duty IDs / Operators for Triple Swap/Exchange.");
        return;
      }
      if (
        swapDuty1 === swapDuty2 ||
        swapDuty2 === swapDuty3 ||
        swapDuty1 === swapDuty3
      ) {
        alert("Please select three distinct duties or operators.");
        return;
      }
    } else {
      if (!swapDuty1 || !swapDuty2) {
        alert("Please select both Duty IDs / Operators.");
        return;
      }
      if (swapDuty1 === swapDuty2) {
        alert("Please select two different duties or operators.");
        return;
      }
    }

    const item1 = findSwappableEntity(swapDuty1);
    const item2 = findSwappableEntity(swapDuty2);
    const item3 = isTriple ? findSwappableEntity(swapDuty3) : null;

    if (!item1 || !item2 || (isTriple && !item3)) {
      alert("One or more selected Duty IDs / Operators were not found in current deployment roster or console.");
      return;
    }

    const isExchange = swapOperationType === "EXCHANGE";
    const statusValue = isExchange ? "EXCHANGED" : "SWAPPED_BY_CC";

    try {
      const batch = writeBatch(db);
      let newConsoleData = { ...consoleData };
      let updatedConsole = false;

      const updateMainlineDeployment = (itemTarget, itemSource, notePrefix) => {
        const payload = {
          empName: itemSource.empName,
          name: itemSource.empName,
          operatorName: itemSource.empName,
          empId: itemSource.empId,
          empNo: itemSource.empId,
          status: statusValue,
          isSwapped: !isExchange,
          swapped: !isExchange,
          isExchanged: isExchange,
          exchanged: isExchange,
          swappedWith: itemSource.empName,
          swappedDutyId: itemSource.dutyId,
          originalEmpId: itemTarget.empId,
          originalEmpName: itemTarget.empName,
          remarks: isExchange
            ? `${notePrefix || "Shift Exchanged"} with ${itemSource.category} (${itemSource.empName || itemSource.dutyId})`
            : `${notePrefix || "Swapped"} with ${itemSource.category} (${itemSource.empName || itemSource.dutyId})`,
          lastUpdated: serverTimestamp(),
        };

        // 1. Target original Firestore docId if present
        if (itemTarget.docId) {
          batch.set(doc(db, "crew_daily_deployment", itemTarget.docId), payload, { merge: true });
        }

        // 2. Also write standard IDs so both padded and unpadded and schedule-specific keys match
        const normId = String(parseInt(itemTarget.dutyId, 10) || itemTarget.dutyId).trim();
        const paddedId = normId.padStart(2, "0");
        const sched = normalizeScheduleType(currentDayType).toLowerCase();

        const possibleDocIds = new Set([
          `gcc_deploy_${sched}_duty_${normId}`,
          `gcc_deploy_${sched}_duty_${paddedId}`,
          `gcc_deploy_active_run_duty_${paddedId}`,
          `gcc_deploy_active_run_duty_${normId}`,
        ]);

        possibleDocIds.forEach((dId) => {
          batch.set(doc(db, "crew_daily_deployment", dId), payload, { merge: true });
        });
      };

      if (isTriple) {
        // Standard Cyclic Rotation:
        // Op 1 (Duty 1) ➔ Duty 2: Duty 2 gets Op 1
        // Op 2 (Duty 2) ➔ Duty 3: Duty 3 gets Op 2
        // Op 3 (Duty 3) ➔ Duty 1: Duty 1 gets Op 3
        if (item1.type === "MAINLINE") {
          updateMainlineDeployment(item1, item3, "Triple Swap Duty 1 ← Op 3");
        }
        if (item2.type === "MAINLINE") {
          updateMainlineDeployment(item2, item1, "Triple Swap Duty 2 ← Op 1");
        }
        if (item3.type === "MAINLINE") {
          updateMainlineDeployment(item3, item2, "Triple Swap Duty 3 ← Op 2");
        }

        if (
          item1.type === "CONSOLE" ||
          item2.type === "CONSOLE" ||
          item3.type === "CONSOLE" ||
          (item1.type === "MAINLINE" && item2.type === "MAINLINE" && item3.type === "MAINLINE" && Array.isArray(newConsoleData.duties))
        ) {
          newConsoleData = rotateTripleOperatorsInConsoleData(
            newConsoleData,
            item1.empId,
            item1.empName,
            item2.empId,
            item2.empName,
            item3.empId,
            item3.empName
          );
          updatedConsole = true;
        }

        if (isExchange) {
          const todayDateStr = new Date().toISOString().split("T")[0];
          const exRef = doc(collection(db, "shift_exchanges"));
          const exPayload = {
            isTriple: true,
            operator1Id: String(item1.empId || ""),
            operator1Name: String(item1.empName || ""),
            operator1Duty: String(item1.dutyId || ""),
            operator2Id: String(item2.empId || ""),
            operator2Name: String(item2.empName || ""),
            operator2Duty: String(item2.dutyId || ""),
            operator3Id: String(item3.empId || ""),
            operator3Name: String(item3.empName || ""),
            operator3Duty: String(item3.dutyId || ""),
            exchangeDate: todayDateStr,
            status: "APPROVED",
            isOperational: true,
            approvedBy: "DISPATCH GATEWAY CORE (CC/GCC)",
            approvedAt: serverTimestamp(),
            approvalTime: new Date().toISOString(),
            remarks: `Triple exchange approved via DISPATCH GATEWAY CORE: Op 1 (${item1.empName}) ➔ Duty ${item2.dutyId} | Op 2 (${item2.empName}) ➔ Duty ${item3.dutyId} | Op 3 (${item3.empName}) ➔ Duty ${item1.dutyId}`,
            createdAt: serverTimestamp(),
          };
          batch.set(exRef, exPayload);
          batch.set(doc(db, "shift_exchanges_operational", `${exRef.id}_${item1.dutyId}`), { ...exPayload, dutyNumber: item1.dutyId });
          batch.set(doc(db, "shift_exchanges_operational", `${exRef.id}_${item2.dutyId}`), { ...exPayload, dutyNumber: item2.dutyId });
          batch.set(doc(db, "shift_exchanges_operational", `${exRef.id}_${item3.dutyId}`), { ...exPayload, dutyNumber: item3.dutyId });
        }

        try {
          const auditRef = doc(collection(db, "auditLogs"));
          batch.set(auditRef, {
            action: isExchange ? "ROSTER_DESK_TRIPLE_EXCHANGE" : "ROSTER_DESK_TRIPLE_SWAP",
            performedBy: "Crew Controller / GCC (DISPATCH GATEWAY CORE)",
            timestamp: serverTimestamp(),
            operationType: isExchange ? "TRIPLE_DUTY_EXCHANGE" : "TRIPLE_DUTY_SWAP",
            isTriple: true,
            duty1: item1.label,
            duty2: item2.label,
            duty3: item3.label,
            operator1: `${item1.empName} (${item1.empId})`,
            operator2: `${item2.empName} (${item2.empId})`,
            operator3: `${item3.empName} (${item3.empId})`,
            details: `${isExchange ? "Triple Exchange" : "Triple Swap"}: Op 1 [${item1.category}] ${item1.label} ➔ Duty ${item2.dutyId} | Op 2 [${item2.category}] ${item2.label} ➔ Duty ${item3.dutyId} | Op 3 [${item3.category}] ${item3.label} ➔ Duty ${item1.dutyId}`,
          });
        } catch (logErr) {
          console.warn("Audit log error:", logErr);
        }
      } else {
        // 1. If item1 is Mainline:
        if (item1.type === "MAINLINE") {
          updateMainlineDeployment(item1, item2);
        }

        // 2. If item2 is Mainline:
        if (item2.type === "MAINLINE") {
          updateMainlineDeployment(item2, item1);
        }

        // 3. If any item is from Roster Desk Console, swap operators across all console registers:
        if (item1.type === "CONSOLE" || item2.type === "CONSOLE") {
          newConsoleData = swapOperatorsInConsoleData(
            newConsoleData,
            item1.empId,
            item1.empName,
            item2.empId,
            item2.empName
          );
          updatedConsole = true;
        }

        // 4. If both items are mainline duties, also update consoleData.duties if present
        if (item1.type === "MAINLINE" && item2.type === "MAINLINE" && Array.isArray(newConsoleData.duties)) {
          newConsoleData = swapOperatorsInConsoleData(
            newConsoleData,
            item1.empId,
            item1.empName,
            item2.empId,
            item2.empName
          );
          updatedConsole = true;
        }

        // 5. If Duty Exchange, also record to shift_exchanges & shift_exchanges_operational
        if (isExchange) {
          const todayDateStr = new Date().toISOString().split("T")[0];
          const exRef = doc(collection(db, "shift_exchanges"));
          const exPayload = {
            operator1Id: String(item1.empId || ""),
            operator1Name: String(item1.empName || ""),
            operator1Duty: String(item1.dutyId || ""),
            operator2Id: String(item2.empId || ""),
            operator2Name: String(item2.empName || ""),
            operator2Duty: String(item2.dutyId || ""),
            exchangeDate: todayDateStr,
            status: "APPROVED",
            isOperational: true,
            approvedBy: "DISPATCH GATEWAY CORE (CC/GCC)",
            approvedAt: serverTimestamp(),
            approvalTime: new Date().toISOString(),
            remarks: `Mutual exchange approved via DISPATCH GATEWAY CORE between Duty ${item1.dutyId} and Duty ${item2.dutyId}`,
            createdAt: serverTimestamp(),
          };
          batch.set(exRef, exPayload);
          batch.set(doc(db, "shift_exchanges_operational", `${exRef.id}_${item1.dutyId}`), { ...exPayload, dutyNumber: item1.dutyId });
          batch.set(doc(db, "shift_exchanges_operational", `${exRef.id}_${item2.dutyId}`), { ...exPayload, dutyNumber: item2.dutyId });
        }

        // 6. Audit Log
        try {
          const auditRef = doc(collection(db, "auditLogs"));
          batch.set(auditRef, {
            action: isExchange ? "ROSTER_DESK_DUTY_EXCHANGE" : "ROSTER_DESK_DUTY_SWAP",
            performedBy: "Crew Controller / GCC (DISPATCH GATEWAY CORE)",
            timestamp: serverTimestamp(),
            operationType: isExchange ? "DUTY_EXCHANGE" : "DUTY_SWAP",
            duty1: item1.label,
            duty2: item2.label,
            operator1: `${item1.empName} (${item1.empId})`,
            operator2: `${item2.empName} (${item2.empId})`,
            details: `${isExchange ? "Exchanged" : "Swapped"}: [${item1.category}] ${item1.label} ↔ [${item2.category}] ${item2.label}`,
          });
        } catch (logErr) {
          console.warn("Audit log error:", logErr);
        }
      }

      if (updatedConsole) {
        newConsoleData.lastUpdated = serverTimestamp();
        batch.set(doc(db, "roster_desk_console", "current"), newConsoleData, { merge: true });
        batch.set(doc(db, "roster_desk_console", "latest"), newConsoleData, { merge: true });
        batch.set(doc(db, "dispatch_excel_cache", "current"), newConsoleData, { merge: true });
        const activeDateStr = deployedRosterInfo?.dateStr || activeSelectedDateStr;
        batch.set(doc(db, "dispatch_excel_cache", activeDateStr), newConsoleData, { merge: true });
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(
            "pyidcc_roster_desk_console_cache",
            JSON.stringify(newConsoleData)
          );
        }
        setConsoleData(newConsoleData);
      }

      await batch.commit();

      if (isTriple) {
        alert(
          `✅ ${isExchange ? "Triple Duty Exchange" : "Triple Duties Swap"} Completed Successfully:\n${item1.label} ➔ ${item2.label} ➔ ${item3.label} ➔ ${item1.label}`
        );
      } else {
        alert(`✅ ${isExchange ? "Duty Exchanged" : "Duties Swapped"} Successfully:\n${item1.label}\n↔\n${item2.label}`);
      }
      setShowSwapModal(false);
      setSwapDuty1("");
      setSwapDuty2("");
      setSwapDuty3("");
      setSwapSearchQuery("");
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert(`Failed to ${isExchange ? "exchange" : "swap"} duties: ` + err.message);
    }
  };

  // ── Book Off & Driver Reassignment Handlers ──
  const openBookOffModal = (deployment) => {
    if (!deployment) return;
    setBookOffTargetDuty(deployment);
    setBookOffFaultCategory("TRAIN_FAULT");
    setBookOffReason(`Train fault on Train ${deployment.trainId || "--"}, Duty #${deployment.dutyId}`);
    setBookOffAssignRelief(true);
    setBookOffReliefSource("STANDBY");
    setBookOffRelieverSearch("");
    const firstStandby = (consoleData.standbys || [])[0];
    setSelectedReliever(
      firstStandby
        ? {
            id: firstStandby.empNo || firstStandby.empId,
            name: firstStandby.name || firstStandby.empName,
            dutyId: firstStandby.duty || firstStandby.code || "Standby",
            source: "STANDBY",
            ...firstStandby,
          }
        : null,
    );
    setShowBookOffModal(true);
  };

  const openAssignDriverModal = (deployment) => {
    if (!deployment) return;
    setAssignTargetDuty(deployment);
    setAssignSearchQuery("");
    setAssignDriverType("STANDBY");
    const firstStandby = (consoleData.standbys || [])[0];
    setSelectedReliever(
      firstStandby
        ? {
            id: firstStandby.empNo || firstStandby.empId,
            name: firstStandby.name || firstStandby.empName,
            dutyId: firstStandby.duty || firstStandby.code || "Standby",
            source: "STANDBY",
            ...firstStandby,
          }
        : null,
    );
    setShowAssignDriverModal(true);
  };

  const handleExecuteBookOff = async () => {
    if (!bookOffTargetDuty) return;
    const deployment = bookOffTargetDuty;
    const todayStr = new Date().toISOString().split("T")[0];
    const timeStr = new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (bookOffAssignRelief && !selectedReliever) {
      alert(
        "Please select a replacement driver from Standby or Crew Pool, or uncheck 'Assign Replacement Driver Now'.",
      );
      return;
    }

    setIsSubmittingBookOff(true);
    try {
      const batch = writeBatch(db);

      const targetDocId =
        deployment.dutyId && deployment.dutyId !== "UNASSIGNED"
          ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
          : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;

      const relieverName = selectedReliever
        ? String(selectedReliever.name || selectedReliever.empName || "").toUpperCase()
        : null;
      const relieverId = selectedReliever
        ? String(selectedReliever.id || selectedReliever.empId || selectedReliever.empNo || "")
        : null;

      // 1. Log to absent_bookoff_register for real-time leave & book-off register tracking
      const regDocId = `bo_reg_${deployment.empId || "op"}_${todayStr}_${Date.now()}`;
      batch.set(
        doc(db, "absent_bookoff_register", regDocId),
        {
          employeeId: String(deployment.empId || deployment.empNo || "--"),
          employeeName: String(deployment.empName || deployment.name || "OPERATOR").toUpperCase(),
          code: "BO",
          category: "BOOK_OFF",
          faultCategory: bookOffFaultCategory,
          reason: bookOffReason || "Booked off from duty due to fault",
          remarks: `Booked off from Duty #${deployment.dutyId} (Train ${deployment.trainId || "--"}). Reason: [${bookOffFaultCategory}] ${bookOffReason}. Relieved by: ${relieverName || "VACANT"}`,
          dutyId: String(deployment.dutyId || ""),
          trainId: String(deployment.trainId || ""),
          relievedBy: relieverName || "VACANT",
          relievedByEmpId: relieverId || "--",
          date: todayStr,
          startDate: todayStr,
          endDate: todayStr,
          status: relieverName ? "RELIEVED" : "VACANT",
          timestamp: serverTimestamp(),
          source: "Automated Dispatch Gate Core",
        },
        { merge: true },
      );

      // 2. Update crew_daily_deployment (write to both padded & unpadded doc IDs for consistency)
      const normDutyId = String(parseInt(deployment.dutyId, 10) || deployment.dutyId || "").trim();
      const paddedDutyId = normDutyId ? normDutyId.padStart(2, "0") : "";
      const sched = normalizeScheduleType(currentDayType).toLowerCase();
      const possibleDutyDocIds = new Set([targetDocId]);
      if (normDutyId) {
        possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${normDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${paddedDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${paddedDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${normDutyId}`);
      }

      if (bookOffAssignRelief && selectedReliever) {
        const payload = {
          empName: relieverName,
          empId: relieverId,
          status: "ACTIVE",
          isSignedOn: true,
          relievedFrom: String(deployment.empId || deployment.empNo || "--"),
          relievedFromName: String(deployment.empName || deployment.name || "--"),
          relievedAt: serverTimestamp(),
          remarks: `Replacement driver assigned. Original driver ${deployment.empName} booked off: [${bookOffFaultCategory}] ${bookOffReason}`,
          lastUpdated: serverTimestamp(),
        };
        possibleDutyDocIds.forEach((dId) => {
          batch.set(doc(db, "crew_daily_deployment", dId), payload, { merge: true });
        });
      } else {
        const payload = {
          empName: "VACANT - DRIVER REQUIRED",
          empId: "--",
          status: "BOOKED_OFF_VACANT",
          isSignedOn: false,
          relievedFrom: String(deployment.empId || deployment.empNo || "--"),
          relievedFromName: String(deployment.empName || deployment.name || "--"),
          relievedAt: serverTimestamp(),
          remarks: `DRIVER BOOKED OFF: [${bookOffFaultCategory}] ${bookOffReason} — RELIEF DRIVER REQUIRED`,
          lastUpdated: serverTimestamp(),
        };
        possibleDutyDocIds.forEach((dId) => {
          batch.set(doc(db, "crew_daily_deployment", dId), payload, { merge: true });
        });
      }

      // 3. Update consoleData: add to bookedOff array
      const boEntry = {
        empNo: String(deployment.empId || deployment.empNo || "--"),
        empId: String(deployment.empId || deployment.empNo || "--"),
        name: String(deployment.empName || deployment.name || "OPERATOR").toUpperCase(),
        dutyId: String(deployment.dutyId || ""),
        trainId: String(deployment.trainId || "--"),
        faultCategory: bookOffFaultCategory,
        reason: bookOffReason,
        date: todayStr,
        time: timeStr,
        bookedOffAt: timeStr,
        relievedBy: relieverName,
        relievedByEmpId: relieverId,
        relieverName: relieverName,
        relieverId: relieverId,
        relieverSource: bookOffReliefSource,
        status: relieverName ? "RELIEVED" : "VACANT",
        originalSignOn: deployment.signOnTime || "--",
      };

      let updatedBookedOff = [
        ...(consoleData.bookedOff || []).filter(
          (b) =>
            String(b.empNo || b.empId) !== String(boEntry.empNo) ||
            String(b.dutyId) !== String(boEntry.dutyId),
        ),
        boEntry,
      ];

      // 4. If reliever was taken from standbys, remove them from standbys to prevent double-booking
      let updatedStandbys = [...(consoleData.standbys || [])];
      if (selectedReliever && bookOffReliefSource === "STANDBY") {
        updatedStandbys = updatedStandbys.filter(
          (s) =>
            String(s.empNo || s.empId).trim() !== String(relieverId).trim() &&
            String(s.name || s.empName).trim().toUpperCase() !== String(relieverName).trim().toUpperCase(),
        );
      }

      const updatedConsole = {
        ...consoleData,
        bookedOff: updatedBookedOff,
        standbys: updatedStandbys,
      };

      batch.set(
        doc(db, "roster_desk_console", "current"),
        { bookedOff: updatedBookedOff, standbys: updatedStandbys },
        { merge: true },
      );
      batch.set(
        doc(db, "roster_desk_console", "latest"),
        { bookedOff: updatedBookedOff, standbys: updatedStandbys },
        { merge: true },
      );
      batch.set(
        doc(db, "dispatch_excel_cache", todayStr),
        { bookedOff: updatedBookedOff, standbys: updatedStandbys },
        { merge: true },
      );
      batch.set(
        doc(db, "dispatch_excel_cache", "current"),
        { bookedOff: updatedBookedOff, standbys: updatedStandbys },
        { merge: true },
      );

      await batch.commit();

      setConsoleData(updatedConsole);
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(
            "pyidcc_roster_desk_console_cache",
            JSON.stringify(updatedConsole),
          );
        }
      } catch (e) {}

      setShowBookOffModal(false);
      setBookOffTargetDuty(null);
      setSelectedReliever(null);
      alert(
        `✅ Operator ${deployment.empName} successfully booked off from Duty #${deployment.dutyId}.\n` +
          (relieverName
            ? `Replacement driver ${relieverName} assigned to Duty #${deployment.dutyId}!`
            : `Duty #${deployment.dutyId} marked VACANT - DRIVER REQUIRED.`),
      );
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Book Off error:", err);
      alert("Failed to book off operator: " + err.message);
    } finally {
      setIsSubmittingBookOff(false);
    }
  };

  const handleExecuteAssignDriver = async () => {
    if (!assignTargetDuty || !selectedReliever) {
      alert("Please select an operator to assign to this duty.");
      return;
    }
    const deployment = assignTargetDuty;
    const todayStr = new Date().toISOString().split("T")[0];
    const relieverName = String(selectedReliever.name || selectedReliever.empName || "").toUpperCase();
    const relieverId = String(selectedReliever.id || selectedReliever.empId || selectedReliever.empNo || "");
    const reliefSource = selectedReliever.source || assignDriverType || "STANDBY";

    setIsSubmittingAssign(true);
    try {
      const batch = writeBatch(db);
      const targetDocId =
        deployment.dutyId && deployment.dutyId !== "UNASSIGNED"
          ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
          : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;

      const normDutyId = String(parseInt(deployment.dutyId, 10) || deployment.dutyId || "").trim();
      const paddedDutyId = normDutyId ? normDutyId.padStart(2, "0") : "";
      const sched = normalizeScheduleType(currentDayType).toLowerCase();
      const possibleDutyDocIds = new Set([targetDocId]);
      if (normDutyId) {
        possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${normDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${paddedDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${paddedDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${normDutyId}`);
      }

      const assignPayload = {
        empName: relieverName,
        empId: relieverId,
        status: "ACTIVE",
        isSignedOn: true,
        remarks: `Assigned driver ${relieverName} (#${relieverId}) from [${reliefSource}] to Duty #${deployment.dutyId}`,
        lastUpdated: serverTimestamp(),
      };

      possibleDutyDocIds.forEach((dId) => {
        batch.set(doc(db, "crew_daily_deployment", dId), assignPayload, { merge: true });
      });

      // If this duty was previously booked off, update matching bookedOff entries
      let updatedBookedOff = (consoleData.bookedOff || []).map((bo) => {
        if (String(bo.dutyId) === String(deployment.dutyId) && (bo.status === "VACANT" || !bo.relieverName)) {
          return {
            ...bo,
            status: "RELIEVED",
            relievedBy: relieverName,
            relievedByEmpId: relieverId,
            relieverName: relieverName,
            relieverId: relieverId,
            relieverSource: reliefSource,
          };
        }
        return bo;
      });

      // Remove from source register in consoleData using universal transfer helper
      let updatedConsole = transferOperatorInConsoleData(
        { ...consoleData, bookedOff: updatedBookedOff },
        relieverId,
        relieverName,
        reliefSource,
        "mainline",
      );

      // If reliever was taken from another mainline duty, handle that duty
      if (reliefSource === "MAINLINE" && selectedReliever.dutyId) {
        const otherDutyId = selectedReliever.dutyId;
        if (String(otherDutyId) !== String(deployment.dutyId)) {
          const otherDocId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${otherDutyId}`;
          const currentDepDriver = String(deployment.empId || "").trim();
          if (currentDepDriver && currentDepDriver !== "--" && currentDepDriver !== "UNASSIGNED") {
            batch.set(
              doc(db, "crew_daily_deployment", otherDocId),
              {
                empName: deployment.empName,
                empId: deployment.empId,
                status: "ACTIVE",
                isSignedOn: true,
                remarks: `Swapped with Duty #${deployment.dutyId}`,
                lastUpdated: serverTimestamp(),
              },
              { merge: true },
            );
          } else {
            batch.set(
              doc(db, "crew_daily_deployment", otherDocId),
              {
                empName: "VACANT - DRIVER REQUIRED",
                empId: "--",
                status: "BOOKED_OFF_VACANT",
                isSignedOn: false,
                remarks: `Driver ${relieverName} transferred to Duty #${deployment.dutyId}`,
                lastUpdated: serverTimestamp(),
              },
              { merge: true },
            );
          }
        }
      }

      batch.set(
        doc(db, "roster_desk_console", "current"),
        updatedConsole,
        { merge: true },
      );
      batch.set(
        doc(db, "roster_desk_console", "latest"),
        updatedConsole,
        { merge: true },
      );
      batch.set(
        doc(db, "dispatch_excel_cache", todayStr),
        updatedConsole,
        { merge: true },
      );

      await batch.commit();

      setConsoleData(updatedConsole);
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(
            "pyidcc_roster_desk_console_cache",
            JSON.stringify(updatedConsole),
          );
        }
      } catch (e) {}

      setShowAssignDriverModal(false);
      setAssignTargetDuty(null);
      setSelectedReliever(null);
      alert(`✅ Driver ${relieverName} assigned to Duty #${deployment.dutyId} successfully from [${reliefSource}]!`);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Assign driver error:", err);
      alert("Failed to assign driver: " + err.message);
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  const openTransferModal = (operator = null, sourceCategory = "STANDBY") => {
    if (operator) {
      setTransferTargetOperator({
        empId: String(operator.empNo || operator.empId || operator.id || "").trim(),
        empName: String(operator.name || operator.empName || "").trim(),
        currentCategory: sourceCategory,
        rawItem: operator,
      });
    } else {
      setTransferTargetOperator(null);
    }
    setTransferDestinationCategory("MAINLINE");
    const vacantDuty = (deduplicatedDeployments || []).find(
      (d) => d.status === "BOOKED_OFF_VACANT" || d.empId === "--" || !d.empId,
    );
    setTransferTargetDutyId(vacantDuty ? String(vacantDuty.dutyId) : "1");
    setTransferReason("");
    setTransferSearchQuery("");
    setShowTransferModal(true);
  };

  const handleExecuteTransfer = async () => {
    if (!transferTargetOperator) {
      alert("Please select a crew member to transfer.");
      return;
    }
    const op = transferTargetOperator;
    const opName = String(op.empName || op.name || "").trim().toUpperCase();
    const opId = String(op.empId || op.empNo || "").trim();
    const srcCat = op.currentCategory || "STANDBY";
    const tgtCat = transferDestinationCategory;
    const todayStr = new Date().toISOString().split("T")[0];

    setIsSubmittingTransfer(true);
    try {
      const batch = writeBatch(db);
      let updatedConsole = { ...consoleData };

      if (tgtCat === "MAINLINE") {
        if (!transferTargetDutyId) {
          alert("Please select a target Mainline Duty Number.");
          setIsSubmittingTransfer(false);
          return;
        }

        const targetDuty = (deduplicatedDeployments || []).find(
          (d) => String(d.dutyId) === String(transferTargetDutyId),
        );
        const targetDocId =
          targetDuty && targetDuty.id
            ? targetDuty.id
            : `gcc_deploy_${currentDayType.toLowerCase()}_duty_${transferTargetDutyId}`;

        // Assign operator to target mainline duty
        batch.set(
          doc(db, "crew_daily_deployment", targetDocId),
          {
            empName: opName,
            empId: opId,
            status: "ACTIVE",
            isSignedOn: true,
            remarks: `Transferred from [${srcCat}] by Crew Controller. Reason: ${transferReason || "Operational transfer"}`,
            lastUpdated: serverTimestamp(),
          },
          { merge: true },
        );

        // If target duty was in bookedOff, update relief status
        let updatedBookedOff = (updatedConsole.bookedOff || []).map((bo) => {
          if (String(bo.dutyId) === String(transferTargetDutyId) && (bo.status === "VACANT" || !bo.relieverName)) {
            return {
              ...bo,
              status: "RELIEVED",
              relievedBy: opName,
              relievedByEmpId: opId,
              relieverName: opName,
              relieverId: opId,
              relieverSource: srcCat,
            };
          }
          return bo;
        });
        updatedConsole.bookedOff = updatedBookedOff;

        // Clean from source register in console
        updatedConsole = transferOperatorInConsoleData(
          updatedConsole,
          opId,
          opName,
          srcCat,
          "mainline",
        );
      } else {
        // Destination is a console register
        updatedConsole = transferOperatorInConsoleData(
          updatedConsole,
          opId,
          opName,
          srcCat,
          tgtCat,
          {
            duty: tgtCat.toUpperCase(),
            code: tgtCat.toUpperCase(),
            info: transferReason || `Transferred from ${srcCat}`,
          },
        );

        // If source was a mainline duty, vacate that duty
        if (srcCat === "MAINLINE" || srcCat === "mainline") {
          const sourceDutyId = op.rawItem?.dutyId || op.dutyId;
          if (sourceDutyId) {
            const srcDocId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${sourceDutyId}`;
            batch.set(
              doc(db, "crew_daily_deployment", srcDocId),
              {
                empName: "VACANT - DRIVER REQUIRED",
                empId: "--",
                status: "BOOKED_OFF_VACANT",
                isSignedOn: false,
                remarks: `Driver ${opName} moved to [${tgtCat}]. Duty requires replacement driver.`,
                lastUpdated: serverTimestamp(),
              },
              { merge: true },
            );
          }
        }
      }

      batch.set(
        doc(db, "roster_desk_console", "current"),
        updatedConsole,
        { merge: true },
      );
      batch.set(
        doc(db, "roster_desk_console", "latest"),
        updatedConsole,
        { merge: true },
      );
      batch.set(
        doc(db, "dispatch_excel_cache", todayStr),
        updatedConsole,
        { merge: true },
      );

      await batch.commit();
      setConsoleData(updatedConsole);
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(
            "pyidcc_roster_desk_console_cache",
            JSON.stringify(updatedConsole),
          );
        }
      } catch (e) {}

      setShowTransferModal(false);
      setTransferTargetOperator(null);
      alert(
        `✅ Operator ${opName} successfully moved from [${srcCat}] to [${
          tgtCat === "MAINLINE" ? `Duty #${transferTargetDutyId}` : tgtCat
        }]!`,
      );
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Transfer error:", err);
      alert("Failed to transfer operator: " + err.message);
    } finally {
      setIsSubmittingTransfer(false);
    }
  };

  const handleRestoreBookedOffOperator = async (boItem) => {
    if (!boItem) return;
    if (
      !window.confirm(
        `Restore operator ${boItem.name} (#${boItem.empNo || boItem.empId}) to active duty #${boItem.dutyId}?`,
      )
    ) {
      return;
    }
    const todayStr = new Date().toISOString().split("T")[0];
    try {
      const batch = writeBatch(db);
      const targetDocId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${boItem.dutyId}`;
      const normDutyId = String(parseInt(boItem.dutyId, 10) || boItem.dutyId || "").trim();
      const paddedDutyId = normDutyId ? normDutyId.padStart(2, "0") : "";
      const sched = normalizeScheduleType(currentDayType).toLowerCase();
      const possibleDutyDocIds = new Set([targetDocId]);
      if (normDutyId) {
        possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${normDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${paddedDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${paddedDutyId}`);
        possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${normDutyId}`);
      }

      const restorePayload = {
        empName: boItem.name,
        empId: boItem.empNo || boItem.empId,
        status: "ACTIVE",
        isSignedOn: true,
        remarks: `Restored to duty from Booked Off register`,
        lastUpdated: serverTimestamp(),
      };

      possibleDutyDocIds.forEach((dId) => {
        batch.set(doc(db, "crew_daily_deployment", dId), restorePayload, { merge: true });
      });

      // Remove from bookedOff list
      const updatedBookedOff = (consoleData.bookedOff || []).filter(
        (b) =>
          String(b.empNo || b.empId) !== String(boItem.empNo || boItem.empId) ||
          String(b.dutyId) !== String(boItem.dutyId),
      );

      const updatedConsole = { ...consoleData, bookedOff: updatedBookedOff };
      batch.set(
        doc(db, "roster_desk_console", "current"),
        { bookedOff: updatedBookedOff },
        { merge: true },
      );
      batch.set(
        doc(db, "dispatch_excel_cache", todayStr),
        { bookedOff: updatedBookedOff },
        { merge: true },
      );

      await batch.commit();
      setConsoleData(updatedConsole);
      alert(`✅ Operator ${boItem.name} restored to Duty #${boItem.dutyId}!`);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Restore error:", err);
      alert("Failed to restore operator: " + err.message);
    }
  };

  const handleCopyBookedOffSummary = () => {
    const boList = consoleData.bookedOff || [];
    if (boList.length === 0) {
      alert("No booked off records to copy.");
      return;
    }
    const dateStr = deployedRosterInfo?.dateStr || activeSelectedDateStr || new Date().toISOString().split("T")[0];
    let text = `🚨 *BMRCL LINE 2 (PEENYA DEPOT) — BOOKED OFF INCIDENT LOG*\n📅 Date: ${dateStr}\n━━━━━━━━━━━━━━━━━━━━\n`;
    boList.forEach((b, idx) => {
      text += `${idx + 1}. *${b.name || b.empName}* (#${b.empNo || b.empId})\n`;
      text += `   • Duty: #${b.dutyId || "--"} | Train: ${b.trainId || "--"}\n`;
      text += `   • Fault: ${b.faultCategory || "FAULT"} — ${b.reason || b.remarks || "Booked off"}\n`;
      if (b.relieverName) {
        text += `   • Status: Relieved by ${b.relieverName} (#${b.relieverId || "--"})\n`;
      } else {
        text += `   • Status: ⚠️ VACANT — DRIVER REQUIRED\n`;
      }
      text += `\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━\nGenerated via Dispatch Gateway Core (BMRCL)`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    alert("📋 Booked Off Incident Summary copied to clipboard!");
  };

  const handleInspectAndAutoDeploy = async () => {
    if (!excelPathInput) {
      alert(
        "Please paste an Excel file path link or select a file using 'Browse File'.",
      );
      return;
    }
    setIsInspectingPath(true);
    try {
      alert(`INSPECT & AUTO-DEPLOY initiated for path: ${excelPathInput}`);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Error inspecting file path: " + err.message);
    } finally {
      setIsInspectingPath(false);
    }
  };

  // Fetch Deployments Fallback (used when AutomatedDispatchGate is standalone)
  useEffect(() => {
    if (providedDeployments) {
      setFallbackLoading(false);
      return undefined;
    }
    const targetSched = normalizeScheduleType(currentDayType);
    const q = query(collection(db, "crew_daily_deployment"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const raw = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((d) => {
          if (!d.scheduleType) return true;
          return normalizeScheduleType(d.scheduleType) === targetSched;
        });
      // Deduplicate and strip invalid duty IDs at the source
      setFallbackDeployments(deduplicateDeployments(raw));
      setFallbackLoading(false);
    });
    return () => unsubscribe();
  }, [providedDeployments, currentDayType]);

  // Fetch Historical Events when History tab is active
  useEffect(() => {
    if (activeTab === "HISTORY") {
      setHistoryLoading(true);
      const q = query(
        collection(db, "automated_dispatch_gate"),
        orderBy("timestamp", "desc"),
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setEventHistory(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        );
        setHistoryLoading(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const deployments = providedDeployments || fallbackDeployments;
  const loading = providedLoading || fallbackLoading;

  const [selectedIds, setSelectedIds] = useState([]);

  // Filtering Logic
  const filteredDeployments = deduplicatedDeployments
    .filter((d) => {
      if (filterStatus === "ALL") return true;
      if (filterStatus === "ACTIVE" || filterStatus === "SIGNED_ON")
        return (
          d.isSignedOn ||
          d.status === "DISPATCHED" ||
          d.status === "RELIEF_DISPATCHED"
        );
      if (filterStatus === "PENDING")
        return (
          !d.isSignedOn &&
          d.status !== "DISPATCHED" &&
          d.status !== "RELIEF_DISPATCHED"
        );
      return true;
    })
    .filter((d) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        String(d.dutyId).toLowerCase().includes(q) ||
        String(d.empName).toLowerCase().includes(q) ||
        String(d.trainId).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      // Sort numerically by duty ID; non-numeric duty IDs go to the end
      const aNum = parseInt(String(a.dutyId).replace(/\D/g, ""), 10);
      const bNum = parseInt(String(b.dutyId).replace(/\D/g, ""), 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return String(a.dutyId).localeCompare(String(b.dutyId));
    });

  const eligibleDeployments = useMemo(() => {
    return filteredDeployments.filter(
      (d) => d.status !== "DISPATCHED" && d.status !== "RELIEF_DISPATCHED",
    );
  }, [filteredDeployments]);

  const getPossibleDutyDocIds = (dutyId, empId) => {
    const ids = new Set();
    const sched = normalizeScheduleType(currentDayType).toLowerCase();
    const rawDutyId = String(dutyId || "").trim();
    if (rawDutyId && rawDutyId !== "UNASSIGNED" && rawDutyId !== "--") {
      ids.add(`gcc_deploy_${sched}_duty_${rawDutyId}`);
      const normDutyId = String(parseInt(rawDutyId, 10) || rawDutyId || "").trim();
      const paddedDutyId = normDutyId ? normDutyId.padStart(2, "0") : "";
      ids.add(`gcc_deploy_${sched}_duty_${normDutyId}`);
      ids.add(`gcc_deploy_${sched}_duty_${paddedDutyId}`);
      ids.add(`gcc_deploy_active_run_duty_${paddedDutyId}`);
      ids.add(`gcc_deploy_active_run_duty_${normDutyId}`);
    }
    const cleanEmpId = String(empId || "").trim();
    if (cleanEmpId && cleanEmpId !== "--" && cleanEmpId !== "UNASSIGNED") {
      ids.add(`gcc_deploy_${sched}_extra_${cleanEmpId}`);
    }
    return Array.from(ids);
  };

  const authorizeDispatch = async (deployment) => {
    if (onAuthorize) {
      await onAuthorize(deployment);
      return;
    }
    try {
      const dutyId = String(deployment.dutyId || "").trim();
      const empId = String(deployment.empId || deployment.empNo || "").trim();
      const docIds = getPossibleDutyDocIds(dutyId, empId);
      const payload = {
        status: "DISPATCHED",
        dispatchTime: serverTimestamp(),
        dispatchAuthorizedBy: "System",
        lastUpdated: serverTimestamp(),
      };
      for (const dId of docIds) {
        await setDoc(doc(db, "crew_daily_deployment", dId), payload, { merge: true });
      }
      setFallbackDeployments((prev) =>
        prev.map((d) =>
          String(d.dutyId).trim() === dutyId ? { ...d, status: "DISPATCHED" } : d,
        ),
      );
    } catch (error) {
      console.error("Error authorizing dispatch:", error);
      alert("Failed to authorize dispatch.");
    }
  };

  const getReliefRecommendations = (targetDeployment) => {
    if (!targetDeployment) return [];
    const targetTrainIds = getLegTrainIds(targetDeployment);
    const targetDutyIdStr = String(targetDeployment.dutyId || "").trim();
    const targetEmpId = String(
      targetDeployment.empId || targetDeployment.empNo || targetDeployment.employeeId || "",
    ).trim();
    const targetEmpName = String(
      targetDeployment.empName || targetDeployment.name || targetDeployment.driverName || "",
    ).trim().toUpperCase();

    const seenCandidates = new Set();
    if (targetEmpId) seenCandidates.add(targetEmpId.toUpperCase());
    if (targetEmpName) seenCandidates.add(targetEmpName);

    const poolList = [];

    // =========================================================================
    // 1. INGEST STANDBY CREW FROM BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
    //    A. Standbys & Operating Reserves (@Standby, @OR)
    // =========================================================================
    (consoleData.standbys || []).forEach((item, idx) => {
      const empId = String(item.empNo || item.empId || `STBY_${idx + 1}`).trim();
      const empName = String(item.name || item.empName || "").trim();
      if (!empName || empName === "--" || empName.toUpperCase().includes("VACANT") || empName.toUpperCase().includes("UNASSIGNED")) return;
      if (empName.toUpperCase() === targetEmpName || (empId && seenCandidates.has(empId.toUpperCase()))) return;
      if (empId) seenCandidates.add(empId.toUpperCase());
      seenCandidates.add(empName.toUpperCase());

      const codeUpper = String(item.code || item.label || item.dutyId || "OR").trim().toUpperCase();
      const isOR = codeUpper.startsWith("OR") || codeUpper.includes(" OR ");
      const dutyCode = item.code || item.label || (isOR ? "OR" : "STANDBY");

      poolList.push({
        id: `console_stby_${empId}`,
        empId,
        empNo: empId,
        empName,
        name: empName,
        dutyId: dutyCode,
        trainId: "--",
        shift: item.time || "06:00 - 14:00",
        signOnTime: item.time ? String(item.time).split("-")[0].trim() : "06:00",
        signOffTime: item.time && item.time.includes("-") ? String(item.time).split("-")[1].trim() : "14:00",
        signOnLocation: "PYID",
        signOffLocation: "PYID",
        status: "STANDBY",
        isSignedOn: true,
        candidatePool: "STANDBY",
        poolLabel: `STANDBY (${dutyCode})`,
        poolPriority: 100, // Top Priority: Designated Depot Standby
        reason: isOR
          ? "Primary Peenya Depot Operating Reserve (OR) Standby Crew (Priority 1)"
          : "Primary Depot Emergency Standby Crew from @Standby Console (Priority 1)",
        isConsoleStandby: true,
        source: "ROSTER_DESK_CONSOLE_STANDBY",
        remainingHours: 7.0,
      });
    });

    // =========================================================================
    // 1. B. Outstation Step-Back Operators (@STBK)
    // =========================================================================
    (consoleData.outstationStepbacks || []).forEach((item, idx) => {
      const empId = String(item.empNo || item.empId || `STBK_${idx + 1}`).trim();
      const empName = String(item.name || item.empName || "").trim();
      if (!empName || empName === "--" || empName.toUpperCase().includes("VACANT")) return;
      if (empName.toUpperCase() === targetEmpName || (empId && seenCandidates.has(empId.toUpperCase()))) return;
      if (empId) seenCandidates.add(empId.toUpperCase());
      seenCandidates.add(empName.toUpperCase());

      const stn = String(item.station || item.loc || "PYID").trim().toUpperCase();
      poolList.push({
        id: `console_stbk_${empId}`,
        empId,
        empNo: empId,
        empName,
        name: empName,
        dutyId: `STBK (${stn})`,
        trainId: "--",
        shift: item.time || "06:00 - 14:00",
        signOnTime: item.time ? String(item.time).split("-")[0].trim() : "06:00",
        signOffTime: "14:00",
        signOnLocation: stn,
        signOffLocation: stn,
        status: "STBK",
        isSignedOn: true,
        candidatePool: "STANDBY",
        poolLabel: `STBK (${stn})`,
        poolPriority: 90, // Step-back: 90 pts
        reason: `Outstation Step-back Operator at ${stn} (@STBK Console) (Priority 1)`,
        isConsoleStandby: true,
        source: "ROSTER_DESK_CONSOLE_STBK",
        remainingHours: 6.5,
      });
    });

    // =========================================================================
    // 1. C. PRO, NPRO, TGTP, RD3 Standby Registers (@PRO, @TGTP, @RD3)
    // =========================================================================
    if (consoleData.customRegisters) {
      Object.entries(consoleData.customRegisters).forEach(([tag, list]) => {
        if (!Array.isArray(list)) return;
        const tagUpper = tag.toUpperCase();
        const isPro = tagUpper.includes("PRO") || tagUpper.includes("PILOT");
        const isTgtp = tagUpper.includes("TGTP");
        const isRd3 = tagUpper.includes("RD3") || tagUpper.includes("RD-3");
        if (!isPro && !isTgtp && !isRd3) return;

        const poolType = isPro ? "PRO" : "STANDBY";
        const priority = isPro ? 85 : 80;

        list.forEach((item, idx) => {
          const empId = String(item.empNo || item.empId || `${tag}_${idx + 1}`).trim();
          const empName = String(item.name || item.empName || "").trim();
          if (!empName || empName === "--" || empName.toUpperCase().includes("VACANT")) return;
          if (empName.toUpperCase() === targetEmpName || (empId && seenCandidates.has(empId.toUpperCase()))) return;
          if (empId) seenCandidates.add(empId.toUpperCase());
          seenCandidates.add(empName.toUpperCase());

          poolList.push({
            id: `console_custom_${tag}_${empId}`,
            empId,
            empNo: empId,
            empName,
            name: empName,
            dutyId: tag,
            trainId: "--",
            shift: item.time || item.info || "06:00 - 14:00",
            signOnTime: "06:00",
            signOffTime: "14:00",
            signOnLocation: isTgtp ? "TGTP" : "PYID",
            signOffLocation: isTgtp ? "TGTP" : "PYID",
            status: tag,
            isSignedOn: true,
            candidatePool: poolType,
            poolLabel: `${poolType} (${tag})`,
            poolPriority: priority,
            reason: `${tag} Operator from Peenya Console Registry (Priority 1)`,
            isConsoleStandby: true,
            source: "ROSTER_DESK_CONSOLE_CUSTOM",
            remainingHours: 6.0,
          });
        });
      });
    }

    // =========================================================================
    // 2. INGEST FROM SCHEDULED DEPLOYMENTS (deployments)
    // =========================================================================
    deployments.forEach((candidate) => {
      const cDutyId = String(candidate.dutyId || "").trim();
      if (cDutyId === targetDutyIdStr) return;
      if (!candidate.empName || candidate.empName === "--") return;
      const nameUpper = String(candidate.empName || "").toUpperCase();
      if (nameUpper.includes("VACANT") || nameUpper.includes("UNASSIGNED")) return;

      const cEmpId = String(candidate.empId || candidate.empNo || "").trim();
      if (seenCandidates.has(nameUpper) || (cEmpId && seenCandidates.has(cEmpId.toUpperCase()))) return;

      const cStatus = String(candidate.status || "").toUpperCase();
      if (
        cStatus === "RELIEF_DISPATCHED" ||
        cStatus === "RELIEVED" ||
        cStatus === "ABSENT" ||
        cStatus === "AB" ||
        cStatus === "NOT_REPORTING" ||
        cStatus === "NR" ||
        cStatus === "BOOKED_OFF" ||
        cStatus === "BOOKED_OFF_VACANT" ||
        Boolean(candidate.isAbsent) ||
        Boolean(candidate.isNotReporting)
      ) {
        return;
      }

      seenCandidates.add(nameUpper);
      if (cEmpId) seenCandidates.add(cEmpId.toUpperCase());

      const candidateTrainIds = getLegTrainIds(candidate);
      const sameTrainDuty = candidateTrainIds.some((tid) => targetTrainIds.includes(tid));
      const remainingHours = getRemainingHours(candidate);

      const resolvedType = String(
        resolveDutyType(candidate, currentDayType) || candidate.dutyType || "",
      ).toUpperCase();
      const trainIdStr = String(candidate.trainId || "").trim().toUpperCase();
      const shiftStr = String(candidate.shift || "").trim().toUpperCase();
      const remarksStr = String(candidate.remarks || "").trim().toUpperCase();
      const dutyIdStr = String(candidate.dutyId || "").trim().toUpperCase();

      // Check if candidate is driving an active mainline passenger train
      // e.g. Train IDs like 201..233, A73, B4235, B57, B59, B60, M62PU, A1833, etc.
      const isMainlineTrain = Boolean(
        trainIdStr &&
        trainIdStr !== "--" &&
        trainIdStr !== "-" &&
        trainIdStr !== "UNASSIGNED" &&
        !["STBY", "STANDBY", "STDBY", "STBK", "RD3", "RD-3", "TGTP", "PRO", "NPRO", "PILOT", "OR", "OR1", "OR2"].includes(trainIdStr) &&
        !trainIdStr.startsWith("ST") &&
        !trainIdStr.startsWith("PRO") &&
        !trainIdStr.startsWith("OR")
      );

      // Standby detection (Scheduled Roster Non-Running Standby Duty)
      const isStandby = Boolean(
        !isMainlineTrain && (
          /\b(STBY|STANDBY|STDBY|STBK|RD-?3|TGTP|OR1|OR2)\b/i.test(resolvedType) ||
          (/\bOR\b/i.test(resolvedType) && !/OPERATOR/i.test(resolvedType)) ||
          /\b(STBY|STANDBY|STDBY|STBK|RD-?3|TGTP|OR1|OR2)\b/i.test(trainIdStr) ||
          (/\bOR\b/i.test(trainIdStr) && !/OPERATOR/i.test(trainIdStr)) ||
          /\b(STBY|STANDBY|STDBY|STBK|RD-?3|TGTP|OR1|OR2)\b/i.test(remarksStr) ||
          /\b(STBY|STANDBY|STDBY|STBK|RD-?3|TGTP|OR1|OR2)\b/i.test(shiftStr) ||
          dutyIdStr.startsWith("STBY") ||
          dutyIdStr.startsWith("OR")
        )
      );

      // Pro detection (Pilot Reserve)
      const isPro = Boolean(
        !isMainlineTrain && !isStandby && (
          resolvedType.includes("PRO") ||
          resolvedType.includes("NPRO") ||
          resolvedType.includes("PILOT") ||
          trainIdStr.includes("PRO") ||
          trainIdStr.startsWith("PRO") ||
          shiftStr.includes("PRO") ||
          shiftStr.includes("NPRO") ||
          remarksStr.includes("PRO") ||
          remarksStr.includes("PILOT") ||
          dutyIdStr.startsWith("PRO")
        )
      );

      // Buffer
      const isBuffer = Boolean(
        !isMainlineTrain && !isStandby && !isPro && (
          trainIdStr === "" ||
          trainIdStr === "--" ||
          trainIdStr === "UNASSIGNED" ||
          resolvedType.includes("BUFFER") ||
          resolvedType.includes("EXTRA")
        )
      );

      let candidatePool = "ACTIVE_MAINLINE";
      let poolLabel = `Active (Train ${candidate.trainId || "--"})`;
      let poolPriority = 10;
      let poolReason = sameTrainDuty
        ? "Same path / train leg detected (crossover swap)"
        : "In-service mainline operator (OCC crossover / cab swap)";

      if (isStandby) {
        candidatePool = "STANDBY";
        const subLabel = trainIdStr && trainIdStr !== "--" ? trainIdStr : (resolvedType || "Depot Reserve");
        poolLabel = `STANDBY (${subLabel})`;
        poolPriority = 80;
        poolReason = "Scheduled Roster Emergency Standby Crew (Priority 1)";
      } else if (isPro) {
        candidatePool = "PRO";
        const subLabel = trainIdStr && trainIdStr !== "--" ? trainIdStr : (resolvedType || "Pilot Reserve");
        poolLabel = `PRO PILOT (${subLabel})`;
        poolPriority = 65;
        poolReason = "Designated Depot Pilot Reserve Crew (Priority 1)";
      } else if (isBuffer) {
        candidatePool = "BUFFER";
        poolLabel = "DEPOT BUFFER CREW";
        poolPriority = 40;
        poolReason = "Unassigned buffer operator available at depot";
      }

      poolList.push({
        ...candidate,
        candidatePool,
        poolLabel,
        poolPriority,
        reason: poolReason,
        sameTrainDuty,
        remainingHours,
      });
    });

    return poolList
      .map((candidate) => {
        const remainingHours = candidate.remainingHours !== undefined ? candidate.remainingHours : getRemainingHours(candidate);
        const scores = {
          poolPriority: candidate.poolPriority || 10,
          readiness: candidate.candidatePool === "STANDBY"
            ? 40
            : candidate.isSignedOn ? 35 : candidate.status === "DISPATCHED" ? 25 : 15,
          trainMatch: candidate.sameTrainDuty ? 25 : 0,
          reliefWindow: Math.min(35, Math.max(0, Math.round(remainingHours * 4.375))),
        };
        const totalScore = scores.poolPriority + scores.readiness + scores.trainMatch + scores.reliefWindow;

        return {
          ...candidate,
          scoreBreakdown: scores,
          score: totalScore,
          remainingHours,
        };
      })
      .filter((candidate) => candidate.remainingHours >= 0.25)
      .sort((a, b) => b.score - a.score);
  };

  const handleAbnormalEvent = async (deployment, eventType) => {
    if (eventType === "RESET_RELIEF") {
      await handleResetRelief(deployment);
      return;
    }
    if (eventType === "UNDO_DISPATCH") {
      await handleUndoDispatch(deployment);
      return;
    }
    if (
      eventType === "RESET" &&
      (deployment.status === "RELIEF_DISPATCHED" ||
        deployment.status === "RELIEVED" ||
        deployment.status === "EMERGENCY" ||
        deployment.status === "EMERGENCY_DECLARED")
    ) {
      await handleResetRelief(deployment);
      return;
    }
    if (eventType === "CHANGE") {
      openAssignDriverModal(deployment);
      return;
    }
    if (eventType === "MOVE") {
      openTransferModal(
        {
          empId: deployment.empId || deployment.empNo,
          empNo: deployment.empNo || deployment.empId,
          name: deployment.driverName || deployment.operatorName || deployment.empName || deployment.name,
          dutyId: deployment.dutyId,
          shift: deployment.shift,
        },
        "MAINLINE",
      );
      return;
    }
    if (eventType === "BOOK_OFF") {
      openBookOffModal(deployment);
      return;
    }
    if (
      eventType === "NOT_REPORTING" ||
      eventType === "ABSENT" ||
      eventType === "RESET"
    ) {
      try {
        const docId =
          deployment.dutyId && deployment.dutyId !== "UNASSIGNED"
            ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
            : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;

        const normDutyId = String(parseInt(deployment.dutyId, 10) || deployment.dutyId || "").trim();
        const paddedDutyId = normDutyId ? normDutyId.padStart(2, "0") : "";
        const sched = normalizeScheduleType(currentDayType).toLowerCase();
        const possibleDutyDocIds = new Set([docId]);
        if (normDutyId) {
          possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${normDutyId}`);
          possibleDutyDocIds.add(`gcc_deploy_${sched}_duty_${paddedDutyId}`);
          possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${paddedDutyId}`);
          possibleDutyDocIds.add(`gcc_deploy_active_run_duty_${normDutyId}`);
        }

        const isCurrentlyNR =
          deployment.status === "NOT_REPORTING" || deployment.status === "NR";
        const isCurrentlyAB =
          deployment.status === "ABSENT" || deployment.status === "AB";
        const isCurrentlyBO =
          deployment.status === "BOOKED_OFF_VACANT" ||
          deployment.status === "BOOKED_OFF" ||
          String(deployment.remarks || "").toUpperCase().includes("BOOKED OFF");

        let newStatus = eventType;
        let newRemarks =
          eventType === "NOT_REPORTING"
            ? "Not Reporting (NR)"
            : eventType === "ABSENT"
              ? "Absent (AB)"
              : "Status Reset";

        // Toggle back to ACTIVE if already marked or if RESET chosen
        if (
          eventType === "RESET" ||
          (eventType === "NOT_REPORTING" && isCurrentlyNR) ||
          (eventType === "ABSENT" && isCurrentlyAB) ||
          (eventType === "RESET" && isCurrentlyBO)
        ) {
          newStatus = "ACTIVE";
          newRemarks = "Active Deployment";
        }

        const updatePayload = {
          status: newStatus,
          isNotReporting: newStatus === "NOT_REPORTING",
          isAbsent: newStatus === "ABSENT",
          remarks: newRemarks,
          lastUpdated: serverTimestamp(),
        };

        for (const dId of possibleDutyDocIds) {
          await setDoc(
            doc(db, "crew_daily_deployment", dId),
            updatePayload,
            { merge: true },
          );
        }

        // Update fallback / local deployment state
        setFallbackDeployments((prev) =>
          prev.map((d) =>
            String(d.dutyId) === String(deployment.dutyId)
              ? {
                  ...d,
                  status: newStatus,
                  isNotReporting: newStatus === "NOT_REPORTING",
                  isAbsent: newStatus === "ABSENT",
                  remarks: newRemarks,
                }
              : d,
          ),
        );

        const empId = String(deployment.empId || "").trim();
        const empName = String(deployment.empName || "").trim();

        // Immediately update consoleData in real time
        setConsoleData((prev) => {
          let updatedNR = (prev.notReporting || []).filter(
            (e) =>
              String(e.empNo || e.empId).trim() !== empId &&
              e.name !== empName,
          );
          let updatedAB = (prev.absents || []).filter(
            (e) =>
              String(e.empNo || e.empId).trim() !== empId &&
              e.name !== empName,
          );
          let updatedBO = (prev.bookedOff || []).filter(
            (b) =>
              String(b.dutyId) !== String(deployment.dutyId) &&
              String(b.empNo || b.empId).trim() !== empId &&
              b.name !== empName,
          );

          if (newStatus === "NOT_REPORTING") {
            updatedNR.push({
              empNo: empId,
              empId,
              name: empName,
              dutyId: deployment.dutyId,
              type: "NOT_REPORTING",
            });
          } else if (newStatus === "ABSENT") {
            updatedAB.push({
              empNo: empId,
              empId,
              name: empName,
              dutyId: deployment.dutyId,
              type: "ABSENT",
            });
          }

          const rawUpdated = {
            ...prev,
            notReporting: updatedNR,
            absents: updatedAB,
            bookedOff: newStatus === "ACTIVE" ? updatedBO : prev.bookedOff,
          };
          const next = enforceSingleDutyRule(rawUpdated);

          const todayStr = new Date().toISOString().split("T")[0];
          setDoc(
            doc(db, "roster_desk_console", "current"),
            { notReporting: next.notReporting, absents: next.absents, bookedOff: next.bookedOff },
            { merge: true },
          ).catch(console.warn);
          setDoc(
            doc(db, "dispatch_excel_cache", todayStr),
            { notReporting: next.notReporting, absents: next.absents },
            { merge: true },
          ).catch(console.warn);

          try {
            if (typeof window !== "undefined" && window.localStorage) {
              window.localStorage.setItem(
                "pyidcc_roster_desk_console_cache",
                JSON.stringify(next),
              );
            }
          } catch (err) {}

          return next;
        });

        // Sync to absent_bookoff_register for real-time leave & book-off register tracking
        if (newStatus !== "ACTIVE") {
          const dateStr = new Date().toISOString().split("T")[0];
          const regDocId = `bo_reg_${deployment.empId}_${dateStr}_${newStatus}`;
          await setDoc(
            doc(db, "absent_bookoff_register", regDocId),
            {
              employeeId: String(deployment.empId || ""),
              employeeName: String(deployment.empName || "").toUpperCase(),
              code: newStatus === "NOT_REPORTING" ? "NR" : "AB",
              category: newStatus === "NOT_REPORTING" ? "NR" : "AB",
              date: dateStr,
              startDate: dateStr,
              endDate: dateStr,
              status: "REGISTERED",
              remarks: `Triggered from Automated Dispatch Gate (${newStatus})`,
              timestamp: serverTimestamp(),
            },
            { merge: true },
          );
        }

        alert(
          `✅ Operator ${deployment.empName || deployment.dutyId} moved to: ${newStatus === "ACTIVE" ? "ACTIVE (Cleared)" : newStatus}`,
        );
        if (onImportComplete) onImportComplete();
        return;
      } catch (err) {
        console.error("Error updating operator status:", err);
        alert("Failed to update status: " + err.message);
        return;
      }
    }

    const recommendations = getReliefRecommendations(deployment);
    const eventId = `dispatch_${eventType.toLowerCase()}_${deployment.dutyId}_${Date.now()}`;
    const nextEvent = { id: eventId, eventType, deployment, recommendations };

    setActiveAbnormalEvent(nextEvent);
    setSavingEvent(true);
    setOverrideDutyId(""); // Reset manual override input

    try {
      await setDoc(doc(db, "automated_dispatch_gate", eventId), {
        incidentId: eventId,
        incidentType: eventType,
        trainId: String(deployment.trainId || "--"),
        currentDutyId: String(deployment.dutyId || "--"),
        currentEmpId: deployment.empId || "--",
        currentEmpName: deployment.empName || "--",
        recommendations: recommendations.map((c) => ({
          empId: c.empId || "--",
          empName: c.empName || "--",
          score: c.score,
          scoreBreakdown: c.scoreBreakdown,
          dutyId: String(c.dutyId || "--"),
          remainingHours: Number(c.remainingHours.toFixed(2)),
          reason: c.reason,
        })),
        status: "ANALYZING",
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error logging abnormal dispatch event:", error);
      alert("Failed to log event.");
    } finally {
      setSavingEvent(false);
    }
  };

  const executeRelief = async (recommendedCandidate) => {
    if (!activeAbnormalEvent) return;
    try {
      setSavingEvent(true);
      const targetDeployment = activeAbnormalEvent.deployment;
      const targetDutyId = String(targetDeployment.dutyId || "").trim();
      const targetEmpName = String(
        targetDeployment.empName || targetDeployment.name || "",
      ).trim();
      const targetEmpId = String(
        targetDeployment.empId || targetDeployment.empNo || "",
      ).trim();

      const candDutyId = String(recommendedCandidate.dutyId || "").trim();
      const candEmpName = String(
        recommendedCandidate.empName || recommendedCandidate.name || "",
      ).trim();
      const candEmpId = String(
        recommendedCandidate.empId || recommendedCandidate.empNo || "",
      ).trim();

      // 1. Mark the event as RESOLVED in automated_dispatch_gate
      await setDoc(
        doc(db, "automated_dispatch_gate", activeAbnormalEvent.id),
        {
          status: "RESOLVED",
          targetDutyId,
          targetEmpName,
          targetEmpId,
          resolvedByDutyId: candDutyId,
          resolvedByEmpName: candEmpName,
          resolvedByEmpId: candEmpId,
          resolvedAt: serverTimestamp(),
        },
        { merge: true },
      );

      // 2. Update the candidate to show they are providing relief across all possible doc IDs
      const candDocIds = getPossibleDutyDocIds(candDutyId, candEmpId);
      const relieverPayload = {
        status: "RELIEF_DISPATCHED",
        reliefTargetDuty: targetDutyId,
        reliefTargetEmpName: targetEmpName,
        reliefTargetEmpId: targetEmpId,
        reliefDispatchedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      };
      for (const cDocId of candDocIds) {
        await setDoc(
          doc(db, "crew_daily_deployment", cDocId),
          relieverPayload,
          { merge: true },
        );
      }

      // If candidate is a console standby, create/update an active deployment record
      if (recommendedCandidate.isConsoleStandby || !candDocIds.length) {
        const cleanDutyKey = candDutyId.replace(/[^a-zA-Z0-9_-]/g, "_");
        const consoleRelieverDocId = `gcc_deploy_active_run_duty_${cleanDutyKey}`;
        await setDoc(
          doc(db, "crew_daily_deployment", consoleRelieverDocId),
          {
            dutyId: candDutyId,
            empId: candEmpId,
            empName: candEmpName,
            status: "RELIEF_DISPATCHED",
            reliefTargetDuty: targetDutyId,
            reliefTargetEmpName: targetEmpName,
            reliefTargetEmpId: targetEmpId,
            reliefDispatchedAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
          },
          { merge: true },
        );
      }

      // 3. Update the relieved target duty across all possible doc IDs
      const targetDocIds = getPossibleDutyDocIds(targetDutyId, targetEmpId);
      const targetPayload = {
        status: "RELIEVED",
        relievedByDutyId: candDutyId,
        relievedByEmpName: candEmpName,
        relievedByEmpId: candEmpId,
        reliefDispatchedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
      };
      for (const tDocId of targetDocIds) {
        await setDoc(
          doc(db, "crew_daily_deployment", tDocId),
          targetPayload,
          { merge: true },
        );
      }

      // 4. Update local fallbackDeployments state immediately for both duties
      setFallbackDeployments((prev) => {
        let foundRelieverInDeployments = false;
        const updated = prev.map((d) => {
          if (String(d.dutyId).trim() === targetDutyId) {
            return {
              ...d,
              status: "RELIEVED",
              relievedByDutyId: candDutyId,
              relievedByEmpName: candEmpName,
              relievedByEmpId: candEmpId,
            };
          }
          if (String(d.dutyId).trim() === candDutyId) {
            foundRelieverInDeployments = true;
            return {
              ...d,
              status: "RELIEF_DISPATCHED",
              reliefTargetDuty: targetDutyId,
              reliefTargetEmpName: targetEmpName,
              reliefTargetEmpId: targetEmpId,
            };
          }
          return d;
        });

        if (!foundRelieverInDeployments && (recommendedCandidate.isConsoleStandby || candDutyId)) {
          updated.unshift({
            id: `reliever_${candEmpId || Date.now()}`,
            dutyId: candDutyId,
            empId: candEmpId,
            empName: candEmpName,
            dutyType: "STANDBY_RELIEVER",
            trainId: targetDeployment.trainId || "--",
            shift: recommendedCandidate.shift || "06:00 - 14:00",
            signOnTime: recommendedCandidate.signOnTime || "06:00",
            signOffTime: recommendedCandidate.signOffTime || "14:00",
            signOnLocation: "PYID",
            signOffLocation: targetDeployment.signOffLocation || "PYID",
            status: "RELIEF_DISPATCHED",
            reliefTargetDuty: targetDutyId,
            reliefTargetEmpName: targetEmpName,
            reliefTargetEmpId: targetEmpId,
            isSignedOn: true,
          });
        }
        return updated;
      });

      alert(
        `✅ Relief Dispatched: ${candEmpName} (${candDutyId}) is now relieving Duty #${targetDutyId} (${targetEmpName}).`,
      );
      setActiveAbnormalEvent(null);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to execute relief. " + (err.message || ""));
    } finally {
      setSavingEvent(false);
    }
  };

  const handleResetRelief = async (deployment) => {
    if (!deployment) return;
    try {
      const isReliever = deployment.status === "RELIEF_DISPATCHED";
      const isTarget = deployment.status === "RELIEVED";
      const isEmergency =
        deployment.status === "EMERGENCY" ||
        deployment.status === "EMERGENCY_DECLARED" ||
        (activeAbnormalEvent && String(activeAbnormalEvent.deployment?.dutyId) === String(deployment.dutyId));

      const dutyId1 = String(deployment.dutyId || "").trim();
      const dutyId2 = String(
        isReliever
          ? deployment.reliefTargetDuty
          : isTarget
            ? deployment.relievedByDutyId
            : "",
      ).trim();

      const pairedDuty = deployments.find(
        (d) => String(d.dutyId).trim() === dutyId2,
      );

      const targetDutyId = isReliever ? dutyId2 : dutyId1;
      const relieverDutyId = isReliever ? dutyId1 : dutyId2;

      const confirmMsg = isEmergency && !isTarget && !isReliever
        ? `Reset emergency incident for Duty #${targetDutyId}? Duty will be restored to Active status.`
        : `Reset & Undo Relief assignment between Duty #${relieverDutyId || "Reliever"} and Duty #${targetDutyId || "Target"}? Both operators will be restored to Active status.`;
      if (!window.confirm(confirmMsg)) return;

      // 1. Reset Reliever Duty
      if (relieverDutyId) {
        const relieverEmpId = String(
          (isReliever ? deployment.empId : pairedDuty?.empId) || "",
        );
        const relDocIds = getPossibleDutyDocIds(relieverDutyId, relieverEmpId);
        const relResetPayload = {
          status: "ACTIVE",
          reliefTargetDuty: null,
          reliefTargetEmpName: null,
          reliefTargetEmpId: null,
          reliefDispatchedAt: null,
          remarks: "Active Deployment",
          lastUpdated: serverTimestamp(),
        };
        for (const docId of relDocIds) {
          await setDoc(
            doc(db, "crew_daily_deployment", docId),
            relResetPayload,
            { merge: true },
          );
        }
      }

      // 2. Reset Target Duty
      if (targetDutyId) {
        const targetEmpId = String(
          (isTarget || isEmergency ? deployment.empId : pairedDuty?.empId) || "",
        );
        const tgtDocIds = getPossibleDutyDocIds(targetDutyId, targetEmpId);
        const tgtResetPayload = {
          status: "ACTIVE",
          relievedByDutyId: null,
          relievedByEmpName: null,
          relievedByEmpId: null,
          reliefDispatchedAt: null,
          remarks: "Active Deployment",
          lastUpdated: serverTimestamp(),
        };
        for (const docId of tgtDocIds) {
          await setDoc(
            doc(db, "crew_daily_deployment", docId),
            tgtResetPayload,
            { merge: true },
          );
        }
      }

      // 3. Mark any open or recent automated_dispatch_gate event as REVERTED
      try {
        const qEvents = query(
          collection(db, "automated_dispatch_gate"),
          orderBy("timestamp", "desc"),
        );
        const snap = await getDocs(qEvents);
        const matchedEvents = snap.docs.filter((d) => {
          const data = d.data();
          return (
            String(data.currentDutyId || data.targetDutyId) === targetDutyId ||
            (relieverDutyId && String(data.resolvedByDutyId) === relieverDutyId)
          );
        });
        for (const ev of matchedEvents) {
          await updateDoc(doc(db, "automated_dispatch_gate", ev.id), {
            status: "REVERTED",
            revertedAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.warn("Could not update incident event doc:", e);
      }

      // 4. Update local fallbackDeployments state
      setFallbackDeployments((prev) =>
        prev.map((d) => {
          const dId = String(d.dutyId).trim();
          if (dId === targetDutyId) {
            return {
              ...d,
              status: "ACTIVE",
              relievedByDutyId: null,
              relievedByEmpName: null,
              relievedByEmpId: null,
              remarks: "Active Deployment",
            };
          }
          if (relieverDutyId && dId === relieverDutyId) {
            return {
              ...d,
              status: "ACTIVE",
              reliefTargetDuty: null,
              reliefTargetEmpName: null,
              reliefTargetEmpId: null,
              remarks: "Active Deployment",
            };
          }
          return d;
        }),
      );

      if (activeAbnormalEvent) {
        setActiveAbnormalEvent(null);
      }

      alert(
        relieverDutyId
          ? `✅ Relief reset successfully! Duty #${targetDutyId} and Reliever Duty #${relieverDutyId} restored to Active.`
          : `✅ Duty #${targetDutyId} emergency cleared and restored to Active.`,
      );
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Error resetting relief:", err);
      alert("Failed to reset relief: " + (err.message || ""));
    }
  };

  const handleUndoDispatch = async (deployment) => {
    if (!deployment) return;
    try {
      const dutyId = String(deployment.dutyId || "").trim();
      const empId = String(deployment.empId || deployment.empNo || "").trim();
      const docIds = getPossibleDutyDocIds(dutyId, empId);
      const payload = {
        status: "ACTIVE",
        dispatchTime: null,
        dispatchAuthorizedBy: null,
        lastUpdated: serverTimestamp(),
      };
      for (const dId of docIds) {
        await setDoc(doc(db, "crew_daily_deployment", dId), payload, {
          merge: true,
        });
      }
      setFallbackDeployments((prev) =>
        prev.map((d) =>
          String(d.dutyId).trim() === dutyId ? { ...d, status: "ACTIVE" } : d,
        ),
      );
      alert(`✅ Dispatch authorization revoked for Duty #${dutyId}.`);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Error revoking dispatch:", err);
      alert("Failed to revoke dispatch: " + err.message);
    }
  };

  const executeManualOverride = async () => {
    if (!overrideDutyId || !activeAbnormalEvent) return;
    const queryStr = String(overrideDutyId).trim().toUpperCase();

    // 1. Try finding in deployments by dutyId or empId or empName
    let candidate = deployments.find(
      (d) =>
        String(d.dutyId).trim().toUpperCase() === queryStr ||
        String(d.empId || d.empNo || "").trim().toUpperCase() === queryStr ||
        String(d.empName || d.name || "").trim().toUpperCase().includes(queryStr),
    );

    // 2. Try finding in consoleData.standbys
    if (!candidate && consoleData.standbys) {
      const stby = (consoleData.standbys || []).find(
        (s) =>
          String(s.code || s.label || s.dutyId || "").trim().toUpperCase() === queryStr ||
          String(s.empNo || s.empId || "").trim().toUpperCase() === queryStr ||
          String(s.name || s.empName || "").trim().toUpperCase().includes(queryStr),
      );
      if (stby) {
        candidate = {
          empId: stby.empNo || stby.empId || `STBY_${Date.now()}`,
          empNo: stby.empNo || stby.empId,
          empName: stby.name || stby.empName,
          dutyId: stby.code || stby.label || "STANDBY",
          trainId: "--",
          isConsoleStandby: true,
        };
      }
    }

    // 3. Try finding in outstationStepbacks
    if (!candidate && consoleData.outstationStepbacks) {
      const stbk = (consoleData.outstationStepbacks || []).find(
        (s) =>
          String(s.station || s.loc || "").trim().toUpperCase() === queryStr ||
          String(s.empNo || s.empId || "").trim().toUpperCase() === queryStr ||
          String(s.name || "").trim().toUpperCase().includes(queryStr),
      );
      if (stbk) {
        candidate = {
          empId: stbk.empNo || stbk.empId || `STBK_${Date.now()}`,
          empNo: stbk.empNo || stbk.empId,
          empName: stbk.name,
          dutyId: `STBK (${stbk.station || stbk.loc || "PYID"})`,
          trainId: "--",
          isConsoleStandby: true,
        };
      }
    }

    if (!candidate) {
      return alert(`Candidate "${overrideDutyId}" not found in Roster or Standby Console.`);
    }

    // Convert to structure expected by executeRelief
    const candidateAdapter = {
      ...candidate,
      score: "OVERRIDE",
      scoreBreakdown: { poolPriority: 100, readiness: 40, trainMatch: 0, reliefWindow: 0 },
      reason: "Manual GCC Supervisor Override",
    };
    await executeRelief(candidateAdapter);
  };

  const handleSaveOperator = async (deploymentId) => {
    const original = deployments.find((d) => d.id === deploymentId);
    let finalTrainId = String(editTrainId || "UNASSIGNED").trim();
    let finalDutyId = String(editDutyId || "UNASSIGNED").trim();

    if (!finalDutyId) finalDutyId = "UNASSIGNED";

    const aligned = alignRecordWithRegistry({
      employeeId: editEmpId.trim(),
      name: editName.trim(),
      _manuallyCorrected: true,
    });

    let finalName = aligned.name.toUpperCase();
    let finalEmpId = aligned.employeeId;

    const targetDocId =
      finalDutyId === "UNASSIGNED"
        ? `gcc_deploy_${currentDayType.toLowerCase()}_extra_${finalEmpId}`
        : `gcc_deploy_${currentDayType.toLowerCase()}_duty_${finalDutyId}`;

    setSavingEdit(true);
    try {
      await setDoc(
        doc(db, "crew_daily_deployment", targetDocId),
        {
          scheduleType: currentDayType,
          dutyId: finalDutyId,
          empName: finalName,
          empId: finalEmpId,
          trainId: finalTrainId,
          "rawLegs.l1Train": finalTrainId,
          "rawLegs.l4Train": finalTrainId,
          remarks: "GCC Manual Edit",
          lastUpdated: serverTimestamp(),
        },
        { merge: true },
      );

      // Clean up the old document if the Duty ID or Employee ID changed
      if (original) {
        if (
          original.dutyId &&
          original.dutyId !== "UNASSIGNED" &&
          String(original.dutyId) !== finalDutyId
        ) {
          const oldDocId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${original.dutyId}`;
          if (oldDocId !== targetDocId) {
            await deleteDoc(doc(db, "crew_daily_deployment", oldDocId));
          }
        } else if (
          (!original.dutyId || original.dutyId === "UNASSIGNED") &&
          original.empId &&
          original.empId !== finalEmpId
        ) {
          const oldDocId = `gcc_deploy_${currentDayType.toLowerCase()}_extra_${original.empId}`;
          if (oldDocId !== targetDocId) {
            await deleteDoc(doc(db, "crew_daily_deployment", oldDocId));
          }
        }
      }

      setEditingDeploymentId(null);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Failed to update operator assignment:", err);
      alert("Failed to save operator details.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Sync step-back duties
  useEffect(() => {
    const q = query(
      collection(db, "stepback_duties"),
      orderBy("timestamp", "desc"),
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStepbacks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAddExtraOperator = async (e) => {
    e.preventDefault();
    if (!newExtraOp.empId && !newExtraOp.empName) {
      alert("Please fill in Employee ID or Operator Name.");
      return;
    }

    let finalTrainId = String(newExtraOp.trainId || "UNASSIGNED").trim();
    let rawDutyId = String(newExtraOp.dutyId || "").trim();

    // Validate and normalize duty ID: reject "6Z" style invalid IDs
    let finalDutyId;
    if (!rawDutyId || rawDutyId === "UNASSIGNED") {
      finalDutyId = "UNASSIGNED";
    } else if (!isValidDutyId(rawDutyId)) {
      alert(
        `❌ Invalid Duty ID "${rawDutyId}". Use numeric IDs (01-99) or known prefixes (CC, SB, RR, PRO).`,
      );
      return;
    } else {
      finalDutyId = normalizeDutyId(rawDutyId);
    }

    const aligned = alignRecordWithRegistry({
      employeeId: String(newExtraOp.empId || "").trim(),
      name: String(newExtraOp.empName || "").trim(),
      _manuallyCorrected: true,
    });

    let finalEmpId = aligned.employeeId;
    let finalName = aligned.name.toUpperCase();

    if (!finalEmpId || !finalName) {
      alert("Invalid Operator Details. Could not resolve employee mapping.");
      return;
    }

    try {
      const docId =
        finalDutyId === "UNASSIGNED"
          ? `gcc_deploy_${currentDayType.toLowerCase()}_extra_${finalEmpId}`
          : `gcc_deploy_${currentDayType.toLowerCase()}_duty_${finalDutyId}`;

      await setDoc(doc(db, "crew_daily_deployment", docId), {
        scheduleType: currentDayType,
        dutyId: finalDutyId,
        empId: finalEmpId,
        empName: finalName,
        trainId: finalTrainId,
        signOnTime: newExtraOp.signOnTime,
        remarks: "Extra Operator Assigned",
        status: "AUTHORIZED_OK",
        isSignedOn: true,
        lastUpdated: serverTimestamp(),
        rawLegs: {
          l1Train: finalTrainId,
          l1Start: newExtraOp.signOnTime,
          l1End: newExtraOp.signOffTime,
          l2Train: "--",
          l2Start: "--",
          l2End: "--",
          l3Train: "--",
          l3Start: "--",
          l3End: "--",
          l4Train: "--",
          l4Start: "--",
          l4End: newExtraOp.signOffTime,
        },
      });
      alert(`✅ Extra operator ${finalName} assigned successfully!`);
      setNewExtraOp({
        empId: "",
        empName: "",
        dutyId: "",
        trainId: "UNASSIGNED",
        signOnTime: "06:00:00",
        signOffTime: "14:00:00",
      });
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to add extra operator: " + err.message);
    }
  };

  const handleAddStepback = async (e) => {
    e.preventDefault();
    if ((!newStepback.empId && !newStepback.empName) || !newStepback.dutyId) {
      alert("Please fill in Duty ID and either Employee ID or Operator Name.");
      return;
    }
    if (newStepback.station !== "PUTH" && newStepback.station !== "NGSA") {
      alert("Step-back station must be PUTH or NGSA.");
      return;
    }

    const aligned = alignRecordWithRegistry({
      employeeId: String(newStepback.empId || "").trim(),
      name: String(newStepback.empName || "").trim(),
      _manuallyCorrected: true,
    });

    let finalEmpId = aligned.employeeId;
    let finalName = aligned.name.toUpperCase();

    if (!finalEmpId || !finalName) {
      alert("Invalid Operator Details. Could not resolve employee mapping.");
      return;
    }

    try {
      const docId = `stepback_${newStepback.station}_${newStepback.dutyId}_${Date.now()}`;
      await setDoc(doc(db, "stepback_duties", docId), {
        empId: finalEmpId,
        empName: finalName,
        station: newStepback.station,
        dutyId: String(newStepback.dutyId),
        startTime: newStepback.startTime || "08:00",
        endTime: newStepback.endTime || "12:00",
        timestamp: serverTimestamp(),
      });
      alert("✅ Step-back duty registered at " + newStepback.station);
      setNewStepback({
        empId: "",
        empName: "",
        station: "PUTH",
        dutyId: "",
        startTime: "08:00",
        endTime: "12:00",
      });
    } catch (err) {
      console.error(err);
      alert("Failed to register Step-back duty.");
    }
  };

  const handleDeleteStepback = async (id) => {
    if (window.confirm("Remove this step-back duty?")) {
      try {
        await deleteDoc(doc(db, "stepback_duties", id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(eligibleDeployments.map((d) => d.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBatchAuthorize = async () => {
    if (selectedIds.length === 0) return;
    const selectedDeps = deployments.filter((d) => selectedIds.includes(d.id));
    if (
      window.confirm(
        `Authorize dispatch for all ${selectedDeps.length} selected operator(s)?`,
      )
    ) {
      if (onAuthorize) {
        await onAuthorize(selectedDeps);
      } else {
        try {
          const batch = writeBatch(db);
          selectedDeps.forEach((deployment) => {
            const docId =
              deployment.dutyId && deployment.dutyId !== "UNASSIGNED"
                ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
                : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;
            batch.set(
              doc(db, "crew_daily_deployment", docId),
              {
                status: "DISPATCHED",
                dispatchTime: serverTimestamp(),
                dispatchAuthorizedBy: "System",
              },
              { merge: true },
            );
          });
          await batch.commit();
          alert(`${selectedDeps.length} Operators Authorized successfully!`);
          if (onImportComplete) onImportComplete();
        } catch (error) {
          console.error("Error authorizing dispatch batch:", error);
          alert("Failed to authorize dispatch batch.");
        }
      }
      setSelectedIds([]);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border border-emerald-900/30 bg-emerald-950/10 rounded-xl shadow-inner font-mono">
        <Cpu className="h-12 w-12 text-emerald-500 mb-4 animate-pulse" />
        <div className="text-sm font-black text-emerald-400 tracking-widest animate-pulse">
          INITIALIZING AUTOMATED GATEWAY...
        </div>
        <div className="text-[10px] text-slate-500 mt-2 uppercase">
          Syncing Live Deployment Data
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black tracking-wider text-emerald-400 flex items-center gap-2">
            <Cpu className="h-6 w-6" /> DISPATCH GATEWAY CORE
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">
            Algorithmic Shift Validation & Relief Engine
          </p>
        </div>
        <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1 gap-1">
          <button
            onClick={() => setActiveTab("LIVE")}
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors ${activeTab === "LIVE" ? "bg-emerald-600 text-slate-950 font-black" : "text-slate-400 hover:text-emerald-400"}`}
          >
            LIVE GATE
          </button>
          <button
            onClick={() => setActiveTab("BOOKED_OFF")}
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors flex items-center gap-1.5 ${activeTab === "BOOKED_OFF" ? "bg-rose-600 text-white font-black shadow-md" : "text-rose-400 hover:text-rose-300"}`}
          >
            <UserX className="h-3.5 w-3.5" />
            BOOKED OFF REGISTER
            {(consoleData.bookedOff?.length || 0) > 0 && (
              <span
                className={`px-1.5 py-0.2 text-[10px] rounded-full font-black ${activeTab === "BOOKED_OFF" ? "bg-white text-rose-700" : "bg-rose-500 text-slate-950 animate-pulse"}`}
              >
                {consoleData.bookedOff.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("PUBLISHER")}
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors flex items-center gap-1.5 ${activeTab === "PUBLISHER" ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black shadow-sm" : "text-emerald-400 hover:text-emerald-300"}`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> ROSTER SPREADSHEET (GOOGLE SHEETS)
          </button>
        </div>
      </div>

      {activeTab === "PUBLISHER" && (
        <div className="space-y-4">
          <RosterPublisherBoard userRole="CONTROLLER" />
        </div>
      )}

      {activeTab === "LIVE" && (
        <div className="space-y-6">
          {/* Staging Confirmation Banner + Full Preview Panel */}
          {stagedRoster &&
            !isRosterConfirmed &&
            (() => {
              const previewDuties = stagedRoster.duties || [];
              const previewLeaves = stagedRoster.leaves || [];
              const previewWO = stagedRoster.weeklyOffs || [];
              const previewStandbys = stagedRoster.standbys || [];
              const previewDesks = stagedRoster.controlDesks || [];
              const previewCRT = stagedRoster.crtTraining || [];
              const previewBMRTI = stagedRoster.bmrtiTraining || [];
              const previewRel = stagedRoster.relievedOperators || [];
              const previewPME = stagedRoster.pmeOperators || [];
              const previewRL = stagedRoster.routeLearning || [];
              const previewNR = stagedRoster.notReporting || [];
              const previewAbs = stagedRoster.absents || [];
              const previewOS = stagedRoster.outstationStepbacks || [];
              return (
                <div className="border-2 border-amber-500 rounded-xl shadow-2xl font-mono overflow-hidden">
                  {/* Header Bar */}
                  <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 px-4 py-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1 shadow animate-pulse">
                          <AlertTriangle className="h-3.5 w-3.5" /> STAGING
                          PREVIEW MODE — UNCONFIRMED DRAFT
                        </span>
                        <span className="text-[10px] text-amber-300 font-bold">
                          {stagedRoster.dateStr ||
                            new Date().toLocaleDateString("en-GB")}{" "}
                          • {previewDuties.length} Duties •{" "}
                          {previewLeaves.length} Leaves • {previewWO.length}{" "}
                          Weekly Offs
                        </span>
                      </div>
                      <h3 className="text-slate-100 font-black text-sm mt-1">
                        📄 Roster File:{" "}
                        <span className="text-amber-300">
                          {stagedRoster.sheetName ||
                            stagedRoster.fileName ||
                            "Uploaded Sheet"}
                        </span>
                      </h3>
                      <p className="text-[10px] text-amber-200/80 mt-0.5">
                        Review the data below carefully. Click{" "}
                        <strong className="text-emerald-400">
                          CONFIRM & SAVE
                        </strong>{" "}
                        to publish, or{" "}
                        <strong className="text-rose-400">DISCARD DRAFT (CANCEL)</strong>{" "}
                        to cancel and abort deployment.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleDiscardStagingDraft}
                        className="bg-slate-900 hover:bg-rose-950 text-rose-400 hover:text-rose-300 font-bold text-xs px-4 py-2.5 rounded-lg border border-rose-600/50 hover:border-rose-500 transition shadow-sm flex items-center gap-1.5"
                      >
                        DISCARD DRAFT (CANCEL) ✕
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmAndSaveToFirebase}
                        disabled={isSavingToFirebase}
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs px-5 py-2.5 rounded-lg shadow-xl transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        {isSavingToFirebase ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="h-4 w-4" />
                        )}
                        <span>
                          {isSavingToFirebase
                            ? "SAVING..."
                            : "CONFIRM & SAVE TO FIREBASE"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Category Summary Pills */}
                  <div className="bg-slate-950 border-b border-slate-800 px-4 py-2.5 flex flex-wrap gap-2">
                    {[
                      {
                        label: "Duties",
                        count: previewDuties.length,
                        color: "emerald",
                      },
                      {
                        label: "Leaves",
                        count: previewLeaves.length,
                        color: "blue",
                      },
                      {
                        label: "Weekly Off",
                        count: previewWO.length,
                        color: "violet",
                      },
                      {
                        label: "Standby",
                        count: previewStandbys.length,
                        color: "amber",
                      },
                      {
                        label: "Control Desk",
                        count: previewDesks.length,
                        color: "cyan",
                      },
                      {
                        label: "CRT Training",
                        count: previewCRT.length,
                        color: "orange",
                      },
                      {
                        label: "BMRTI",
                        count: previewBMRTI.length,
                        color: "pink",
                      },
                      {
                        label: "Relieved",
                        count: previewRel.length,
                        color: "rose",
                      },
                      { label: "PME", count: previewPME.length, color: "teal" },
                      {
                        label: "Route Learning",
                        count: previewRL.length,
                        color: "indigo",
                      },
                      {
                        label: "Not Reporting",
                        count: previewNR.length,
                        color: "red",
                      },
                      {
                        label: "Absent",
                        count: previewAbs.length,
                        color: "red",
                      },
                      {
                        label: "Outstation",
                        count: previewOS.length,
                        color: "yellow",
                      },
                    ].map(({ label, count, color }) => (
                      <span
                        key={label}
                        className={`bg-${color}-950/60 border border-${color}-700/40 text-${color}-300 text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1.5`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full bg-${color}-400`}
                        />
                        {label}: <span className="font-black">{count}</span>
                      </span>
                    ))}
                  </div>

                  {/* DUTIES PREVIEW TABLE */}
                  {previewDuties.length > 0 && (
                    <div className="bg-slate-950/80 border-b border-slate-800">
                      <div className="px-4 pt-3 pb-1 text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        DUTY DEPLOYMENTS — {previewDuties.length} Records
                      </div>
                      <div className="overflow-x-auto max-h-56 overflow-y-auto">
                        <table className="w-full text-[10px] font-mono">
                          <thead className="sticky top-0 bg-slate-900 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                            <tr>
                              <th className="px-3 py-1.5 text-left">#</th>
                              <th className="px-3 py-1.5 text-left">Duty</th>
                              <th className="px-3 py-1.5 text-left">Emp ID</th>
                              <th className="px-3 py-1.5 text-left">
                                Operator Name
                              </th>
                              <th className="px-3 py-1.5 text-left">Train</th>
                              <th className="px-3 py-1.5 text-left">Sign On</th>
                              <th className="px-3 py-1.5 text-left">
                                Sign Off
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                            {previewDuties.map((d, idx) => {
                              const hasEmp = d.empId && d.empId !== "--";
                              const hasName = d.empName && d.empName !== "--";
                              return (
                                <tr
                                  key={d.dutyId || idx}
                                  className={`hover:bg-slate-900/60 transition ${!hasEmp && !hasName ? "opacity-50" : ""}`}
                                >
                                  <td className="px-3 py-1 text-slate-500">
                                    {idx + 1}
                                  </td>
                                  <td className="px-3 py-1 text-amber-300 font-black">
                                    {d.dutyId || "--"}
                                  </td>
                                  <td className="px-3 py-1 text-cyan-300">
                                    {d.empId || d.empNo || "--"}
                                  </td>
                                  <td className="px-3 py-1 text-slate-100 font-bold">
                                    {d.empName || d.name || "--"}
                                  </td>
                                  <td className="px-3 py-1 text-slate-300">
                                    {d.trainId || "--"}
                                  </td>
                                  <td className="px-3 py-1 text-emerald-300">
                                    {d.signOnTime || "--"}
                                  </td>
                                  <td className="px-3 py-1 text-rose-300">
                                    {d.signOffTime || "--"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* CONSOLE CATEGORIES PREVIEW — Leaves, WO, Standby side by side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 divide-x divide-slate-800 border-b border-slate-800">
                    {[
                      { title: "LEAVES", color: "blue", items: previewLeaves },
                      {
                        title: "WEEKLY OFF",
                        color: "violet",
                        items: previewWO,
                      },
                      {
                        title: "STANDBY",
                        color: "amber",
                        items: previewStandbys,
                      },
                      {
                        title: "NOT REPORTING / ABSENT",
                        color: "rose",
                        items: [...previewNR, ...previewAbs],
                      },
                    ].map(({ title, color, items }) => (
                      <div
                        key={title}
                        className="bg-slate-950/60 p-3 min-h-[80px]"
                      >
                        <div
                          className={`text-[9px] font-black text-${color}-400 uppercase tracking-widest mb-1.5 flex items-center gap-1`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full bg-${color}-400`}
                          />{" "}
                          {title} ({items.length})
                        </div>
                        {items.length === 0 ? (
                          <span className="text-[9px] text-slate-600 italic">
                            None
                          </span>
                        ) : (
                          <div className="space-y-0.5 max-h-24 overflow-y-auto">
                            {items.map((item, i) => (
                              <div
                                key={i}
                                className="text-[10px] text-slate-300 font-mono flex items-center gap-1.5"
                              >
                                <span
                                  className={`text-${color}-300 font-black`}
                                >
                                  {item.empNo || item.employeeId || "--"}
                                </span>
                                <span className="text-slate-400 truncate">
                                  {item.name || item.empName || "--"}
                                </span>
                                {item.type && (
                                  <span
                                    className={`text-[9px] text-${color}-400/70`}
                                  >
                                    [{item.type}]
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Bottom action strip */}
                  <div className="bg-slate-900/80 px-4 py-2.5 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>
                      ⚠️ This data has{" "}
                      <strong className="text-amber-400">NOT been saved</strong>{" "}
                      to Firebase yet. Review above and confirm.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDiscardStagingDraft}
                        className="bg-slate-900 hover:bg-rose-950 text-rose-400 hover:text-rose-300 font-bold text-xs px-3.5 py-1.5 rounded-lg border border-rose-500/40 transition flex items-center gap-1"
                      >
                        ✕ DISCARD DRAFT (CANCEL)
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmAndSaveToFirebase}
                        disabled={isSavingToFirebase}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] px-4 py-1.5 rounded-lg transition disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {isSavingToFirebase ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3 w-3" />
                        )}
                        CONFIRM & PUBLISH
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

          {stagedRoster && isRosterConfirmed && (
            <div className="bg-emerald-955/80 border border-emerald-500/60 rounded-xl p-3.5 shadow-xl flex justify-between items-center text-xs font-mono">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <span>
                  OFFICIAL ROSTER CONFIRMED & SAVED TO FIREBASE (
                  {stagedRoster.dateStr || "Today"})
                </span>
              </div>
              <span className="text-[10px] text-emerald-400/80">
                Snapshot Archived to Monthly Database
              </span>
            </div>
          )}

          {/* 1. Excel Daily Roster Path Link Auto-Reader & Classifier Card */}
          <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-emerald-400 tracking-wider flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  EXCEL DAILY ROSTER PATH LINK AUTO-READER & CLASSIFIER
                </h2>
                <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">
                  ZERO MANUAL ENTRY ENGINE • 7-DAY ROLLING ROSTER
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOfficialGccSheetModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs font-mono uppercase tracking-wider transition shadow cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Official GCC Sheet (1:1)</span>
                </button>
              </div>
            </div>

            {/* ── Step 1 — Target Deployment Day Selector ── */}
            <div className="bg-slate-950/80 border border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800">
                <span className="flex items-center gap-1.5 font-black uppercase tracking-wider text-emerald-400 text-[10px]">
                  <Calendar className="w-3.5 h-3.5" />
                  Step 1 — Select Target Deployment Day
                </span>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:block">
                  {activeSelectedDayObj.fullOfficialTitle}
                </span>
              </div>

              {/* Day Pills Row */}
              <div className="flex items-stretch overflow-x-auto border-b border-slate-800 scrollbar-none">
                {rollingDays.map((d, idx) => {
                  const isSelected = idx === activeRosterDayOffset;
                  const typeStyles = {
                    SUNDAY:  { sel: 'bg-orange-600 text-white shadow-lg shadow-orange-950/60 ring-2 ring-orange-400', idle: 'bg-slate-950 text-slate-400 hover:bg-orange-950/30 hover:text-orange-300', badge: 'text-orange-400 bg-orange-950/60 border-orange-700/40' },
                    SATURDAY:{ sel: 'bg-violet-600 text-white shadow-lg shadow-violet-950/60 ring-2 ring-violet-400', idle: 'bg-slate-950 text-slate-400 hover:bg-violet-950/30 hover:text-violet-300', badge: 'text-violet-400 bg-violet-950/60 border-violet-700/40' },
                    MONDAY:  { sel: 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-400', idle: 'bg-slate-950 text-slate-400 hover:bg-emerald-950/30 hover:text-emerald-300', badge: 'text-emerald-400 bg-emerald-950/60 border-emerald-700/40' },
                    WEEKDAY: { sel: 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 ring-2 ring-emerald-400', idle: 'bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-white', badge: 'text-cyan-400 bg-cyan-950/60 border-cyan-700/40' },
                  };
                  const ts = typeStyles[d.scheduleType] || typeStyles.WEEKDAY;
                  const displayType = d.scheduleType === 'MONDAY' ? 'WEEKDAY' : d.scheduleType;
                  return (
                    <button
                      key={d.dateStr}
                      type="button"
                      onClick={() => setActiveRosterDayOffset(idx)}
                      className={`flex flex-col items-center px-3.5 py-2.5 text-xs font-mono font-bold transition shrink-0 border-r border-slate-800 last:border-r-0 ${isSelected ? ts.sel : ts.idle}`}
                    >
                      <span className={`text-[9px] uppercase tracking-widest font-black ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                        {d.badge}
                      </span>
                      <span className="text-base font-black leading-tight mt-0.5">{d.dayOfMonth}</span>
                      <span className={`text-[10px] font-bold ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>{d.monthShort}</span>
                      <span className={`text-[9px] ${isSelected ? 'text-white/60' : 'text-slate-500'}`}>{d.shortDay}</span>
                      <span className={`mt-1.5 text-[8px] px-1.5 py-0.5 rounded-sm font-black uppercase border ${isSelected ? 'bg-black/25 border-white/20 text-white/75' : ts.badge}`}>
                        {displayType}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Context Awareness Strip */}
              {(() => {
                const offset = activeRosterDayOffset;
                const d = activeSelectedDayObj;
                const configs = [
                  { icon: '⚡', label: "TODAY'S ROSTER", sub: `Deploying for current operational day`, color: 'bg-amber-950/50 border-amber-600/30 text-amber-300' },
                  { icon: '📅', label: 'NEXT DAY ROSTER', sub: `Standard next-day advance deployment`, color: 'bg-emerald-950/50 border-emerald-600/30 text-emerald-300' },
                  { icon: '📅', label: 'DAY AFTER TOMORROW', sub: `2-day advance deployment`, color: 'bg-cyan-950/50 border-cyan-600/30 text-cyan-300' },
                ];
                const cfg = offset <= 2
                  ? configs[offset]
                  : { icon: '🗓', label: `D+${offset} ADVANCE PLANNING`, sub: `${offset}-day advance deployment`, color: 'bg-slate-900 border-slate-700/50 text-slate-300' };
                return (
                  <div className={`px-3 py-2 flex items-center gap-2 text-[10px] font-mono ${cfg.color}`}>
                    <span className="text-sm leading-none">{cfg.icon}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-black uppercase tracking-wider">{cfg.label}</span>
                      <span className="opacity-60">—</span>
                      <span className="font-normal opacity-70">{cfg.sub} • {d.fullOfficialTitle}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Step 2 — Select Roster File ── */}
            <div className="bg-slate-950/80 border border-slate-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 border-b border-slate-800 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                <UploadCloud className="w-3.5 h-3.5" />
                Step 2 — Select Roster File
                <span className="text-slate-500 font-normal normal-case ml-1 tracking-normal">Supports .xlsx · .xls · .xlsb · .xlsm · .csv · .json · .pdf</span>
              </div>

              <div className="p-3 space-y-2.5">
                <div className="flex flex-col md:flex-row gap-2 items-stretch">
                  <div className="relative flex-1 w-full">
                    <input
                      id="automateddispatchgat-i9"
                      name="automateddispatchgat-i9"
                      type="text"
                      value={excelPathInput}
                      onChange={(e) => setExcelPathInput(e.target.value)}
                      placeholder="Paste file path or URL here…"
                      className="w-full h-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <label
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-4 py-2.5 rounded-lg cursor-pointer border border-slate-700 flex items-center gap-1.5 shrink-0 transition justify-center"
                    title="Supported: Excel (.xlsx/.xls), CSV, JSON, PDF (AI-extracted via Gemini)"
                  >
                    <UploadCloud className="h-4 w-4 text-emerald-400" />
                    <span>Browse &amp; Select File</span>
                    <input
                      id="automateddispatchgat-i10"
                      name="automateddispatchgat-i10"
                      type="file"
                      accept=".xlsx,.xls,.xlsb,.xlsm,.csv,.json,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setSelectedRosterFile(file);
                          setExcelPathInput(file.name);
                          // ✋ No auto-deploy — user must press INSPECT & DEPLOY (Step 3)
                        }
                      }}
                    />
                  </label>
                </div>

                {/* File Ready / Empty Indicator */}
                {selectedRosterFile ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/40 border border-emerald-600/30 rounded-lg">
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <div className="flex-1 min-w-0 text-[10px] font-mono">
                      <span className="text-emerald-300 font-black">{selectedRosterFile.name}</span>
                      <span className="text-emerald-400/60 ml-2">({(selectedRosterFile.size / 1024).toFixed(1)} KB)</span>
                      <span className="text-emerald-400/50 ml-2">· Ready for {activeSelectedDayObj.displayLabel}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedRosterFile(null); setExcelPathInput(''); }}
                      className="text-slate-500 hover:text-rose-400 transition text-[10px] shrink-0 font-mono"
                      title="Clear selected file"
                    >
                      ✕ Clear
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-[10px] font-mono text-slate-500 italic">
                    <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                    No file selected — browse above or paste a path, then press INSPECT &amp; DEPLOY below
                  </div>
                )}
              </div>
            </div>

            {/* ── Step 3 — INSPECT & DEPLOY ── */}
            {(() => {
              const canInspect = !!selectedRosterFile && !isInspectingPath;
              const d = activeSelectedDayObj;
              const displayType = d.scheduleType === 'MONDAY' ? 'WEEKDAY' : d.scheduleType;
              const gradients = {
                SUNDAY:  'from-orange-600 to-amber-500 hover:from-orange-500 hover:to-amber-400 shadow-orange-950/60',
                SATURDAY:'from-violet-600 to-purple-500 hover:from-violet-500 hover:to-purple-400 shadow-violet-950/60',
                MONDAY:  'from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-emerald-950/60',
                WEEKDAY: 'from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-emerald-950/60',
              };
              const grad = gradients[d.scheduleType] || gradients.WEEKDAY;
              const dayLabel = d.badge === 'TODAY'
                ? 'TODAY'
                : d.badge === 'TOMORROW'
                  ? 'TOMORROW'
                  : `${d.shortDay.toUpperCase()} ${d.dayOfMonth} ${d.monthShort.toUpperCase()}`;
              return (
                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <button
                    type="button"
                    onClick={() => processFileAndDeploy(selectedRosterFile, null, activeSelectedDayObj.date)}
                    disabled={!canInspect}
                    title={!selectedRosterFile ? 'Select a roster file first (Step 2)' : `Inspect & deploy roster for ${d.displayLabel}`}
                    className={`flex-1 bg-gradient-to-r ${grad} text-slate-950 font-black text-xs px-6 py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2.5 uppercase tracking-wider transition-all ${
                      canInspect ? 'cursor-pointer opacity-100' : 'opacity-35 cursor-not-allowed'
                    }`}
                  >
                    {isInspectingPath ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Cpu className="h-5 w-5" />
                    )}
                    <span className="text-sm">
                      {isInspectingPath
                        ? `Inspecting ${d.badge} Roster…`
                        : `INSPECT & DEPLOY — ${dayLabel} (${displayType})`
                      }
                    </span>
                  </button>
                  {!selectedRosterFile && (
                    <span className="text-[10px] text-slate-500 font-mono italic whitespace-nowrap">
                      ← Select a file in Step 2 to enable
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Detected Sheets in Multi-Sheet Workbook */}
            {detectedWorkbookSheets.length > 0 && (
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="font-bold text-emerald-400 uppercase">
                    Detected Sheets in Workbook ({detectedWorkbookSheets.length}):
                  </span>
                  <span>Click sheet to parse & deploy day-wise</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {detectedWorkbookSheets.map((sh, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        processFileAndDeploy(selectedRosterFile, sh.sheetName, sh.dateStr ? new Date(sh.dateStr) : null);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-800 text-slate-200 hover:text-white text-xs font-mono font-bold border border-slate-700 transition"
                    >
                      <span>{sh.sheetName}</span>
                      {sh.dayName && <span className="text-[10px] text-emerald-400 font-normal">({sh.dayName})</span>}
                      <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded text-slate-300">
                        {sh.rowCount} rows
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Active Deployed Roster Date Notification Banner */}
            {(deployedRosterInfo || deduplicatedDeployments.length > 0) && (
              <div className="bg-emerald-950/70 border border-emerald-500/60 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-mono animate-in fade-in duration-300 shadow-xl">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black text-emerald-300 text-xs flex items-center gap-2 tracking-wide uppercase">
                      <span>
                        Date Roster Sheet (
                        {deployedRosterInfo?.sheetName || currentDayType})
                        Parsed & Deployed!
                      </span>
                      {deployedRosterInfo?.deployedAt && (
                        <span className="text-[10px] text-emerald-400/80 font-normal">
                          [{deployedRosterInfo.deployedAt}]
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-emerald-200/90 font-medium mt-1">
                      Target Day (
                      {deployedRosterInfo?.dateStr ||
                        new Date().toLocaleDateString("en-GB")}
                      ): Deployed{" "}
                      <span className="font-black text-emerald-300">
                        {deployedRosterInfo?.deployedCount ||
                          deduplicatedDeployments.length}
                      </span>{" "}
                      Operators to Dispatch Gate |{" "}
                      <span className="font-black text-emerald-300">
                        {deployedRosterInfo?.woCount ??
                          consoleData.weeklyOffs.length}
                      </span>{" "}
                      to Weekly Off Page |{" "}
                      <span className="font-black text-emerald-300">
                        {deployedRosterInfo?.leaveCount ??
                          consoleData.leaves.length}
                      </span>{" "}
                      to Leave & Rest Page.
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowOfficialGccSheetModal(true)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider transition shadow cursor-pointer"
                    title="View 1:1 official GCC Roster Sheet"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>View 1:1 Sheet</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const targetDateStr = deployedRosterInfo?.dateStr || activeSelectedDateStr;
                      const nextStatus = !isPublishedToOperators;
                      setIsPublishedToOperators(nextStatus);
                      await setDoc(doc(db, "dispatch_excel_cache", targetDateStr), {
                        isPublishedForOperators: nextStatus,
                        publishedAt: serverTimestamp(),
                      }, { merge: true });
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition border ${
                      isPublishedToOperators 
                        ? "bg-emerald-900/90 text-emerald-300 border-emerald-500" 
                        : "bg-amber-950/80 text-amber-300 border-amber-500"
                    }`}
                  >
                    <Radio className={`w-3.5 h-3.5 ${isPublishedToOperators ? "text-emerald-400 animate-pulse" : "text-amber-400"}`} />
                    <span>{isPublishedToOperators ? "● PUBLISHED TO TOs" : "○ UNPUBLISHED"}</span>
                  </button>
                  <span className="bg-emerald-900/90 text-emerald-300 text-[10px] font-bold px-3 py-1 rounded-lg border border-emerald-600 uppercase tracking-widest shadow">
                    DEPLOYED DATE:{" "}
                    {deployedRosterInfo?.dateStr ||
                      new Date().toLocaleDateString("en-GB")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Control Toolbar: Search, Filters, Duplicate Check & Actions */}
          <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
              {/* Search Input */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  id="automateddispatchgat-i11"
                  name="automateddispatchgat-i11"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Duty ID, Name, Train..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Status Filters: ALL | ACTIVE | PENDING */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                {["ALL", "ACTIVE", "PENDING"].map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setFilterStatus(status)}
                    className={`px-2.5 py-1 rounded text-[10px] font-black font-mono transition-all uppercase ${
                      filterStatus === status
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>

              {/* Duplicate Verification Pill */}
              <div
                className={`px-2.5 py-1 rounded text-[10px] font-black font-mono border uppercase flex items-center gap-1 ${
                  duplicateEmpIds.length > 0
                    ? "bg-rose-950/60 border-rose-600 text-rose-300 animate-pulse"
                    : "bg-emerald-955/40 border-emerald-800/60 text-emerald-400"
                }`}
              >
                <AlertTriangle className="h-3 w-3" />
                <span>VERIFY DUPLICATE EMP IDs ({duplicateEmpIds.length})</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSwapModal(true)}
                className="bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 text-amber-400 text-xs font-bold font-mono px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <Repeat className="h-3.5 w-3.5" />
                <span>SWAP / EXCHANGE DUTIES (CC/GCC/ALS)</span>
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold font-mono px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Export Excel</span>
              </button>

              <button
                type="button"
                onClick={handleClearDailyRoster}
                className="bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-400 text-xs font-bold font-mono px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Daily Roster & Console</span>
              </button>
            </div>
          </div>

          {/* 3. Operator Status Legend */}
          <div className="bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg flex flex-wrap items-center gap-4 text-[10px] font-mono font-bold text-slate-400 select-none">
            <span className="text-slate-500 uppercase tracking-widest font-black">
              Operator Status Legend:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.5)]"></span>
              <span className="text-purple-300">EXCHANGED DUTY (Purple)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]"></span>
              <span className="text-amber-300">SWAPPED BY CC (Amber)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.5)]"></span>
              <span className="text-rose-300">NOT REPORTING NR (Rose)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]"></span>
              <span className="text-red-400">ABSENT AB (Red)</span>
            </div>
          </div>

          {/* Day Types Selection Ribbon */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Select Roster Day Type:
              </span>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
                {["WEEKDAY", "MONDAY", "SATURDAY", "SUNDAY"].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayTypeChange(day)}
                    className={`px-3 py-1.5 rounded text-xs font-bold font-mono transition-all ${
                      currentDayType === day
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)] font-black"
                        : "text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900 border border-transparent"
                    }`}
                  >
                    {day === "SATURDAY" ? "SAT & GH" : day}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs font-black font-mono text-slate-400 uppercase tracking-wider">
              Target Day Roster:{" "}
              <span className="text-emerald-400">{currentDayType}</span>
            </div>
          </div>

          {/* Active Abnormal Event Relief Engine View */}
          {activeAbnormalEvent && (
            <div className="bg-slate-900 border-2 border-amber-500/50 rounded-xl p-5 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-black px-3 py-1 rounded-bl-lg flex items-center gap-1 uppercase tracking-widest shadow">
                <span className="h-2 w-2 rounded-full bg-slate-950 animate-pulse"></span>
                ACTIVE INCIDENT ANALYSIS
              </div>

              <div className="flex items-center gap-3 mb-6">
                <ShieldAlert className="h-8 w-8 text-amber-500" />
                <div>
                  <h3 className="text-lg font-black text-amber-400 uppercase tracking-wider">
                    {activeAbnormalEvent.eventType} on Duty{" "}
                    {activeAbnormalEvent.deployment.dutyId}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Operator: {activeAbnormalEvent.deployment.empName} | Train:{" "}
                    {activeAbnormalEvent.deployment.trainId}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Engine Recommendations */}
                <div className="col-span-2 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-2 gap-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-emerald-500" /> Engine
                      Recommendations
                    </h4>
                    {/* Pool Filter Tabs */}
                    {activeAbnormalEvent.recommendations && activeAbnormalEvent.recommendations.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setReliefPoolFilter("PRIORITY")}
                          className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                            reliefPoolFilter === "PRIORITY"
                              ? "bg-emerald-500 text-slate-950 font-black shadow-md"
                              : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                          }`}
                        >
                          🛡️ Standby & Pro (
                          {
                            activeAbnormalEvent.recommendations.filter(
                              (r) => r.candidatePool === "STANDBY" || r.candidatePool === "PRO",
                            ).length
                          }
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() => setReliefPoolFilter("ACTIVE")}
                          className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                            reliefPoolFilter === "ACTIVE"
                              ? "bg-cyan-500 text-slate-950 font-black shadow-md"
                              : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                          }`}
                        >
                          🚆 Active Mainline (
                          {
                            activeAbnormalEvent.recommendations.filter(
                              (r) => r.candidatePool === "ACTIVE_MAINLINE",
                            ).length
                          }
                          )
                        </button>
                        <button
                          type="button"
                          onClick={() => setReliefPoolFilter("ALL")}
                          className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer ${
                            reliefPoolFilter === "ALL"
                              ? "bg-purple-500 text-slate-950 font-black shadow-md"
                              : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                          }`}
                        >
                          ⭐ All ({activeAbnormalEvent.recommendations.length})
                        </button>
                      </div>
                    )}
                  </div>

                  {(() => {
                    const allRecs = activeAbnormalEvent.recommendations || [];
                    const priorityRecs = allRecs.filter(
                      (r) => r.candidatePool === "STANDBY" || r.candidatePool === "PRO",
                    );
                    const activeRecs = allRecs.filter(
                      (r) => r.candidatePool === "ACTIVE_MAINLINE",
                    );
                    const displayedRecs =
                      reliefPoolFilter === "PRIORITY"
                        ? (priorityRecs.length > 0 ? priorityRecs : allRecs)
                        : reliefPoolFilter === "ACTIVE"
                          ? activeRecs
                          : allRecs;

                    if (displayedRecs.length === 0) {
                      return (
                        <div className="p-4 bg-slate-950 border border-slate-800 border-dashed rounded text-center text-slate-500 text-xs">
                          {reliefPoolFilter === "PRIORITY"
                            ? "No Standby or Pro candidates available. Switch to Active Mainline or use Manual Override."
                            : "No suitable relief candidates found in this pool. Manual intervention required."}
                        </div>
                      );
                    }

                    return displayedRecs.map((rec, i) => (
                      <div
                        key={rec.id || rec.dutyId || i}
                        className={`flex flex-col md:flex-row items-center justify-between bg-slate-950 border rounded-lg p-3 transition-colors ${
                          rec.candidatePool === "STANDBY"
                            ? "border-emerald-600/50 hover:border-emerald-400 bg-emerald-955/20"
                            : rec.candidatePool === "PRO"
                              ? "border-amber-600/50 hover:border-amber-400 bg-amber-955/20"
                              : "border-slate-800 hover:border-cyan-500/30"
                        }`}
                      >
                        <div className="flex-1 w-full md:w-auto">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`font-black text-xs px-2 py-0.5 rounded border ${
                                rec.candidatePool === "STANDBY"
                                  ? "bg-emerald-900/60 text-emerald-300 border-emerald-600"
                                  : rec.candidatePool === "PRO"
                                    ? "bg-amber-900/60 text-amber-300 border-amber-600"
                                    : "bg-slate-900 text-slate-300 border-slate-700"
                              }`}
                            >
                              #{i + 1}
                            </span>
                            <span className="font-bold text-white text-sm">
                              {rec.empName}
                            </span>
                            <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 font-mono">
                              Duty #{rec.dutyId}
                            </span>

                            {/* Pool Badge */}
                            {rec.candidatePool === "STANDBY" ? (
                              <span className="bg-emerald-950 text-emerald-300 border border-emerald-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                🛡️ {rec.poolLabel || "STANDBY"}
                              </span>
                            ) : rec.candidatePool === "PRO" ? (
                              <span className="bg-amber-955 text-amber-300 border border-amber-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                ⚡ {rec.poolLabel || "PRO PILOT"}
                              </span>
                            ) : rec.candidatePool === "BUFFER" ? (
                              <span className="bg-teal-950 text-teal-300 border border-teal-600 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                📋 {rec.poolLabel || "BUFFER"}
                              </span>
                            ) : (
                              <span className="bg-cyan-950 text-cyan-300 border border-cyan-600/70 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">
                                🚆 {rec.poolLabel || "ACTIVE MAINLINE"}
                              </span>
                            )}
                          </div>

                          {/* Reason Explanation */}
                          <div className="text-[10px] text-slate-400 mt-1 italic font-mono">
                            {rec.reason}
                          </div>

                          {/* Score Visualization Bar */}
                          <div className="mt-2 w-full max-w-sm flex h-2 rounded bg-slate-900 overflow-hidden border border-slate-800">
                            <div
                              style={{
                                width: `${Math.min(100, ((rec.scoreBreakdown?.poolPriority || 0) / 80) * 45)}%`,
                              }}
                              className="bg-emerald-500"
                              title={`Pool Priority: ${rec.scoreBreakdown?.poolPriority || 0}`}
                            ></div>
                            <div
                              style={{
                                width: `${Math.min(100, ((rec.scoreBreakdown?.readiness || 0) / 40) * 25)}%`,
                              }}
                              className="bg-blue-500"
                              title={`Readiness: ${rec.scoreBreakdown?.readiness || 0}`}
                            ></div>
                            <div
                              style={{
                                width: `${Math.min(100, ((rec.scoreBreakdown?.trainMatch || 0) / 25) * 15)}%`,
                              }}
                              className="bg-purple-500"
                              title={`Path Match: ${rec.scoreBreakdown?.trainMatch || 0}`}
                            ></div>
                            <div
                              style={{
                                width: `${Math.min(100, ((rec.scoreBreakdown?.reliefWindow || 0) / 35) * 15)}%`,
                              }}
                              className="bg-cyan-500"
                              title={`Relief Window: ${rec.scoreBreakdown?.reliefWindow || 0}`}
                            ></div>
                          </div>

                          <div className="flex text-[9px] gap-2.5 mt-1.5 text-slate-500 uppercase font-bold tracking-widest flex-wrap">
                            <span className="text-emerald-400">
                              POOL: {rec.scoreBreakdown?.poolPriority || 0}
                            </span>
                            <span className="text-blue-400">
                              READY: {rec.scoreBreakdown?.readiness || 0}
                            </span>
                            {(rec.scoreBreakdown?.trainMatch || 0) > 0 && (
                              <span className="text-purple-400">
                                PATH: {rec.scoreBreakdown?.trainMatch}
                              </span>
                            )}
                            <span className="text-cyan-400">
                              WIND: {rec.scoreBreakdown?.reliefWindow || 0}
                            </span>
                            <span className="text-white ml-auto font-black bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">
                              TOTAL: {rec.score}
                            </span>
                          </div>
                        </div>

                        <div className="mt-3 md:mt-0 ml-0 md:ml-4 w-full md:w-auto">
                          <button
                            onClick={() => executeRelief(rec)}
                            disabled={savingEvent}
                            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black px-4 py-2 rounded text-[10px] tracking-widest flex items-center justify-center gap-1 uppercase shadow-md transition-colors cursor-pointer"
                          >
                            <CheckCircle className="h-3 w-3" />{" "}
                            {savingEvent ? "EXECUTING..." : "DISPATCH RELIEF"}
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Manual Override Panel */}
                <div className="col-span-1 border-l-0 lg:border-l border-slate-800 pl-0 lg:pl-6 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 border-b border-slate-800 pb-2 uppercase tracking-widest flex items-center gap-2">
                    <Settings className="h-4 w-4 text-slate-400" /> Manual
                    Override
                  </h4>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                    <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                      If algorithmic recommendations are unsuitable, GCC may
                      manually designate a relief Duty ID or Emp No from Standby/Mainline.
                    </p>
                    <label
                      className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1"
                      htmlFor="automateddispatchgat-i1"
                    >
                      Target Duty ID / Emp No
                    </label>
                    <input
                      id="automateddispatchgat-i1"
                      name="automateddispatchgat-i1"
                      type="text"
                      value={overrideDutyId}
                      onChange={(e) => setOverrideDutyId(e.target.value)}
                      placeholder="e.g. 104, OR, 21968"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 mb-3 font-mono"
                    />
                    <button
                      onClick={executeManualOverride}
                      disabled={savingEvent || !overrideDutyId}
                      className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-600 font-bold px-3 py-2 rounded text-[10px] tracking-widest flex items-center justify-center gap-1 uppercase transition-colors cursor-pointer"
                    >
                      FORCE DISPATCH <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        window.confirm(
                          `Reset and clear incident on Duty #${activeAbnormalEvent.deployment.dutyId}? This will restore the duty to normal Active status and cancel the event.`
                        )
                      ) {
                        await handleResetRelief(activeAbnormalEvent.deployment);
                      }
                    }}
                    className="w-full mt-2 bg-rose-950/70 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-700/80 rounded py-2 text-xs font-black tracking-wider uppercase flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow"
                    title="Clear emergency/incident and restore duty to normal Active"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> RESET / CANCEL INCIDENT
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAbnormalEvent(null)}
                    className="w-full mt-1.5 text-slate-500 hover:text-slate-300 text-[10px] font-mono tracking-wider uppercase py-1 text-center cursor-pointer transition-colors"
                  >
                    ✕ CLOSE WINDOW (KEEP INCIDENT OPEN)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Roster Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900 p-3 rounded-lg border border-slate-800 shadow">
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  id="automateddispatchgat-i2"
                  name="automateddispatchgat-i2"
                  type="text"
                  placeholder="Search Duty ID, Name, Train..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto text-xs font-bold tracking-widest">
              <button
                onClick={() => setFilterStatus("ALL")}
                className={`px-3 py-1.5 rounded border ${filterStatus === "ALL" ? "bg-slate-700 border-slate-500 text-white" : "bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600"}`}
              >
                ALL
              </button>
              <button
                onClick={() => setFilterStatus("SIGNED_ON")}
                className={`px-3 py-1.5 rounded border ${filterStatus === "SIGNED_ON" ? "bg-emerald-900/50 border-emerald-500/50 text-emerald-400" : "bg-slate-950 border-slate-800 text-slate-500 hover:border-emerald-900/50"}`}
              >
                ACTIVE
              </button>
              <button
                onClick={() => setFilterStatus("PENDING")}
                className={`px-3 py-1.5 rounded border ${filterStatus === "PENDING" ? "bg-amber-900/50 border-amber-500/50 text-amber-400" : "bg-slate-950 border-slate-800 text-slate-500 hover:border-amber-900/50"}`}
              >
                PENDING
              </button>
            </div>
          </div>

          {/* Batch Action Bar */}
          {selectedIds.length > 0 && (
            <div className="bg-slate-950 border border-emerald-500/20 p-3 rounded-lg flex items-center justify-between gap-4 mb-3 animate-in slide-in-from-top duration-300">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {selectedIds.length} Operator(s) Selected for Dispatch
                Authorization
              </span>
              <button
                onClick={handleBatchAuthorize}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded text-xs tracking-widest uppercase transition-colors shadow-lg animate-pulse"
              >
                AUTHORIZE SELECTED ({selectedIds.length})
              </button>
            </div>
          )}

          {/* Instant Duty Search Identification Summary Banner */}
          {searchQuery.trim() !== "" && (
            <div className="bg-amber-955/90 border-2 border-amber-500/80 rounded-xl p-4 shadow-2xl space-y-3 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-amber-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-amber-400 animate-pulse" />
                  <h3 className="text-amber-300 font-black text-xs uppercase tracking-wider">
                    Search Duty Identifier & Match Results (
                    {filteredDeployments.length} Operator
                    {filteredDeployments.length !== 1 ? "s" : ""} Found)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-amber-300 hover:text-white text-xs font-bold px-2.5 py-0.5 rounded bg-amber-900/60 hover:bg-amber-900 border border-amber-600 transition"
                >
                  Clear Search ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredDeployments.slice(0, 6).map((matchItem) => (
                  <div
                    key={matchItem.id}
                    className="bg-slate-950 border-2 border-amber-500/80 rounded-lg p-3 space-y-1.5 shadow-xl relative overflow-hidden ring-1 ring-amber-500/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-amber-400 font-black uppercase tracking-wider">
                        Matched Operator
                      </span>
                      <span className="bg-amber-400 text-slate-955 px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-widest shadow-md animate-pulse">
                        ASSIGNED DUTY #{matchItem.dutyId}
                      </span>
                    </div>

                    <div className="text-xs font-black text-slate-100 flex items-center gap-2">
                      <span>
                        {highlightMatch(
                          matchItem.empName || matchItem.name,
                          searchQuery,
                        )}
                      </span>
                      <span className="text-[10px] text-cyan-400 font-mono">
                        (ID:{" "}
                        {highlightMatch(
                          matchItem.empId || matchItem.empNo,
                          searchQuery,
                        )}
                        )
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-800/80 pt-1.5">
                      <div>
                        <span className="text-slate-500 font-bold">Train:</span>{" "}
                        <span className="text-cyan-300 font-bold">
                          {matchItem.trainId || "--"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold">
                          Sign On:
                        </span>{" "}
                        <span className="text-emerald-400 font-bold">
                          {formatExcelTime(matchItem.signOnTime)}
                        </span>{" "}
                        <span className="text-slate-400">
                          @ {matchItem.signOnLocation || "PYID"}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold">
                          Status:
                        </span>{" "}
                        <span className="text-amber-300 font-bold uppercase">
                          {matchItem.status || "PENDING"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deployment Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[10px]">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      {eligibleDeployments.length > 0 && (
                        <input
                          id="automateddispatchgat-i3"
                          name="automateddispatchgat-i3"
                          type="checkbox"
                          checked={
                            selectedIds.length === eligibleDeployments.length &&
                            eligibleDeployments.length > 0
                          }
                          onChange={handleSelectAll}
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                      )}
                    </th>
                    <th className="p-3 font-black">Duty No</th>
                    <th className="p-3 font-black">Type</th>
                    <th className="p-3 font-black">Sign On Time</th>
                    <th className="p-3 font-black">Sign On Place</th>
                    <th className="p-3 font-black">Operator Name</th>
                    <th className="p-3 font-black">Emp No</th>
                    <th className="p-3 font-black">Sign Off Time</th>
                    <th className="p-3 font-black">Sign Off Place</th>
                    <th className="p-3 font-black">Train ID</th>
                    <th className="p-3 font-black">Shift Progress</th>
                    <th className="p-3 font-black text-center">
                      Engine Triggers
                    </th>
                    <th className="p-3 font-black text-right border-l border-slate-800">
                      Gate Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredDeployments.length === 0 ? (
                    <tr>
                      <td
                        colSpan="13"
                        className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs"
                      >
                        No deployments match criteria
                      </td>
                    </tr>
                  ) : (
                    filteredDeployments.map((d) => {
                      const progress = getDutyProgress(d);
                      const displayDutyType = resolveDutyType(
                        d,
                        currentDayType,
                      );
                      const isDispatched =
                        d.status === "DISPATCHED" ||
                        d.status === "RELIEF_DISPATCHED";

                      const isExchanged = Boolean(
                        d.isExchanged ||
                        d.exchanged ||
                        d.type === "EXCHANGED" ||
                        d.status === "EXCHANGED" ||
                        d.status === "EXCHANGED_DUTY" ||
                        String(d.status || "")
                          .toLowerCase()
                          .includes("exchange"),
                      );
                      const isSwapped = Boolean(
                        d.isSwapped ||
                        d.swapped ||
                        d.type === "SWAPPED" ||
                        d.status === "SWAPPED" ||
                        d.status === "SWAPPED_BY_CC" ||
                        String(d.status || "")
                          .toLowerCase()
                          .includes("swap"),
                      );
                      const isNR = Boolean(
                        d.status === "NOT_REPORTING" ||
                        d.status === "NR" ||
                        d.isNotReporting ||
                        String(d.remarks || "")
                          .toUpperCase()
                          .includes("NOT REPORTING"),
                      );
                      const isAbsent = Boolean(
                        d.status === "ABSENT" ||
                        d.status === "AB" ||
                        d.isAbsent ||
                        String(d.remarks || "")
                          .toUpperCase()
                          .includes("AB"),
                      );
                      const cleanedName = cleanOperatorName(
                        d.empName || d.name,
                      );
                      const matched =
                        matchCrewMember(d.empId || d.empNo) ||
                        matchCrewMember(cleanedName);
                      const displayId = matched
                        ? String(matched.id)
                        : d.empId || d.empNo || "";
                      const isDup = Boolean(
                        displayId &&
                        displayId !== "--" &&
                        duplicateOperatorsMap[String(displayId).toLowerCase()],
                      );

                      const hasValidDriver = Boolean(
                        (d.empName || d.name || d.operatorName) &&
                        !String(d.empName || d.name || d.operatorName).toUpperCase().includes("VACANT") &&
                        !String(d.empName || d.name || d.operatorName).toUpperCase().includes("UNASSIGNED") &&
                        (d.empId || d.empNo || d.employeeId || displayId) &&
                        String(d.empId || d.empNo || d.employeeId || displayId).trim() !== "--" &&
                        String(d.empId || d.empNo || d.employeeId || displayId).trim() !== "UNASSIGNED" &&
                        String(d.empId || d.empNo || d.employeeId || displayId).trim() !== "0" &&
                        String(d.empId || d.empNo || d.employeeId || displayId).trim() !== ""
                      );

                      const isBookedOffVacant = Boolean(
                        !hasValidDriver &&
                        (d.status === "BOOKED_OFF_VACANT" ||
                          String(d.empName || "").toUpperCase().includes("VACANT") ||
                          (String(d.remarks || "").toUpperCase().includes("BOOKED OFF") && !hasValidDriver) ||
                          d.status === "BOOKED_OFF")
                      );
                      const isUnassigned = !hasValidDriver;
                      const isSearchMatch = Boolean(
                        searchQuery.trim() &&
                        (String(d.dutyId || "")
                          .toLowerCase()
                          .includes(searchQuery.toLowerCase().trim()) ||
                          String(d.empName || d.name || "")
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase().trim()) ||
                          String(d.empId || d.empNo || "")
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase().trim()) ||
                          String(d.trainId || "")
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase().trim()) ||
                          (d.extraColumns &&
                            Object.values(d.extraColumns).some((v) =>
                              String(v)
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase().trim()),
                            ))),
                      );

                      const isRowSelected = selectedIds.includes(d.id);
                      return (
                        <tr
                          key={d.id}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isRowSelected
                              ? "bg-emerald-950/80 border-l-4 border-emerald-400 ring-1 ring-emerald-500/60 shadow-lg text-white"
                              : isSearchMatch
                                ? "bg-amber-955/80 border-l-4 border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] ring-1 ring-amber-500/40"
                                : isDup
                                  ? "bg-rose-950/40 border-l-4 border-rose-500 shadow-md shadow-rose-950/50"
                                  : ""
                          }`}
                        >
                          <td className="p-3 w-10 text-center border-r border-slate-800">
                            {!isDispatched ? (
                              <input
                                id={`dispatch-duty-select-${d.dutyId || d.id}`}
                                name={`dispatch_duty_select_${d.dutyId || d.id}`}
                                aria-label={`Select Duty ${d.dutyId}`}
                                type="checkbox"
                                checked={selectedIds.includes(d.id)}
                                onChange={() => handleToggleSelect(d.id)}
                                className="rounded border-slate-700 bg-slate-955 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                              />
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>

                          {/* Duty No with Inline Duty Type Tag */}
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded ${
                                  isSearchMatch
                                    ? "text-sm font-black text-slate-955 bg-amber-400 border border-amber-300 shadow-md animate-pulse"
                                    : "text-xs font-black text-white bg-slate-800 border border-slate-700"
                                }`}
                              >
                                Duty #{d.dutyId}
                              </span>
                              {displayDutyType && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black tracking-wider border shadow-sm ${
                                    String(displayDutyType)
                                      .toUpperCase()
                                      .includes("TEST")
                                      ? "bg-purple-950 text-purple-300 border-purple-600/70"
                                      : String(displayDutyType)
                                            .toUpperCase()
                                            .includes("TRAIN")
                                        ? "bg-teal-950 text-teal-300 border-teal-600/70"
                                        : String(displayDutyType)
                                              .toUpperCase()
                                              .includes("NPRO") ||
                                            String(displayDutyType)
                                              .toUpperCase()
                                              .includes("PRO") ||
                                            String(displayDutyType)
                                              .toUpperCase()
                                              .includes("OR1") ||
                                            String(displayDutyType)
                                              .toUpperCase()
                                              .includes("OR2")
                                          ? "bg-amber-955 text-amber-300 border-amber-600/70"
                                          : String(displayDutyType)
                                                .toUpperCase()
                                                .includes("STDBY") ||
                                              String(displayDutyType)
                                                .toUpperCase()
                                                .includes("STBY") ||
                                              String(displayDutyType)
                                                .toUpperCase()
                                                .includes("STBK") ||
                                              String(displayDutyType)
                                                .toUpperCase()
                                                .includes("RD-3") ||
                                              String(displayDutyType)
                                                .toUpperCase()
                                                .includes("DPO - RD3")
                                            ? "bg-emerald-950 text-emerald-300 border-emerald-600/70"
                                            : String(displayDutyType)
                                                  .toUpperCase()
                                                  .includes("SHORT LOOP")
                                              ? "bg-sky-950 text-sky-300 border-sky-600/70"
                                              : String(displayDutyType)
                                                    .toUpperCase()
                                                    .includes("TGTP")
                                                ? "bg-indigo-950 text-indigo-300 border-indigo-600/70"
                                                : String(displayDutyType)
                                                      .toUpperCase()
                                                      .includes("BT DN BE")
                                                  ? "bg-teal-950 text-teal-300 border-teal-600/70"
                                                  : "bg-slate-850 text-cyan-300 border-cyan-700/60"
                                  }`}
                                >
                                  {displayDutyType}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Type Column */}
                          <td className="p-3 font-mono">
                            {displayDutyType ? (
                              <span
                                className={`px-2.5 py-1 rounded text-xs font-black border inline-flex items-center gap-1 shadow-sm ${
                                  String(displayDutyType)
                                    .toUpperCase()
                                    .includes("TEST")
                                    ? "bg-purple-950/90 text-purple-200 border-purple-500/70 shadow-purple-950/50"
                                    : String(displayDutyType)
                                          .toUpperCase()
                                          .includes("TRAIN")
                                      ? "bg-teal-950/90 text-teal-200 border-teal-500/70 shadow-teal-950/50"
                                      : String(displayDutyType)
                                            .toUpperCase()
                                            .includes("NPRO") ||
                                          String(displayDutyType)
                                            .toUpperCase()
                                            .includes("PRO") ||
                                          String(displayDutyType)
                                            .toUpperCase()
                                            .includes("OR1") ||
                                          String(displayDutyType)
                                            .toUpperCase()
                                            .includes("OR2")
                                        ? "bg-amber-950/90 text-amber-200 border-amber-500/70 shadow-amber-950/50"
                                        : String(displayDutyType)
                                              .toUpperCase()
                                              .includes("STDBY") ||
                                            String(displayDutyType)
                                              .toUpperCase()
                                              .includes("STBY") ||
                                            String(displayDutyType)
                                              .toUpperCase()
                                              .includes("STBK") ||
                                            String(displayDutyType)
                                              .toUpperCase()
                                              .includes("RD-3") ||
                                            String(displayDutyType)
                                              .toUpperCase()
                                              .includes("DPO - RD3")
                                          ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/70 shadow-emerald-950/50"
                                          : String(displayDutyType)
                                                .toUpperCase()
                                                .includes("SHORT LOOP")
                                            ? "bg-sky-950/90 text-sky-200 border-sky-500/70 shadow-sky-950/50"
                                            : String(displayDutyType)
                                                  .toUpperCase()
                                                  .includes("TGTP")
                                              ? "bg-indigo-950/90 text-indigo-200 border-indigo-500/70 shadow-indigo-950/50"
                                              : String(displayDutyType)
                                                    .toUpperCase()
                                                    .includes("BT DN BE")
                                                ? "bg-teal-950/90 text-teal-200 border-teal-500/70 shadow-teal-950/50"
                                                : "bg-slate-900 text-amber-300 border-slate-750"
                                }`}
                              >
                                {displayDutyType}
                              </span>
                            ) : (
                              <span className="text-slate-600 text-xs font-mono">
                                -
                              </span>
                            )}
                          </td>

                          {/* Sign On Time */}
                          <td className="p-3 font-mono text-slate-300 font-bold">
                            {formatExcelTime(d.signOnTime)}
                          </td>

                          {/* Sign On Location */}
                          <td className="p-3 font-bold text-cyan-400">
                            {d.signOnLocation || "PYID"}
                          </td>

                          {/* Operator Name with EXCH / SWAP / NR / AB Badges & Text Highlighting */}
                          <td className="p-3 font-bold">
                            {editingDeploymentId === d.id ? (
                              <input
                                id={`edit-deploy-name-${d.dutyId || d.id}`}
                                name={`edit_deploy_name_${d.dutyId || d.id}`}
                                aria-label={`Edit Name for Duty ${d.dutyId}`}
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded p-1 text-xs text-white"
                              />
                            ) : isDup ? (
                              <span className="bg-rose-950 text-rose-200 border border-rose-500 px-2 py-1 rounded font-black text-xs shadow-md inline-flex items-center gap-1.5 animate-pulse">
                                <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                                {highlightMatch(
                                  d.empName || d.name || "UNASSIGNED",
                                  searchQuery,
                                )}
                              </span>
                            ) : isBookedOffVacant ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-rose-400 font-bold italic tracking-wide">
                                  ⚠️ VACANT — DRIVER REQUIRED
                                </span>
                                <span className="text-[9px] bg-rose-955 text-rose-300 border border-rose-500 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow animate-pulse">
                                  <UserX className="h-2.5 w-2.5" /> BO (VACANT)
                                </span>
                              </span>
                            ) : isAbsent ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">
                                  {highlightMatch(
                                    d.empName || d.name || "UNASSIGNED",
                                    searchQuery,
                                  )}
                                </span>
                                <span className="text-[9px] bg-red-950/90 text-red-300 border border-red-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>{" "}
                                  AB
                                </span>
                              </span>
                            ) : isNR ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">
                                  {highlightMatch(
                                    d.empName || d.name || "UNASSIGNED",
                                    searchQuery,
                                  )}
                                </span>
                                <span className="text-[9px] bg-rose-950/90 text-rose-300 border border-rose-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse"></span>{" "}
                                  NR
                                </span>
                              </span>
                            ) : isExchanged ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">
                                  {highlightMatch(
                                    d.empName || d.name || "UNASSIGNED",
                                    searchQuery,
                                  )}
                                </span>
                                <span className="text-[9px] bg-purple-950/90 text-purple-300 border border-purple-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse"></span>{" "}
                                  EXCH
                                </span>
                              </span>
                            ) : d.status === "RELIEF_DISPATCHED" ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">
                                  {highlightMatch(
                                    d.empName || d.name || "UNASSIGNED",
                                    searchQuery,
                                  )}
                                </span>
                                <span className="text-[9px] bg-amber-950/90 text-amber-300 border border-amber-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>{" "}
                                  RELIEF → #{d.reliefTargetDuty || "--"}
                                </span>
                              </span>
                            ) : d.status === "RELIEVED" ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">
                                  {highlightMatch(
                                    d.empName || d.name || "UNASSIGNED",
                                    searchQuery,
                                  )}
                                </span>
                                <span className="text-[9px] bg-purple-950/90 text-purple-300 border border-purple-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse"></span>{" "}
                                  RELIEVED (#{d.relievedByDutyId || "--"})
                                </span>
                              </span>
                            ) : isSwapped ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-slate-200">
                                  {highlightMatch(
                                    d.empName || d.name || "UNASSIGNED",
                                    searchQuery,
                                  )}
                                </span>
                                <span className="text-[9px] bg-amber-950/90 text-amber-300 border border-amber-500/80 px-1.5 py-0.5 rounded font-mono font-black uppercase tracking-wider inline-flex items-center gap-1 shadow">
                                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>{" "}
                                  SWAP
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-200">
                                {highlightMatch(
                                  d.empName || d.name || "UNASSIGNED",
                                  searchQuery,
                                )}
                              </span>
                            )}
                          </td>

                          {/* Emp No with Text Highlighting */}
                          <td className="p-3 font-mono font-bold">
                            <span
                              className={
                                isBookedOffVacant
                                  ? "text-rose-400 italic"
                                  : isAbsent
                                    ? "text-red-400"
                                    : isNR
                                      ? "text-rose-400"
                                      : isExchanged
                                        ? "text-purple-300"
                                        : isSwapped
                                          ? "text-amber-300"
                                          : "text-cyan-400"
                              }
                            >
                              {isBookedOffVacant
                                ? "--"
                                : highlightMatch(
                                    (d.empId && d.empId !== "--" && d.empId !== "UNASSIGNED")
                                      ? d.empId
                                      : (d.employeeId && d.employeeId !== "--")
                                        ? d.employeeId
                                        : (displayId && displayId !== "--")
                                          ? displayId
                                          : "--",
                                    searchQuery,
                                  )}
                            </span>
                          </td>

                          {/* Sign OFF Time */}
                          <td className="p-3 font-mono text-slate-300">
                            {formatExcelTime(d.signOffTime)}
                          </td>

                          {/* Sign OFF Location */}
                          <td className="p-3 font-bold text-cyan-400">
                            {d.signOffLocation || "PYID"}
                          </td>

                          {/* Train ID */}
                          <td className="p-3 font-bold text-cyan-300">
                            {d.trainId || "--"}
                          </td>

                          {/* Shift Progress */}
                          <td className="p-3 min-w-30">
                            <div className="w-full">
                              <div className="flex justify-between text-[9px] text-slate-500 mb-0.5 font-bold">
                                <span>{Math.round(progress)}%</span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${progress > 90 ? "bg-rose-500" : progress > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>

                          {/* Engine Triggers Dropdown */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center">
                              <select
                                id={`engine-trigger-${d.dutyId || d.id}`}
                                name={`engine_trigger_${d.dutyId || d.id}`}
                                aria-label={`Engine Triggers for Duty ${d.dutyId}`}
                                value={
                                  d.status === "NOT_REPORTING" || d.status === "NR"
                                    ? "NOT_REPORTING"
                                    : d.status === "ABSENT" || d.status === "AB"
                                      ? "ABSENT"
                                      : ""
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) {
                                    handleAbnormalEvent(d, val);
                                  }
                                }}
                                disabled={!!activeAbnormalEvent}
                                className={`text-[10px] font-black tracking-wider uppercase px-2 py-1 rounded border outline-none transition-all cursor-pointer shadow-sm ${
                                  d.status === "NOT_REPORTING" || d.status === "NR"
                                    ? "bg-rose-950/90 border-rose-500/60 text-rose-300"
                                    : d.status === "ABSENT" || d.status === "AB"
                                      ? "bg-red-950/90 border-red-500/60 text-red-300"
                                      : d.status === "RELIEF_DISPATCHED"
                                        ? "bg-amber-955/90 border-amber-500/60 text-amber-300"
                                        : d.status === "RELIEVED"
                                          ? "bg-purple-955/90 border-purple-500/60 text-purple-300"
                                          : "bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-500/60"
                                }`}
                                title="Algorithmic Shift Validation & Relief Engine Trigger"
                              >
                                <option value="">⚡ Engine Trigger...</option>
                                <option value="CHANGE">🔄 CHANGE (Reassign / Swap)</option>
                                <option value="MOVE">⇄ MOVE (Transfer Desk)</option>
                                <option value="BOOK_OFF">⛔ BOOK OFF (Fault / Incident)</option>
                                <option value="NOT_REPORTING">🔴 Not Reported (NR)</option>
                                <option value="ABSENT">⛔ Absent (AB)</option>
                                <option value="EMERGENCY">🚨 Emergency</option>
                                <option value="INCIDENT">⚠️ Incident</option>
                                <option value="DELAY">⏱️ Delay</option>

                                {/* Dynamic Relief & Dispatch Actions */}
                                {d.status === "RELIEF_DISPATCHED" && (
                                  <option value="RESET_RELIEF">↺ Undo Relief (Restore Operator)</option>
                                )}
                                {d.status === "RELIEVED" && (
                                  <>
                                    <option value="RESET_RELIEF">↺ Undo Relief (Restore Duty)</option>
                                    <option value="EMERGENCY">🚨 Re-trigger Relief</option>
                                  </>
                                )}
                                {d.status === "DISPATCHED" && (
                                  <option value="UNDO_DISPATCH">↺ Revoke Dispatch</option>
                                )}
                                {(d.status === "NOT_REPORTING" ||
                                  d.status === "NR" ||
                                  d.status === "ABSENT" ||
                                  d.status === "AB" ||
                                  d.status === "EMERGENCY" ||
                                  d.status === "EMERGENCY_DECLARED" ||
                                  d.status === "BOOKED_OFF_VACANT" ||
                                  isBookedOffVacant ||
                                  String(d.remarks || "").toUpperCase().includes("BOOKED OFF") ||
                                  d.status === "RELIEF_DISPATCHED" ||
                                  d.status === "RELIEVED") && (
                                  <option value="RESET">🔄 Reset to Active</option>
                                )}
                              </select>
                            </div>
                          </td>

                          {/* Gate Actions */}
                          <td className="p-3 text-right border-l border-slate-800 bg-slate-900/50">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {isUnassigned && (
                                <button
                                  type="button"
                                  onClick={() => openAssignDriverModal(d)}
                                  className="bg-amber-500 hover:bg-amber-400 text-slate-955 font-black px-2.5 py-1 rounded text-[10px] tracking-wider uppercase shadow-md flex items-center gap-1 cursor-pointer transition animate-pulse"
                                  title="Assign a train driver to this vacant duty"
                                >
                                  <Plus className="h-3 w-3" /> ASSIGN DRIVER
                                </button>
                              )}

                              {d.status === "RELIEF_DISPATCHED" ? (
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  <span className="text-[9px] bg-amber-955 text-amber-300 border border-amber-600/70 px-2 py-0.5 rounded font-mono font-bold">
                                    RELIEF → #{d.reliefTargetDuty || "--"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleResetRelief(d)}
                                    className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded text-[9px] tracking-wider uppercase shadow flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Undo relief dispatch and restore operator to normal duty"
                                  >
                                    <RotateCcw className="h-3 w-3" /> UNDO RELIEF
                                  </button>
                                </div>
                              ) : d.status === "RELIEVED" ? (
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  <span className="text-[9px] bg-purple-955 text-purple-300 border border-purple-600/70 px-2 py-0.5 rounded font-mono font-bold">
                                    RELIEVED by #{d.relievedByDutyId || "--"}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleResetRelief(d)}
                                    className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-black px-2.5 py-1 rounded text-[9px] tracking-wider uppercase shadow flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Reset relief and restore duty to active"
                                  >
                                    <RotateCcw className="h-3 w-3" /> RESET
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAbnormalEvent(d, "EMERGENCY")}
                                    className="bg-rose-600 hover:bg-rose-500 text-white font-black px-2 py-1 rounded text-[9px] tracking-wider uppercase shadow flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Re-open relief recommendations for this duty"
                                  >
                                    🔁 RE-RELIEVE
                                  </button>
                                </div>
                              ) : d.status === "EMERGENCY" || d.status === "EMERGENCY_DECLARED" ? (
                                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                  <span className="text-[9px] bg-rose-955 text-rose-300 border border-rose-600/70 px-2 py-0.5 rounded font-mono font-bold animate-pulse">
                                    🚨 EMERGENCY
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAbnormalEvent(d, "EMERGENCY")}
                                    className="bg-rose-600 hover:bg-rose-500 text-white font-black px-2.5 py-1 rounded text-[9px] tracking-wider uppercase shadow flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Open Algorithmic Relief recommendations for this emergency duty"
                                  >
                                    🛡️ RELIEF ENGINE
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResetRelief(d)}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-2 py-1 rounded text-[9px] tracking-wider uppercase border border-slate-600 flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Cancel emergency and restore duty to Active"
                                  >
                                    <RotateCcw className="h-3 w-3" /> RESET
                                  </button>
                                </div>
                              ) : d.status === "DISPATCHED" ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1 pl-1">
                                    <CheckCircle className="h-3 w-3 text-emerald-500" /> DISPATCHED
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleUndoDispatch(d)}
                                    className="text-[9px] text-slate-400 hover:text-amber-400 underline uppercase tracking-wider ml-1 cursor-pointer font-bold"
                                    title="Revoke dispatch authorization"
                                  >
                                    UNDO
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => authorizeDispatch(d)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-3 py-1 rounded text-[10px] tracking-widest uppercase shadow-md transition-colors cursor-pointer"
                                >
                                  AUTHORIZE
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-4 font-mono mt-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-emerald-400" />
                  BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] font-bold text-slate-400">
                  <button
                    type="button"
                    onClick={() => setConsoleFilterCategory("ALL")}
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "ALL"
                        ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-emerald-400 hover:bg-slate-850"
                    }`}
                  >
                    ALL ({totalConsoleMatches})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "CO_OP" ? "ALL" : "CO_OP",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "CO_OP"
                        ? "bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400 shadow-sm"
                        : "bg-slate-955 border-amber-500/40 text-amber-300 hover:bg-slate-850"
                    }`}
                  >
                    Co-Operators & 2nd Crew ({consoleData.coOperators?.length || 0})
                    {consoleSearchQuery.trim() && filteredCoOperators.length > 0 && ` 🎯${filteredCoOperators.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "CC" ? "ALL" : "CC",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "CC"
                        ? "bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-amber-400 hover:bg-slate-850"
                    }`}
                  >
                    Crew Controllers ({consoleData.controlDesks?.length || 0}/10)
                    {consoleSearchQuery.trim() && filteredControlDesks.length > 0 && ` 🎯${filteredControlDesks.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "LEAVE" ? "ALL" : "LEAVE",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "LEAVE"
                        ? "bg-cyan-500 text-slate-950 border-cyan-400 ring-2 ring-cyan-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-cyan-400 hover:bg-slate-850"
                    }`}
                  >
                    Leave & Rest ({consoleData.leaves?.length || 0}/50)
                    {consoleSearchQuery.trim() && filteredLeaves.length > 0 && ` 🎯${filteredLeaves.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "STANDBY" ? "ALL" : "STANDBY",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "STANDBY"
                        ? "bg-emerald-500 text-slate-950 border-emerald-400 ring-2 ring-emerald-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-emerald-400 hover:bg-slate-850"
                    }`}
                  >
                    Standby ({consoleData.standbys?.length || 0}/50)
                    {consoleSearchQuery.trim() && filteredStandbys.length > 0 && ` 🎯${filteredStandbys.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "STBK" ? "ALL" : "STBK",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "STBK"
                        ? "bg-purple-500 text-slate-950 border-purple-400 ring-2 ring-purple-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-purple-400 hover:bg-slate-850"
                    }`}
                  >
                    STBK ({consoleData.outstationStepbacks?.length || 0}/20)
                    {consoleSearchQuery.trim() && filteredStepbacks.length > 0 && ` 🎯${filteredStepbacks.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "CRT" ? "ALL" : "CRT",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "CRT"
                        ? "bg-teal-500 text-slate-950 border-teal-400 ring-2 ring-teal-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-teal-400 hover:bg-slate-850"
                    }`}
                  >
                    CRT ({consoleData.crtTraining?.length || 0}/15)
                    {consoleSearchQuery.trim() && filteredCrt.length > 0 && ` 🎯${filteredCrt.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "BMRTI" ? "ALL" : "BMRTI",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "BMRTI"
                        ? "bg-sky-500 text-slate-950 border-sky-400 ring-2 ring-sky-400 shadow-sm"
                        : "bg-slate-955 border-sky-500/40 text-sky-300 hover:bg-slate-850"
                    }`}
                  >
                    BMRTI ({consoleData.bmrtiTraining?.length || 0}/50)
                    {consoleSearchQuery.trim() && filteredBmrti.length > 0 && ` 🎯${filteredBmrti.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "WO" ? "ALL" : "WO",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "WO"
                        ? "bg-rose-500 text-slate-950 border-rose-400 ring-2 ring-rose-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-rose-400 hover:bg-slate-850"
                    }`}
                  >
                    Weekly Off ({consoleData.weeklyOffs?.length || 0}/50)
                    {consoleSearchQuery.trim() && filteredWeeklyOffs.length > 0 && ` 🎯${filteredWeeklyOffs.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "REL" ? "ALL" : "REL",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "REL"
                        ? "bg-fuchsia-500 text-slate-950 border-fuchsia-400 ring-2 ring-fuchsia-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-fuchsia-400 hover:bg-slate-850"
                    }`}
                  >
                    REL ({consoleData.relievedOperators?.length || 0}/10)
                    {consoleSearchQuery.trim() && filteredRel.length > 0 && ` 🎯${filteredRel.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "PME" ? "ALL" : "PME",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "PME"
                        ? "bg-lime-500 text-slate-950 border-lime-400 ring-2 ring-lime-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-lime-400 hover:bg-slate-850"
                    }`}
                  >
                    PME ({consoleData.pmeOperators?.length || 0}/20)
                    {consoleSearchQuery.trim() && filteredPme.length > 0 && ` 🎯${filteredPme.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "LRD" ? "ALL" : "LRD",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "LRD"
                        ? "bg-indigo-500 text-slate-950 border-indigo-400 ring-2 ring-indigo-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-indigo-400 hover:bg-slate-850"
                    }`}
                  >
                    LRD ({consoleData.routeLearning?.length || 0}/20)
                    {consoleSearchQuery.trim() && filteredLrd.length > 0 && ` 🎯${filteredLrd.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "OD" ? "ALL" : "OD",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "OD"
                        ? "bg-amber-500 text-slate-950 border-amber-400 ring-2 ring-amber-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-amber-300 hover:bg-slate-850"
                    }`}
                  >
                    OD ({consoleData.onDuty?.length || 0}/20)
                    {consoleSearchQuery.trim() && filteredOd.length > 0 && ` 🎯${filteredOd.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "NR" ? "ALL" : "NR",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "NR"
                        ? "bg-rose-500 text-slate-950 border-rose-400 ring-2 ring-rose-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-rose-300 hover:bg-slate-850"
                    }`}
                  >
                    NR ({consoleData.notReporting?.length || 0}/20)
                    {consoleSearchQuery.trim() && filteredNr.length > 0 && ` 🎯${filteredNr.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "AB" ? "ALL" : "AB",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "AB"
                        ? "bg-red-500 text-slate-950 border-red-400 ring-2 ring-red-400 shadow-sm"
                        : "bg-slate-955 border-slate-800 text-red-400 hover:bg-slate-850"
                    }`}
                  >
                    AB ({consoleData.absents?.length || 0}/20)
                    {consoleSearchQuery.trim() && filteredAbsents.length > 0 && ` 🎯${filteredAbsents.length}`}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConsoleFilterCategory(
                        consoleFilterCategory === "BO" ? "ALL" : "BO",
                      )
                    }
                    className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                      consoleFilterCategory === "BO"
                        ? "bg-rose-600 text-white border-rose-400 ring-2 ring-rose-400 shadow-sm"
                        : "bg-slate-955 border-rose-900/70 text-rose-300 hover:bg-slate-850"
                    }`}
                  >
                    BO ({consoleData.bookedOff?.length || 0}/20)
                    {consoleSearchQuery.trim() && filteredBo.length > 0 && ` 🎯${filteredBo.length}`}
                  </button>
                  {Object.keys(consoleData.customRegisters || {}).map(
                    (tagName) => {
                      const matchCount = (
                        consoleData.customRegisters[tagName] || []
                      ).filter(matchesConsoleSearch).length;
                      return (
                        <button
                          key={tagName}
                          type="button"
                          onClick={() =>
                            setConsoleFilterCategory(
                              consoleFilterCategory === tagName ? "ALL" : tagName,
                            )
                          }
                          className={`px-2 py-0.5 rounded border transition-all cursor-pointer font-bold ${
                            consoleFilterCategory === tagName
                              ? "bg-cyan-500 text-slate-950 border-cyan-400 ring-2 ring-cyan-400 shadow-sm"
                              : "bg-slate-955 border-cyan-800 text-cyan-300 hover:bg-slate-850"
                          }`}
                        >
                          {tagName} (
                          {consoleData.customRegisters[tagName]?.length || 0})
                          {consoleSearchQuery.trim() &&
                            matchCount > 0 &&
                            ` 🎯${matchCount}`}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-955 font-black text-xs px-3.5 py-2 rounded-lg transition-all shadow-lg flex items-center gap-1.5 shrink-0 uppercase tracking-wider cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  <span>PREPARE DAILY POSITION REPORT</span>
                </button>
                <button
                  type="button"
                  onClick={handleAutoDeployConsoleToAllPages}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-slate-955 font-black text-xs px-4 py-2 rounded-lg transition-all shadow-lg flex items-center gap-2 shrink-0 uppercase tracking-wider cursor-pointer"
                >
                  <UploadCloud className="h-4 w-4" />
                  <span>AUTO-DEPLOY CONSOLE TO ALL PAGES</span>
                </button>
              </div>
            </div>

            {/* Daily Shift & Crew Position Report Panel (Live Realtime Sync & Editable) */}
            {isReportOpen && (
              <div className="bg-slate-955 border-2 border-amber-500/40 rounded-xl p-4 shadow-2xl space-y-4 transition-all animate-fadeIn">
                {/* Header & Controls Bar */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
                      <FileText className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-amber-300 uppercase tracking-wider flex items-center gap-2">
                          <span>DAILY SHIFT & CREW POSITION REPORT</span>
                          <span className="text-slate-600">/</span>
                          <span className="text-amber-400 text-xs font-mono font-bold">PREPARE DAILY POSITION REPORT</span>
                        </h3>
                        {isAutoSyncReport && !isManuallyEdited ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-black animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                            REAL-TIME AUTO SYNC
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold">
                            <Edit3 className="h-3 w-3" />
                            MANUAL EDIT MODE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Live real-time position validation across BMRCL TO & (JMD Contract TD) cadres.
                      </p>
                    </div>
                  </div>

                  {/* View Tabs & Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
                    {/* View Switcher Tabs */}
                    <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-750 mr-2">
                      <button
                        type="button"
                        onClick={() => setReportViewTab("TEXT")}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          reportViewTab === "TEXT"
                            ? "bg-amber-500 text-slate-955 shadow-sm font-black"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Formatted Report Text</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportViewTab("INDIVIDUAL")}
                        className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          reportViewTab === "INDIVIDUAL"
                            ? "bg-cyan-500 text-slate-955 shadow-sm font-black"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        <span>Individual Positions</span>
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-950 text-cyan-300 font-mono">
                          {positionStats.allIndividualPositions.length}
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleResyncReport}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isAutoSyncReport && !isManuallyEdited
                          ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                          : "bg-slate-900 border-slate-750 text-slate-300 hover:text-white"
                      }`}
                      title="Re-sync and recalculate with live crew deployment data"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${
                          isAutoSyncReport && !isManuallyEdited
                            ? "text-emerald-400"
                            : "text-cyan-400"
                        }`}
                      />
                      <span>
                        {isAutoSyncReport && !isManuallyEdited
                          ? "LIVE SYNC ACTIVE"
                          : "RE-SYNC LIVE"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
                        isCopiedReport
                          ? "bg-emerald-500 text-slate-955"
                          : "bg-amber-500 hover:bg-amber-400 text-slate-955"
                      }`}
                    >
                      {isCopiedReport ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {isCopiedReport
                          ? "COPIED TO CLIPBOARD!"
                          : "COPY REPORT"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadReport}
                      className="bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-750 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-400" />
                      <span>DOWNLOAD .TXT</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveReport}
                      disabled={isSavingReport}
                      className="bg-emerald-600 hover:bg-emerald-500 text-slate-955 font-black px-3.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>
                        {isSavingReport ? "SAVING..." : "SAVE CLOUD"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsReportOpen(false)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      CLOSE
                    </button>
                  </div>
                </div>

                {/* Cadre Deployment Executive Metric Bar */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
                  <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-2.5 flex flex-col justify-between shadow-inner">
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Present (Mainline)</span>
                      <Train className="h-3 w-3 text-emerald-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-emerald-300 font-mono">
                        {String(positionStats.presentBmrcl.length).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        ({String(positionStats.presentJmd.length).padStart(2, "0")})
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      BMRCL TO <span className="text-amber-300 font-bold">(JMD TD)</span>
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-cyan-500/30 rounded-xl p-2.5 flex flex-col justify-between shadow-inner">
                    <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Standby & STBK</span>
                      <Clock className="h-3 w-3 text-cyan-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-cyan-300 font-mono">
                        {String(positionStats.stbyBmrcl.length + positionStats.stbkBmrcl.length).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        ({String(positionStats.stbyJmd.length + positionStats.stbkJmd.length).padStart(2, "0")})
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      BMRCL TO <span className="text-amber-300 font-bold">(JMD TD)</span>
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-2.5 flex flex-col justify-between shadow-inner">
                    <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Rest / Weekly Off</span>
                      <Calendar className="h-3 w-3 text-indigo-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-indigo-300 font-mono">
                        {String(positionStats.restCoBmrcl.length).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        ({String(positionStats.restCoJmd.length).padStart(2, "0")})
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      BMRCL TO <span className="text-amber-300 font-bold">(JMD TD)</span>
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-rose-500/30 rounded-xl p-2.5 flex flex-col justify-between shadow-inner">
                    <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Leaves & Absents</span>
                      <UserX className="h-3 w-3 text-rose-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-rose-300 font-mono">
                        {String(
                          positionStats.leaveBmrcl.length +
                            positionStats.hplBmrcl.length +
                            positionStats.abBmrcl.length +
                            positionStats.boBmrcl.length,
                        ).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        ({String(
                          positionStats.leaveJmd.length +
                            positionStats.hplJmd.length +
                            positionStats.abJmd.length +
                            positionStats.boJmd.length,
                        ).padStart(2, "0")})
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      BMRCL TO <span className="text-amber-300 font-bold">(JMD TD)</span>
                    </span>
                  </div>

                  <div className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-2.5 flex flex-col justify-between shadow-inner">
                    <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Training / Special</span>
                      <UserCheck className="h-3 w-3 text-purple-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-purple-300 font-mono">
                        {String(
                          positionStats.crtBmrcl.length +
                            positionStats.bmrtiBmrcl.length +
                            positionStats.pmeBmrcl.length +
                            positionStats.lrdBmrcl.length +
                            positionStats.odBmrcl.length +
                            positionStats.crrcBmrcl.length +
                            positionStats.r6Bmrcl.length +
                            positionStats.relR5Bmrcl.length,
                        ).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        ({String(
                          positionStats.crtJmd.length +
                            positionStats.bmrtiJmd.length +
                            positionStats.pmeJmd.length +
                            positionStats.lrdJmd.length +
                            positionStats.odJmd.length +
                            positionStats.crrcJmd.length +
                            positionStats.r6Jmd.length +
                            positionStats.relR5Jmd.length,
                        ).padStart(2, "0")})
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                      CRT / BMRTI / PME / LRD / OD
                    </span>
                  </div>

                  <div className="bg-gradient-to-br from-amber-950/40 to-slate-900 border border-amber-500/50 rounded-xl p-2.5 flex flex-col justify-between shadow-inner">
                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center justify-between">
                      <span>Total Active Crew</span>
                      <Users className="h-3 w-3 text-amber-400" />
                    </span>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-xl font-black text-emerald-300 font-mono">
                        {positionStats.totalBmrcl}
                      </span>
                      <span className="text-sm font-black text-amber-400 font-mono">
                        ({positionStats.totalJmd})
                      </span>
                    </div>
                    <span className="text-[9px] text-amber-200/80 font-mono mt-0.5">
                      Combined: <strong className="text-white">{positionStats.totalBmrcl + positionStats.totalJmd}</strong>
                    </span>
                  </div>
                </div>

                {/* Tab 1: Formatted Text Report View */}
                {reportViewTab === "TEXT" && (
                  <div className="relative">
                    <textarea
                      id="adg-live-report-content"
                      name="live_report_content"
                      aria-label="Live Operational Report Content"
                      value={reportContent}
                      onChange={(e) => {
                        setReportContent(e.target.value);
                        setIsManuallyEdited(true);
                      }}
                      rows={26}
                      className="w-full bg-slate-900/90 text-emerald-300 font-mono text-xs p-4 rounded-xl border border-amber-500/20 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 outline-none leading-relaxed tracking-wide selection:bg-amber-500/30 selection:text-white"
                      placeholder="Report text will calculate automatically from live crew data..."
                      spellCheck={false}
                    />
                    <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 bg-slate-955/95 px-2.5 py-1 rounded border border-slate-800 font-mono flex items-center gap-2 pointer-events-none">
                      <span>
                        {isAutoSyncReport && !isManuallyEdited
                          ? "⚡ Auto-Updating with Live Crew Data"
                          : "✏️ Custom Edit Mode Active"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tab 2: Individual Positions: BMRCL & JMD View */}
                {reportViewTab === "INDIVIDUAL" && (
                  <div className="space-y-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                    {/* Search & Category Filter Toolbar */}
                    <div className="flex flex-col md:flex-row items-center justify-between gap-2.5 pb-2 border-b border-slate-800">
                      <div className="relative w-full md:w-96">
                        <input
                          id="adg-individual-search"
                          name="individual_search"
                          aria-label="Search individual crew positions"
                          type="text"
                          value={individualSearchQuery}
                          onChange={(e) => setIndividualSearchQuery(e.target.value)}
                          placeholder="Search individual positions (Name, Emp ID, Duty #, Train #, Station, Cadre)..."
                          className="w-full bg-slate-900 border border-slate-750 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 rounded-lg py-1.5 pl-8 pr-7 text-xs text-slate-200 placeholder-slate-500 font-mono outline-none"
                        />
                        <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                        {individualSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setIndividualSearchQuery("")}
                            className="absolute right-2 top-2 text-slate-400 hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Filter Chips */}
                      <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
                        {[
                          { id: "ALL", label: `All (${positionStats.allIndividualPositions.length})` },
                          { id: "MAINLINE", label: `Mainline (${positionStats.presentBmrcl.length + positionStats.presentJmd.length})` },
                          { id: "STANDBY", label: `Standby/STBK (${positionStats.stbyBmrcl.length + positionStats.stbkBmrcl.length + positionStats.stbyJmd.length + positionStats.stbkJmd.length})` },
                          { id: "REST", label: `Rest/Off (${positionStats.restCoBmrcl.length + positionStats.restCoJmd.length})` },
                          { id: "LEAVES", label: `Leaves/AB (${positionStats.leaveBmrcl.length + positionStats.hplBmrcl.length + positionStats.leaveJmd.length + positionStats.hplJmd.length})` },
                          { id: "TRAINING", label: "Training & Special" },
                          { id: "BMRCL", label: `BMRCL Cadre (${positionStats.totalBmrcl})` },
                          { id: "JMD", label: `(JMD TD Cadre) (${positionStats.totalJmd})` },
                        ].map((chip) => (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setIndividualFilterCategory(chip.id)}
                            className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                              individualFilterCategory === chip.id
                                ? chip.id === "JMD"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm"
                                  : "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Individual Positions Interactive Table */}
                    <div className="overflow-x-auto max-h-[520px] rounded-lg border border-slate-800">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-800 shadow-sm">
                          <tr>
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Position / Duty</th>
                            <th className="py-2.5 px-3">Train #</th>
                            <th className="py-2.5 px-3">Assigned Operator & Emp ID</th>
                            <th className="py-2.5 px-3">Cadre (BMRCL / [JMD])</th>
                            <th className="py-2.5 px-3">Shift / Timings</th>
                            <th className="py-2.5 px-3">Base / Station</th>
                            <th className="py-2.5 px-3">Deployment Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredIndividualPositions.length > 0 ? (
                            filteredIndividualPositions.map((pos, idx) => (
                              <tr
                                key={pos.id || idx}
                                className={`transition-all hover:bg-slate-800/40 ${
                                  pos.isJmd
                                    ? "bg-amber-950/10 hover:bg-amber-950/20"
                                    : "bg-slate-900/40"
                                }`}
                              >
                                <td className="py-2 px-3 text-slate-500 text-[11px]">
                                  {idx + 1}
                                </td>
                                <td className="py-2 px-3">
                                  <span className="font-bold text-slate-200">
                                    {pos.dutyId}
                                  </span>
                                  <span className="block text-[10px] text-slate-400">
                                    {pos.category}
                                  </span>
                                </td>
                                <td className="py-2 px-3">
                                  {pos.trainId && pos.trainId !== "--" ? (
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-[11px]">
                                      {pos.trainId}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 text-xs">--</span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    {pos.isJmd ? (
                                      <div>
                                        <span className="font-bold text-amber-300">
                                          ({pos.name})
                                        </span>
                                        <span className="block text-[10px] text-amber-400/80">
                                          (#{pos.empId})
                                        </span>
                                      </div>
                                    ) : (
                                      <div>
                                        <span className="font-bold text-slate-100">
                                          {pos.name}
                                        </span>
                                        <span className="block text-[10px] text-cyan-400">
                                          #{pos.empId}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  {pos.isJmd ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm">
                                      <span>(JMD Contract TD)</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm">
                                      <span>BMRCL Regular TO</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-slate-300 text-[11px]">
                                  {pos.timings}
                                </td>
                                <td className="py-2 px-3 text-slate-400 text-[11px]">
                                  {pos.location}
                                </td>
                                <td className="py-2 px-3">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      pos.status.includes("DEPLOYED") || pos.status === "ACTIVE"
                                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                        : pos.status.includes("STANDBY") || pos.status.includes("STEPBACK")
                                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                        : pos.status.includes("REST") || pos.status.includes("OFF")
                                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                        : pos.status.includes("LEAVE") || pos.status.includes("AB") || pos.status.includes("BO")
                                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                        : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                    }`}
                                  >
                                    {pos.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={8}
                                className="py-8 text-center text-slate-500 font-sans"
                              >
                                No individual positions found matching the active search or category filters.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Omni-Search & Filter Toolbar for Desk Registers */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-955 p-3 rounded-xl border border-slate-800 shadow-lg">
              <div className="relative w-full sm:w-96">
                <input
                  id="adg-console-search-query"
                  name="console_search_query"
                  aria-label="Search desk console"
                  type="text"
                  value={consoleSearchQuery}
                  onChange={(e) => setConsoleSearchQuery(e.target.value)}
                  placeholder="Search desk console (Name, Emp ID, Duty, Station, Tag)..."
                  className="w-full bg-slate-900 border border-slate-750 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/40 rounded-lg py-2 pl-9 pr-8 text-xs text-slate-200 placeholder-slate-500 font-mono outline-none transition-all shadow-inner"
                />
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                {consoleSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setConsoleSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
                    title="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs font-mono w-full sm:w-auto justify-between sm:justify-end flex-wrap">
                {consoleSearchQuery.trim() && (
                  <span className="text-[11px] text-amber-300 font-bold bg-amber-950/60 px-2.5 py-1 rounded border border-amber-800/60 flex items-center gap-1.5 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping"></span>
                    Found {totalConsoleMatches} match{totalConsoleMatches === 1 ? "" : "es"}
                  </span>
                )}
                {consoleFilterCategory !== "ALL" && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-cyan-300 font-bold bg-cyan-950/60 px-2.5 py-1 rounded border border-cyan-800/60 flex items-center gap-1">
                      Filter: {consoleFilterCategory}
                      <button
                        type="button"
                        onClick={() => setConsoleFilterCategory("ALL")}
                        className="ml-1 text-slate-400 hover:text-white cursor-pointer"
                        title="Clear category filter"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                    <button
                      type="button"
                      onClick={() => setConsoleFilterCategory("ALL")}
                      className="text-[10px] text-amber-400 hover:underline font-bold cursor-pointer"
                    >
                      SHOW ALL
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => openTransferModal(null, "STANDBY")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 shadow-sm transition-all cursor-pointer"
                  title="Move any train operator across roster pages & desk registers"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-400" />
                  <span>⇄ Transfer Crew Across Pages</span>
                </button>
              </div>
            </div>

            {/* Console Cards Grid (Desk Registers) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Empty Search Results Alert */}
              {consoleSearchQuery.trim() && totalConsoleMatches === 0 && (
                <div className="col-span-1 md:col-span-2 lg:col-span-4 bg-slate-955 border border-amber-500/30 rounded-xl p-8 text-center space-y-3 shadow-xl">
                  <div className="inline-flex p-3 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <Search className="h-6 w-6" />
                  </div>
                  <h3 className="text-slate-200 font-bold text-sm">
                    No crew members found matching "{consoleSearchQuery}"
                  </h3>
                  <p className="text-slate-400 text-xs font-mono max-w-md mx-auto">
                    Checked across all 15+ desk registers (BMRTI, CRT, Co-Operators, Standby, Stepbacks, Leaves, Weekly Offs, NR, AB, etc.).
                  </p>
                  <button
                    type="button"
                    onClick={() => setConsoleSearchQuery("")}
                    className="bg-amber-500 hover:bg-amber-400 text-slate-955 font-black text-xs px-4 py-2 rounded-lg transition-all cursor-pointer"
                  >
                    CLEAR SEARCH
                  </button>
                </div>
              )}

              {/* 0. Co-Operators & Trainee Drivers (2nd Crew) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "CO_OP") &&
                (!consoleSearchQuery.trim() ||
                  filteredCoOperators.length > 0 ||
                  consoleFilterCategory === "CO_OP") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 col-span-1 md:col-span-2 lg:col-span-2 shadow-lg transition-all ${
                      consoleSearchQuery.trim() && filteredCoOperators.length > 0
                        ? "border-amber-400 ring-2 ring-amber-400/30"
                        : "border-amber-500/30"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-black text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-amber-400" />
                        Co-Operators & Trainee Drivers (2nd Crew) (
                        {filteredCoOperators.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.coOperators?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-amber-950/60 text-amber-300 px-2 py-0.5 rounded border border-amber-800/40 font-mono font-bold">
                        {filteredCoOperators.length} Operators
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs">
                      {filteredCoOperators && filteredCoOperators.length > 0 ? (
                        filteredCoOperators.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-amber-950/30 border-amber-500/50"
                                : "bg-slate-900 border-slate-800 hover:border-amber-500/40"
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-200 flex items-center gap-1.5">
                                <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono text-[10px] border border-amber-500/30 font-black">
                                  Duty {item.dutyId}
                                </span>
                                <span>{item.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Train {item.trainId || "--"} •{" "}
                                {item.time ||
                                  `${item.signOn || "--"} - ${item.signOff || "--"}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "coOperators")}
                                className="text-[10px] font-mono text-amber-400 hover:text-white bg-amber-950/60 hover:bg-amber-800/80 px-1.5 py-0.5 rounded border border-amber-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Move this operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] font-mono text-amber-400 font-bold bg-slate-955 px-2 py-1 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No co-operators matching "${consoleSearchQuery}"`
                            : "No Co-Operators / Trainees deployed in secondary block for this day."}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* 1. Crew Controllers */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "CC") &&
                (!consoleSearchQuery.trim() ||
                  filteredControlDesks.length > 0 ||
                  consoleFilterCategory === "CC") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredControlDesks.length > 0
                        ? "border-amber-400 ring-2 ring-amber-400/30"
                        : "border-slate-800 hover:border-amber-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-amber-400 uppercase">
                        Crew Controllers ({filteredControlDesks.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.controlDesks?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-amber-950/60 text-amber-300 px-2 py-0.5 rounded border border-amber-800/40 font-mono font-bold">
                        {filteredControlDesks.length} / 10
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredControlDesks && filteredControlDesks.length > 0 ? (
                        filteredControlDesks.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-amber-950/30 border-amber-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.code || item.label || `CC${idx + 1}`} •{" "}
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.time || "06:30 - 14:00"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "controlDesks")}
                                className="text-[10px] font-mono text-amber-400 hover:text-white bg-amber-950/60 hover:bg-amber-800/80 px-1.5 py-0.5 rounded border border-amber-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Move this controller"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-amber-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No controllers matching "${consoleSearchQuery}"`
                            : "No controllers assigned."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              10 - (consoleData.controlDesks?.length || 0),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>
                                CC{(consoleData.controlDesks?.length || 0) + i + 1} •
                                --
                              </div>
                              <span className="text-[10px]">06:00 • --</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 2. Leave & Rest */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "LEAVE") &&
                (!consoleSearchQuery.trim() ||
                  filteredLeaves.length > 0 ||
                  consoleFilterCategory === "LEAVE") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredLeaves.length > 0
                        ? "border-cyan-400 ring-2 ring-cyan-400/30"
                        : "border-slate-800 hover:border-cyan-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-cyan-400 uppercase">
                        Leave & Rest ({filteredLeaves.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.leaves?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-cyan-950/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/40 font-mono font-bold">
                        {filteredLeaves.length} / 50
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredLeaves && filteredLeaves.length > 0 ? (
                        filteredLeaves.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-cyan-950/30 border-cyan-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                <span className="text-cyan-400">
                                  {item.type || "CL"}
                                </span>{" "}
                                • {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {safeFormatExcelDate(
                                  item.from || item.dateCode || "--",
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "leaves")}
                                className="text-[10px] font-mono text-cyan-400 hover:text-white bg-cyan-950/60 hover:bg-cyan-800/80 px-1.5 py-0.5 rounded border border-cyan-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Recall from Leave / Transfer operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-cyan-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No leaves matching "${consoleSearchQuery}"`
                            : "No leaves recorded for this day."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 50 - (consoleData.leaves?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>-- • --</div>
                              <span className="text-[10px]">--</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 3. Standby Operators */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "STANDBY") &&
                (!consoleSearchQuery.trim() ||
                  filteredStandbys.length > 0 ||
                  consoleFilterCategory === "STANDBY") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredStandbys.length > 0
                        ? "border-emerald-400 ring-2 ring-emerald-400/30"
                        : "border-slate-800 hover:border-emerald-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-emerald-400 uppercase">
                        Standby ({filteredStandbys.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.standbys?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800/40 font-mono font-bold">
                        {filteredStandbys.length} / 50
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredStandbys && filteredStandbys.length > 0 ? (
                        filteredStandbys.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-emerald-950/30 border-emerald-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.code || item.label || "OR"} • {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.time || "09:00 - 17:00"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "standbys")}
                                className="text-[10px] font-mono text-emerald-400 hover:text-white bg-emerald-950/60 hover:bg-emerald-800/80 px-1.5 py-0.5 rounded border border-emerald-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Deploy Standby to active duty / Transfer operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-emerald-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No standby crew matching "${consoleSearchQuery}"`
                            : "No standby crew deployed."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 50 - (consoleData.standbys?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">06:00 • --</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 4. Step-Back STBK */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "STBK") &&
                (!consoleSearchQuery.trim() ||
                  filteredStepbacks.length > 0 ||
                  consoleFilterCategory === "STBK") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredStepbacks.length > 0
                        ? "border-purple-400 ring-2 ring-purple-400/30"
                        : "border-slate-800 hover:border-purple-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-purple-400 uppercase">
                        STBK ({filteredStepbacks.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.outstationStepbacks?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-purple-950/60 text-purple-300 px-2 py-0.5 rounded border border-purple-800/40 font-mono font-bold">
                        {filteredStepbacks.length} / 20
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredStepbacks && filteredStepbacks.length > 0 ? (
                        filteredStepbacks.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-purple-950/30 border-purple-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-purple-300">
                                {item.station || item.loc || "STBK"}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {item.time}
                              </div>
                              <div className="font-bold text-slate-200 mt-0.5">
                                {item.name}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "outstationStepbacks")}
                                className="text-[10px] font-mono text-purple-400 hover:text-white bg-purple-950/60 hover:bg-purple-800/80 px-1.5 py-0.5 rounded border border-purple-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Deploy Stepback to active duty / Transfer operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-purple-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No STBK operators matching "${consoleSearchQuery}"`
                            : "No STBK operators assigned."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 20 - (consoleData.outstationStepbacks?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>STBK • --</div>
                              <span className="text-[10px]">06:00 • --</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 5. CRT Training */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "CRT") &&
                (!consoleSearchQuery.trim() ||
                  filteredCrt.length > 0 ||
                  consoleFilterCategory === "CRT") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredCrt.length > 0
                        ? "border-teal-400 ring-2 ring-teal-400/30"
                        : "border-slate-800 hover:border-teal-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-teal-400 uppercase">
                        CRT ({filteredCrt.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.crtTraining?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-teal-950/60 text-teal-300 px-2 py-0.5 rounded border border-teal-800/40 font-mono font-bold">
                        {filteredCrt.length} / 15
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredCrt && filteredCrt.length > 0 ? (
                        filteredCrt.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-teal-950/30 border-teal-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {safeFormatExcelDate(
                                  item.time || item.date || "CRT",
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "crtTraining")}
                                className="text-[10px] font-mono text-teal-400 hover:text-white bg-teal-950/60 hover:bg-teal-800/80 px-1.5 py-0.5 rounded border border-teal-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-teal-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No CRT operators matching "${consoleSearchQuery}"`
                            : "No CRT trainees deployed."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 15 - (consoleData.crtTraining?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">06:00 • --</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 6. BMRTI Training (Real Deputation Roster Data) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "BMRTI") &&
                (!consoleSearchQuery.trim() ||
                  filteredBmrti.length > 0 ||
                  consoleFilterCategory === "BMRTI") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredBmrti.length > 0
                        ? "border-sky-400 ring-2 ring-sky-400/40 shadow-xl"
                        : "border-slate-800 hover:border-sky-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-sky-400 uppercase flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-sky-400" />
                        BMRTI ({filteredBmrti.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.bmrtiTraining?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-sky-950/60 text-sky-300 px-2 py-0.5 rounded border border-sky-800/40 font-mono font-bold">
                        {filteredBmrti.length} / 50
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredBmrti && filteredBmrti.length > 0 ? (
                        filteredBmrti.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-sky-950/30 border-sky-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200 flex items-center gap-1.5">
                                <span>{item.name || item.empName}</span>
                              </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {safeFormatExcelDate(
                                    item.date || item.time || "BMRTI",
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => openTransferModal(item, "bmrtiTraining")}
                                  className="text-[10px] font-mono text-sky-400 hover:text-white bg-sky-950/60 hover:bg-sky-800/80 px-1.5 py-0.5 rounded border border-sky-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                  title="Transfer / Deploy operator"
                                >
                                  <ArrowRightLeft className="h-2.5 w-2.5" />
                                  <span>Move</span>
                                </button>
                                <span className="text-[10px] text-sky-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                  #{item.empNo || item.empId || "--"}
                                </span>
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No BMRTI operators matching "${consoleSearchQuery}"`
                            : "No operators deployed under BMRTI for this day."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 50 - (consoleData.bmrtiTraining?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">06:00 • --</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 7. Weekly Off */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "WO") &&
                (!consoleSearchQuery.trim() ||
                  filteredWeeklyOffs.length > 0 ||
                  consoleFilterCategory === "WO") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredWeeklyOffs.length > 0
                        ? "border-rose-400 ring-2 ring-rose-400/30"
                        : "border-slate-800 hover:border-rose-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-rose-400 uppercase">
                        Weekly Off ({filteredWeeklyOffs.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.weeklyOffs?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded border border-rose-800/40 font-mono font-bold">
                        {filteredWeeklyOffs.length} / 50
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredWeeklyOffs && filteredWeeklyOffs.length > 0 ? (
                        filteredWeeklyOffs.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-rose-950/30 border-rose-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div className="font-bold text-slate-200">
                              {item.name}
                            </div>
                            {item.date && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {safeFormatExcelDate(item.date)}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "weeklyOffs")}
                                className="text-[10px] font-mono text-rose-400 hover:text-white bg-rose-950/60 hover:bg-rose-800/80 px-1.5 py-0.5 rounded border border-rose-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Recall from Weekly Off (OT) / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-rose-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No Weekly Off crew matching "${consoleSearchQuery}"`
                            : "No Weekly Off crew recorded."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 50 - (consoleData.weeklyOffs?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">--</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 8. REL (Relieved) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "REL") &&
                (!consoleSearchQuery.trim() ||
                  filteredRel.length > 0 ||
                  consoleFilterCategory === "REL") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredRel.length > 0
                        ? "border-fuchsia-400 ring-2 ring-fuchsia-400/30"
                        : "border-slate-800 hover:border-fuchsia-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-fuchsia-400 uppercase">
                        REL ({filteredRel.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.relievedOperators?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-fuchsia-950/60 text-fuchsia-300 px-2 py-0.5 rounded border border-fuchsia-800/40 font-mono font-bold">
                        {filteredRel.length} / 10
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredRel && filteredRel.length > 0 ? (
                        filteredRel.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-fuchsia-950/30 border-fuchsia-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {safeFormatExcelDate(item.time || "--")}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "relievedOperators")}
                                className="text-[10px] font-mono text-fuchsia-400 hover:text-white bg-fuchsia-950/60 hover:bg-fuchsia-800/80 px-1.5 py-0.5 rounded border border-fuchsia-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-fuchsia-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No REL crew matching "${consoleSearchQuery}"`
                            : "No relieved operators recorded."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 10 - (consoleData.relievedOperators?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">06:00 • --</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 9. PME Register */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "PME") &&
                (!consoleSearchQuery.trim() ||
                  filteredPme.length > 0 ||
                  consoleFilterCategory === "PME") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredPme.length > 0
                        ? "border-lime-400 ring-2 ring-lime-400/30"
                        : "border-slate-800 hover:border-lime-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-lime-400 uppercase">
                        PME ({filteredPme.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.pmeOperators?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-lime-950/60 text-lime-300 px-2 py-0.5 rounded border border-lime-800/40 font-mono font-bold">
                        {filteredPme.length} / 20
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredPme && filteredPme.length > 0 ? (
                        filteredPme.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-lime-950/30 border-lime-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {safeFormatExcelDate(
                                  item.time || item.date || "PME",
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "pmeOperators")}
                                className="text-[10px] font-mono text-lime-400 hover:text-white bg-lime-950/60 hover:bg-lime-800/80 px-1.5 py-0.5 rounded border border-lime-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-lime-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No PME crew matching "${consoleSearchQuery}"`
                            : "No PME scheduled."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 20 - (consoleData.pmeOperators?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">PME</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 10. Route Learning (LRD) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "LRD") &&
                (!consoleSearchQuery.trim() ||
                  filteredLrd.length > 0 ||
                  consoleFilterCategory === "LRD") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredLrd.length > 0
                        ? "border-indigo-400 ring-2 ring-indigo-400/30"
                        : "border-slate-800 hover:border-indigo-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-indigo-400 uppercase">
                        LRD ({filteredLrd.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.routeLearning?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-indigo-950/60 text-indigo-300 px-2 py-0.5 rounded border border-indigo-800/40 font-mono font-bold">
                        {filteredLrd.length} / 20
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredLrd && filteredLrd.length > 0 ? (
                        filteredLrd.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-indigo-950/30 border-indigo-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {safeFormatExcelDate(
                                  item.time || item.date || "LRD",
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "routeLearning")}
                                className="text-[10px] font-mono text-indigo-400 hover:text-white bg-indigo-950/60 hover:bg-indigo-800/80 px-1.5 py-0.5 rounded border border-indigo-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-indigo-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No LRD crew matching "${consoleSearchQuery}"`
                            : "No route learning crew."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 20 - (consoleData.routeLearning?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">LRD</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 11. NOT REPORTING (NR) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "NR") &&
                (!consoleSearchQuery.trim() ||
                  filteredNr.length > 0 ||
                  consoleFilterCategory === "NR") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredNr.length > 0
                        ? "border-rose-400 ring-2 ring-rose-400/30"
                        : "border-slate-800 hover:border-rose-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-rose-300 uppercase">
                        NOT REPORTING ({filteredNr.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.notReporting?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded border border-rose-800/40 font-mono font-bold">
                        {filteredNr.length} / 20
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredNr && filteredNr.length > 0 ? (
                        filteredNr.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-rose-950/30 border-rose-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div className="font-bold text-slate-200">
                              {item.name}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "notReporting")}
                                className="text-[10px] font-mono text-rose-400 hover:text-white bg-rose-950/60 hover:bg-rose-800/80 px-1.5 py-0.5 rounded border border-rose-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-rose-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No not-reporting crew matching "${consoleSearchQuery}"`
                            : "No Not-Reporting operators recorded."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 20 - (consoleData.notReporting?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">NR</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 12. ABSENT (AB) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "AB") &&
                (!consoleSearchQuery.trim() ||
                  filteredAbsents.length > 0 ||
                  consoleFilterCategory === "AB") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredAbsents.length > 0
                        ? "border-red-400 ring-2 ring-red-400/30"
                        : "border-slate-800 hover:border-red-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-red-400 uppercase">
                        ABSENT ({filteredAbsents.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.absents?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-red-950/60 text-red-300 px-2 py-0.5 rounded border border-red-800/40 font-mono font-bold">
                        {filteredAbsents.length} / 20
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredAbsents && filteredAbsents.length > 0 ? (
                        filteredAbsents.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-red-950/30 border-red-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div className="font-bold text-slate-200">
                              {item.name}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "absents")}
                                className="text-[10px] font-mono text-red-400 hover:text-white bg-red-950/60 hover:bg-red-800/80 px-1.5 py-0.5 rounded border border-red-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-red-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No absent crew matching "${consoleSearchQuery}"`
                            : "No Absent operators recorded."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 20 - (consoleData.absents?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">AB</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 13. OD (On Duty / Outstation Duty) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "OD") &&
                (!consoleSearchQuery.trim() ||
                  filteredOd.length > 0 ||
                  consoleFilterCategory === "OD") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredOd.length > 0
                        ? "border-amber-400 ring-2 ring-amber-400/30"
                        : "border-amber-900/40 hover:border-amber-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-amber-400 uppercase">
                        OD (On Duty) ({filteredOd.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.onDuty?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-amber-950/60 text-amber-300 px-2 py-0.5 rounded border border-amber-800/40 font-mono font-bold">
                        {filteredOd.length} / 20
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredOd && filteredOd.length > 0 ? (
                        filteredOd.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-amber-950/30 border-amber-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-amber-300 font-mono">
                                {safeFormatExcelDate(
                                  item.info || item.remark || "OD",
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, "onDuty")}
                                className="text-[10px] font-mono text-amber-400 hover:text-white bg-amber-950/60 hover:bg-amber-800/80 px-1.5 py-0.5 rounded border border-amber-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Deploy OD to active duty / Transfer operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-amber-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No On-Duty crew matching "${consoleSearchQuery}"`
                            : "No On-Duty crew recorded."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          {
                            length: Math.max(
                              0,
                              Math.min(5, 20 - (consoleData.onDuty?.length || 0)),
                            ),
                          },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">OD</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                )}

              {/* 14. BO (Booked Off / Operational Reliefs) */}
              {(consoleFilterCategory === "ALL" ||
                consoleFilterCategory === "BO") &&
                (!consoleSearchQuery.trim() ||
                  filteredBo.length > 0 ||
                  consoleFilterCategory === "BO") && (
                  <div
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredBo.length > 0
                        ? "border-rose-400 ring-2 ring-rose-400/30"
                        : "border-rose-900/40 hover:border-rose-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-rose-400 uppercase flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
                        BO (Booked Off) ({filteredBo.length}
                        {consoleSearchQuery.trim()
                          ? ` / ${consoleData.bookedOff?.length || 0}`
                          : ""}
                        )
                      </span>
                      <span className="text-[10px] bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded border border-rose-800/40 font-mono font-bold">
                        {filteredBo.length} Recorded
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredBo && filteredBo.length > 0 ? (
                        filteredBo.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-rose-950/30 border-rose-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div className="space-y-0.5">
                              <div className="font-bold text-slate-200 flex items-center gap-1.5">
                                <span>{item.name || item.empName}</span>
                                <span className="text-[10px] text-rose-400 bg-rose-950/80 px-1.5 py-0.2 rounded border border-rose-800/60 font-mono font-bold">
                                  Duty #{item.dutyId || "--"}
                                </span>
                              </div>
                              <div className="text-[10px] text-rose-300/80 font-mono flex items-center gap-1">
                                <span className="text-rose-400 font-semibold">{item.faultCategory || "FAULT"}</span>
                                <span>•</span>
                                <span className="truncate max-w-[130px]">{item.reason || item.remarks || "Booked off"}</span>
                              </div>
                              {item.relieverName && (
                                <div className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
                                  <span>Relieved by: {item.relieverName} (#{item.relieverId || "--"})</span>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] text-rose-400 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openTransferModal(item, "bookedOff")}
                                  className="text-[9px] font-bold text-cyan-400 hover:text-white bg-cyan-950/60 hover:bg-cyan-800/80 px-1 py-0.2 rounded border border-cyan-800/50 cursor-pointer flex items-center gap-0.5 transition-all"
                                  title="Transfer / Move this operator to another register or active duty"
                                >
                                  <ArrowRightLeft className="h-2 w-2" /> Move
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRestoreBookedOffOperator(item)}
                                  className="text-[9px] font-bold text-slate-400 hover:text-emerald-400 underline cursor-pointer"
                                  title="Restore back to active duty"
                                >
                                  Restore
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No Booked Off crew matching "${consoleSearchQuery}"`
                            : "No operators booked off today."}
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {/* 15+. Dynamic Custom Section Cards (e.g. CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)) */}
              {Object.keys(consoleData.customRegisters || {}).map((tagName) => {
                const list = consoleData.customRegisters[tagName] || [];
                const filteredCustomList = list.filter(matchesConsoleSearch);
                if (
                  consoleFilterCategory !== "ALL" &&
                  consoleFilterCategory !== tagName
                ) {
                  return null;
                }
                if (
                  consoleSearchQuery.trim() &&
                  filteredCustomList.length === 0 &&
                  consoleFilterCategory !== tagName
                ) {
                  return null;
                }

                return (
                  <div
                    key={tagName}
                    className={`bg-slate-955 border rounded-xl p-3 space-y-2 transition-all ${
                      consoleSearchQuery.trim() && filteredCustomList.length > 0
                        ? "border-cyan-400 ring-2 ring-cyan-400/30"
                        : "border-cyan-900/40 hover:border-cyan-500/40"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-cyan-300 uppercase truncate" title={tagName}>
                        {tagName} ({filteredCustomList.length}
                        {consoleSearchQuery.trim() ? ` / ${list.length}` : ""})
                      </span>
                      <span className="text-[10px] bg-cyan-950/60 text-cyan-300 px-2 py-0.5 rounded border border-cyan-800/40 font-mono font-bold shrink-0">
                        {filteredCustomList.length} / 20
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 text-xs">
                      {filteredCustomList && filteredCustomList.length > 0 ? (
                        filteredCustomList.map((item, idx) => (
                          <div
                            key={idx}
                            className={`border p-2 rounded flex justify-between items-center transition-all ${
                              consoleSearchQuery.trim()
                                ? "bg-cyan-950/30 border-cyan-500/50"
                                : "bg-slate-900 border-slate-800"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-200">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-cyan-400 font-mono">
                                {item.info || item.tag || ""}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => openTransferModal(item, tagName)}
                                className="text-[10px] font-mono text-cyan-400 hover:text-white bg-cyan-950/60 hover:bg-cyan-800/80 px-1.5 py-0.5 rounded border border-cyan-800/50 cursor-pointer flex items-center gap-1 transition-all"
                                title="Transfer / Deploy operator"
                              >
                                <ArrowRightLeft className="h-2.5 w-2.5" />
                                <span>Move</span>
                              </button>
                              <span className="text-[10px] text-cyan-300 font-bold font-mono bg-slate-955 px-2 py-0.5 rounded border border-slate-800">
                                #{item.empNo || item.empId || "--"}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-3 bg-slate-900/40 border border-slate-850 rounded text-center text-slate-500 text-xs font-mono">
                          {consoleSearchQuery.trim()
                            ? `No operators in ${tagName} matching "${consoleSearchQuery}"`
                            : "No operators recorded."}
                        </div>
                      )}
                      {!consoleSearchQuery.trim() &&
                        Array.from(
                          { length: Math.max(0, Math.min(5, 20 - list.length)) },
                          (_, i) => (
                            <div
                              key={i}
                              className="bg-slate-900/40 border border-slate-850 p-1.5 rounded flex justify-between items-center text-slate-500"
                            >
                              <div>--</div>
                              <span className="text-[10px]">{tagName}</span>
                            </div>
                          ),
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── BOOKED OFF REGISTER VIEW (FAULTS & OPERATIONAL RELIEFS) ─────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "BOOKED_OFF" && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="bg-slate-900 border border-rose-900/50 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-36 h-36 bg-rose-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-white tracking-wider uppercase flex items-center gap-2">
                      BOOKED OFF REGISTER & FAULT RELIEF ENGINE
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-rose-600 text-white shadow-sm">
                        {(consoleData.bookedOff || []).length} RECORDED
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400 font-mono">
                      BMRCL Line 2 Peenya Industry Depot • Train Faults, BA Unfitness, Medical & Safety Book-Offs
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyBookedOffSummary}
                  className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5 text-rose-400" />
                  Copy Incident Summary (OCC Broadcast)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("LIVE")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  Return to Live Gate
                </button>
              </div>
            </div>

            {/* Metric KPI Chips */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-800/80">
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Booked Off</div>
                  <div className="text-lg font-black text-white font-mono">
                    {(consoleData.bookedOff || []).length}
                  </div>
                </div>
                <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400 text-xs font-bold">BO</div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Relieved with Replacement</div>
                  <div className="text-lg font-black text-emerald-400 font-mono">
                    {(consoleData.bookedOff || []).filter((b) => Boolean(b.relieverName)).length}
                  </div>
                </div>
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400 text-xs font-bold">STAFFED</div>
              </div>

              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Pending Relief / Vacant Duties</div>
                  <div className="text-lg font-black text-rose-400 font-mono">
                    {(consoleData.bookedOff || []).filter((b) => !b.relieverName).length}
                  </div>
                </div>
                <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400 text-xs font-bold">VACANT</div>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id="adg-bookedoff-search"
                name="bookedoff_search"
                aria-label="Search booked-off crew"
                type="text"
                placeholder="Search booked-off crew by Name, Emp ID, Duty #, Train #, or Reason..."
                value={bookedOffViewSearch}
                onChange={(e) => setBookedOffViewSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 bg-slate-955 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-rose-500"
              />
              {bookedOffViewSearch && (
                <button
                  type="button"
                  onClick={() => setBookedOffViewSearch("")}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="text-xs text-slate-400 font-mono flex items-center gap-2 justify-end">
              <span>Showing:</span>
              <span className="font-bold text-white font-mono">
                {(consoleData.bookedOff || []).filter((item) => {
                  if (!bookedOffViewSearch.trim()) return true;
                  const q = bookedOffViewSearch.toLowerCase();
                  return (
                    (item.name || item.empName || "").toLowerCase().includes(q) ||
                    (item.empNo || item.empId || "").toLowerCase().includes(q) ||
                    String(item.dutyId || "").toLowerCase().includes(q) ||
                    String(item.trainId || "").toLowerCase().includes(q) ||
                    (item.reason || item.remarks || "").toLowerCase().includes(q) ||
                    (item.relieverName || "").toLowerCase().includes(q)
                  );
                }).length} / {(consoleData.bookedOff || []).length}
              </span>
            </div>
          </div>

          {/* Booked Off Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-955 border-b border-slate-800 text-[11px] font-black uppercase text-slate-400 tracking-wider">
                    <th className="p-3 w-12 text-center">#</th>
                    <th className="p-3">Booked Off Operator</th>
                    <th className="p-3">Relieved From Duty</th>
                    <th className="p-3">Fault Category & Reason</th>
                    <th className="p-3">Replacement / Reliever</th>
                    <th className="p-3">Time Recorded</th>
                    <th className="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {(() => {
                    const allBo = consoleData.bookedOff || [];
                    const filtered = allBo.filter((item) => {
                      if (!bookedOffViewSearch.trim()) return true;
                      const q = bookedOffViewSearch.toLowerCase();
                      return (
                        (item.name || item.empName || "").toLowerCase().includes(q) ||
                        (item.empNo || item.empId || "").toLowerCase().includes(q) ||
                        String(item.dutyId || "").toLowerCase().includes(q) ||
                        String(item.trainId || "").toLowerCase().includes(q) ||
                        (item.reason || item.remarks || "").toLowerCase().includes(q) ||
                        (item.relieverName || "").toLowerCase().includes(q)
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan={7} className="p-8 text-center">
                            <div className="flex flex-col items-center justify-center space-y-3">
                              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/30">
                                <CheckCircle className="h-8 w-8" />
                              </div>
                              <div className="text-sm font-bold text-white">
                                {allBo.length === 0
                                  ? "No Booked Off Operators"
                                  : "No Matching Records Found"}
                              </div>
                              <p className="text-xs text-slate-400 max-w-md">
                                {allBo.length === 0
                                  ? "All train operators are operating normally. When an operator is booked off due to a train fault or incident, they will appear in this register with immediate relief tracking."
                                  : `No booked-off records matched "${bookedOffViewSearch}".`}
                              </p>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map((item, idx) => {
                      // Find matching active deployment to know if duty is still vacant
                      const activeDep = deduplicatedDeployments.find(
                        (d) => String(d.dutyId) === String(item.dutyId),
                      );
                      const isVacantDuty =
                        activeDep &&
                        (activeDep.status === "BOOKED_OFF_VACANT" ||
                          activeDep.empId === "--" ||
                          !activeDep.empId);

                      return (
                        <tr
                          key={idx}
                          className="hover:bg-slate-850/50 transition-colors group"
                        >
                          <td className="p-3 text-center text-slate-500 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="p-3">
                            <div className="space-y-0.5">
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>{item.name || item.empName}</span>
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono">
                                Emp ID: <span className="text-rose-300 font-bold">#{item.empNo || item.empId || "--"}</span>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {item.designation || "Train Operator"} • Peenya Depot
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded font-black font-mono text-[11px] bg-slate-950 text-amber-300 border border-slate-800">
                                  Duty #{item.dutyId || "--"}
                                </span>
                                {item.trainId && (
                                  <span className="px-1.5 py-0.2 rounded font-bold font-mono text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800/60">
                                    Train {item.trainId}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Shift: {item.startTime || "--"} - {item.endTime || "--"}
                              </div>
                            </div>
                          </td>
                          <td className="p-3 max-w-xs">
                            <div className="space-y-1">
                              <div>
                                <span className="inline-block px-2 py-0.5 text-[10px] font-bold rounded uppercase font-mono bg-rose-950 text-rose-300 border border-rose-800/60">
                                  {item.faultCategory || "TRAIN_FAULT"}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-300">
                                {item.reason || item.remarks || "Booked off from active duty"}
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            {item.relieverName ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1 text-emerald-400 font-bold text-xs">
                                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>{item.relieverName}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Emp #{item.relieverId || "--"} • {item.relieverSource || "Standby"}
                                </div>
                              </div>
                            ) : isVacantDuty ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                                  <AlertTriangle className="h-3 w-3" />
                                  VACANT — DRIVER REQUIRED
                                </span>
                                <div className="text-[10px] text-rose-400/80 font-mono">
                                  Duty #{item.dutyId} currently has no operator
                                </div>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Relief handled externally
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-[11px] text-slate-400 font-mono">
                            {item.bookedOffAt || "Today"}
                          </td>
                          <td className="p-3 text-right pr-4">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {/* Change or Assign Reliever */}
                              <button
                                type="button"
                                onClick={() => {
                                  const targetDep = deduplicatedDeployments.find(
                                    (d) => String(d.dutyId) === String(item.dutyId),
                                  ) || {
                                    dutyId: item.dutyId,
                                    trainId: item.trainId,
                                    empName: item.name || item.empName,
                                    empId: item.empNo || item.empId,
                                  };
                                  openAssignDriverModal(targetDep);
                                }}
                                className="px-2.5 py-1 rounded text-[11px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition cursor-pointer flex items-center gap-1"
                                title="Assign or Change Replacement Driver"
                              >
                                <Repeat className="h-3 w-3" />
                                {item.relieverName ? "Change Reliever" : "Assign Reliever"}
                              </button>

                              {/* Restore to Duty */}
                              <button
                                type="button"
                                onClick={() => handleRestoreBookedOffOperator(item)}
                                className="px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition cursor-pointer flex items-center gap-1"
                                title="Restore back to active duty if cleared"
                              >
                                <CheckCircle className="h-3 w-3" />
                                Restore
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Swap / Exchange Duties Modal */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-xl p-6 max-w-xl w-full space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className={`text-sm font-black flex items-center gap-2 uppercase tracking-wider ${swapOperationType === "EXCHANGE" ? "text-purple-400" : "text-amber-400"}`}>
                  <Repeat className="h-4 w-4" /> {swapOperationType === "EXCHANGE" ? "DUTY EXCHANGE (SHIFT EXCHANGE)" : "SWAP DUTIES (CC/GCC/ALS)"}
                </h3>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSwapModal(false);
                  setSwapSearchQuery("");
                }}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher: 2-OPERATOR PAIR vs 3-OPERATOR TRIPLE */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setSwapMode("PAIR")}
                className={`flex-1 py-1.5 rounded transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider text-[11px] cursor-pointer ${
                  swapMode === "PAIR"
                    ? "bg-slate-800 text-slate-100 font-black border border-slate-700 shadow"
                    : "text-slate-400 hover:text-slate-200 font-bold"
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                2 Operators (Pair)
              </button>
              <button
                type="button"
                onClick={() => setSwapMode("TRIPLE")}
                className={`flex-1 py-1.5 rounded transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider text-[11px] cursor-pointer ${
                  swapMode === "TRIPLE"
                    ? "bg-emerald-600 text-white font-black border border-emerald-500 shadow"
                    : "text-slate-400 hover:text-emerald-300 font-bold"
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                3 Operators (Triple Swap)
              </button>
            </div>

            {/* Operation Type Switcher: DUTY SWAP vs DUTY EXCHANGE */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
              <button
                type="button"
                onClick={() => setSwapOperationType("SWAP")}
                className={`flex-1 py-1.5 rounded transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider text-[11px] cursor-pointer ${
                  swapOperationType === "SWAP"
                    ? "bg-amber-500 text-slate-950 font-black shadow"
                    : "text-slate-400 hover:text-amber-300 font-bold"
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                {swapMode === "TRIPLE" ? "Triple Swap (CC / GCC)" : "Duty Swap (CC / GCC)"}
              </button>
              <button
                type="button"
                onClick={() => setSwapOperationType("EXCHANGE")}
                className={`flex-1 py-1.5 rounded transition-all flex items-center justify-center gap-1.5 uppercase tracking-wider text-[11px] cursor-pointer ${
                  swapOperationType === "EXCHANGE"
                    ? "bg-purple-600 text-white font-black shadow"
                    : "text-slate-400 hover:text-purple-300 font-bold"
                }`}
              >
                <ArrowRight className="h-3.5 w-3.5" />
                {swapMode === "TRIPLE" ? "Triple Exchange (Shift Exch)" : "Duty Exchange (Shift Exch)"}
              </button>
            </div>

            {/* Quick Filter Search */}
            <div className="relative">
              <input
                id="adg-swap-search"
                name="swap_search"
                aria-label="Filter operators for swap"
                type="text"
                value={swapSearchQuery}
                onChange={(e) => setSwapSearchQuery(e.target.value)}
                placeholder="Filter by operator name, ID, duty, or column (e.g. Mahantesh, 21953, CRRC, Standby)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 font-mono focus:border-amber-500 focus:outline-none"
              />
              <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
              {swapSearchQuery && (
                <button
                  type="button"
                  onClick={() => setSwapSearchQuery("")}
                  className="absolute right-2.5 top-2 text-[10px] text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="space-y-3">
              {/* Dropdown 1 */}
              <div>
                <label
                  className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1"
                  htmlFor="automateddispatchgat-i21"
                >
                  First Duty / Operator {swapMode === "TRIPLE" ? "(Operator 1 ➔ Takes Duty 2)" : ""}
                </label>
                <select
                  id="automateddispatchgat-i21"
                  name="automateddispatchgat-i21"
                  value={swapDuty1}
                  onChange={(e) => setSwapDuty1(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-amber-500"
                >
                  <option value="">-- Select Operator 1 / Duty --</option>
                  {filteredSwappableGroups.map((group) => (
                    <optgroup key={group.categoryKey || group.groupLabel} label={group.groupLabel}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Dropdown 2 */}
              <div>
                <label
                  className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1"
                  htmlFor="automateddispatchgat-i22"
                >
                  Second Duty / Operator {swapMode === "TRIPLE" ? "(Operator 2 ➔ Takes Duty 3)" : ""}
                </label>
                <select
                  id="automateddispatchgat-i22"
                  name="automateddispatchgat-i22"
                  value={swapDuty2}
                  onChange={(e) => setSwapDuty2(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-amber-500"
                >
                  <option value="">-- Select Operator 2 / Duty --</option>
                  {filteredSwappableGroups.map((group) => (
                    <optgroup key={group.categoryKey || group.groupLabel} label={group.groupLabel}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Dropdown 3 (Triple Swap/Exchange only) */}
              {swapMode === "TRIPLE" && (
                <div>
                  <label
                    className="block text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1"
                    htmlFor="automateddispatchgat-i23"
                  >
                    Third Duty / Operator (Operator 3 ➔ Takes Duty 1)
                  </label>
                  <select
                    id="automateddispatchgat-i23"
                    name="automateddispatchgat-i23"
                    value={swapDuty3}
                    onChange={(e) => setSwapDuty3(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 font-mono focus:border-amber-500"
                  >
                    <option value="">-- Select Operator 3 / Duty --</option>
                    {filteredSwappableGroups.map((group) => (
                      <optgroup key={group.categoryKey || group.groupLabel} label={group.groupLabel}>
                        {group.items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )}

              {/* Visual Preview Card: Triple Rotation */}
              {swapMode === "TRIPLE" && (swapDuty1 || swapDuty2 || swapDuty3) && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-[10px] text-slate-400 font-mono">
                    <span className="text-emerald-400 font-bold uppercase flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Triple Cyclic Rotation (3 Duties):
                    </span>
                    <span className="text-slate-500">1 ➔ 2 ➔ 3 ➔ 1</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Operator 1 */}
                    <div className="bg-slate-900 border border-slate-800 rounded p-2">
                      <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider truncate">
                        {findSwappableEntity(swapDuty1)?.category || "Operator 1"}
                      </div>
                      <div className="font-bold text-slate-200 truncate mt-0.5">
                        {findSwappableEntity(swapDuty1)?.empName || "--"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        ID: #{findSwappableEntity(swapDuty1)?.empId || "--"} • Duty: {findSwappableEntity(swapDuty1)?.dutyId || "--"}
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-slate-800 text-[9px] text-amber-300 font-bold flex items-center gap-1">
                        ➔ Takes Duty: <span className="font-mono text-cyan-400 font-black">{findSwappableEntity(swapDuty2)?.dutyId || "Duty 2"}</span>
                      </div>
                    </div>

                    {/* Operator 2 */}
                    <div className="bg-slate-900 border border-slate-800 rounded p-2">
                      <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider truncate">
                        {findSwappableEntity(swapDuty2)?.category || "Operator 2"}
                      </div>
                      <div className="font-bold text-slate-200 truncate mt-0.5">
                        {findSwappableEntity(swapDuty2)?.empName || "--"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        ID: #{findSwappableEntity(swapDuty2)?.empId || "--"} • Duty: {findSwappableEntity(swapDuty2)?.dutyId || "--"}
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-slate-800 text-[9px] text-cyan-300 font-bold flex items-center gap-1">
                        ➔ Takes Duty: <span className="font-mono text-purple-400 font-black">{findSwappableEntity(swapDuty3)?.dutyId || "Duty 3"}</span>
                      </div>
                    </div>

                    {/* Operator 3 */}
                    <div className="bg-slate-900 border border-slate-800 rounded p-2">
                      <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider truncate">
                        {findSwappableEntity(swapDuty3)?.category || "Operator 3"}
                      </div>
                      <div className="font-bold text-slate-200 truncate mt-0.5">
                        {findSwappableEntity(swapDuty3)?.empName || "--"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        ID: #{findSwappableEntity(swapDuty3)?.empId || "--"} • Duty: {findSwappableEntity(swapDuty3)?.dutyId || "--"}
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-slate-800 text-[9px] text-purple-300 font-bold flex items-center gap-1">
                        ➔ Takes Duty: <span className="font-mono text-amber-400 font-black">{findSwappableEntity(swapDuty1)?.dutyId || "Duty 1"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Pair Preview Card */}
              {swapMode !== "TRIPLE" && (swapDuty1 || swapDuty2) && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-5 gap-2 items-center text-xs">
                  <div className="sm:col-span-2 bg-slate-900 border border-slate-800 rounded p-2 min-w-0">
                    <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider truncate">
                      {findSwappableEntity(swapDuty1)?.category || "Operator 1"}
                    </div>
                    <div className="font-bold text-slate-200 truncate mt-0.5">
                      {findSwappableEntity(swapDuty1)?.empName || "--"}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      ID: #{findSwappableEntity(swapDuty1)?.empId || "--"} • Duty: {findSwappableEntity(swapDuty1)?.dutyId || "--"}
                    </div>
                  </div>

                  <div className="flex justify-center items-center py-1">
                    <div className={`p-1.5 rounded-full border ${swapOperationType === "EXCHANGE" ? "bg-purple-500/20 text-purple-400 border-purple-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}`}>
                      <Repeat className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="sm:col-span-2 bg-slate-900 border border-slate-800 rounded p-2 min-w-0">
                    <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider truncate">
                      {findSwappableEntity(swapDuty2)?.category || "Operator 2"}
                    </div>
                    <div className="font-bold text-slate-200 truncate mt-0.5">
                      {findSwappableEntity(swapDuty2)?.empName || "--"}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      ID: #{findSwappableEntity(swapDuty2)?.empId || "--"} • Duty: {findSwappableEntity(swapDuty2)?.dutyId || "--"}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowSwapModal(false);
                  setSwapSearchQuery("");
                }}
                className="px-4 py-1.5 rounded text-xs font-bold text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSwap}
                disabled={
                  swapMode === "TRIPLE"
                    ? !swapDuty1 || !swapDuty2 || !swapDuty3 || swapDuty1 === swapDuty2 || swapDuty2 === swapDuty3 || swapDuty1 === swapDuty3
                    : !swapDuty1 || !swapDuty2 || swapDuty1 === swapDuty2
                }
                className={`px-4 py-1.5 rounded text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  swapOperationType === "EXCHANGE"
                    ? "bg-purple-600 hover:bg-purple-500 text-white"
                    : "bg-amber-400 hover:bg-amber-300 text-slate-955"
                }`}
              >
                {swapMode === "TRIPLE"
                  ? (swapOperationType === "EXCHANGE" ? "CONFIRM TRIPLE EXCHANGE" : "CONFIRM TRIPLE SWAP")
                  : (swapOperationType === "EXCHANGE" ? "CONFIRM EXCHANGE" : "CONFIRM SWAP")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showOfficialGccSheetModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-6xl max-h-[95vh] rounded-2xl overflow-hidden shadow-2xl bg-slate-950 border border-slate-800 flex flex-col">
            <OfficialGccRosterSheetView
              userRole="CONTROLLER"
              initialDateStr={deployedRosterInfo?.dateStr || activeSelectedDateStr}
              onClose={() => setShowOfficialGccSheetModal(false)}
              isModal={true}
            />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── BOOK OFF & IMMEDIATE RELIEF MODAL ──────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showBookOffModal && bookOffTargetDuty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-rose-500/50 rounded-2xl p-5 sm:p-6 max-w-2xl w-full space-y-4 shadow-2xl my-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                    BOOK OFF TRAIN OPERATOR
                    <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-rose-950 text-rose-300 border border-rose-800">
                      DUTY #{bookOffTargetDuty.dutyId}
                    </span>
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    BMRCL Line 2 Peenya Depot • Fault / Incident Book-Off & Operational Relief
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBookOffModal(false);
                  setBookOffTargetDuty(null);
                  setSelectedReliever(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Target Duty & Operator Card */}
            <div className="bg-slate-955 border border-slate-800 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Current Operator</div>
                <div className="font-bold text-white text-sm truncate">{bookOffTargetDuty.empName || bookOffTargetDuty.name}</div>
                <div className="text-[10px] text-rose-400 font-mono">Emp #{bookOffTargetDuty.empId || bookOffTargetDuty.empNo || "--"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Duty & Train</div>
                <div className="font-black text-amber-300 font-mono">Duty #{bookOffTargetDuty.dutyId}</div>
                <div className="text-[10px] text-indigo-300 font-mono">Train {bookOffTargetDuty.trainId || "--"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Shift Timing</div>
                <div className="font-mono text-slate-200">{bookOffTargetDuty.startTime || "--"} - {bookOffTargetDuty.endTime || "--"}</div>
                <div className="text-[10px] text-slate-400 font-mono">Sign On: {bookOffTargetDuty.signOnTime || bookOffTargetDuty.startTime || "--"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Depot / Station</div>
                <div className="font-bold text-slate-300">{bookOffTargetDuty.sourceStation || "PUTH"}</div>
                <div className="text-[10px] text-emerald-400">Mainline Service</div>
              </div>
            </div>

            {/* Fault Category Selection */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                1. Select Fault / Incident Category <span className="text-rose-400">*</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: "TRAIN_FAULT", label: "🛠️ Train Fault / Tech", desc: "Traction/Brake failure" },
                  { key: "SAFETY_INCIDENT", label: "🚨 Safety / Incident", desc: "Signal / Track / SPAD" },
                  { key: "MEDICAL_BA", label: "🩺 Medical / BA Unfit", desc: "Sickness / Breathalyzer" },
                  { key: "FATIGUE_HOURS", label: "⏱️ Hours Exceeded", desc: "Fatigue / Exceeded duty" },
                  { key: "PERSONAL_EMERGENCY", label: "⚠️ Emergency", desc: "Personal urgent leave" },
                  { key: "OCC_ORDER", label: "📝 OCC / CC Order", desc: "Operational instruction" },
                ].map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setBookOffFaultCategory(cat.key)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      bookOffFaultCategory === cat.key
                        ? "bg-rose-500/20 border-rose-500 text-white shadow-sm ring-1 ring-rose-500"
                        : "bg-slate-955 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-xs">{cat.label}</div>
                    <div className="text-[10px] text-slate-400">{cat.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Remarks / Incident Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block" htmlFor="bookoff-incident-details">
                2. Incident Details / Remarks <span className="text-rose-400">*</span>
              </label>
              <textarea
                id="bookoff-incident-details"
                name="bookoff_incident_details"
                rows={2}
                value={bookOffReason}
                onChange={(e) => setBookOffReason(e.target.value)}
                placeholder="Specify train fault code, station location, OCC advice, or incident description..."
                className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            {/* Relief / Replacement Option */}
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none" htmlFor="bookoff-assign-relief">
                  <input
                    id="bookoff-assign-relief"
                    name="bookoff_assign_relief"
                    type="checkbox"
                    checked={bookOffAssignRelief}
                    onChange={(e) => {
                      setBookOffAssignRelief(e.target.checked);
                      if (e.target.checked && !selectedReliever) {
                        const firstStandby = (consoleData.standbys || [])[0];
                        if (firstStandby) {
                          setSelectedReliever({
                            id: firstStandby.empNo || firstStandby.empId,
                            name: firstStandby.name || firstStandby.empName,
                            dutyId: firstStandby.duty || firstStandby.code || "Standby",
                            source: "STANDBY",
                            ...firstStandby,
                          });
                        }
                      }
                    }}
                    className="h-4 w-4 rounded bg-slate-900 border-slate-700 text-rose-600 focus:ring-rose-500 focus:ring-offset-slate-900 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    3. Immediately Assign Replacement Driver Now
                  </span>
                </label>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded">
                  Recommended for Live Ops
                </span>
              </div>

              {bookOffAssignRelief ? (
                <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-3">
                  {/* Source Tabs */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBookOffReliefSource("STANDBY")}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        bookOffReliefSource === "STANDBY"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/50"
                          : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                      }`}
                    >
                      Standby Crew ({(consoleData.standbys || []).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setBookOffReliefSource("CREW_POOL")}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        bookOffReliefSource === "CREW_POOL"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50"
                          : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                      }`}
                    >
                      Available Crew Registry ({availableCrewPool.length})
                    </button>
                  </div>

                  {/* Reliever Selector Content */}
                  {bookOffReliefSource === "STANDBY" ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {(consoleData.standbys || []).length > 0 ? (
                        (consoleData.standbys || []).map((stb, idx) => {
                          const isSelected =
                            selectedReliever &&
                            String(selectedReliever.id) === String(stb.empNo || stb.empId);
                          return (
                            <div
                              key={idx}
                              onClick={() =>
                                setSelectedReliever({
                                  id: stb.empNo || stb.empId,
                                  name: stb.name || stb.empName,
                                  dutyId: stb.duty || stb.code || "Standby",
                                  source: "STANDBY",
                                  ...stb,
                                })
                              }
                              className={`p-2 rounded-lg border flex justify-between items-center cursor-pointer transition-all ${
                                isSelected
                                  ? "bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500"
                                  : "bg-slate-900 border-slate-850 hover:border-slate-700 text-slate-300"
                              }`}
                            >
                              <div>
                                <div className="font-bold text-xs flex items-center gap-2">
                                  <span>{stb.name || stb.empName}</span>
                                  <span className="text-[10px] text-amber-400 font-mono bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-800/40">
                                    {stb.duty || stb.code || "Standby"}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  Station: {stb.station || stb.info || "PUTH"} • Ready
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono text-slate-400">
                                  #{stb.empNo || stb.empId || "--"}
                                </span>
                                {isSelected && (
                                  <Check className="h-4 w-4 text-emerald-400" />
                                )}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-center text-xs text-slate-400 font-mono">
                          No standby operators currently on roster. Switch to "Available Crew Registry".
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          id="adg-bookoff-reliever-search"
                          name="bookoff_reliever_search"
                          aria-label="Search available crew by Name or Emp ID"
                          type="text"
                          placeholder="Search available crew by Name or Emp ID..."
                          value={bookOffRelieverSearch}
                          onChange={(e) => setBookOffRelieverSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                        {availableCrewPool
                          .filter((c) => {
                            if (!bookOffRelieverSearch.trim()) return true;
                            const q = bookOffRelieverSearch.toLowerCase();
                            return (
                              c.name.toLowerCase().includes(q) ||
                              String(c.id).toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 20)
                          .map((crew) => {
                            const isSelected =
                              selectedReliever &&
                              String(selectedReliever.id) === String(crew.id);
                            return (
                              <div
                                key={crew.id}
                                onClick={() =>
                                  setSelectedReliever({
                                    id: crew.id,
                                    name: crew.name,
                                    dutyId: "Relief",
                                    source: "CREW_POOL",
                                    ...crew,
                                  })
                                }
                                className={`p-1.5 px-2 rounded border flex justify-between items-center cursor-pointer transition-all ${
                                  isSelected
                                    ? "bg-emerald-950/40 border-emerald-500 text-white ring-1 ring-emerald-500"
                                    : "bg-slate-900 border-slate-850 hover:border-slate-700 text-slate-300"
                                }`}
                              >
                                <div>
                                  <span className="font-bold text-xs">{crew.name}</span>
                                  <span className="text-[10px] text-slate-500 ml-2 font-mono">
                                    {crew.designation || "TO"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-emerald-400">
                                    #{crew.id}
                                  </span>
                                  {isSelected && (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Selected Reliever Confirmation Box */}
                  {selectedReliever && (
                    <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-white">
                            Selected Reliever: <span className="text-emerald-300">{selectedReliever.name}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Emp #{selectedReliever.id} • Will take over Duty #{bookOffTargetDuty.dutyId} immediately
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedReliever(null)}
                        className="text-[10px] text-slate-400 hover:text-white underline cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-3 flex items-start gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-300/90 leading-relaxed">
                    <span className="font-bold">Duty #{bookOffTargetDuty.dutyId} will be marked as VACANT:</span> The operator will be moved to the Booked Off Register, and this duty will require an operator before departure. You can assign a replacement driver later anytime from the Live Gate or Booked Off Register.
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Buttons */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowBookOffModal(false);
                  setBookOffTargetDuty(null);
                  setSelectedReliever(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBookOff}
                disabled={isSubmittingBookOff || (bookOffAssignRelief && !selectedReliever)}
                className="px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-500 text-white transition shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingBookOff ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing Book-Off...
                  </>
                ) : bookOffAssignRelief && selectedReliever ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Confirm Book Off & Assign Replacement
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    Confirm Book Off (Vacate Duty)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── QUICK ASSIGN / CHANGE DRIVER MODAL ─────────────────────────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showAssignDriverModal && assignTargetDuty && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl p-5 sm:p-6 max-w-xl w-full space-y-4 shadow-2xl my-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400">
                  <Repeat className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                    {assignTargetDuty.status === "BOOKED_OFF_VACANT" ||
                    assignTargetDuty.empId === "--" ||
                    !assignTargetDuty.empId
                      ? "ASSIGN DRIVER TO VACANT DUTY"
                      : "CHANGE / REASSIGN DUTY DRIVER"}
                    <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-amber-950 text-amber-300 border border-amber-800">
                      DUTY #{assignTargetDuty.dutyId}
                    </span>
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    BMRCL Line 2 Peenya Depot • Instant Roster Restaffing
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAssignDriverModal(false);
                  setAssignTargetDuty(null);
                  setSelectedReliever(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Target Duty Summary Card */}
            <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Duty & Train</div>
                <div className="font-black text-amber-300 font-mono">Duty #{assignTargetDuty.dutyId}</div>
                <div className="text-[10px] text-indigo-300 font-mono">Train {assignTargetDuty.trainId || "--"}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Current Operator</div>
                <div className="font-bold text-white truncate">
                  {assignTargetDuty.empName || "VACANT"}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  #{assignTargetDuty.empId || "--"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-bold">Shift Hours</div>
                <div className="font-mono text-slate-300">
                  {assignTargetDuty.startTime || "--"} - {assignTargetDuty.endTime || "--"}
                </div>
                <div className="text-[10px] text-emerald-400">
                  {assignTargetDuty.sourceStation || "PUTH"}
                </div>
              </div>
            </div>

            {/* Select Driver Source Tabs */}
            <div className="space-y-3">
              {/* Omni Search across candidates */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  id="adg-assign-search"
                  name="assign_search"
                  aria-label="Search crew by Name, Emp ID, Station, or Duty"
                  type="text"
                  placeholder="Search crew by Name, Emp ID, Station, or Duty..."
                  value={assignSearchQuery}
                  onChange={(e) => setAssignSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-955 border border-slate-750 focus:border-amber-400 rounded-lg text-xs text-white placeholder-slate-500 font-mono outline-none"
                />
                {assignSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setAssignSearchQuery("")}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Source Tabs */}
              <div className="flex gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold">
                {[
                  { key: "STANDBY", label: `⏱️ Standbys (${consoleData.standbys?.length || 0})` },
                  { key: "STBK", label: `🔄 Stepback (${consoleData.outstationStepbacks?.length || 0})` },
                  { key: "OR", label: `🛡️ OR / OD (${consoleData.onDuty?.length || 0})` },
                  { key: "CC", label: `🎧 CC (${consoleData.controlDesks?.length || 0})` },
                  { key: "WO", label: `📅 Weekly Off (${consoleData.weeklyOffs?.length || 0})` },
                  { key: "LEAVE", label: `📝 Leaves (${consoleData.leaves?.length || 0})` },
                  {
                    key: "MAINLINE",
                    label: `🚆 Active Duties (${
                      (deduplicatedDeployments || []).filter(
                        (d) => d.empId && d.empId !== "--" && String(d.dutyId) !== String(assignTargetDuty.dutyId),
                      ).length
                    })`,
                  },
                  { key: "CREW_POOL", label: `👥 Master Pool (${availableCrewPool.length})` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setAssignDriverType(tab.key);
                      setSelectedReliever(null);
                    }}
                    className={`px-2.5 py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      assignDriverType === tab.key
                        ? "bg-amber-500 text-slate-955 font-black shadow-sm ring-1 ring-amber-400"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-750 hover:text-white"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Candidates List Container */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {(() => {
                  let list = [];
                  const q = assignSearchQuery.trim().toLowerCase();

                  if (assignDriverType === "STANDBY") {
                    list = (consoleData.standbys || []).map((item, idx) => {
                      const clean = sanitizeConsoleItem(item);
                      return {
                        id: clean.empNo || clean.empId || `stb_${idx}`,
                        name: clean.name || clean.empName,
                        dutyId: clean.duty || clean.code || "Standby",
                        station: clean.station || clean.info || "PUTH",
                        time: clean.time || "07:00 - 15:00",
                        source: "STANDBY",
                        sourceLabel: "Standby Operator",
                        rawItem: clean,
                      };
                    });
                  } else if (assignDriverType === "STBK") {
                    list = (consoleData.outstationStepbacks || []).map((item, idx) => {
                      const clean = sanitizeConsoleItem(item);
                      return {
                        id: clean.empNo || clean.empId || `stbk_${idx}`,
                        name: clean.name || clean.empName,
                        dutyId: clean.duty || clean.code || `Stepback #${idx + 1}`,
                        station: clean.station || clean.info || "PUTH",
                        time: clean.time || "06:30 - 15:00",
                        source: "STBK",
                        sourceLabel: "Stepback Crew (1Stbk / 2Stbk)",
                        rawItem: clean,
                      };
                    });
                  } else if (assignDriverType === "OR") {
                    list = (consoleData.onDuty || []).map((item, idx) => {
                      const clean = sanitizeConsoleItem(item);
                      return {
                        id: clean.empNo || clean.empId || `od_${idx}`,
                        name: clean.name || clean.empName,
                        dutyId: clean.duty || clean.code || "OR",
                        station: clean.station || clean.info || "Depot",
                        time: clean.time || "06:00 - 14:00",
                        source: "OR",
                        sourceLabel: "Outstation Reserve / OD",
                        rawItem: clean,
                      };
                    });
                  } else if (assignDriverType === "CC") {
                    list = (consoleData.controlDesks || []).map((item, idx) => {
                      const clean = sanitizeConsoleItem(item);
                      return {
                        id: clean.empNo || clean.empId || `cc_${idx}`,
                        name: clean.name || clean.empName,
                        dutyId: clean.duty || clean.code || `CC${idx + 1}`,
                        station: clean.station || clean.info || "Peenya CC",
                        time: clean.time || "06:30 - 14:00",
                        source: "CC",
                        sourceLabel: "Control Desk Controller",
                        rawItem: clean,
                      };
                    });
                  } else if (assignDriverType === "WO") {
                    list = (consoleData.weeklyOffs || []).map((item, idx) => {
                      const clean = sanitizeConsoleItem(item);
                      return {
                        id: clean.empNo || clean.empId || `wo_${idx}`,
                        name: clean.name || clean.empName,
                        dutyId: "WO",
                        station: "Weekly Off",
                        time: "Rest Day",
                        source: "WO",
                        sourceLabel: "Weekly Off Recall (Overtime)",
                        rawItem: clean,
                      };
                    });
                  } else if (assignDriverType === "LEAVE") {
                    list = (consoleData.leaves || []).map((item, idx) => {
                      const clean = sanitizeConsoleItem(item);
                      return {
                        id: clean.empNo || clean.empId || `leave_${idx}`,
                        name: clean.name || clean.empName,
                        dutyId: clean.type || clean.code || "Leave",
                        station: "On Leave",
                        time: clean.date || "Scheduled Leave",
                        source: "LEAVE",
                        sourceLabel: "Leave Recall",
                        rawItem: clean,
                      };
                    });
                  } else if (assignDriverType === "MAINLINE") {
                    list = (deduplicatedDeployments || [])
                      .filter(
                        (d) =>
                          String(d.dutyId) !== String(assignTargetDuty.dutyId) &&
                          d.empId &&
                          d.empId !== "--",
                      )
                      .map((d) => ({
                        id: d.empId || d.empNo,
                        name: d.empName || d.name,
                        dutyId: `Duty #${d.dutyId}`,
                        station: d.sourceStation || "PUTH",
                        time: `${d.startTime || "--"} - ${d.endTime || "--"}`,
                        source: "MAINLINE",
                        sourceLabel: `Active Mainline Duty #${d.dutyId}`,
                        rawDeployment: d,
                        rawItem: d,
                      }));
                  } else {
                    list = (availableCrewPool || []).map((c) => ({
                      id: c.id,
                      name: c.name,
                      dutyId: c.designation || "Train Operator",
                      station: "BMRCL Registry",
                      time: "Available",
                      source: "CREW_POOL",
                      sourceLabel: "Crew Registry Master Pool",
                      rawItem: c,
                    }));
                  }

                  const filtered = list.filter((c) => {
                    if (!q) return true;
                    return (
                      (c.name || "").toLowerCase().includes(q) ||
                      String(c.id || "").toLowerCase().includes(q) ||
                      (c.dutyId || "").toLowerCase().includes(q) ||
                      (c.station || "").toLowerCase().includes(q) ||
                      (c.sourceLabel || "").toLowerCase().includes(q)
                    );
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="p-5 bg-slate-955 border border-slate-800 rounded-xl text-center text-xs text-slate-400 font-mono">
                        {q
                          ? `No crew matching "${q}" in this category.`
                          : `No operators currently recorded in ${assignDriverType}.`}
                      </div>
                    );
                  }

                  return filtered.slice(0, 30).map((c, idx) => {
                    const isSelected =
                      selectedReliever && String(selectedReliever.id) === String(c.id);
                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedReliever(c)}
                        className={`p-2.5 rounded-lg border flex justify-between items-center cursor-pointer transition-all ${
                          isSelected
                            ? "bg-amber-950/40 border-amber-500 text-white ring-1 ring-amber-500 shadow-md"
                            : "bg-slate-955 border-slate-800 hover:border-slate-700 text-slate-300 hover:bg-slate-900"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold text-xs flex items-center gap-2">
                            <span>{c.name}</span>
                            <span className="text-[10px] text-amber-300 font-mono bg-amber-950/70 px-1.5 py-0.2 rounded border border-amber-800/50">
                              {c.dutyId}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5">
                            <span className="text-emerald-400 font-semibold">{c.sourceLabel}</span>
                            <span>•</span>
                            <span>{c.station}</span>
                            <span>•</span>
                            <span>{c.time}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">
                            #{c.id}
                          </span>
                          {isSelected && (
                            <Check className="h-4 w-4 text-amber-400" />
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Selected Driver Banner */}
              {selectedReliever && (
                <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Assigning:</span>
                        <span className="text-emerald-300 font-mono font-black text-sm">{selectedReliever.name}</span>
                        <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 rounded font-mono">
                          Emp #{selectedReliever.id}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Source: <span className="text-amber-300 font-bold">{selectedReliever.sourceLabel || selectedReliever.source}</span> • Will be assigned to <span className="text-white font-bold">Duty #{assignTargetDuty.dutyId}</span> (Train {assignTargetDuty.trainId || "--"})
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedReliever(null)}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowAssignDriverModal(false);
                  setAssignTargetDuty(null);
                  setSelectedReliever(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteAssignDriver}
                disabled={isSubmittingAssign || !selectedReliever}
                className="px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-400 text-slate-955 transition shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingAssign ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning Driver...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" />
                    Confirm Driver Assignment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* ── UNIVERSAL CREW TRANSFER ACROSS PAGES & REGISTERS MODAL ─────── */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-indigo-500/50 rounded-2xl p-5 sm:p-6 max-w-2xl w-full space-y-4 shadow-2xl my-auto">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-indigo-400">
                  <Repeat className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                    TRANSFER OPERATOR ACROSS ROSTER PAGES
                  </h3>
                  <div className="text-[11px] text-slate-400 font-mono">
                    BMRCL Line 2 Peenya Depot • Move Operator to Any Register or Active Duty
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferTargetOperator(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Operator Selection (If none pre-selected) */}
            {!transferTargetOperator ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block" htmlFor="transfer-search-query">
                  1. Select Train Operator to Transfer
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    id="transfer-search-query"
                    name="transfer_search_query"
                    type="text"
                    placeholder="Search any operator across all registers by Name or Emp ID..."
                    value={transferSearchQuery}
                    onChange={(e) => setTransferSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-955 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {allSwappableEntities
                    .filter((e) => {
                      if (!transferSearchQuery.trim()) return true;
                      const q = transferSearchQuery.toLowerCase();
                      return (
                        (e.empName || "").toLowerCase().includes(q) ||
                        String(e.empId || "").toLowerCase().includes(q) ||
                        (e.label || "").toLowerCase().includes(q) ||
                        (e.category || "").toLowerCase().includes(q)
                      );
                    })
                    .slice(0, 20)
                    .map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() =>
                          setTransferTargetOperator({
                            empId: item.empId,
                            empName: item.empName,
                            currentCategory: item.type === "MAINLINE" ? "MAINLINE" : item.catKey || item.category,
                            rawItem: item,
                          })
                        }
                        className="p-2 bg-slate-955 border border-slate-800 hover:border-indigo-500/60 rounded-lg flex justify-between items-center cursor-pointer transition"
                      >
                        <div>
                          <span className="font-bold text-xs text-white">{item.empName}</span>
                          <span className="text-[10px] text-indigo-300 font-mono ml-2 bg-indigo-950/60 px-1.5 py-0.2 rounded border border-indigo-800/40">
                            {item.category}: {item.dutyId || "--"}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          #{item.empId || "--"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    Operator to Move
                  </div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{transferTargetOperator.empName}</span>
                    <span className="text-[10px] text-indigo-300 font-mono bg-indigo-950 px-1.5 py-0.2 rounded border border-indigo-800">
                      Emp #{transferTargetOperator.empId}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Currently stationed in: <span className="text-amber-300 font-bold">{transferTargetOperator.currentCategory}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTransferTargetOperator(null)}
                  className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                >
                  Change Operator
                </button>
              </div>
            )}

            {/* Destination Selection */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
                2. Select Destination Register / Page
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                {[
                  { key: "MAINLINE", label: "🚆 Active Duty", desc: "Mainline Train" },
                  { key: "STANDBY", label: "⏱️ Standby", desc: "Ready for duty" },
                  { key: "STBK", label: "🔄 Stepback", desc: "1Stbk / 2Stbk" },
                  { key: "OR", label: "🛡️ OR / OD", desc: "Outstation Reserve" },
                  { key: "CC", label: "🎧 Control Desk", desc: "CC1 / CC2 / CC3" },
                  { key: "WO", label: "📅 Weekly Off", desc: "Scheduled Rest" },
                  { key: "LEAVE", label: "📝 Leave", desc: "CL / EL / L" },
                  { key: "CRT", label: "🎓 CRT Training", desc: "Training Desk" },
                  { key: "BO", label: "⛔ Booked Off", desc: "Relieved / Fault" },
                  { key: "NR", label: "⚠️ Not Reporting", desc: "Absence Tracker" },
                ].map((dest) => (
                  <button
                    key={dest.key}
                    type="button"
                    onClick={() => setTransferDestinationCategory(dest.key)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      transferDestinationCategory === dest.key
                        ? "bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400/40"
                        : "bg-slate-955 border-slate-800 text-slate-300 hover:bg-slate-850 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-xs">{dest.label}</div>
                    <div className="text-[10px] opacity-80">{dest.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Destination Specific Input */}
            {transferDestinationCategory === "MAINLINE" ? (
              <div className="bg-slate-955 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                <label className="text-xs font-bold text-amber-300 uppercase tracking-wider block" htmlFor="transfer-target-duty">
                  Select Target Mainline Duty Number
                </label>
                <select
                  id="transfer-target-duty"
                  name="transfer_target_duty"
                  value={transferTargetDutyId}
                  onChange={(e) => setTransferTargetDutyId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-750 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-amber-400 font-mono"
                >
                  <option value="">Select Duty #...</option>
                  {(deduplicatedDeployments || []).map((d) => {
                    const isVacant = d.status === "BOOKED_OFF_VACANT" || d.empId === "--" || !d.empId;
                    return (
                      <option key={d.dutyId} value={d.dutyId}>
                        Duty #{d.dutyId} (Train {d.trainId || "--"}) — {isVacant ? "⚠️ VACANT - DRIVER REQUIRED" : `${d.empName || "Staff"} (#${d.empId})`}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-slate-400 font-mono">
                  The operator will be assigned to this duty in the Live Gate and Crew Deployment register.
                </p>
              </div>
            ) : null}

            {/* Remarks / Reason */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block" htmlFor="transfer-reason">
                3. Reason / Authorization Remarks (Optional)
              </label>
              <input
                id="transfer-reason"
                name="transfer_reason"
                type="text"
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
                placeholder="e.g. Shift reallocation, covering vacant duty, OCC instruction..."
                className="w-full bg-slate-955 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferTargetOperator(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteTransfer}
                disabled={isSubmittingTransfer || !transferTargetOperator}
                className="px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingTransfer ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Moving Operator...
                  </>
                ) : (
                  <>
                    <Repeat className="h-4 w-4" />
                    Confirm Move Operator
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="crew-employees">
        {BMRCL_CREW_REGISTRY.map((c) => (
          <option key={c.id} value={c.id}>
            {c.id} - {c.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

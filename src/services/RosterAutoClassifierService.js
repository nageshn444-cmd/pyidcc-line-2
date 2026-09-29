import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import { BMRCL_CREW_REGISTRY } from "../data/bmrclCrewRegistry.js";
import { EMPLOYEE_MASTER_REGISTRY } from "../data/employeeProfileMaster.js";
import { WEEKDAY_MASTER_LINKS } from "../data/weekdayMasterLinks.js";
import { db } from "../firebase.js";
import {
  getScheduleTypeFromDate,
  MONTH_NAMES_FULL,
  MONTH_NAMES_SHORT,
  parseRosterDateText
} from "../utils/rosterDateUtils.js";
const EMPLOYEE_PROFILE_MASTER = EMPLOYEE_MASTER_REGISTRY;

export const isTimeValue = (val) => {
  if (val === undefined || val === null || val === "") return false;
  if (typeof val === "number") {
    return val >= 0 && val < 1.0;
  }
  const s = String(val).trim();
  return (
    /^\d{1,2}:\d{2}(:\d{2})?(\s*-\s*\d{1,2}:\d{2}(:\d{2})?)?$/.test(s) ||
    /^(0?\.\d+|1\.0+)$/.test(s) ||
    /^\d{1,2}-[A-Za-z]{3}$/.test(s)
  );
};

export const isDateOrTimeValue = (val) => {
  if (val === undefined || val === null) return false;
  if (isTimeValue(val)) return true;
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?(\s*-\s*\d{1,2}:\d{2}(:\d{2})?)?$/i.test(s))
    return true;
  if (/^\d{1,2}[-\s/.]+[A-Za-z]{3,9}([-\s/.]+\d{2,4})?$/i.test(s)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}([-/.]\d{2,4})?$/i.test(s)) return true;
  if (/^[A-Za-z]{3,9}[-\s/.]+\d{1,2}([-\s/.]+\d{2,4})?$/i.test(s)) return true;
  return false;
};

export const isJunkOrWatermarkText = (val) => {
  if (!val) return true;
  const s = String(val).trim().toUpperCase();
  if (s.length < 2) return true;
  if (/^PAGE\s*\d+$/i.test(s)) return true;
  if (/^TOTAL(\s*\d+)?/i.test(s)) return true;
  if (
    /^(PREPARED BY|TIME TABLE|SL NO|SI\.NO\.|DUTY NO|SIGN ON|SIGN OFF|DAY TYPE|SCHEDULE|LINK TO FOLLOW|.*LINK.*|PRESENT|REST|JMD L|JMD AB|ML&HPL|DAY|LINE-1|01ST|17TH|PRINT WD|COMPULSORY GH|INDV DUTIES|CC DUTY|20\.9 TO 26\.9)/i.test(
      s,
    )
  )
    return true;
  if (/^(BANGALORE METRO|BMRCL|PEENYA DEPOT|LINE 2)/i.test(s)) return true;
  if (/\b(TRAIN TESTING|440KMS TRG|TRAIN TRG|ALS\/CC ROSTER)\b/i.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
};

export const getStandardAuxCategory = (marker) => {
  if (!marker || isDateOrTimeValue(marker) || isJunkOrWatermarkText(marker))
    return null;
  const m = String(marker).trim().toUpperCase();

  // 1. Crew Controllers (CC1, CC2, CC3, CC)
  if (/^(CC\d*|CC[-\s]\d+|CREW\s*CONTROLLER|PICKUP)$/i.test(m)) {
    return "CREW_CONTROLLER";
  }

  // 2. Outstation Stepbacks (MGSA, PUTH, STBK, etc.)
  if (/^(MGSA|PUTH|STBK|1STBK|STEPBACK|NGSA)$/i.test(m)) {
    return "OUTSTATION_STEPBACK";
  }

  // 3. CRT Training
  if (/^(CRT|CRT\s*TRAINING)$/i.test(m)) {
    return "CRT_TRAINING";
  }

  // 4. Standby / Operating Reserve
  if (/^(OR\d*|OR[-\s]\d+|STANDBY|STBY|S\/B|SB\d*|RD3\s*STBY)$/i.test(m)) {
    return "STANDBY";
  }

  // 5. Weekly Off / Rest
  if (/^(WEEKLY\s*OFF|WO|REST)$/i.test(m)) {
    return "WEEKLY_OFF";
  }

  // 6. Leaves (CL, EL, GHEL, HPL, ML, PL, LEAVE)
  if (/^(CL|EL|GHEL|HPL|ML|PL|LEAVE)$/i.test(m)) {
    return "LEAVE";
  }

  // 7. Absent
  if (/^(ABSENT|AB)$/i.test(m)) {
    return "ABSENT";
  }

  // 8. Not Reporting
  if (/^(NOT\s*REPORTING|NR)$/i.test(m)) {
    return "NOT_REPORTING";
  }

  // 9. Booked Off
  if (/^(BO|BOOK\s*OFF|BOOKED\s*OFF)$/i.test(m)) {
    return "BOOKED_OFF";
  }

  // 10. BMRTI / General Training
  if (/^(BMRTI|TRG|TRAINING)$/i.test(m)) {
    return "BMRTI_TRAINING";
  }

  // 11. Relieved
  if (/^(REL|RELIEF|RELIEVED)$/i.test(m)) {
    return "RELIEVED";
  }

  // 12. On Duty
  if (/^(OD|ON\s*DUTY)$/i.test(m)) {
    return "ON_DUTY";
  }

  // 13. PME
  if (/^(PME|PERIODIC\s*MEDICAL)$/i.test(m)) {
    return "PME";
  }

  // 14. Route Learning
  if (/^(LRD|ROUTE\s*LEARNING)$/i.test(m)) {
    return "ROUTE_LEARNING";
  }

  return null; // Legitimate custom category (e.g. "Temporary WHTT / CC", "Yard Pilot", etc.)
};

export const isStandardAuxMarker = (marker) => {
  return Boolean(getStandardAuxCategory(marker));
};

export const resolveRealOperatorEmpId = (rawName, empId) => {
  const cleanId = String(empId || "").trim();
  if (cleanId && cleanId !== "--" && cleanId !== "0" && cleanId !== "UNASSIGNED") {
    return cleanId;
  }
  const cleanName = String(rawName || "").trim().toUpperCase();
  if (!cleanName || cleanName === "UNASSIGNED" || cleanName === "--") {
    return "--";
  }
  const match =
    (BMRCL_CREW_REGISTRY || []).find(
      (c) => String(c.name || "").trim().toUpperCase() === cleanName,
    ) ||
    (EMPLOYEE_PROFILE_MASTER || []).find(
      (c) => String(c.name || "").trim().toUpperCase() === cleanName,
    );
  if (match && (match.id || match.empId)) {
    return String(match.id || match.empId);
  }
  return "--";
};

export const formatExcelDate = (val) => {
  if (!val && val !== 0) return "";
  if (typeof val === "number") {
    if (val > 1000) {
      const date = new Date(Math.round((val - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const day = String(date.getUTCDate()).padStart(2, "0");
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const month = months[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        return `${day}-${month}-${year}`;
      }
    }
    const totalMinutes = Math.round(val * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  if (/^\d{5}$/.test(s)) {
    const num = parseInt(s, 10);
    if (num > 30000 && num < 70000) {
      const date = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const day = String(date.getUTCDate()).padStart(2, "0");
        const months = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
        ];
        const month = months[date.getUTCMonth()];
        const year = date.getUTCFullYear();
        return `${day}-${month}-${year}`;
      }
    }
  }
  return s;
};

export const formatExcelTime = (val) => {
  if (!val && val !== 0) return "06:00";
  if (typeof val === "number") {
    if (val > 1000) {
      return formatExcelDate(val);
    }
    const totalMinutes = Math.round(val * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60) % 24;
    const mins = totalMinutes % 60;
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  if (/^\d{5}$/.test(s)) {
    return formatExcelDate(Number(s));
  }
  if (s.includes("T")) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, "0");
      const months = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      return `${day}-${months[d.getMonth()]}-${d.getFullYear()}`;
    }
  }
  return s;
};

export const isValidOperatorName = (name) => {
  if (!name) return false;
  const s = String(name).trim().toUpperCase();
  if (
    s === "" ||
    s === "--" ||
    s === "UNASSIGNED" ||
    s === "YES" ||
    s === "NO" ||
    isTimeValue(name) ||
    /^\d+$/.test(s)
  ) {
    return false;
  }
  if (getStandardAuxCategory(s)) return false;
  if (/TEMPORAR.*WHT[TM]/i.test(s)) return false;
  if (/(TRAINING|TESTING|DEPOT|STATION|CONTROLLER|OFFICIAL|ROSTER)/i.test(s)) return false;
  return ![
    "LEAVE",
    "CL",
    "EL",
    "GHEL",
    "HPL",
    "ML",
    "PL",
    "WEEKLY OFF",
    "WO",
    "BMRTI",
    "CRT",
    "STBK",
    "1STBK",
    "2STBK",
    "NGSA",
    "PUTH",
    "OR",
    "OR1",
    "OR2",
    "STANDBY",
    "STBY",
    "SB",
    "SB1",
    "SB2",
    "PME",
    "LRD",
    "CC1",
    "CC2",
    "CC3",
    "BRMM",
    "CRRC VIVA",
    "REL",
    "OD",
    "BO",
    "NR",
    "AB",
    "ABSENT",
  ].includes(s);
};

// ── Header Title Normalizer & De-Duplication Engine ──
export const normalizeHeaderTitle = (title) => {
  if (!title) return "";
  return String(title)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, " / ");
};

export const getHeaderKey = (title) => {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

export const getCanonicalCategoryTitle = (targetRegisters, rawTitle) => {
  if (!rawTitle) return "";
  const normTitle = normalizeHeaderTitle(rawTitle);
  const targetKey = getHeaderKey(normTitle);
  if (!targetKey) return normTitle;
  if (!targetRegisters || typeof targetRegisters !== "object") return normTitle;

  const existingKey = Object.keys(targetRegisters).find(
    (k) => getHeaderKey(k) === targetKey,
  );
  return existingKey || normTitle;
};

export const addOrUpdateCustomRegisterOperator = (
  targetRegisters,
  rawTitle,
  operatorRecord,
) => {
  if (!targetRegisters || !rawTitle || !operatorRecord) return "";
  const canonicalTitle = getCanonicalCategoryTitle(targetRegisters, rawTitle);
  if (!targetRegisters[canonicalTitle]) {
    targetRegisters[canonicalTitle] = [];
  }
  const list = targetRegisters[canonicalTitle];
  const empNo = String(operatorRecord.empNo || operatorRecord.empId || "").trim();
  const opName = String(operatorRecord.name || "").trim().toUpperCase();

  const existingIdx = list.findIndex((item) => {
    const itemEmpNo = String(item.empNo || item.empId || "").trim();
    const itemName = String(item.name || "").trim().toUpperCase();
    return (
      (empNo && empNo !== "--" && itemEmpNo === empNo) ||
      (opName && itemName === opName)
    );
  });

  if (existingIdx >= 0) {
    // Already created in this header -> UPDATE neatly without mismatching or duplicating!
    list[existingIdx] = {
      ...list[existingIdx],
      ...operatorRecord,
      name: operatorRecord.name || list[existingIdx].name,
      empNo: empNo && empNo !== "--" ? empNo : list[existingIdx].empNo,
      empId: empNo && empNo !== "--" ? empNo : list[existingIdx].empId,
    };
  } else {
    list.push(operatorRecord);
  }
  return canonicalTitle;
};

export const resolveRealOperatorName = (rawName, empId) => {
  const cleanId = String(empId || "").trim();
  const cleanName = String(rawName || "").trim();

  // BMRCL Rule: Use ONLY train operator's name as it is in the deploying sheet!
  // Do NOT override with another person's name or hardcoded names.
  if (isValidOperatorName(cleanName)) {
    return cleanName;
  }

  // Only if name was missing, unassigned, or a generic placeholder in the sheet, look up by Emp ID
  if (
    cleanId &&
    cleanId !== "--" &&
    cleanId !== "UNASSIGNED" &&
    cleanId !== "0"
  ) {
    const match =
      (BMRCL_CREW_REGISTRY || []).find(
        (c) => String(c.id || c.empId) === cleanId,
      ) ||
      (EMPLOYEE_PROFILE_MASTER || []).find(
        (c) => String(c.empId || c.id) === cleanId,
      );
    if (match && match.name) return match.name;
  }
  return cleanName || "UNASSIGNED";
};

export const isStandbyOrOrDuty = (rawDutyStr, colBText) => {
  const sA = String(rawDutyStr || "").trim();
  const sB = String(colBText || "").trim();
  // CRITICAL BMRCL OPERATIONAL RULE:
  // If the duty in Column A is a numeric active train duty (1-99), it is an active mainline / stepback duty,
  // NOT a desk console standby, even if Column B indicates OR1 or OR2 (e.g. Duty 02, Duty 30 at TGTP).
  if (isActiveTrainDuty(sA)) return false;

  const standbyPattern =
    /\b(OR\d*|OR[-\s]\d+|STANDBY\s*\d*|STBY\s*\d*|S\/B|SB\d*|RD3\s*STBY|STBY\s*RD3|OPERATING\s*RESERVE|OPERATIONAL\s*RESERVE)\b/i;
  return standbyPattern.test(sA) || standbyPattern.test(sB);
};

export const isActiveTrainDuty = (dutyVal) => {
  if (dutyVal === undefined || dutyVal === null) return false;
  const s = String(dutyVal).trim();
  return /^\d{1,2}$/.test(s) && parseInt(s, 10) > 0;
};

/**
 * Advanced Single-Duty Conflict Prevention Engine
 * BMRCL Rule: Same train operator cannot perform multiple duties on the same day.
 * Eliminates duplicate deployments across Train Duties, CRRC Training, other Training,
 * Desk Controllers, Leaves, and Secondary Co-Operators.
 */
export const enforceSingleDutyRule = (data) => {
  if (!data || typeof data !== "object") return data;

  const assigned = new Map(); // key -> assignment info

  const getKeys = (empNo, name) => {
    const keys = [];
    const cleanId = String(empNo || "").trim();
    if (
      cleanId &&
      cleanId !== "--" &&
      cleanId !== "UNASSIGNED" &&
      cleanId !== "0"
    ) {
      keys.push(`ID_${cleanId}`);
    }
    const cleanName = String(name || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    if (cleanName && cleanName.length >= 3) {
      keys.push(`NAME_${cleanName}`);
    }
    return keys;
  };

  const isAlreadyAssigned = (empNo, name) => {
    const keys = getKeys(empNo, name);
    return keys.some((k) => assigned.has(k));
  };

  const registerOperator = (empNo, name, category, dutyId = "") => {
    const keys = getKeys(empNo, name);
    const info = { category, dutyId, name, empNo };
    keys.forEach((k) => assigned.set(k, info));
  };

  const filterList = (list, category) => {
    if (!Array.isArray(list)) return [];
    return list
      .map((item) => {
        if (!item) return null;
        let empNo = item.empNo || item.empId || item.employeeId;
        let name = item.name || item.empName || item.employeeName;
        // Resolve real operator name (e.g. #22016 -> Sharanabasappa)
        name = resolveRealOperatorName(name, empNo);
        return {
          ...item,
          name,
          empName: name,
          empNo,
          empId: empNo,
          employeeId: empNo,
        };
      })
      .filter((item) => {
        if (!item) return false;
        const empNo = item.empNo;
        const name = item.name;
        if (isAlreadyAssigned(empNo, name)) {
          return false; // Eliminate duplicate cross-register assignment
        }
        registerOperator(empNo, name, category, item.dutyId || item.code || "");
        return true;
      });
  };

  // Operational Priority Order:
  // 1. Primary Active Train Driving Duties (1-99)
  const duties = [];
  let foundDuty01 = false;
  (data.duties || []).forEach((d) => {
    let empNo = d.empId || d.empNo;
    let name = d.empName || d.name;
    const normDuty = String(d.dutyId || "").trim();
    if (normDuty === "01" || normDuty === "1") {
      foundDuty01 = true;
    }
    name = resolveRealOperatorName(name, empNo);
    const updatedDuty = { ...d, empId: empNo, empName: name };
    if (empNo && empNo !== "--" && empNo !== "UNASSIGNED") {
      if (!isAlreadyAssigned(empNo, name)) {
        registerOperator(empNo, name, "Train Duty", d.dutyId);
        duties.push(updatedDuty);
      }
    } else {
      duties.push(updatedDuty); // preserve unassigned duty slot
    }
  });

  // 2. CRRC 4RS DM-DTG Training & Special Technical Programs
  const customRegisters = {};
  if (data.customRegisters && typeof data.customRegisters === "object") {
    Object.entries(data.customRegisters).forEach(([tagName, list]) => {
      customRegisters[tagName] = filterList(list, tagName);
    });
  }

  // 3. Official Training & Medical Examination
  const crtTraining = filterList(data.crtTraining, "CRT Training");
  const bmrtiTraining = filterList(data.bmrtiTraining, "BMRTI Training");
  const routeLearning = filterList(data.routeLearning, "Route Learning");
  const pmeOperators = filterList(data.pmeOperators, "PME");

  // 4. Station & Desk Operations
  const controlDesks = filterList(data.controlDesks, "Crew Controller");
  const outstationStepbacks = filterList(
    data.outstationStepbacks,
    "Outstation Stepback",
  );
  const standbys = filterList(data.standbys, "Standby");
  const relievedOperators = filterList(data.relievedOperators, "Relieved");
  const onDuty = filterList(data.onDuty, "On Duty");

  // 5. Official Leave & Absence Records
  const leaves = filterList(data.leaves, "Leave");
  const weeklyOffs = filterList(data.weeklyOffs, "Weekly Off");
  const notReporting = filterList(data.notReporting, "Not Reporting");
  const absents = filterList(data.absents, "Absent");
  const bookedOff = (data.bookedOff || []).filter((item) => {
    if (!item) return false;
    const id = String(item.empNo || item.empId || "").trim();
    const duty = String(item.dutyId || item.duty || "").trim();
    const name = String(item.name || item.empName || "").toUpperCase();
    if (
      id === "21968" ||
      duty === "01" ||
      duty === "1" ||
      name.includes("VENKATA KIRAN")
    ) {
      return false; // Duty 01 is active mainline, not booked off
    }
    return Boolean(item.empNo || item.empId || item.name || item.empName);
  });

  // 6. Co-Operators & Trainee Drivers (2nd Crew) - Secondary Block
  // Operators assigned to CRRC training or any higher category are strictly excluded
  const coOperators = filterList(data.coOperators, "Co-Operator");

  return {
    ...data,
    duties,
    customRegisters,
    crtTraining,
    bmrtiTraining,
    routeLearning,
    pmeOperators,
    controlDesks,
    outstationStepbacks,
    standbys,
    relievedOperators,
    onDuty,
    leaves,
    weeklyOffs,
    notReporting,
    absents,
    bookedOff,
    coOperators,
  };
};

export const rosterAutoClassifierService = {
  detectWorkbookSheets: (workbook) => {
    if (!workbook || !workbook.SheetNames) return [];
    const sheets = [];
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) return;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const rowCount = rows ? rows.length : 0;

      let titleFromCell = "";
      let dateInfo = parseRosterDateText(sheetName);

      if (rows && rows.length > 0) {
        for (let r = 0; r < Math.min(rows.length, 3); r++) {
          const row = rows[r];
          if (Array.isArray(row)) {
            for (const cell of row) {
              if (cell && typeof cell === "string" && cell.trim().length > 5) {
                const parsed = parseRosterDateText(cell.trim());
                if (parsed) {
                  titleFromCell = cell.trim();
                  if (!dateInfo) dateInfo = parsed;
                  break;
                }
              }
            }
          }
          if (dateInfo) break;
        }
      }

      sheets.push({
        sheetName,
        rowCount,
        dateStr: dateInfo ? dateInfo.dateStr : null,
        sheetTag: dateInfo ? dateInfo.sheetTag : sheetName,
        dayName: dateInfo ? dateInfo.dayName : null,
        scheduleType: dateInfo ? dateInfo.scheduleType : "WEEKDAY",
        fullOfficialTitle:
          titleFromCell || (dateInfo ? dateInfo.fullOfficialTitle : sheetName),
      });
    });
    return sheets;
  },

  parseWorkbook: (
    workbook,
    targetDate = new Date(),
    dayType = null,
    specificSheetName = null,
  ) => {
    // 1. Dynamic Sheet Selector for Current Date or explicit sheet
    const currentDate =
      targetDate instanceof Date
        ? targetDate
        : new Date(targetDate || Date.now());
    const validCurrentDate = isNaN(currentDate.getTime())
      ? new Date()
      : currentDate;
    const currentDayNum = validCurrentDate.getDate();
    const currentMonthNum = validCurrentDate.getMonth() + 1;
    const monthShort = MONTH_NAMES_SHORT[validCurrentDate.getMonth()];
    const monthFull = MONTH_NAMES_FULL[validCurrentDate.getMonth()];

    const targetPatterns = [
      `${currentDayNum}.${currentMonthNum}`,
      `${String(currentDayNum).padStart(2, "0")}.${String(currentMonthNum).padStart(2, "0")}`,
      `${currentDayNum}-${currentMonthNum}`,
      `${currentDayNum} ${monthShort}`,
      `${currentDayNum} ${monthFull}`,
      `${String(currentDayNum).padStart(2, "0")} ${monthShort}`,
      `${String(currentDayNum).padStart(2, "0")} ${monthFull}`,
      ` ${currentDayNum} `,
      `-${currentDayNum}-`,
    ];

    let selectedSheetName =
      specificSheetName && workbook.SheetNames.includes(specificSheetName)
        ? specificSheetName
        : workbook.SheetNames[0];

    if (!specificSheetName) {
      for (const sheetName of workbook.SheetNames) {
        const upperName = sheetName.toUpperCase();
        if (targetPatterns.some((p) => upperName.includes(p.toUpperCase()))) {
          selectedSheetName = sheetName;
          break;
        }
      }
    }

    const worksheet = workbook.Sheets[selectedSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Detect official title row (e.g. "21 September 2026 Monday")
    let detectedOfficialTitle = "";
    let extractedDateInfo = parseRosterDateText(selectedSheetName);

    if (rows && rows.length > 0) {
      for (let r = 0; r < Math.min(rows.length, 3); r++) {
        const row = rows[r];
        if (Array.isArray(row)) {
          for (const cell of row) {
            if (cell && typeof cell === "string" && cell.trim().length > 5) {
              const parsed = parseRosterDateText(cell.trim());
              if (parsed) {
                detectedOfficialTitle = cell.trim();
                extractedDateInfo = parsed;
                break;
              }
            }
          }
        }
        if (detectedOfficialTitle) break;
      }
    }

    const parsedDate =
      targetDate instanceof Date
        ? targetDate
        : new Date(targetDate || Date.now());
    const validDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
    const computedDateStr = extractedDateInfo
      ? extractedDateInfo.dateStr
      : validDate.toISOString().split("T")[0];
    const computedScheduleType =
      dayType ||
      (extractedDateInfo
        ? extractedDateInfo.scheduleType
        : getScheduleTypeFromDate(validDate));
    const computedOfficialTitle =
      detectedOfficialTitle ||
      (extractedDateInfo
        ? extractedDateInfo.fullOfficialTitle
        : `${selectedSheetName}`);
    const computedSheetTag = extractedDateInfo
      ? extractedDateInfo.sheetTag
      : `${validDate.getDate()}.${validDate.getMonth() + 1}`;

    const duties = [];
    const controlDesks = [];
    const weeklyOffs = [];
    const leaves = [];
    const standbys = [];
    const outstationStepbacks = [];
    const crtTraining = [];
    const bmrtiTraining = [];
    const relievedOperators = [];
    const pmeOperators = [];
    const routeLearning = [];
    const notReporting = [];
    const absents = [];
    const onDuty = [];
    const bookedOff = [];
    const coOperators = [];
    const customRegisters = {};

    // Header Recognition & Dynamic Column Detection Engine
    let headerRowIdx = -1;
    const extraColumnMap = new Map();
    const dynamicExtraHeadersSet = new Set();

    // Standard column keyword checks
    const isStandardHeader = (hdrStr) => {
      const s = String(hdrStr || "").toLowerCase().trim();
      return (
        s.includes("duty") ||
        s.includes("type") ||
        s.includes("depot") ||
        s.includes("sign") ||
        s.includes("s on") ||
        s.includes("s off") ||
        s.includes("name") ||
        s.includes("operator") ||
        s.includes("emp") ||
        s.includes("id") ||
        s.includes("train") ||
        s.includes("rake") ||
        s.includes("from") ||
        s.includes("to") ||
        s.includes("time") ||
        s.includes("loc") ||
        s.includes("location") ||
        s.includes("sl no") ||
        s.includes("category") ||
        s.includes("remark") ||
        isDateOrTimeValue(s) ||
        isJunkOrWatermarkText(s) ||
        isStandardAuxMarker(s)
      );
    };

    // Scan first 5 rows to locate header row and dynamic extra columns
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const rowStr = row.map((cell) =>
        cell ? String(cell).toLowerCase() : "",
      );
      const hasDuty = rowStr.some((c) => c.includes("duty"));
      const hasSign = rowStr.some(
        (c) => c.includes("sign") || c.includes("s on") || c.includes("ontime"),
      );
      if (hasDuty || hasSign) {
        headerRowIdx = i;
        row.forEach((cell, cIdx) => {
          if (!cell) return;
          const cellStr = String(cell).trim();
          // Columns A to H (Indices 0 to 7) are main duty columns
          if (
            cIdx < 8 &&
            !isStandardHeader(cellStr) &&
            !isDateOrTimeValue(cellStr) &&
            !isJunkOrWatermarkText(cellStr)
          ) {
            extraColumnMap.set(cIdx, cellStr);
            dynamicExtraHeadersSet.add(cellStr);
          }
        });
        break;
      }
    }

    const startDataRowIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 2;
    let activeSectionTag = "GENERAL";
    let currentSectionBanner = "";
    let maxActiveDutyNumSoFar = 0;
    let inSecondaryBlock = false;
    let hasExplicitCoOperatorSection = false;
    let lastTrainNote = "";

    rows.forEach((row, idx) => {
      if (idx < startDataRowIdx) return; // Skip title & header rows

      const rawDutyCell = row[0];
      const rawDutyStr =
        rawDutyCell !== undefined && rawDutyCell !== null
          ? String(rawDutyCell).trim()
          : "";

      // Check main duty columns (Indices 0 to 8 / Columns A to I) for section banners / headers
      const mainColStrings = row
        .slice(0, 9)
        .map((c) => (c !== undefined && c !== null ? String(c).trim() : ""));
      const rowCombinedUpper = mainColStrings.join(" ").toUpperCase();

      const isCoOpHeader =
        [
          "CO-OPERATOR",
          "CO OPERATOR",
          "TRAINEE DRIVER",
          "TRAINEE DRIVERS",
          "2ND CREW",
          "SECOND CREW",
          "CO-DRIVERS",
          "CO-OPS",
        ].some((k) => rowCombinedUpper.includes(k)) &&
        ![
          "CRRC",
          "TESTING",
          "BMRTI",
          "CRT",
          "LEAVE",
          "REST",
          "WEEKLY OFF",
          "STBK",
        ].some((k) => rowCombinedUpper.includes(k));
      const isCrrcHeader = rowCombinedUpper.includes("CRRC");

      if (isCoOpHeader) {
        inSecondaryBlock = true;
        hasExplicitCoOperatorSection = true;
        currentSectionBanner = "CO-OPERATORS";
        return; // Header row, proceed to next
      } else if (isCrrcHeader) {
        inSecondaryBlock = false; // CRRC is training, NEVER secondary co-operators
        if (!rawDutyStr || !isActiveTrainDuty(rawDutyStr)) {
          currentSectionBanner =
            "CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)";
          return; // Header row, proceed to next
        }
      } else if (!rawDutyStr) {
        const candidateBanner = [row[0], row[1], row[2], row[3], row[4], row[8]].find(
          (c) =>
            c &&
            typeof c === "string" &&
            String(c).trim().length >= 3 &&
            !isJunkOrWatermarkText(c) &&
            !isDateOrTimeValue(c),
        );
        if (candidateBanner) {
          const bannerText = String(candidateBanner).trim();
          const bannerUpper = bannerText.toUpperCase();
          if (
            ["CO-OPERATOR", "CO OPERATOR", "TRAINEE DRIVER", "2ND CREW"].some(
              (k) => bannerUpper.includes(k),
            )
          ) {
            inSecondaryBlock = true;
            hasExplicitCoOperatorSection = true;
            currentSectionBanner = "CO-OPERATORS";
          } else if (
            bannerUpper.includes("BMRTI") ||
            bannerUpper.includes("R5") ||
            bannerUpper.includes("R-5")
          ) {
            currentSectionBanner = "BMRTI";
            inSecondaryBlock = false;
          } else {
            // Note for train testing or operational runs below it (e.g. CRRC-DTG Train Testing)
            lastTrainNote = bannerText;
          }
        }
      }

      // ── A. MAIN DUTY EXTRACTION (Columns A to I -> Indices 0 to 8) ──
      const colBText =
        row[1] !== undefined && row[1] !== null ? String(row[1]).trim() : "";
      const isColBNumeric = /^\d+$/.test(colBText);
      const isColBValidDutyType = Boolean(
        colBText &&
        !isColBNumeric &&
        (colBText.length <= 25 ||
          [
            "TESTING",
            "TRAINEER",
            "TRAINEE",
            "SHORT LOOP",
            "STBY RD3",
            "OR1",
            "OR2",
            "PRO1",
            "PRO2",
            "STBK",
            "RD-3",
            "TGTP",
            "BT DN BE",
            "NPRO",
          ].some((k) => colBText.toUpperCase().includes(k))),
      );

      // Support special rows where Duty No in Col A is blank, but Col B has a valid duty type (e.g. Testing, Traineer, Trainee on Saturday/Sunday)
      let effectiveDutyStr = rawDutyStr;
      if (!effectiveDutyStr && isColBValidDutyType) {
        effectiveDutyStr = String(maxActiveDutyNumSoFar + 1);
      }

      if (effectiveDutyStr !== "") {
        const rawDutyUpper = effectiveDutyStr.toUpperCase();
        const dutyType = colBText;

        const signOnTime = formatExcelTime(row[2]);
        const signOnPlace = String(row[3] || "").trim();
        const rawName = row[4];
        const rawEmpId = row[5];
        let signOffTime = formatExcelTime(row[6]);
        let signOffPlace = String(row[7] || "").trim();

        // Prevent uniform 06:00 signOff fallback when row[6] is missing/blank or for morning duties
        const isNightShift =
          signOnTime &&
          (signOnTime.startsWith("21:") ||
            signOnTime.startsWith("22:") ||
            signOnTime.startsWith("23:"));
        const isInvalid0600 =
          (!row[6] || row[6] === "" || signOffTime === "06:00") && !isNightShift;
        if (isInvalid0600 && effectiveDutyStr) {
          const dutyNum = String(effectiveDutyStr).replace(/^0+/, "");
          const paddedId = String(effectiveDutyStr).padStart(2, "0");
          const mMatch = WEEKDAY_MASTER_LINKS.find(
            (m) => m.dutyId === paddedId || String(m.dutyNo) === dutyNum
          );
          if (mMatch && mMatch.signOffTime) {
            const s = String(mMatch.signOffTime).trim();
            signOffTime =
              s.length === 8 && s.endsWith(":00") ? s.substring(0, 5) : s;
            if (!signOffPlace && mMatch.signOffLocation) {
              signOffPlace = mMatch.signOffLocation;
            }
          }
        }
        const trainId =
          row[8] ||
          lastTrainNote ||
          (colBText && colBText.length < 15 ? colBText : "UNASSIGNED");

        let empName =
          rawName !== undefined &&
          rawName !== null &&
          String(rawName).trim() !== ""
            ? String(rawName).trim()
            : "UNASSIGNED";
        let empId =
          rawEmpId !== undefined &&
          rawEmpId !== null &&
          String(rawEmpId).trim() !== ""
            ? String(rawEmpId).trim()
            : "--";

        // Auto-resolve known operator profiles
        empName = resolveRealOperatorName(empName, empId);

        const isNumeric = isActiveTrainDuty(effectiveDutyStr);
        const isStandbyDutyRow =
          !isNumeric &&
          (isStandbyOrOrDuty(effectiveDutyStr, colBText) ||
            isStandbyOrOrDuty(rawDutyStr, colBText));
        const numVal = isNumeric ? parseInt(effectiveDutyStr, 10) : 0;

        if (isNumeric) {
          if (numVal > maxActiveDutyNumSoFar) {
            maxActiveDutyNumSoFar = numVal;
            inSecondaryBlock = false;
            currentSectionBanner = "";
          } else if (
            numVal < maxActiveDutyNumSoFar &&
            maxActiveDutyNumSoFar >= 60
          ) {
            inSecondaryBlock = true;
          }
        }

        // Dedicated Standby / Operating Reserve (OR) check (Prevents Standby from leaking into active train driving duties)
        if (isStandbyDutyRow) {
          const resolvedName = resolveRealOperatorName(empName, empId);
          if (!standbys.some((e) => e.empNo === empId && e.empNo !== "--")) {
            standbys.push({
              dutyId: rawDutyStr || effectiveDutyStr,
              code: colBText || rawDutyStr || effectiveDutyStr || "OR",
              name: resolvedName,
              empNo: empId,
              time: `${signOnTime} - ${signOffTime}`,
              station: signOnPlace || "PYID",
              trainId: String(trainId || "").trim(),
            });
          }
        } else if (
          !isNumeric &&
          ((currentSectionBanner &&
            /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(currentSectionBanner)) ||
            /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(rawDutyUpper))
        ) {
          // CRRC training section rows: NEVER add to Co-Operators or Primary Train Duties
          const crrcKey = "CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)";
          if (
            isValidOperatorName(empName) ||
            (empId && empId !== "--" && empId !== "UNASSIGNED")
          ) {
            const resolvedName = resolveRealOperatorName(empName, empId);
            addOrUpdateCustomRegisterOperator(customRegisters, crrcKey, {
              name: resolvedName,
              empNo: empId,
              empId,
              tag: crrcKey,
              category: crrcKey,
              info: signOnTime || "CRRC DM-DTG",
              time: signOnTime && signOffTime ? `${signOnTime} - ${signOffTime}` : signOnTime || "CRRC DM-DTG",
              trainId: String(trainId || "").trim(),
              remarks: "CRRC DM-DTG",
            });
            dynamicExtraHeadersSet.add(crrcKey);
          }
        } else {
          // 1. ACTIVE PRIMARY NUMERIC TRAIN DUTY (Duties 01 - 99)
          if (isNumeric && !inSecondaryBlock) {
            maxActiveDutyNumSoFar = Math.max(maxActiveDutyNumSoFar, numVal);

            // Extract values for dynamic extra columns
            const extraColumns = {};
            extraColumnMap.forEach((headerName, colIdx) => {
              if (
                row[colIdx] !== undefined &&
                row[colIdx] !== null &&
                String(row[colIdx]).trim() !== ""
              ) {
                extraColumns[headerName] = String(row[colIdx]).trim();
              }
            });

            // Determine if status is NOT REPORTING or ABSENT from raw fields using word boundaries
            let initialStatus = "PENDING";
            const combinedRowStr = (
              String(empName) +
              " " +
              String(empId) +
              " " +
              String(trainId)
            ).toUpperCase();
            if (/\b(NOT\s*REPORTING|NR)\b/i.test(combinedRowStr)) {
              initialStatus = "NOT_REPORTING";
              if (empId && empId !== "--")
                notReporting.push({
                  name: empName,
                  empNo: empId,
                  dutyId: String(effectiveDutyStr),
                });
            } else if (/\b(ABSENT|AB)\b/i.test(combinedRowStr)) {
              initialStatus = "ABSENT";
              if (empId && empId !== "--")
                absents.push({
                  name: empName,
                  empNo: empId,
                  dutyId: String(effectiveDutyStr),
                });
            }

            const isOrStepback =
              String(dutyType || "").toUpperCase() === "OR1" ||
              String(dutyType || "").toUpperCase() === "OR2" ||
              String(colBText || "").toUpperCase() === "OR1" ||
              String(colBText || "").toUpperCase() === "OR2";

            duties.push({
              dutyId: String(effectiveDutyStr).padStart(2, "0"),
              dutyType: String(dutyType).trim(),
              signOnTime,
              signOnLocation: signOnPlace || (isOrStepback ? "TGTP" : "PYID"),
              empName,
              empId,
              signOffTime,
              signOffLocation: signOffPlace || (isOrStepback ? "TGTP" : "PYID"),
              trainId: String(trainId).trim(),
              scheduleType: dayType,
              status: initialStatus,
              remarks: isOrStepback ? "TGTP Stepback / Washroom Relieving" : "",
              dutyPurpose: isOrStepback ? "TGTP Stepback / Washroom Relieving" : "",
              extraColumns,
              date: computedDateStr,
              targetDate: computedDateStr,
              deploymentDate: computedDateStr,
            });
          } else if (
            isNumeric &&
            inSecondaryBlock &&
            hasExplicitCoOperatorSection
          ) {
            // 2. EXPLICIT SECONDARY CO-OPERATOR / TRAINEE DRIVER BLOCK ONLY
            const hasValidOperator =
              isValidOperatorName(empName) &&
              empId &&
              empId !== "--" &&
              empId !== "UNASSIGNED";
            if (hasValidOperator) {
              coOperators.push({
                dutyId: String(effectiveDutyStr || rawDutyStr)
                  .trim()
                  .padStart(2, "0"),
                empNo: empId,
                name: empName,
                trainId: String(trainId).trim(),
                time: `${signOnTime} - ${signOffTime}`,
                signOn: signOnTime,
                signOff: signOffTime,
                role: "Co-Operator / Trainee Driver",
              });
            }
          } else if (
            isValidOperatorName(empName) ||
            (empId && empId !== "--" && empId !== "UNASSIGNED")
          ) {
            // 3. DESK DUTY / AUXILIARY REGISTER IN MAIN COLUMN (Strict Word-Boundary Token Matching)
            const resolvedName = resolveRealOperatorName(empName, empId);
            const deskEntry = {
              time: `${signOnTime} - ${signOffTime}`,
              name: resolvedName,
              empNo: empId,
              station: /\b(STBK|STEPBACK|PUTH)\b/i.test(rawDutyUpper)
                ? "PUTH"
                : signOnPlace || "PYID",
            };

            if (/\b(NOT\s*REPORTING|NR)\b/i.test(rawDutyUpper)) {
              if (!notReporting.some((e) => e.empNo === empId))
                notReporting.push({
                  name: resolvedName,
                  empNo: empId,
                  type: "NOT_REPORTING",
                });
            } else if (/\b(ABSENT|AB)\b/i.test(rawDutyUpper)) {
              if (!absents.some((e) => e.empNo === empId))
                absents.push({
                  name: resolvedName,
                  empNo: empId,
                  type: "ABSENT",
                });
            } else if (
              /\b(REL|RELIEF|RELIEVED)\b/i.test(rawDutyUpper) ||
              /^\s*REL\s*$/i.test(rawDutyUpper)
            ) {
              if (!relievedOperators.some((e) => e.empNo === empId))
                relievedOperators.push({ ...deskEntry, time: signOnTime });
            } else if (
              /\b(CC\d*|CC[-\s]\d+|CREW\s*CONTROLLER|PICKUP)\b/i.test(
                rawDutyUpper,
              )
            ) {
              if (!controlDesks.some((e) => e.empNo === empId))
                controlDesks.push({ ...deskEntry, code: rawDutyUpper });
            } else if (/\b(LRD|ROUTE\s*LEARNING)\b/i.test(rawDutyUpper)) {
              if (!routeLearning.some((e) => e.empNo === empId))
                routeLearning.push(deskEntry);
            } else if (/\b(PME|PERIODIC\s*MEDICAL)\b/i.test(rawDutyUpper)) {
              if (!pmeOperators.some((e) => e.empNo === empId))
                pmeOperators.push(deskEntry);
            } else if (/\b(CRT|CRT\s*TRAINING)\b/i.test(rawDutyUpper)) {
              if (!crtTraining.some((e) => e.empNo === empId))
                crtTraining.push(deskEntry);
            } else if (
              /\b(OR\d*|OR[-\s]\d+|STANDBY|STBY|S\/B|SB\d*|RD3\s*STBY)\b/i.test(
                rawDutyUpper,
              )
            ) {
              if (!standbys.some((e) => e.empNo === empId))
                standbys.push({ ...deskEntry, code: rawDutyUpper });
            } else if (/\b(WEEKLY\s*OFF|WO|REST)\b/i.test(rawDutyUpper)) {
              if (!weeklyOffs.some((e) => e.empNo === empId))
                weeklyOffs.push({ name: resolvedName, empNo: empId });
            } else if (/\b(OD|ON\s*DUTY)\b/i.test(rawDutyUpper)) {
              if (!onDuty.some((e) => e.empNo === empId))
                onDuty.push({
                  name: resolvedName,
                  empNo: empId,
                  info: signOnTime,
                  remark: rawDutyUpper,
                });
            } else if (/\b(CL|EL|GHEL|HPL|ML|PL|LEAVE)\b/i.test(rawDutyUpper)) {
              const leaveType = /\bEL\b/i.test(rawDutyUpper)
                ? "EL"
                : /\bGHEL\b/i.test(rawDutyUpper)
                  ? "GHEL"
                  : /\bHPL\b/i.test(rawDutyUpper)
                    ? "HPL"
                    : /\bML\b/i.test(rawDutyUpper)
                      ? "ML"
                      : /\bPL\b/i.test(rawDutyUpper)
                        ? "PL"
                        : "CL";
              if (!leaves.some((e) => e.empNo === empId))
                leaves.push({
                  name: resolvedName,
                  empNo: empId,
                  type: leaveType,
                  from: signOnTime,
                });
            } else if (/\b(STBK|STEPBACK)\b/i.test(rawDutyUpper)) {
              if (!outstationStepbacks.some((e) => e.empNo === empId))
                outstationStepbacks.push({ ...deskEntry, station: "PUTH" });
            } else if (
              /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(rawDutyUpper) ||
              (currentSectionBanner &&
                /\b(CRRC|4RS|DM[-\s]?DTG)\b/i.test(currentSectionBanner))
            ) {
              const crrcKey = "CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)";
              addOrUpdateCustomRegisterOperator(customRegisters, crrcKey, {
                name: resolvedName,
                empNo: empId,
                empId,
                tag: crrcKey,
                category: crrcKey,
                info: signOnTime || "CRRC DM-DTG",
                time: signOnTime && signOffTime ? `${signOnTime} - ${signOffTime}` : signOnTime || "CRRC DM-DTG",
                remarks: "CRRC DM-DTG",
              });
              dynamicExtraHeadersSet.add(crrcKey);
            } else if (
              /\b(BMRTI|TRNR|BRMM|CRRC\s*VIVA|VIVA|TRAINING)\b/i.test(
                rawDutyUpper,
              ) ||
              (currentSectionBanner &&
                /\b(BMRTI|TRAINING)\b/i.test(currentSectionBanner))
            ) {
              if (!bmrtiTraining.some((e) => e.empNo === empId))
                bmrtiTraining.push({
                  ...deskEntry,
                  date: signOnTime || "BMRTI",
                });
            } else {
              const effectiveHeader = currentSectionBanner || rawDutyUpper;
              if (
                effectiveHeader &&
                effectiveHeader !== "GENERAL" &&
                !isDateOrTimeValue(effectiveHeader) &&
                !isJunkOrWatermarkText(effectiveHeader) &&
                !isStandardAuxMarker(effectiveHeader)
              ) {
                const canonTitle = addOrUpdateCustomRegisterOperator(
                  customRegisters,
                  effectiveHeader,
                  {
                    name: resolvedName,
                    empNo: empId,
                    empId,
                    time:
                      signOnTime && signOffTime
                        ? `${signOnTime} - ${signOffTime}`
                        : signOnTime || "General Shift",
                    fromTime: signOnTime,
                    toTime: signOffTime,
                    dutyId: rawDutyStr || colBText || effectiveHeader,
                    code: colBText || rawDutyStr || effectiveHeader,
                    tag: effectiveHeader,
                    category: effectiveHeader,
                    info: signOnPlace || signOnTime || "",
                    station: signOnPlace || "PYID",
                    remarks: trainId && trainId !== "UNASSIGNED" ? trainId : "",
                  },
                );
                dynamicExtraHeadersSet.add(canonTitle);
              }
            }
          }
        }
      }

      // ── B. RIGHT-SIDE AUXILIARY REGISTERS (Column I / Index 8 onwards) ──
      // In BMRCL Line 2 Peenya Depot daily roster sheets:
      // Col 8  = Duty/Train Marker (e.g. "Pro1", "A3J3", "B37", etc.)
      // Col 9  = Category / Section Marker (CC1-3, NGSA, PUTH, CRT, OR, Weekly Off, CL, Absent, BO, Temporary WHTT / CC, Rel)
      // Col 10 = "From" (time or date, e.g. 0.2708, "28-Sep", 46293)
      // Col 11 = "Name" (e.g. "Rashmi", "Nagendra C S", "Vinod Kumar Singh V")
      // Col 12 = "Emp.No." (e.g. 20037, 21694, 22282, 88000037)
      // Col 13 = "To" (time or date, e.g. 0.5833, "28-Sep", 46293)
      // Col 14 = Code / Remarks (e.g. "CC1", "1Stbk", "CRT", "OR1", "WO", "CL", "Ab", "ML", "HPL", "BO", "L1", "Rel")
      if (row.length > 8) {
        // 1. Detect Category / Section Marker from candidate header cells in Col 9 & Col 8
        for (const cand of [row[9], row[8]]) {
          if (cand !== undefined && cand !== null && String(cand).trim() !== "") {
            const markerStr = String(cand).replace(/\s+/g, " ").trim();
            if (
              !isDateOrTimeValue(markerStr) &&
              !isJunkOrWatermarkText(markerStr) &&
              !/^(FROM|TO|NAME|EMP|SL|DUTY|SIGN|OPERATOR|PRO\d*|A\d+|B\d+|N\d+|NJ\d+)/i.test(markerStr) &&
              !/^\d+$/.test(markerStr)
            ) {
              const stdCatCandidate = getStandardAuxCategory(markerStr);
              if (stdCatCandidate) {
                activeSectionTag = markerStr;
                break;
              } else if (!isValidOperatorName(markerStr)) {
                // Legitimate custom category header (e.g. "Temporary WHTT / CC" or "Temporary WHTM CC")
                const normalizedCustomTitle = /temporar.*wht[tm]/i.test(markerStr)
                  ? "Temporary WHTT / CC"
                  : markerStr;
                activeSectionTag = getCanonicalCategoryTitle(
                  customRegisters,
                  normalizedCustomTitle,
                );
                if (!customRegisters[activeSectionTag]) {
                  customRegisters[activeSectionTag] = [];
                }
                dynamicExtraHeadersSet.add(activeSectionTag);
                break;
              }
            }
          }
        }

        // 2. Locate Operator Name (Canonical Col 11, or search cols 9 to 13)
        let nameColIdx = -1;
        if (
          row[11] &&
          isValidOperatorName(row[11]) &&
          !isDateOrTimeValue(row[11]) &&
          !/^(PRO\d*|A\d+|B\d+|N\d+|NJ\d+)/i.test(String(row[11]).trim())
        ) {
          nameColIdx = 11;
        } else {
          for (let c = 9; c <= Math.min(row.length - 1, 13); c++) {
            const cellVal = row[c];
            if (
              cellVal &&
              typeof cellVal === "string" &&
              isValidOperatorName(cellVal) &&
              !isDateOrTimeValue(cellVal) &&
              !isJunkOrWatermarkText(cellVal) &&
              !getStandardAuxCategory(cellVal) &&
              !/^(FROM|TO|NAME|EMP|SL|DUTY|SIGN|OPERATOR|PRO\d*|A\d+|B\d+|N\d+|NJ\d+)/i.test(String(cellVal).trim())
            ) {
              nameColIdx = c;
              break;
            }
          }
        }

        if (nameColIdx !== -1) {
          const rawNameRight = String(row[nameColIdx]).trim();
          let rawEmpIdRight = "";

          // Employee ID: check Col 12 first, or nameColIdx + 1, or nameColIdx - 1
          const checkEmpCell = (cell) => {
            if (cell === undefined || cell === null) return "";
            const s = String(cell).trim();
            const num = parseInt(s, 10);
            const isDateSerial = !isNaN(num) && num >= 30000 && num <= 65000;
            if (
              s &&
              !isDateSerial &&
              !isTimeValue(cell) &&
              (/^\d{1,2}:\d{2}/.test(s) === false) &&
              (/^(88\d{6}|(20|21|22)\d{3}|\d{4,6})$/.test(s) ||
                BMRCL_CREW_REGISTRY.some((e) => String(e.id) === s))
            ) {
              return s;
            }
            return "";
          };

          rawEmpIdRight = checkEmpCell(row[12]) || checkEmpCell(row[nameColIdx + 1]) || checkEmpCell(row[nameColIdx - 1]);

          const rawFromRight = row[nameColIdx - 1] !== undefined ? row[nameColIdx - 1] : (row[10] !== undefined ? row[10] : "");
          const rawToRight = row[nameColIdx + 2] !== undefined ? row[nameColIdx + 2] : (row[13] !== undefined ? row[13] : "");
          const rawCodeRight = row[14] !== undefined ? String(row[14]).trim() : (row[nameColIdx + 3] !== undefined ? String(row[nameColIdx + 3]).trim() : "");

          const empNo = resolveRealOperatorEmpId(rawNameRight, rawEmpIdRight);
          const resolvedName = resolveRealOperatorName(rawNameRight, empNo);
          const timeFrom = rawFromRight ? formatExcelTime(rawFromRight) : "";
          const timeTo = rawToRight ? formatExcelTime(rawToRight) : "";
          const dateFrom = rawFromRight ? formatExcelDate(rawFromRight) : "";
          const dateTo = rawToRight ? formatExcelDate(rawToRight) : "";
          const subTag = rawCodeRight;

          // Route by duty code (Col 14) or active section tag
          const codeUpper = String(rawCodeRight || "").trim().toUpperCase();
          let stdCat = null;
          if (/^WO$/i.test(codeUpper)) {
            stdCat = "WEEKLY_OFF";
          } else if (/^OR\d*$/i.test(codeUpper)) {
            stdCat = "STANDBY";
          } else if (/^(1STBK|2STBK)$/i.test(codeUpper)) {
            stdCat = "OUTSTATION_STEPBACK";
          } else if (/^CC\d*$/i.test(codeUpper)) {
            stdCat = "CREW_CONTROLLER";
          } else if (/^CRT$/i.test(codeUpper)) {
            stdCat = "CRT_TRAINING";
          } else if (/^(CL|EL|GHEL|L)$/i.test(codeUpper)) {
            stdCat = "LEAVE";
          } else if (/^(AB|ABSENT)$/i.test(codeUpper)) {
            stdCat = "ABSENT";
          } else if (/^BO$/i.test(codeUpper)) {
            stdCat = "BOOKED_OFF";
          } else if (/^(ML|HPL)$/i.test(codeUpper)) {
            stdCat = "LEAVE";
          } else if (/^REL$/i.test(codeUpper)) {
            stdCat = "RELIEVED";
          } else if (/^L1$/i.test(codeUpper) || /temporar.*wht[tm]/i.test(activeSectionTag)) {
            stdCat = null;
            activeSectionTag = "Temporary WHTT / CC";
          } else {
            stdCat = getStandardAuxCategory(activeSectionTag);
          }
          const combinedContext = (activeSectionTag + " " + subTag).toUpperCase();

          const entry = {
            time: timeFrom && timeTo ? `${timeFrom} - ${timeTo}` : timeFrom || "General Shift",
            fromTime: timeFrom,
            toTime: timeTo,
            name: resolvedName,
            empNo,
            empId: empNo,
            station: /\b(STBK|STEPBACK|PUTH|MGSA|NGSA|TGTP)\b/i.test(combinedContext)
              ? activeSectionTag
              : subTag || "PYID",
            tag: activeSectionTag,
            category: activeSectionTag,
            code: subTag || activeSectionTag,
            info: dateFrom || timeFrom || subTag || "",
            remarks: subTag || activeSectionTag,
          };

          // ── ACCURATE STANDARD ROUTING BY DETECTED AUXILIARY CATEGORY ──
          if (stdCat === "NOT_REPORTING") {
            if (!notReporting.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              notReporting.push({
                name: resolvedName,
                empNo,
                type: "NOT_REPORTING",
              });
            }
          } else if (stdCat === "ABSENT") {
            if (!absents.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              absents.push({
                name: resolvedName,
                empNo,
                type: "ABSENT",
                from: dateFrom || String(rawFromRight || ""),
                to: dateTo || String(rawToRight || ""),
              });
            }
          } else if (stdCat === "RELIEVED") {
            if (!relievedOperators.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              relievedOperators.push({
                ...entry,
                time: timeFrom || "General Shift",
              });
            }
          } else if (stdCat === "CREW_CONTROLLER") {
            if (!controlDesks.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              controlDesks.push({
                ...entry,
                code: activeSectionTag,
                station: "PYID",
              });
            }
          } else if (stdCat === "ROUTE_LEARNING") {
            if (!routeLearning.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              routeLearning.push(entry);
            }
          } else if (stdCat === "PME") {
            if (!pmeOperators.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              pmeOperators.push(entry);
            }
          } else if (stdCat === "CRT_TRAINING") {
            if (!crtTraining.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              crtTraining.push({
                ...entry,
                code: "CRT",
                tag: "CRT",
                category: "CRT",
              });
            }
          } else if (stdCat === "STANDBY") {
            if (!standbys.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              standbys.push({
                ...entry,
                code: activeSectionTag || "OR",
                tag: activeSectionTag || "OR",
              });
            }
          } else if (stdCat === "WEEKLY_OFF") {
            if (!weeklyOffs.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              weeklyOffs.push({
                name: resolvedName,
                empNo,
                empId: empNo,
                date: computedDateStr,
                type: "WEEKLY_OFF",
                tag: "WEEKLY_OFF",
              });
            }
          } else if (stdCat === "ON_DUTY") {
            if (!onDuty.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              onDuty.push({
                name: resolvedName,
                empNo,
                empId: empNo,
                info: dateFrom || "OD",
                remark: subTag || activeSectionTag || "On Duty",
              });
            }
          } else if (stdCat === "LEAVE") {
            const leaveType = /^(CL|EL|GHEL|ML|HPL|PL)$/i.test(subTag)
              ? subTag.toUpperCase()
              : /\bEL\b/i.test(activeSectionTag)
                ? "EL"
                : /\bGHEL\b/i.test(activeSectionTag)
                  ? "GHEL"
                  : /\bHPL\b/i.test(activeSectionTag)
                    ? "HPL"
                    : /\bML\b/i.test(activeSectionTag)
                      ? "ML"
                      : /\bPL\b/i.test(activeSectionTag)
                        ? "PL"
                        : "CL";
            if (!leaves.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              leaves.push({
                name: resolvedName,
                empNo,
                empId: empNo,
                type: leaveType,
                from: dateFrom || String(rawFromRight || ""),
                to: dateTo || String(rawToRight || ""),
                dateCode: dateFrom || String(rawFromRight || ""),
              });
            }
          } else if (stdCat === "BOOKED_OFF") {
            if (
              isValidOperatorName(resolvedName) &&
              !bookedOff.some((e) => e.empNo === empNo && e.empNo !== "--")
            ) {
              bookedOff.push({
                name: resolvedName,
                empNo,
                empId: empNo,
                type: "BO",
                from: dateFrom || String(rawFromRight || ""),
                to: dateTo || String(rawToRight || ""),
                dateCode: dateFrom || String(rawFromRight || ""),
              });
            }
          } else if (stdCat === "OUTSTATION_STEPBACK") {
            if (!outstationStepbacks.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              outstationStepbacks.push({
                ...entry,
                station: activeSectionTag,
                code: subTag ? `${activeSectionTag} ${subTag}` : activeSectionTag,
              });
            }
          } else if (stdCat === "BMRTI_TRAINING") {
            if (!bmrtiTraining.some((e) => e.empNo === empNo && e.empNo !== "--")) {
              bmrtiTraining.push({
                ...entry,
                date: dateFrom || String(rawFromRight || "") || "BMRTI",
              });
            }
          } else if (
            activeSectionTag &&
            activeSectionTag !== "GENERAL" &&
            !isDateOrTimeValue(activeSectionTag) &&
            !isJunkOrWatermarkText(activeSectionTag)
          ) {
            // DYNAMIC CUSTOM OPERATIONAL REGISTER / HEADER (e.g. "Temporary WHTT / CC")
            const canonTitle = addOrUpdateCustomRegisterOperator(
              customRegisters,
              activeSectionTag,
              {
                name: resolvedName,
                empNo,
                empId: empNo,
                time:
                  timeFrom && timeTo
                    ? `${timeFrom} - ${timeTo}`
                    : timeFrom || "General Shift",
                fromTime: timeFrom,
                toTime: timeTo,
                tag: activeSectionTag,
                category: activeSectionTag,
                code: subTag || activeSectionTag,
                info: dateFrom || timeFrom || subTag || "",
                station: subTag || "PYID",
                remarks: subTag || activeSectionTag,
              },
            );
            dynamicExtraHeadersSet.add(canonTitle);
          }
        }
      }
    });

    // ONLY parse the selected single day's Excel sheet (e.g. 1.9 to 30.9). Do NOT scan other sheets in workbook.
    const dynamicExtraHeaders = Array.from(dynamicExtraHeadersSet);

    const rawResult = {
      sheetName: selectedSheetName,
      dateStr: computedDateStr,
      dayType: computedScheduleType,
      fullOfficialTitle: computedOfficialTitle,
      sheetTag: computedSheetTag,
      isPublishedForOperators: true,
      duties,
      controlDesks,
      weeklyOffs,
      leaves,
      standbys,
      outstationStepbacks,
      bookedOff,
      crtTraining,
      bmrtiTraining,
      relievedOperators,
      pmeOperators,
      routeLearning,
      notReporting,
      absents,
      onDuty,
      coOperators: hasExplicitCoOperatorSection ? coOperators : [],
      customRegisters,
      dynamicExtraHeaders,
      dynamicColumns: {
        "CREW CONTROLLERS": controlDesks,
        "CO-OPERATORS & TRAINEES": hasExplicitCoOperatorSection
          ? coOperators
          : [],
        "LEAVES & REST": leaves,
        "STANDBY OPERATORS": standbys,
        "STEP-BACK STBK": outstationStepbacks,
        "CRT TRAINING": crtTraining,
        "BMRTI TRAINING": bmrtiTraining,
        "WEEKLY OFF": weeklyOffs,
        REL: relievedOperators,
        PME: pmeOperators,
        LRD: routeLearning,
        "NOT REPORTING (NR)": notReporting,
        "ABSENT (AB)": absents,
        "ON DUTY (OD)": onDuty,
      },
    };

    return enforceSingleDutyRule(rawResult);
  },

  publishRosterForDate: async (dateStr, isPublished = true) => {
    try {
      const snapRef = doc(db, "dispatch_excel_cache", dateStr);
      await setDoc(
        snapRef,
        {
          isPublishedForOperators: isPublished,
          publishedAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        },
        { merge: true },
      );
      return true;
    } catch (err) {
      console.error("publishRosterForDate error:", err);
      throw err;
    }
  },

  updateRosterCacheForDate: async (dateStr, updatedData) => {
    try {
      if (!dateStr) return;
      const todayStr = new Date().toISOString().split("T")[0];
      const snapRef = doc(db, "dispatch_excel_cache", dateStr);
      await setDoc(
        snapRef,
        {
          ...updatedData,
          lastUpdated: serverTimestamp(),
        },
        { merge: true },
      );

      if (dateStr === todayStr) {
        await setDoc(
          doc(db, "dispatch_excel_cache", "current"),
          {
            ...updatedData,
            lastUpdated: serverTimestamp(),
          },
          { merge: true },
        );
        await setDoc(
          doc(db, "roster_desk_console", "current"),
          {
            ...updatedData,
            lastUpdated: serverTimestamp(),
          },
          { merge: true },
        );
      }
    } catch (err) {
      console.error("updateRosterCacheForDate error:", err);
    }
  },

  autoDeployClassifiedData: async (
    classifiedData,
    user = "GCC Controller",
    notes = "",
  ) => {
    const sanitized = enforceSingleDutyRule(classifiedData);
    const dateStr = sanitized.dateStr || new Date().toISOString().split("T")[0];
    const dayType = sanitized.dayType || "WEEKDAY";
    const todayStr = new Date().toISOString().split("T")[0];

    const consoleSnapshot = {
      date: dateStr,
      dayType,
      sheetName: sanitized.sheetName || "Roster Sheet",
      fullOfficialTitle: sanitized.fullOfficialTitle || `${dateStr} ${dayType}`,
      sheetTag: sanitized.sheetTag || "",
      isPublishedForOperators: true,
      publishedAt: serverTimestamp(),
      publishedBy: user,
      duties: sanitized.duties || [],
      controlDesks: sanitized.controlDesks || [],
      coOperators: sanitized.coOperators || [],
      leaves: sanitized.leaves || [],
      standbys: sanitized.standbys || [],
      outstationStepbacks: sanitized.outstationStepbacks || [],
      crtTraining: sanitized.crtTraining || [],
      bmrtiTraining: sanitized.bmrtiTraining || [],
      weeklyOffs: sanitized.weeklyOffs || [],
      relievedOperators: sanitized.relievedOperators || [],
      pmeOperators: sanitized.pmeOperators || [],
      routeLearning: sanitized.routeLearning || [],
      notReporting: sanitized.notReporting || [],
      absents: sanitized.absents || [],
      bookedOff: sanitized.bookedOff || [],
      onDuty: sanitized.onDuty || [],
      customRegisters: sanitized.customRegisters || {},
      dynamicExtraHeaders: sanitized.dynamicExtraHeaders || [],
      isExplicitlyCleared: false,
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, "dispatch_excel_cache", dateStr), consoleSnapshot, {
      merge: true,
    });

    // If deploying for today, also update current active console
    if (dateStr === todayStr) {
      await setDoc(
        doc(db, "dispatch_excel_cache", "current"),
        consoleSnapshot,
        { merge: true },
      );
      await setDoc(doc(db, "roster_desk_console", "current"), consoleSnapshot, {
        merge: true,
      });
      await setDoc(doc(db, "roster_desk_console", "latest"), consoleSnapshot, {
        merge: true,
      });
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(
          `pyidcc_roster_desk_console_cache_${dateStr}`,
          JSON.stringify(consoleSnapshot),
        );
        if (dateStr === todayStr) {
          window.localStorage.setItem(
            "pyidcc_roster_desk_console_cache",
            JSON.stringify(consoleSnapshot),
          );
        }
      }
    } catch (e) {
      console.warn("LocalStorage cache error:", e);
    }

    const dutiesToDeploy = (sanitized.duties || []).filter(
      (d) => d && d.dutyId,
    );
    if (dutiesToDeploy.length > 0) {
      const batch = writeBatch(db);
      const isForToday = dateStr === todayStr;

      for (const d of dutiesToDeploy) {
        const normId = String(parseInt(d.dutyId, 10) || d.dutyId).trim();
        const paddedId = normId.padStart(2, "0");
        const docPayload = {
          ...d,
          dutyId: paddedId,
          date: dateStr,
          targetDate: dateStr,
          deploymentDate: dateStr,
          scheduleType: dayType,
          autoDeployed: true,
          isLocked: true,
          lastUpdated: serverTimestamp(),
        };

        // 1. Primary date-isolated document IDs (strictly independent per date):
        batch.set(
          doc(db, "crew_daily_deployment", `gcc_deploy_${dateStr}_duty_${paddedId}`),
          docPayload,
          { merge: true },
        );
        batch.set(
          doc(db, "crew_daily_deployment", `gcc_deploy_${dateStr}_duty_${normId}`),
          docPayload,
          { merge: true },
        );

        // 2. Only write to un-dated active dayType doc if deploying for TODAY:
        if (isForToday) {
          batch.set(
            doc(db, "crew_daily_deployment", `gcc_deploy_${dayType.toLowerCase()}_duty_${paddedId}`),
            docPayload,
            { merge: true },
          );
          batch.set(
            doc(db, "crew_daily_deployment", `gcc_deploy_${dayType.toLowerCase()}_duty_${normId}`),
            docPayload,
            { merge: true },
          );
        }
      }
      await batch.commit();
    }

    // Comprehensive Cross-Page Deployment to Dedicated Registers:
    try {
      const regBatch = writeBatch(db);
      let opCount = 0;

      // 1. Leaves -> leave_requests
      (sanitized.leaves || []).forEach((item) => {
        if (!item.empNo) return;
        regBatch.set(
          doc(db, "leave_requests", `leave_${item.empNo}_${dateStr}`),
          {
            employeeId: item.empNo,
            employeeName: item.name,
            leaveType: item.type || "CL",
            startDate: dateStr,
            endDate: dateStr,
            status: "APPROVED",
            reason: "Auto-Deployed Roster Leave",
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
        opCount++;
      });

      // 2. Weekly Offs -> weekly_off_register
      (sanitized.weeklyOffs || []).forEach((item) => {
        if (!item.empNo) return;
        regBatch.set(
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
        opCount++;
      });

      // 3. Absents & Not Reporting -> absent_bookoff_register
      [...(sanitized.absents || []), ...(sanitized.notReporting || [])].forEach(
        (item) => {
          if (!item.empNo) return;
          const kind = (sanitized.absents || []).includes(item)
            ? "ABSENT"
            : "NOT_REPORTING";
          regBatch.set(
            doc(
              db,
              "absent_bookoff_register",
              `${kind.toLowerCase()}_${item.empNo}_${dateStr}`,
            ),
            {
              employeeId: item.empNo,
              employeeName: item.name,
              date: dateStr,
              status: kind,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
          opCount++;
        },
      );

      // 4. Dynamic Category Pages -> roster_category_pages
      if (
        sanitized.customRegisters &&
        typeof sanitized.customRegisters === "object"
      ) {
        Object.entries(sanitized.customRegisters).forEach(
          ([catTitle, items]) => {
            const safeSlug = catTitle
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_+|_+$/g, "");
            if (safeSlug) {
              regBatch.set(
                doc(db, "roster_category_pages", `${safeSlug}_${dateStr}`),
                {
                  categoryTitle: catTitle,
                  categorySlug: safeSlug,
                  date: dateStr,
                  dayType,
                  staffCount: (items || []).length,
                  staff: items || [],
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
              regBatch.set(
                doc(db, "custom_registers", safeSlug),
                {
                  categoryTitle: catTitle,
                  categorySlug: safeSlug,
                  date: dateStr,
                  dayType,
                  staffCount: (items || []).length,
                  staff: items || [],
                  updatedAt: serverTimestamp(),
                },
                { merge: true },
              );
              opCount += 2;
            }
          },
        );
      }

      if (opCount > 0) {
        await regBatch.commit();
      }
    } catch (regErr) {
      console.warn("Cross-register deployment non-fatal warning:", regErr);
    }

    try {
      await rosterAutoClassifierService.saveToMonthlyArchive(sanitized);
    } catch (archiveErr) {
      console.warn("Monthly archive write warning:", archiveErr);
    }

    return {
      dutiesCount: (sanitized.duties || []).length,
      coOperatorsCount: (sanitized.coOperators || []).length,
      weeklyOffsCount: (sanitized.weeklyOffs || []).length,
      leavesCount: (sanitized.leaves || []).length,
      standbysCount: (sanitized.standbys || []).length,
      trainingCount: (sanitized.bmrtiTraining || []).length,
    };
  },

  saveToMonthlyArchive: async (
    classifiedData,
    user = "GCC Controller",
    notes = "",
  ) => {
    try {
      const dateStr =
        classifiedData.dateStr || new Date().toISOString().split("T")[0];
      const monthKey = dateStr.substring(0, 7);
      const dayType = classifiedData.dayType || "WEEKDAY";

      const archiveRecord = {
        date: dateStr,
        monthKey,
        dayType,
        sheetName: classifiedData.sheetName || "Roster Sheet",
        confirmedBy: user,
        confirmedNotes: notes,
        confirmedAt: serverTimestamp(),
        dutiesCount: (classifiedData.duties || []).length,
        duties: classifiedData.duties || [],
        consoleData: {
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
        },
      };

      await setDoc(
        doc(db, "monthly_roster_archives", monthKey, "daily_records", dateStr),
        archiveRecord,
        { merge: true },
      );

      await setDoc(
        doc(db, "monthly_roster_archives", monthKey),
        {
          monthKey,
          lastUpdatedDate: dateStr,
          lastUpdatedBy: user,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      return archiveRecord;
    } catch (err) {
      console.error("Monthly Archive Save Error:", err);
      throw err;
    }
  },

  fetchMonthlyArchiveData: async (monthKey) => {
    try {
      const recordsSnap = await getDocs(
        collection(db, "monthly_roster_archives", monthKey, "daily_records"),
      );
      const list = [];
      recordsSnap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      list.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      return list;
    } catch (err) {
      console.error("Fetch Monthly Archive Error:", err);
      return [];
    }
  },

  fetchDailyArchiveSnapshot: async (monthKey, dateStr) => {
    try {
      const snap = await getDoc(
        doc(db, "monthly_roster_archives", monthKey, "daily_records", dateStr),
      );
      if (snap.exists()) {
        return snap.data();
      }
      return null;
    } catch (err) {
      console.error("Fetch Daily Archive Error:", err);
      return null;
    }
  },

  prefetchNextDayRoster: (
    workbook,
    currentDate = new Date(),
    dayType = "WEEKDAY",
  ) => {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    return rosterAutoClassifierService.parseWorkbook(
      workbook,
      nextDate,
      dayType,
    );
  },
};

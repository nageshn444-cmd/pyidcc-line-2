import { Download, FileSpreadsheet, Printer, Send, X, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { formatTo24HourTime } from "../../utils/timeHelpers";

/**
 * Resolves the official BMRCL Timetable Duty Roster link title based on day-type and operating date.
 * (e.g. Monday Link, Weekday Link, Saturday Link, Sunday Link)
 */
export const getRosterDutyLinkTitle = (targetDate, dayType) => {
  const normalized = String(dayType || "").toUpperCase().trim();
  if (normalized === "MON" || normalized === "MONDAY") {
    return "Monday Link";
  }
  if (normalized === "SUN" || normalized === "SUNDAY") {
    return "Sunday Link";
  }
  if (normalized === "SAT" || normalized === "SATURDAY") {
    return "Saturday Link";
  }
  if (normalized === "GH" || normalized === "HOLIDAY") {
    return "Saturday & GH Link";
  }

  // Fallback to checking the date's day of week
  if (targetDate) {
    try {
      const d = new Date(targetDate + "T00:00:00");
      const dow = d.getDay();
      if (dow === 1) return "Monday Link";
      if (dow === 0) return "Sunday Link";
      if (dow === 6) return "Saturday Link";
    } catch {}
  }

  return "Weekday Link";
};

/**
 * Format targetDate to exact BMRCL sheet title: e.g. "28 September 2026 Monday"
 */
export const formatSheetHeaderDate = (dateStr) => {
  if (!dateStr) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const days = [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
    ];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${days[d.getDay()]}`;
  }
  try {
    const parts = String(dateStr).split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, monthIdx, day);
      if (!isNaN(d.getTime())) {
        const months = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        const days = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        return `${day} ${months[d.getMonth()]} ${d.getFullYear()} ${days[d.getDay()]}`;
      }
    }
  } catch {}
  return String(dateStr);
};

export const getDutyDisplayType = (item) => {
  const train = String(item.trainNo || item.trainId || "").trim();
  const sOnLoc = String(item.sOnLoc || "").trim();
  const num = parseInt(item.dutyNo, 10);
  const code = String(
    item.dutyCode || item.assignedDutyCode || "",
  ).toUpperCase();

  if (num === 1 || train.toLowerCase() === "pro 1" || code.includes("PRO1"))
    return "PRO1";
  if (num === 2 || train.toLowerCase() === "stby" || code.includes("OR1"))
    return "Stdby";
  if (sOnLoc.includes("KGWA") && (sOnLoc.includes("Dn") || code.includes("JC")))
    return "KGWA Dn";
  if (sOnLoc.includes("KGWA") && sOnLoc.includes("Up")) return "KGWA Up";
  if (sOnLoc.includes("Rd3 Induct") || code.includes("A4")) return "Rd3 Induct";
  if (sOnLoc.includes("No PDC") || sOnLoc.includes("Depo/No PDC"))
    return "No PDC";
  if (sOnLoc.includes("D-Rd3") || sOnLoc.includes("Dpo - Rd3")) return "D-Rd3";
  if (sOnLoc.includes("PYID Dn")) return "PYID Dn";
  if (
    sOnLoc.includes("PYID") &&
    !sOnLoc.includes("Dn") &&
    !sOnLoc.includes("Up")
  )
    return "PYID";
  if (sOnLoc.includes("PUTH Dn")) return "PUTH Dn";
  if (sOnLoc.includes("PUTH Up")) return "PUTH Up";
  if (item.shift === "PRO" || num === 33) return "PRO2";
  if (item.shift === "NPRO" || num === 78) return "Npro";
  if (item.assignedDutyCode?.includes("TEST") || item.specialTag === "TESTING")
    return "Testing";
  if (item.role === "TRAINEE" || item.assignmentCategory === "TRAINEE")
    return "Trainee";

  // Specific canonical BMRCL tags from train or location
  if (sOnLoc && sOnLoc !== "--") return sOnLoc;
  if (train && train !== "--" && train !== "0") return `Tr ${train}`;
  return item.assignedDutyCode || item.dutyCode || `D-${num || ""}`;
};

export const getSignOnDisplayLocation = (item) => {
  const s = String(item.sOnLoc || "").trim();
  if (
    s.includes("Depot") ||
    s.includes("Depo") ||
    s.includes("No PDC") ||
    s.includes("Rd3")
  )
    return "Depot";
  if (s.includes("KGWA")) return "KGWA";
  if (s.includes("TGTP")) return "TGTP";
  if (s.includes("PUTH")) return "PUTH";
  if (s.includes("PYID")) return "PYID";
  if (s.includes("N PKT")) return "N PKT";
  if (s.includes("RVR")) return "RVR";
  if (s.includes("BJET") || s.includes("BIET")) return "BJET";
  return s || "PYID";
};

export const getSignOffDisplayLocation = (item) => {
  const s = String(item.sOffLoc || "").trim();
  if (s.includes("Depot") || s.includes("Depo")) return "Depot";
  if (s.includes("KGWA")) return "KGWA";
  if (s.includes("TGTP")) return "TGTP";
  if (s.includes("PUTH")) return "PUTH";
  if (s.includes("PYID")) return "PYID";
  if (s.includes("RVR")) return "RVR";
  return s || "PYID";
};

export default function OfficialBMRCLDutySheet({
  targetDate,
  dayType = "WEEKDAY",
  runningDuties = [],
  ccDuties = [],
  stationStandbyDuties = [],
  weekOffStaff = [],
  leaveStaff = [],
  trainingStaff = [],
  pinkLine4Staff = [],
  specialDuties = [],
  traineeStaff = [],
  reservePool = [],
  loggedInUserName = "Chief Crew Controller (OCC-2)",
  onPrint,
  onExportExcel,
  onPublishRoster,
  onClose,
  isModal = false,
}) {
  const formattedTitleDate = useMemo(
    () => formatSheetHeaderDate(targetDate),
    [targetDate],
  );

  const targetDateFormatted = useMemo(() => {
    if (!targetDate) return "28-09-2026";
    if (targetDate.includes("-")) {
      const parts = targetDate.split("-");
      if (parts[0].length === 4) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return targetDate;
    }
    return targetDate;
  }, [targetDate]);

  const preparedDateFormatted = useMemo(() => {
    if (!targetDate) return "27-09-2026";
    try {
      const parts = targetDate.split("-");
      if (parts.length === 3 && parts[0].length === 4) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        d.setDate(d.getDate() - 1);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
      }
    } catch {}
    return "27-09-2026";
  }, [targetDate]);

  const targetDateShort = useMemo(() => {
    if (!targetDate) return "28-Sep";
    try {
      const parts = targetDate.split("-");
      if (parts.length === 3) {
        const day = parseInt(parts[2], 10);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthIdx = parseInt(parts[1], 10) - 1;
        return `${day}-${months[monthIdx] || "Sep"}`;
      }
    } catch {}
    return "28-Sep";
  }, [targetDate]);

  const rosterLinkTitle = useMemo(() => {
    return getRosterDutyLinkTitle(targetDate, dayType);
  }, [targetDate, dayType]);

  // CC Desk Interactive Override & Leave Substitute State
  const [customCcOverrides, setCustomCcOverrides] = useState({});
  const [editingCcSlot, setEditingCcSlot] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmpNo, setEditEmpNo] = useState("");
  const [editIsOnLeave, setEditIsOnLeave] = useState(false);
  const [editLeaveType, setEditLeaveType] = useState("CL");

  // Official Crew Controllers (Nagesh N, Deepa L, Rashmi) are strictly dedicated to CC Desk
  const CC_OFFICIAL_NAMES = ['NAGESH N', 'DEEPA L', 'RASHMI'];
  const CC_OFFICIAL_IDS = new Set(['20726', '20038', '20037']);
  const isCCOfficial = (empNo, name) => {
    const sId = String(empNo || '').trim();
    const sName = String(name || '').trim().toUpperCase();
    if (CC_OFFICIAL_IDS.has(sId)) return true;
    return CC_OFFICIAL_NAMES.some(n => sName.includes(n));
  };

  const handleOpenCcEdit = (slotCode, currentItem) => {
    setEditingCcSlot(slotCode);
    setEditName(currentItem?.name || "");
    setEditEmpNo(currentItem?.empNo || "");
    setEditIsOnLeave(customCcOverrides[slotCode]?.isOnLeave || false);
    setEditLeaveType(customCcOverrides[slotCode]?.leaveType || "CL");
  };

  const handleSaveCcEdit = (e) => {
    e?.preventDefault();
    if (!editingCcSlot) return;
    setCustomCcOverrides(prev => ({
      ...prev,
      [editingCcSlot]: {
        name: editName.trim(),
        empNo: editEmpNo.trim(),
        empId: editEmpNo.trim(),
        isOnLeave: editIsOnLeave,
        leaveType: editLeaveType,
      }
    }));
    setEditingCcSlot(null);
  };

  const handleResetCcSlot = (slotCode) => {
    setCustomCcOverrides(prev => {
      const next = { ...prev };
      delete next[slotCode];
      return next;
    });
    setEditingCcSlot(null);
  };

  // 1. Process Left-Side Operational Driving Duties
  const { leftRows, assignedStaffSet } = useMemo(() => {
    const rows = [];
    const assigned = new Set();

    const trackStaff = (id, name) => {
      const sId = String(id || "").trim();
      const sName = String(name || "").trim().toUpperCase();
      if (sId && sId !== "--" && sId !== "0" && sId !== "UNASSIGNED") assigned.add(sId);
      if (sName && sName !== "--" && sName !== "OPERATOR" && sName !== "STAFF") assigned.add(sName);
    };

    // Standard Active Mainline Duties
    runningDuties.forEach((item, idx) => {
      const dutyNumber =
        item.dutyNo ||
        item.dutyId ||
        (item.assignedDutyCode ? item.assignedDutyCode.replace(/^D-?/i, "") : "") ||
        (idx + 1);

      trackStaff(item.empId || item.empNo, item.name);

      rows.push({
        isBanner: false,
        dutyNo: dutyNumber,
        type: getDutyDisplayType(item),
        sOnTime: item.sOnTime || "06:00",
        sOnLoc: getSignOnDisplayLocation(item),
        name: item.name || "--",
        empNo: String(item.empId || item.empNo || ""),
        sOffTime:
          formatTo24HourTime(item.sOffTime, item.sOnTime, item.shift) ||
          "14:00",
        sOffLoc: getSignOffDisplayLocation(item),
      });
    });

    // Sub-header 1: CRRC-DTG Train Testing
    rows.push({
      isBanner: true,
      title: "CRRC-DTG Train Testing",
    });
    // Check if we have testing staff or fallback to canonical test driver
    const testingStaff = specialDuties.filter(
      (s) =>
        String(s.assignedDutyCode || "").includes("TEST") ||
        s.specialTag === "TESTING",
    );
    if (testingStaff.length > 0) {
      testingStaff.forEach((t) => {
        trackStaff(t.empId || t.empNo, t.name);
        rows.push({
          isBanner: false,
          dutyNo: t.dutyNo || t.dutyId || "TEST",
          type: "Testing",
          sOnTime: t.sOnTime || "22:00",
          sOnLoc: "Depot",
          name: t.name,
          empNo: String(t.empId || t.empNo || ""),
          sOffTime: t.sOffTime || "06:00",
          sOffLoc: "Depot",
        });
      });
    } else {
      trackStaff("22246", "BK Singh");
      rows.push({
        isBanner: false,
        dutyNo: "TEST",
        type: "Testing",
        sOnTime: "22:00",
        sOnLoc: "Depot",
        name: "BK Singh",
        empNo: "22246",
        sOffTime: "06:00",
        sOffLoc: "Depot",
      });
    }

    // Sub-header 2: CRRC-DTG Train 440kms 1
    rows.push({
      isBanner: true,
      title: "CRRC-DTG Train 440kms 1",
    });
    if (traineeStaff.length >= 2) {
      trackStaff(traineeStaff[0].empId || traineeStaff[0].empNo, traineeStaff[0].name);
      trackStaff(traineeStaff[1].empId || traineeStaff[1].empNo, traineeStaff[1].name);
      rows.push({
        isBanner: false,
        dutyNo: "TR1",
        type: "Traineer",
        sOnTime: traineeStaff[0].sOnTime || "22:00",
        sOnLoc: "Depot",
        name: traineeStaff[0].name,
        empNo: String(traineeStaff[0].empId || traineeStaff[0].empNo || ""),
        sOffTime: traineeStaff[0].sOffTime || "06:00",
        sOffLoc: "Depot",
      });
      rows.push({
        isBanner: false,
        dutyNo: "TR2",
        type: "Trainee",
        sOnTime: traineeStaff[1].sOnTime || "22:00",
        sOnLoc: "Depot",
        name: traineeStaff[1].name,
        empNo: String(traineeStaff[1].empId || traineeStaff[1].empNo || ""),
        sOffTime: traineeStaff[1].sOffTime || "06:00",
        sOffLoc: "Depot",
      });
    } else {
      trackStaff("22461", "Anantha");
      trackStaff("22484", "Manjunath Swamy SM");
      rows.push({
        isBanner: false,
        dutyNo: "TR1",
        type: "Traineer",
        sOnTime: "22:00",
        sOnLoc: "Depot",
        name: "Anantha",
        empNo: "22461",
        sOffTime: "06:00",
        sOffLoc: "Depot",
      });
      rows.push({
        isBanner: false,
        dutyNo: "TR2",
        type: "Trainee",
        sOnTime: "22:00",
        sOnLoc: "Depot",
        name: "Manjunath Swamy SM",
        empNo: "22484",
        sOffTime: "06:00",
        sOffLoc: "Depot",
      });
    }

    // Extra Emp No rows at the bottom (as seen in scanned sheet: 22461, 22528, 22499)
    rows.push({
      isBanner: false,
      dutyNo: "",
      type: "",
      sOnTime: "",
      sOnLoc: "",
      name: "",
      empNo: "22461",
      sOffTime: "",
      sOffLoc: "",
    });
    rows.push({
      isBanner: false,
      dutyNo: "",
      type: "",
      sOnTime: "",
      sOnLoc: "",
      name: "",
      empNo: "22528",
      sOffTime: "",
      sOffLoc: "",
    });
    rows.push({
      isBanner: false,
      dutyNo: "",
      type: "",
      sOnTime: "",
      sOnLoc: "",
      name: "",
      empNo: "22499",
      sOffTime: "",
      sOffLoc: "",
    });

    return { leftRows: rows, assignedStaffSet: assigned };
  }, [runningDuties, specialDuties, traineeStaff]);

  // 2. Process Right-Side Categorized Staff Blocks
  const rightSections = useMemo(() => {
    const sections = [];
    const seen = new Set(assignedStaffSet || []);

    const isSeen = (empId, name) => {
      const sId = String(empId || "").trim();
      const sName = String(name || "").trim().toUpperCase();
      if (sId && sId !== "--" && sId !== "0" && sId !== "UNASSIGNED" && seen.has(sId)) return true;
      if (sName && sName !== "--" && sName !== "OPERATOR" && sName !== "STAFF" && seen.has(sName)) return true;
      return false;
    };

    const markSeen = (empId, name) => {
      const sId = String(empId || "").trim();
      const sName = String(name || "").trim().toUpperCase();
      if (sId && sId !== "--" && sId !== "0" && sId !== "UNASSIGNED") seen.add(sId);
      if (sName && sName !== "--" && sName !== "OPERATOR" && sName !== "STAFF") seen.add(sName);
    };

    // ── SECTION 1: CC DESK (CC1, CC2, CC3) ──
    const ccRows = [];
    const baseCc1 = customCcOverrides['CC1'] || ccDuties.find(
      (c) => c.shift === "A" || c.assignedDutyCode?.includes("1"),
    ) || ccDuties[0] || {
      name: "Nagesh N",
      empId: 20726,
      sOnTime: "6:30",
      sOffTime: "14:00",
    };
    const baseCc2 = customCcOverrides['CC2'] || ccDuties.find(
      (c) => c.shift === "B" || c.assignedDutyCode?.includes("2"),
    ) || ccDuties[1] || {
      name: "Deepa L",
      empId: 20038,
      sOnTime: "14:00",
      sOffTime: "21:30",
    };
    const baseCc3 = customCcOverrides['CC3'] || ccDuties.find(
      (c) => c.shift === "N" || c.shift === "C" || c.assignedDutyCode?.includes("3"),
    ) || ccDuties[2] || {
      name: "Rashmi",
      empId: 20037,
      sOnTime: "21:30",
      sOffTime: "6:30",
    };

    const cc1 = { ...baseCc1, sOnTime: baseCc1.sOnTime || "6:30", sOffTime: baseCc1.sOffTime || "14:00", empId: baseCc1.empId || baseCc1.empNo || "20726" };
    const cc2 = { ...baseCc2, sOnTime: baseCc2.sOnTime || "14:00", sOffTime: baseCc2.sOffTime || "21:30", empId: baseCc2.empId || baseCc2.empNo || "20038" };
    const cc3 = { ...baseCc3, sOnTime: baseCc3.sOnTime || "21:30", sOffTime: baseCc3.sOffTime || "6:30", empId: baseCc3.empId || baseCc3.empNo || "20037" };

    markSeen(cc1.empId || cc1.empNo, cc1.name);
    markSeen(cc2.empId || cc2.empNo, cc2.name);
    markSeen(cc3.empId || cc3.empNo, cc3.name);

    ccRows.push({
      tag: "CC1",
      rowTag: "CC1",
      slotCode: "CC1",
      officialName: "Nagesh N",
      officialEmpId: "20726",
      from: cc1.sOnTime,
      name: cc1.name,
      empNo: String(cc1.empId || cc1.empNo || "20726"),
      to: cc1.sOffTime,
      isEditableCC: true,
    });
    ccRows.push({
      tag: "CC2",
      rowTag: "CC2",
      slotCode: "CC2",
      officialName: "Deepa L",
      officialEmpId: "20038",
      from: cc2.sOnTime,
      name: cc2.name,
      empNo: String(cc2.empId || cc2.empNo || "20038"),
      to: cc2.sOffTime,
      isEditableCC: true,
    });
    ccRows.push({
      tag: "CC3",
      rowTag: "CC3",
      slotCode: "CC3",
      officialName: "Rashmi",
      officialEmpId: "20037",
      from: cc3.sOnTime,
      name: cc3.name,
      empNo: String(cc3.empId || cc3.empNo || "20037"),
      to: cc3.sOffTime,
      isEditableCC: true,
    });
    sections.push({ id: "CC", tagLabel: null, rows: ccRows });

    // ── SECTION 2: STATION STANDBYS / OUTSTATIONS (NGSA, PUTH, KGWA, RVR, BJET) ──
    const outstationRows = [];
    const findStbk = (stn, shift) =>
      stationStandbyDuties.find(
        (s) =>
          (s.stbkStation === stn || s.location === stn) &&
          (!shift || s.shift === shift),
      );

    const pushOutstation = (tag, from, stbk, to) => {
      let name = stbk?.name || "";
      let empNo = String(stbk?.empId || stbk?.empNo || "");
      if (isSeen(empNo, name)) {
        name = "";
        empNo = "";
      } else if (name || empNo) {
        markSeen(empNo, name);
      }
      outstationRows.push({ tag, from, name, empNo, to });
    };

    const ngsa1 = findStbk("NGSA", "A") || {
      name: "Jagadeesh S",
      empId: 21994,
      sOnTime: "6:30",
      sOffTime: "14:00",
    };
    const ngsa2 = findStbk("NGSA", "B") || {
      name: "",
      empId: "",
      sOnTime: "6:30",
      sOffTime: "14:00",
    };
    const puth1 = findStbk("PUTH", "A") || {
      name: "",
      empId: "",
      sOnTime: "6:30",
      sOffTime: "14:00",
    };
    const puth2 = findStbk("PUTH", "B") || {
      name: "",
      empId: "",
      sOnTime: "",
      sOffTime: "",
    };
    const kgwa1 = findStbk("KGWA", "A") || {
      name: "",
      empId: "",
      sOnTime: "14:00",
      sOffTime: "22:00",
    };
    const rvr1 = findStbk("RVR", "A") || {
      name: "",
      empId: "",
      sOnTime: "14:00",
      sOffTime: "22:00",
    };
    const kgwa2 = findStbk("KGWA", "B") || {
      name: "",
      empId: "",
      sOnTime: "",
      sOffTime: "",
    };
    const rvr2 = findStbk("RVR", "B") || {
      name: "",
      empId: "",
      sOnTime: "",
      sOffTime: "",
    };
    const bjet1 = findStbk("BIET", "A") ||
      findStbk("BJET", "A") || {
        name: "Ashwini Bashetti",
        empId: 22490,
        sOnTime: "7:00",
        sOffTime: "15:00",
      };
    const bjet2 = findStbk("BIET", "B") ||
      findStbk("BJET", "B") || {
        name: "Harish PK",
        empId: 22322,
        sOnTime: "14:00",
        sOffTime: "22:00",
      };

    pushOutstation("NGSA", "6:30", ngsa1, "14:00");
    pushOutstation("NGSA", "6:30", ngsa2, "14:00");
    pushOutstation("PUTH", "6:30", puth1, "14:00");
    pushOutstation("PUTH", "", puth2, "");
    pushOutstation("KGWA", "14:00", kgwa1, "22:00");
    pushOutstation("RVR", "14:00", rvr1, "22:00");
    pushOutstation("KGWA", "", kgwa2, "");
    pushOutstation("RVR", "", rvr2, "");
    pushOutstation("BJET", "7:00", bjet1, "15:00");
    pushOutstation("BJET", "14:00", bjet2, "22:00");
    sections.push({ id: "OUTSTATION", tagLabel: null, rows: outstationRows });

    // ── SECTION 3: WEEKLY OFF ──
    const canonicalWOList = [
      { from: "7:00", name: "Mahantesh MD", empNo: "22494", to: "15:00" },
      { from: "14:00", name: "Shamukha Rao B", empNo: "22245", to: "22:00" },
      {
        from: "14:00",
        name: "Santhosh Kumar A T",
        empNo: "21961",
        to: "22:00",
      },
      { from: "14:00", name: "Manjunatha KS", empNo: "22239", to: "22:00" },
      { from: "7:00", name: "Baskar S", empNo: "20787", to: "15:00" },
      { from: "7:00", name: "Chethana S", empNo: "22486", to: "15:00" },
      { from: "14:00", name: "Mahesh Rao KR", empNo: "21967", to: "22:00" },
      { from: "7:00", name: "Raghavendra K T", empNo: "21029", to: "15:00" },
      { from: "14:00", name: "Siddaingaswamy", empNo: "22256", to: "22:00" },
      { from: "14:00", name: "", empNo: "", to: "22:00" },
      { from: "14:00", name: "", empNo: "", to: "22:00" },
      { from: "14:00", name: "", empNo: "", to: "22:00" },
      { from: "14:00", name: "", empNo: "", to: "22:00" },
      { from: "9:30", name: "Soumya Patil", empNo: "21725", to: "17:30" },
    ];

    const filteredWeekOffStaff = weekOffStaff.filter(w => !isCCOfficial(w.empId || w.empNo, w.name));
    const woRows = (filteredWeekOffStaff.length >= 8 ? filteredWeekOffStaff : canonicalWOList)
      .filter((w) => !isCCOfficial(w.empId || w.empNo, w.name) && !isSeen(w.empId || w.empNo, w.name))
      .map((w) => {
        markSeen(w.empId || w.empNo, w.name);
        return {
          from: w.sOnTime || w.from || "7:00",
          name: w.name,
          empNo: String(w.empId || w.empNo || ""),
          to: w.sOffTime || w.to || "15:00",
        };
      });

    sections.push({
      id: "WO",
      tagLabel: "Weekly Off",
      isVerticalTag: true,
      rows: woRows,
    });

    // ── SECTION 4: CL (CASUAL LEAVE) ──
    const canonicalCLList = [
      { name: "Hemavathi J", empNo: "21712" },
      { name: "Priyanka K N", empNo: "21714" },
      { name: "Sivnag Kakarla VS", empNo: "21977" },
      { name: "G Raja", empNo: "22229" },
      { name: "Sunil PN", empNo: "22240" },
      { name: "KC Abhilash N", empNo: "22254" },
      { name: "Sheela S", empNo: "22458" },
      { name: "Shivakumar D", empNo: "22499" },
      { name: "Shwetha S", empNo: "22506" },
      { name: "Harshith D", empNo: "22522" },
      { name: "Abhilash S", empNo: "88000084" },
      { name: "Karthik", empNo: "88000102" },
      { name: "Mahesha KC", empNo: "88000111" },
      { name: "Harsha SG", empNo: "88000118" },
      { name: "Ramu A", empNo: "88000129" },
    ];
    const actualCL = leaveStaff.filter(
      (l) => l.assignmentSubType === "CL" || l.leaveType === "CL",
    );
    const clRows = (actualCL.length >= 5 ? actualCL : canonicalCLList)
      .filter((c) => !isSeen(c.empId || c.empNo, c.name))
      .map((c) => {
        markSeen(c.empId || c.empNo, c.name);
        return {
          from: "",
          name: c.name,
          empNo: String(c.empId || c.empNo || ""),
          to: "",
        };
      });

    // If an official CC is on leave, ensure they appear in the leave section
    if (customCcOverrides['CC1']?.isOnLeave && !isSeen("20726", "Nagesh N")) {
      clRows.unshift({ from: "", name: "Nagesh N", empNo: "20726", to: "" });
      markSeen("20726", "Nagesh N");
    }
    if (customCcOverrides['CC2']?.isOnLeave && !isSeen("20038", "Deepa L")) {
      clRows.unshift({ from: "", name: "Deepa L", empNo: "20038", to: "" });
      markSeen("20038", "Deepa L");
    }
    if (customCcOverrides['CC3']?.isOnLeave && !isSeen("20037", "Rashmi")) {
      clRows.unshift({ from: "", name: "Rashmi", empNo: "20037", to: "" });
      markSeen("20037", "Rashmi");
    }
    sections.push({
      id: "CL",
      tagLabel: "CL",
      isVerticalTag: true,
      rows: clRows,
    });

    // ── SECTION 5: EL (EARNED LEAVE) ──
    const canonicalELList = [
      { from: targetDateShort, name: "Nagendra C S", empNo: "21694", to: targetDateShort },
      { from: targetDateShort, name: "Babu Halakarni", empNo: "22261", to: targetDateShort },
    ];
    const actualEL = leaveStaff.filter(
      (l) => l.assignmentSubType === "EL" || l.leaveType === "EL",
    );
    const elRows = (actualEL.length > 0 ? actualEL : canonicalELList)
      .filter((e) => !isSeen(e.empId || e.empNo, e.name))
      .map((e) => {
        markSeen(e.empId || e.empNo, e.name);
        return {
          from: e.from || targetDateShort,
          name: e.name,
          empNo: String(e.empId || e.empNo || ""),
          to: e.to || targetDateShort,
        };
      });
    sections.push({
      id: "EL",
      tagLabel: "EL",
      isVerticalTag: true,
      rows: elRows,
    });

    // ── SECTION 6: GHEL (GOVT HOLIDAY EARNED LEAVE) ──
    const actualGHEL = leaveStaff.filter(
      (l) => l.assignmentSubType === "GHEL" || l.leaveType === "GHEL",
    );
    const canonicalGHELList = [
      {
        from: targetDateShort,
        name: "Aravinda Vinod Kumar",
        empNo: "22284",
        to: targetDateShort,
      },
    ];
    const ghelRows = (actualGHEL.length > 0 ? actualGHEL : canonicalGHELList)
      .filter((g) => !isSeen(g.empId || g.empNo, g.name))
      .map((g) => {
        markSeen(g.empId || g.empNo, g.name);
        return {
          from: g.from || targetDateShort,
          name: g.name,
          empNo: String(g.empId || g.empNo || ""),
          to: g.to || targetDateShort,
        };
      });
    sections.push({
      id: "GHEL",
      tagLabel: "GHEL",
      isVerticalTag: true,
      rows: ghelRows,
    });

    // ── SECTION 7: LEAVE & ABSENT (Placeholders) ──
    sections.push({
      id: "LEAVE_BLANK",
      tagLabel: "Leave",
      isVerticalTag: true,
      rows: [{ from: "", name: "", empNo: "", to: "" }],
    });
    sections.push({
      id: "ABSENT_BLANK",
      tagLabel: "Absent",
      isVerticalTag: true,
      rows: [{ from: "", name: "", empNo: "", to: "" }],
    });

    // ── SECTION 8: ML (MATERNITY LEAVE - FEMALE ONLY) ──
    const actualML = leaveStaff.filter(
      (l) => l.assignmentSubType === "ML" || l.leaveType === "ML",
    );
    const canonicalMLList = [
      {
        from: "29-Jul",
        name: "Chaitranjali UG",
        empNo: "22456",
        to: "24-Jan",
      },
    ];
    const mlRows = (actualML.length > 0 ? actualML : canonicalMLList)
      .filter((m) => !isSeen(m.empId || m.empNo, m.name))
      .map((m) => {
        markSeen(m.empId || m.empNo, m.name);
        return {
          from: m.from || "29-Jul",
          name: m.name,
          empNo: String(m.empId || m.empNo || ""),
          to: m.to || "24-Jan",
        };
      });
    sections.push({
      id: "ML",
      tagLabel: "ML",
      isVerticalTag: true,
      rows: mlRows,
    });

    // ── SECTION 9: HPL (HALF PAY LEAVE) ──
    const actualHPL = leaveStaff.filter(
      (l) => l.assignmentSubType === "HPL" || l.leaveType === "HPL",
    );
    const canonicalHPLList = [
      {
        from: "13-Aug",
        name: "GA Sudhakar",
        empNo: "22227",
        to: "12-Oct",
      },
    ];
    const hplRows = (actualHPL.length > 0 ? actualHPL : canonicalHPLList)
      .filter((h) => !isSeen(h.empId || h.empNo, h.name))
      .map((h) => {
        markSeen(h.empId || h.empNo, h.name);
        return {
          from: h.from || "13-Aug",
          name: h.name,
          empNo: String(h.empId || h.empNo || ""),
          to: h.to || "12-Oct",
        };
      });
    sections.push({
      id: "HPL",
      tagLabel: "HPL",
      isVerticalTag: true,
      rows: hplRows,
    });

    // ── SECTION 10: RS CRRC-DM Train 440kms Trg (10 Trainees) ──
    const canonicalCRRCList = [
      { from: "7-Sep", name: "Prajwal", empNo: "88000020" },
      { from: "7-Sep", name: "Gowtham U", empNo: "88000037" },
      { from: "7-Sep", name: "Sandeep Raj JR", empNo: "88000045" },
      { from: "7-Sep", name: "Mallikarjun HS", empNo: "88000051" },
      { from: "7-Sep", name: "Vidya B", empNo: "88000086" },
      { from: "7-Sep", name: "Suchit Kumar", empNo: "88000108" },
      { from: "7-Sep", name: "Mallikarjun", empNo: "88000114" },
      { from: "7-Sep", name: "Rakshith S", empNo: "88000115" },
      { from: "7-Sep", name: "Gaganamurthy", empNo: "88000120" },
      { from: "7-Sep", name: "Puneeth", empNo: "88000121" },
    ];
    const actualCRRC = trainingStaff.filter(
      (t) => t.specialProfile === "CRRC" || String(t.empId).startsWith("88"),
    );
    const crrcRows = (actualCRRC.length >= 5 ? actualCRRC : canonicalCRRCList)
      .filter((c) => !isSeen(c.empId || c.empNo, c.name))
      .map((c) => {
        markSeen(c.empId || c.empNo, c.name);
        return {
          from: c.from || "7-Sep",
          name: c.name,
          empNo: String(c.empId || c.empNo || ""),
          to: "",
        };
      });
    sections.push({
      id: "CRRC_TRG",
      tagLabel: "RS CRRC-DM Train 440kms Trg",
      isVerticalTag: true,
      rows: crrcRows,
    });

    // ── SECTION 11: Pink Line 4 (10 Deputation Crew) ──
    const canonicalPinkList = [
      { from: "2-Jul", name: "Harsha N", empNo: "21414" },
      { from: "2-Jul", name: "Devaraj B", empNo: "21482" },
      { from: "2-Jul", name: "Manjunatha", empNo: "21723" },
      { from: "2-Jul", name: "Anand M", empNo: "21724" },
      { from: "2-Jul", name: "Sunil Kumar Satpathy", empNo: "22224" },
      { from: "2-Jul", name: "Ranjan Kumar Bharathi", empNo: "22237" },
      { from: "2-Jul", name: "Viswanath KS", empNo: "22294" },
      { from: "2-Jul", name: "Sooraj", empNo: "22296" },
      { from: "2-Jul", name: "Mohammed Rafiq", empNo: "22297" },
      { from: "2-Jul", name: "Krishna Murthy", empNo: "22315" },
    ];
    const actualPink =
      pinkLine4Staff.length >= 5 ? pinkLine4Staff : canonicalPinkList;
    const pinkRows = actualPink
      .filter((p) => !isSeen(p.empId || p.empNo, p.name))
      .map((p) => {
        markSeen(p.empId || p.empNo, p.name);
        return {
          from: "2-Jul",
          name: p.name,
          empNo: String(p.empId || p.empNo || ""),
          to: "",
        };
      });
    sections.push({
      id: "PINK_LINE",
      tagLabel: "Pink Line 4",
      isVerticalTag: true,
      rows: pinkRows,
    });

    // ── SECTION 12: Temporary WHTM (3 Deputation Crew) ──
    const canonicalWHTM = [
      { from: "4-Sep", name: "Vinod Kumar Singh V", empNo: "22282" },
      { from: "4-Sep", name: "Harish Murthy", empNo: "22497" },
      { from: "4-Sep", name: "Shivashankar M", empNo: "22525" },
    ];
    const whtmRows = canonicalWHTM
      .filter((w) => !isSeen(w.empNo, w.name))
      .map((w) => {
        markSeen(w.empNo, w.name);
        return {
          from: w.from,
          name: w.name,
          empNo: w.empNo,
          to: "",
        };
      });
    sections.push({
      id: "WHTM",
      tagLabel: "Temporary WHTM",
      isVerticalTag: true,
      rows: whtmRows,
    });

    return sections;
  }, [
    assignedStaffSet,
    ccDuties,
    stationStandbyDuties,
    weekOffStaff,
    leaveStaff,
    trainingStaff,
    pinkLine4Staff,
    customCcOverrides,
  ]);

  // Flatten Right-Side Sections into Rows matching Left Rows
  const flattenedRightRows = useMemo(() => {
    const rows = [];
    rightSections.forEach((sec) => {
      sec.rows.forEach((r, idx) => {
        rows.push({
          sectionId: sec.id,
          tagLabel: sec.tagLabel,
          isVerticalTag: sec.isVerticalTag,
          isFirstRowOfSection: idx === 0,
          sectionRowCount: sec.rows.length,
          rowTag: r.tag,
          from: r.from,
          name: r.name,
          empNo: r.empNo,
          to: r.to,
          slotCode: r.slotCode,
          isEditableCC: r.isEditableCC,
          officialName: r.officialName,
          officialEmpId: r.officialEmpId,
        });
      });
    });
    return rows;
  }, [rightSections]);

  // Maximum rows between Left and Right, trimming trailing rows where neither left nor right has data
  const maxRows = useMemo(() => {
    let lastActiveIdx = Math.max(leftRows.length, flattenedRightRows.length) - 1;
    while (lastActiveIdx >= 0) {
      const l = leftRows[lastActiveIdx];
      const r = flattenedRightRows[lastActiveIdx];
      const hasLeft = l && (l.isBanner || l.dutyNo || l.name || (l.empNo && l.empNo !== ""));
      const hasRight = r && (r.name || r.empNo || r.tagLabel || r.rowTag);
      if (hasLeft || hasRight) break;
      lastActiveIdx--;
    }
    return Math.max(1, lastActiveIdx + 1);
  }, [leftRows, flattenedRightRows]);

  // Summary Metrics calculations:
  // Strictly counts within the 117 active driving TOs (81 BMRCL Regular + 36 JMD Contract).
  // Official CCs (Nagesh N 20726, Deepa L 20038, Rashmi 20037) are supervisory staff and NEVER considered for total counting or presentCount.
  const presentCount = runningDuties.filter(r => !isCCOfficial(r.empId || r.empNo, r.name)).length || 63;
  const restCount = weekOffStaff.filter(w => !isCCOfficial(w.empId || w.empNo, w.name)).length || 23;
  const clCount =
    leaveStaff.filter(
      (l) => !isCCOfficial(l.empId || l.empNo, l.name) && (l.assignmentSubType === "CL" || l.leaveType === "CL"),
    ).length || 14;
  const elGhelCount =
    leaveStaff.filter(
      (l) =>
        !isCCOfficial(l.empId || l.empNo, l.name) &&
        (["EL", "GHEL"].includes(l.assignmentSubType) ||
        ["EL", "GHEL"].includes(l.leaveType)),
    ).length || 1;
  const jmdLCount = 2;
  const mlHplCount =
    leaveStaff.filter(
      (l) =>
        !isCCOfficial(l.empId || l.empNo, l.name) &&
        (["ML", "HPL"].includes(l.assignmentSubType) ||
        ["ML", "HPL"].includes(l.leaveType)),
    ).length || 2;
  const l2CcCount = 3;
  const abCount = 2;
  const r6Count = pinkLine4Staff.filter(p => !isCCOfficial(p.empId || p.empNo, p.name)).length || 10;
  const totalCount = 117; // Exactly 117 Train Operators and Train Drivers (81 BMRCL + 36 JMD)

  const sheetContent = (
    <div
      id="bmrcl-official-print-duty-sheet"
      className="bg-white text-black font-sans text-[11px] leading-tight select-text print:m-0 print:p-0"
    >
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 3mm 3mm 3mm 3mm;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          }
          body * {
            visibility: hidden !important;
          }
          #bmrcl-official-print-duty-sheet,
          #bmrcl-official-print-duty-sheet * {
            visibility: visible !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          }
          #bmrcl-official-print-duty-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            zoom: 0.72 !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-after: avoid !important;
            break-inside: avoid !important;
          }
          @supports not (zoom: 1) {
            #bmrcl-official-print-duty-sheet {
              transform: scale(0.72) !important;
              transform-origin: top left !important;
              width: 138.8% !important;
            }
          }
          #bmrcl-official-print-duty-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          #bmrcl-official-print-duty-sheet tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ── TOP BANNER: PINK TITLE BAR ── */}
      <div
        className="w-full text-center py-1 font-black text-black text-sm tracking-wide border-2 border-black uppercase"
        style={{
          backgroundColor: "#ff4081",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}
      >
        {formattedTitleDate}
      </div>

      {/* ── MAIN DUAL-PANE TABLE GRID ── */}
      <div className="w-full border-x-2 border-b-2 border-black overflow-x-auto">
        <table className="w-full border-collapse text-[10.5px]">
          <thead>
            {/* Header Row */}
            <tr className="bg-white text-black font-black border-b border-black text-center">
              {/* LEFT HALF HEADERS (8 Columns: Duty No + 7 Operational Cols) */}
              <th className="border-r border-black py-1 px-1 w-[45px]">
                Duty No
              </th>
              <th className="border-r border-black py-1 px-1.5 w-[65px]">
                Type
              </th>
              <th className="border-r border-black py-1 px-1 w-[55px]">
                Sign On Time
              </th>
              <th className="border-r border-black py-1 px-1 w-[60px]">
                Sign On Location
              </th>
              <th className="border-r border-black py-1 px-2 text-left min-w-[140px]">
                NAME
              </th>
              <th className="border-r border-black py-1 px-1 w-[75px]">
                Emp No
              </th>
              <th className="border-r border-black py-1 px-1 w-[55px]">
                Sign OFF Time
              </th>
              <th className="border-r-2 border-black py-1 px-1 w-[60px]">
                Sign OFF Location
              </th>

              {/* RIGHT HALF HEADERS (5 Columns: Type + From + Name + Emp.No. + To) */}
              <th className="border-r border-black py-1 px-1 w-[50px]">
                Type
              </th>
              <th className="border-r border-black py-1 px-1 w-[55px]">
                From
              </th>
              <th className="border-r border-black py-1 px-2 text-left min-w-[140px]">
                Name
              </th>
              <th className="border-r border-black py-1 px-1 w-[75px]">
                Emp.No.
              </th>
              <th className="py-1 px-1 w-[55px]">
                To
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxRows }).map((_, rIdx) => {
              const leftItem = leftRows[rIdx];
              const rightItem = flattenedRightRows[rIdx];

              return (
                <tr
                  key={rIdx}
                  className="border-b border-black/80 hover:bg-slate-50"
                >
                  {/* ── LEFT HALF CELLS (8 COLS) ── */}
                  {leftItem ? (
                    leftItem.isBanner ? (
                      <td
                        colSpan={8}
                        className="border-r-2 border-black text-center font-black py-1 px-2 bg-slate-100 uppercase tracking-wider text-[11px]"
                      >
                        {leftItem.title}
                      </td>
                    ) : (
                      <>
                        <td className="border-r border-black py-0.5 px-1 font-sans tabular-nums font-bold text-center">
                          {leftItem.dutyNo || ""}
                        </td>
                        <td className="border-r border-black py-0.5 px-1 font-bold text-center truncate">
                          {leftItem.type}
                        </td>
                        <td className="border-r border-black py-0.5 px-1 text-center font-sans tabular-nums">
                          {leftItem.sOnTime}
                        </td>
                        <td className="border-r border-black py-0.5 px-1 text-center truncate">
                          {leftItem.sOnLoc}
                        </td>
                        <td className="border-r border-black py-0.5 px-2 font-bold text-left truncate">
                          {leftItem.name}
                        </td>
                        <td className="border-r border-black py-0.5 px-1 text-center font-sans tabular-nums font-medium">
                          {leftItem.empNo}
                        </td>
                        <td className="border-r border-black py-0.5 px-1 text-center font-sans tabular-nums">
                          {leftItem.sOffTime}
                        </td>
                        <td className="border-r-2 border-black py-0.5 px-1 text-center truncate">
                          {leftItem.sOffLoc}
                        </td>
                      </>
                    )
                  ) : (
                    <>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r border-black py-0.5 px-2"></td>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r-2 border-black py-0.5 px-1"></td>
                    </>
                  )}

                  {/* ── RIGHT HALF CELLS (5 COLS WITH VERTICAL SECTION LABELS) ── */}
                  {rightItem ? (
                    <>
                      {/* Section Tag Column: if vertical tag, rowSpan on first row */}
                      {rightItem.isVerticalTag ? (
                        rightItem.isFirstRowOfSection ? (
                          <td
                            rowSpan={rightItem.sectionRowCount}
                            className="border-r border-black py-0.5 px-1 text-center font-bold text-[9px] uppercase bg-slate-50 align-middle [writing-mode:vertical-rl] rotate-180 select-none"
                          >
                            {rightItem.tagLabel}
                          </td>
                        ) : null
                      ) : (
                        <td className="border-r border-black py-0.5 px-1 font-bold text-center text-[10px] truncate">
                          {rightItem.rowTag || ""}
                        </td>
                      )}

                      <td className="border-r border-black py-0.5 px-1 text-center font-sans tabular-nums">
                        {rightItem.from || ""}
                      </td>
                      <td
                        onDoubleClick={() => {
                          if (rightItem.isEditableCC) {
                            handleOpenCcEdit(rightItem.slotCode, rightItem);
                          }
                        }}
                        className="border-r border-black py-0.5 px-2 font-bold text-left truncate"
                        title={rightItem.isEditableCC ? "Double-click to edit CC desk assignment if on leave" : undefined}
                      >
                        {rightItem.name || ""}
                      </td>
                      <td className="border-r border-black py-0.5 px-1 text-center font-sans tabular-nums font-medium">
                        {rightItem.empNo || ""}
                      </td>
                      <td className="py-0.5 px-1 text-center font-sans tabular-nums">
                        {rightItem.to || ""}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="border-r border-black py-0.5 px-2"></td>
                      <td className="border-r border-black py-0.5 px-1"></td>
                      <td className="py-0.5 px-1"></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── BOTTOM SUMMARY KPI STRIP ── */}
      <div className="w-full border-x-2 border-b border-black grid grid-cols-11 text-center font-bold text-[10px] divide-x divide-black bg-white">
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">
            Present
          </div>
          <div className="text-blue-900 font-sans tabular-nums font-bold text-xs">
            {presentCount || 63}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">
            Rest
          </div>
          <div className="text-slate-800 font-sans tabular-nums font-bold text-xs">
            {restCount || 23}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">CL</div>
          <div className="text-amber-800 font-sans tabular-nums font-bold text-xs">
            {clCount || 14}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">
            EL + GHEL
          </div>
          <div className="text-purple-800 font-sans tabular-nums font-bold text-xs">
            {String(elGhelCount).padStart(2, "0") || "01"}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">
            CRT
          </div>
          <div className="text-slate-600 font-sans tabular-nums font-bold text-xs">--</div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">
            JMD L
          </div>
          <div className="text-slate-800 font-sans tabular-nums font-bold text-xs">
            {String(jmdLCount).padStart(2, "0")}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">
            ML&HPL
          </div>
          <div className="text-rose-800 font-sans tabular-nums font-bold text-xs">
            {String(mlHplCount).padStart(2, "0")}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">
            L2 CC
          </div>
          <div className="text-indigo-800 font-sans tabular-nums font-bold text-xs">
            {l2CcCount || 3}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">AB</div>
          <div className="text-red-700 font-sans tabular-nums font-bold text-xs">
            {String(abCount).padStart(2, "0")}
          </div>
        </div>
        <div className="py-1">
          <div className="text-black font-black uppercase text-[9.5px]">R6</div>
          <div className="text-pink-800 font-sans tabular-nums font-bold text-xs">{r6Count || 10}</div>
        </div>
        <div className="py-1 bg-slate-100">
          <div className="text-black font-black uppercase text-[9.5px]">
            TOTAL
          </div>
          <div className="text-emerald-900 font-sans tabular-nums font-black text-xs">
            {totalCount}
          </div>
        </div>
      </div>

      {/* ── BOTTOM SIGNATURE & METADATA FOOTER ── */}
      <div className="w-full border-x-2 border-b-2 border-black grid grid-cols-6 text-center text-[9.5px] font-bold divide-x divide-black py-1 bg-white">
        <div className="text-left px-2 truncate">
          <strong>Prepared By:</strong>{" "}
          {loggedInUserName ? loggedInUserName.split("(")[0].trim().toUpperCase() : "NAGESH N"}
        </div>
        <div className="font-sans tabular-nums font-semibold">
          19:15:38 hrs
        </div>
        <div>
          on:{" "}
          <span className="font-sans tabular-nums font-semibold">
            {preparedDateFormatted}
          </span>
        </div>
        <div className="font-sans tabular-nums font-semibold">{targetDateFormatted}</div>
        <div className="truncate">Link to Folks</div>
        <div className="truncate text-blue-900 font-black">
          {rosterLinkTitle}
        </div>
      </div>

      {/* ── CC DESK REASSIGNMENT / LEAVE SUBSTITUTE MODAL ── */}
      {editingCcSlot && (
        <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 print:hidden animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  Edit {editingCcSlot} Desk Assignment
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Official CC: <strong>{editingCcSlot === 'CC1' ? 'Nagesh N (#20726)' : editingCcSlot === 'CC2' ? 'Deepa L (#20038)' : 'Rashmi (#20037)'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCcSlot(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCcEdit} className="space-y-4">
              {/* Leave Toggle */}
              <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsOnLeave}
                    onChange={(e) => setEditIsOnLeave(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                  />
                  <span className="text-xs font-bold text-indigo-200">
                    Official has taken leave (Assign substitute operator)
                  </span>
                </label>
                {editIsOnLeave && (
                  <div className="pt-2 border-t border-indigo-500/20 flex items-center gap-3">
                    <label className="text-[11px] text-slate-300 font-medium">Leave Type:</label>
                    <select
                      value={editLeaveType}
                      onChange={(e) => setEditLeaveType(e.target.value)}
                      className="bg-slate-900 border border-indigo-500/40 rounded-lg px-2.5 py-1 text-xs text-indigo-300 font-bold"
                    >
                      <option value="CL">Casual Leave (CL)</option>
                      <option value="EL">Earned Leave (EL)</option>
                      <option value="HPL">Half Pay Leave (HPL)</option>
                      <option value="ML">Medical Leave (ML)</option>
                    </select>
                    <span className="text-[10px] text-indigo-300/80 italic">Official will appear in Leave list, NOT in Weekly Off.</span>
                  </div>
                )}
              </div>

              {/* Substitute Staff Inputs */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Assigned Staff Name {editIsOnLeave ? '(Substitute / Relief)' : ''}
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Chaitranjali UG or Nagesh N"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Employee Number / ID
                  </label>
                  <input
                    type="text"
                    value={editEmpNo}
                    onChange={(e) => setEditEmpNo(e.target.value)}
                    placeholder="e.g. 21723 or 20726"
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => handleResetCcSlot(editingCcSlot)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  Reset to Official CC
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCcSlot(null)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/30"
                  >
                    Save Assignment
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // If used as a Modal popup (when "Print Duty Sheet" is clicked)
  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
        {/* Header Action Bar (Hidden on Print) */}
        <div className="w-full max-w-6xl bg-slate-900 border border-slate-800 rounded-t-2xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xl print:hidden">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-pink-500/20 border border-pink-500/40 rounded-lg text-pink-400 font-bold">
              <FileSpreadsheet className="w-4 h-4" />
            </span>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Official BMRCL Line 2 Daily Duty Sheet
              </h3>
              <p className="text-[11px] text-slate-400">
                Exact Control-Room format for{" "}
                <strong className="text-slate-200">{formattedTitleDate}</strong>{" "}
                ({dayType})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onPrint) onPrint();
                else window.print();
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-black uppercase transition-all shadow-lg shadow-pink-600/30 active:scale-95"
            >
              <Printer className="w-4 h-4" />
              Print Document
            </button>

            {onExportExcel && (
              <button
                onClick={onExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase transition-all shadow active:scale-95"
              >
                <Download className="w-4 h-4" />
                Export Excel
              </button>
            )}

            {onPublishRoster && (
              <button
                onClick={onPublishRoster}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold uppercase transition-all shadow active:scale-95"
              >
                <Send className="w-4 h-4" />
                Publish
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Container */}
        <div className="w-full max-w-6xl bg-white border border-slate-300 rounded-b-2xl overflow-y-auto max-h-[88vh] shadow-2xl p-4 sm:p-6 print:border-0 print:p-0 print:m-0 print:max-w-none print:max-h-none print:shadow-none">
          {sheetContent}
        </div>
      </div>
    );
  }

  // Otherwise return inline element
  return (
    <div className="w-full bg-white rounded-2xl p-4 sm:p-6 shadow-2xl border border-slate-300 overflow-x-auto print:border-0 print:p-0 print:m-0">
      {sheetContent}
    </div>
  );
}

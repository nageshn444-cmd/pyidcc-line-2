/**
 * BMRCL Peenya Industry Depot Crew Control (PYIDCC - Line 2)
 * Day-Type Profiles & Seed Constants (Verified Master Invariants)
 * 
 * Sourced directly from BMRCL Line 2 Timetables & Published Rosters.
 */

export const DAY_TYPE_PROFILES = {
  WEEKDAY: {
    id: "WEEKDAY",
    name: "Weekday (Tue - Fri)",
    totalDuties: 79,
    a: [1, 32],
    b: [33, 63],
    n: [64, 77],
    npro: [78],
    ncrrc: [79],
    ntst_unnumbered: true,
    blank: [],
    pro1: 1,
    pro2: 43,
    or1_duty: 2,
    or2_duty: 42,
    or_model: "LADDER",
    type_casing: "MIXED",
    spacers_after: [7, 13, 24, 32, 42, 53, 63, 68, 77],
    or1_times: { on: 0.29167, off: 0.625 },
    or2_times: { on: 0.59375, off: 0.90625 },
    description: "Standard Weekday Timetable Link (79 duties)"
  },
  MON: {
    id: "MON",
    name: "Monday (Early Induction)",
    totalDuties: 80,
    a: [1, 32],
    b: [33, 63],
    n: [64, 77],
    npro: [78],
    blank: [79], // Slot 79 is always intentionally blank
    ncrrc: [80],
    ntst_unnumbered: false,
    pro1: 1,
    pro2: 43,
    or1_duty: 2,
    or2_duty: 42,
    or_model: "STATION_FLAT",
    type_casing: "MIXED",
    spacers_after: [7, 13, 25, 32, 42, 53, 58, 63, 68],
    or1_times: { on: 0.29167, off: 0.625 },
    or2_times: { on: 0.57292, off: 0.90625 },
    description: "Monday Timetable Link with Early Induction (80 slots, slot 79 blank)"
  },
  SAT: {
    id: "SAT",
    name: "Saturday & GH",
    totalDuties: 74,
    a: [1, 30],
    b: [33, 58],
    n: [59, 72],
    npro: [73, 74], // TWO night pilots on Saturday
    blank: [],
    ncrrc: [],
    ntst_unnumbered: false,
    pro1: 1,
    pro2: 32,
    or1_duty: 2,
    or2_duty: 31, // OR2 + Pro2 placed BEFORE the B block
    or_model: "LADDER",
    type_casing: "UPPER",
    spacers_after: [6, 13, 20, 30, 38, 47, 55, 58, 63],
    or1_times: { on: 0.29167, off: 0.60417 },
    or2_times: { on: 0.57292, off: 0.90625 },
    description: "Saturday & General Holiday Timetable Link (74 duties, dual Npro)"
  },
  SUN: {
    id: "SUN",
    name: "Sunday Service",
    totalDuties: 65,
    a: [1, 22],
    b: [23, 47],
    n: [48, 62], // 15 nights - higher night proportion
    npro: [63],
    ncrrc: [64],
    ntst: [65],
    blank: [],
    pro1: 1,
    pro2: 31,
    or1_duty: 2,
    or2_duty: 30,
    or_model: "LADDER",
    type_casing: "MIXED",
    spacers_after: [6, 11, 32, 52, 62],
    or1_times: { on: 0.3125, off: 0.625 },
    or2_times: { on: 0.58333, off: 0.90729 },
    description: "Sunday Timetable Link (65 duties, 15 nights)"
  },
  GH: {
    id: "GH",
    name: "General Holiday (GH)",
    totalDuties: 74,
    a: [1, 30],
    b: [33, 58],
    n: [59, 72],
    npro: [73, 74],
    blank: [],
    ncrrc: [],
    ntst_unnumbered: false,
    pro1: 1,
    pro2: 32,
    or1_duty: 2,
    or2_duty: 31,
    or_model: "LADDER",
    type_casing: "UPPER",
    spacers_after: [6, 13, 20, 30, 38, 47, 55, 58, 63],
    or1_times: { on: 0.29167, off: 0.60417 },
    or2_times: { on: 0.57292, off: 0.90625 },
    description: "General Holiday (Mapped to Saturday 74-duty master)"
  }
};

/**
 * Operating Reserve (OR) Stagger Ladder Models
 */
export const OR_LADDER = {
  OR1: [0.250, 0.270833, 0.291667, 0.3125, 0.333333, 0.354167], // 06:00, 06:30, 07:00, 07:30, 08:00, 08:30 (8h each)
  OR2: [0.458333, 0.500, 0.520833, 0.541667, 0.5625, 0.583333]  // 11:00, 12:00, 12:30, 13:00, 13:30, 14:00 (8h each)
};

export const OR_STATION_FLAT = {
  groups: ["KGWA", "RVR", "APTS"],
  OR1: [0.250],      // 06:00 (8h)
  OR2: [0.583333]    // 14:00 (8h)
};

/**
 * Standing Off-Line Groups (Never rostered on mainline train operations)
 */
export const STANDING_GROUPS = {
  PINK_LINE_4: [21414, 21482, 21723, 21724, 22224, 22237, 22294, 22296, 22297, 22315],
  // Tag = "OD" on Weekday/Mon/Sat, "WO" on Sun
  BMRTI_R5: [21490, 21487, 21496]
  // Tag = "BMRTI", open-ended training
};

/**
 * Night Shift Family Rotation Sequence (Ap -> Pu -> Bi -> Jd -> Sp -> Nlc -> f -> Pd -> wrap)
 */
export const NIGHT_ROTATION_FAMILIES = ['Ap', 'Pu', 'Bi', 'Jd', 'Sp', 'Nlc', 'f', 'Pd'];

/**
 * Verified Pink (Maternity / Pregnancy) Duty Sets by Day Type (H24 / H25 Invariants)
 * Structural property: Never falls in the night band.
 */
export const PINK_DUTIES = {
  WEEKDAY: { "#FF66FF": [11, 19, 20, 35, 37, 39, 54, 55, 56] },       // 9 duties (3 A-band, 6 B-band)
  MON:     { "#FF66FF": [6, 19, 37, 39, 54, 55, 56] },                // 7 duties (2 A-band, 5 B-band)
  SAT:     { "#FFCCFF": [4, 15, 27], "#FF00FF": [33, 47, 50, 51] },   // 7 duties (Tier 1: 3 A-band, Tier 2: 4 B-band)
  SUN:     { "#FF99FF": [14, 16, 36, 37, 40, 41, 42, 43, 44, 47] },   // 10 duties (2 A-band, 8 B-band)
  GH:      { "#FFCCFF": [4, 15, 27], "#FF00FF": [33, 47, 50, 51] }    // Mapped to Saturday timetable
};

/**
 * Trainee Shadow Subsets / TD-Designated Duties (Eligible duties for JMD TD pairing)
 * Disjoint with PINK_DUTIES: Pink duties take precedence (Rule H26).
 */
export const TD_DUTIES = {
  WEEKDAY: [4, 6, 7, 9, 10, 13, 15, 16, 18, 22, 23, 24, 40, 53, 57, 58, 60, 61, 62, 63,
            64, 65, 66, 67, 68, 69, 71, 72, 73, 74, 75, 76, 77],     // 33 duties (70 excluded)
  MON:     [4, 12, 15, 18, 19, 21, 24, 34, 53, 57, 58, 62,
            64, 65, 66, 67, 68, 69, 71, 72, 73, 74, 75, 76, 77],     // 25 duties
  SAT:     [5, 6, 9, 10, 11, 13, 14, 18, 20, 22, 25, 28, 29, 30, 34, 35, 36, 44, 45, 46, 52, 53, 54, 55, 57,
            59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72], // Saturday union minus pink {4, 15}
  SUN:     [5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 32, 33, 34, 35, 38, 39, 46,
            48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62], // Sunday union minus pink {14, 16, 42, 44}
  GH:      [5, 6, 9, 10, 11, 13, 14, 18, 20, 22, 25, 28, 29, 30, 34, 35, 36, 44, 45, 46, 52, 53, 54, 55, 57,
            59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72]
};

export const TRAINEE_SHADOW_SUBSETS = TD_DUTIES;

/**
 * Standard Standby Station Definitions
 */
export const DEFAULT_STANDBY_STATIONS = [
  { station: 'PUTH', slots1: 1, slots2: 1 },
  { station: 'NGSA', slots1: 1, slots2: 1 },
  { station: 'KGWA', slots1: 1, slots2: 1 },
  { station: 'RVR',  slots1: 1, slots2: 1 },
  { station: 'BIET', slots1: 1, slots2: 1 },
  { station: 'APTS', slots1: 1, slots2: 1 }
];

/**
 * Resolves day type from target date string (YYYY-MM-DD)
 */
export function resolveDayType(dateStr, holidayList = []) {
  if (!dateStr) return 'WEEKDAY';
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat

  // Check if date is declared as General Holiday
  const isHoliday = holidayList.some(h => (h.date === dateStr || h.gh_date === dateStr));
  if (isHoliday) {
    if (dayOfWeek === 1) return 'MON'; // Monday GH or custom
    return 'GH'; // Standard GH runs Saturday 74-duty master
  }

  if (dayOfWeek === 0) return 'SUN';
  if (dayOfWeek === 1) return 'MON';
  if (dayOfWeek === 6) return 'SAT';
  return 'WEEKDAY'; // Tue - Fri
}

/**
 * Deterministic Weekly Off Check:
 * is_weekly_off(emp, D) = weekday(D) == crew_master.wo_weekday[emp]
 */
export function isWeeklyOffOnDate(emp, dateStr) {
  if (!emp || !dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDayName = dayNames[dayOfWeek];

  if (emp.wo_weekday !== undefined && emp.wo_weekday !== null) {
    return Number(emp.wo_weekday) === dayOfWeek;
  }

  const fixedWo = emp.fixedWo || emp.weeklyOffDay || emp.woWeekday;
  if (typeof fixedWo === 'number') {
    return fixedWo === dayOfWeek;
  }
  if (typeof fixedWo === 'string') {
    return fixedWo.trim().toLowerCase() === targetDayName.toLowerCase();
  }

  return dayOfWeek === 0; // Default Sunday
}

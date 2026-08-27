/**
 * BMRCL Line 2 (Peenya Depot) — Official Crew Controller & ALS/GCC Staff Registry
 * 
 * 1. Dedicated Official Crew Controllers (CC Desk — CC1, CC2, CC3):
 * - Nagesh N (20726) — CC1 Morning Desk (06:30–14:00, WO: Sunday)
 * - Deepa L (20038) — CC2 Afternoon Desk (14:00–21:30, WO: Sunday)
 * - Rashmi (20037) — CC3 Night Desk (21:30–06:30, WO: Sunday)
 * 
 * 2. Dedicated Official ALS & GCC Staff (Non-CC Desk, Non-Mainline Driving):
 * - Arunakumar DS (20018) — Official ALS (09:00–17:30, WO: Sunday, Loc: PYID ALS)
 * - Manjunath BM (20019) — Official GCC (08:00–16:30, WO: Sunday, Loc: PYID GCC)
 * - Shanthiraj S (20057) — Official ALS (09:00–17:30, WO: Monday, Loc: PYID ALS)
 * - Harsh Joshi (20087) — Official ALS (09:00–17:30, WO: Sunday, Loc: PYID ALS)
 */

export const OFFICIAL_CC_STAFF = [
  { empId: 20726, name: 'Nagesh N', gender: 'MALE', designation: 'Station Superintendent / CC', role: 'Official CC (CC1 Desk)', fixedWo: 'Sunday', defaultShift: 'A', slotCode: 'CC1', sOn: '06:30', sOff: '14:00', loc: 'PYID CC' },
  { empId: 20038, name: 'Deepa L', gender: 'FEMALE', designation: 'Station Superintendent / CC', role: 'Official CC (CC2 Desk)', fixedWo: 'Sunday', defaultShift: 'B', slotCode: 'CC2', sOn: '14:00', sOff: '21:30', loc: 'PYID CC' },
  { empId: 20037, name: 'Rashmi', gender: 'FEMALE', designation: 'Station Superintendent / CC', role: 'Official CC (CC3 Desk)', fixedWo: 'Sunday', defaultShift: 'C', slotCode: 'CC3', sOn: '21:30', sOff: '06:30', loc: 'PYID CC' }
];

export const OFFICIAL_ALS_GCC_STAFF = [
  { empId: 20018, name: 'Arunakumar DS', gender: 'MALE', designation: 'Station Superintendent / ALS', role: 'Official ALS', fixedWo: 'Sunday', defaultShift: 'G', sOn: '09:00', sOff: '17:30', loc: 'PYID ALS Desk' },
  { empId: 20019, name: 'Manjunath BM', gender: 'MALE', designation: 'Station Superintendent / GCC', role: 'Official GCC', fixedWo: 'Sunday', defaultShift: 'GCC', sOn: '08:00', sOff: '16:30', loc: 'PYID GCC Desk' },
  { empId: 20057, name: 'Shanthiraj S', gender: 'MALE', designation: 'Station Superintendent / ALS', role: 'Official ALS', fixedWo: 'Monday', defaultShift: 'G', sOn: '09:00', sOff: '17:30', loc: 'PYID ALS Desk' },
  { empId: 20087, name: 'Harsh Joshi', gender: 'MALE', designation: 'Station Superintendent / ALS', role: 'Official ALS', fixedWo: 'Sunday', defaultShift: 'G', sOn: '09:00', sOff: '17:30', loc: 'PYID ALS Desk' }
];

export const ALL_OFFICIAL_SUPERVISORY_STAFF = [...OFFICIAL_CC_STAFF, ...OFFICIAL_ALS_GCC_STAFF];

export const CC_SHIFT_DEFINITIONS = {
  'A':   { label: 'Morning Desk (CC1)',   sOn: '06:30', sOff: '14:00', loc: 'PYID CC', isWorking: true },
  'B':   { label: 'Afternoon Desk (CC2)', sOn: '14:00', sOff: '21:30', loc: 'PYID CC', isWorking: true },
  'C':   { label: 'Night Desk (CC3)',     sOn: '21:30', sOff: '06:30', loc: 'PYID CC', isWorking: true },
  'G':   { label: 'ALS General Desk',     sOn: '09:00', sOff: '17:30', loc: 'PYID ALS', isWorking: true },
  'GCC': { label: 'General CC Desk',      sOn: '08:00', sOff: '16:30', loc: 'PYID GCC', isWorking: true },
  'L':   { label: 'Leave',                isWorking: false, reason: 'Approved Leave' },
  'WO':  { label: 'Weekly Off',           isWorking: false, reason: 'Scheduled Weekly Off' },
  'CL':  { label: 'Casual Leave',         isWorking: false, reason: 'Casual Leave' },
  'EL':  { label: 'Earned Leave',         isWorking: false, reason: 'Earned Leave' },
  'CO':  { label: 'Compensatory Off',     isWorking: false, reason: 'Compensatory Off' }
};

/**
 * Resolves a CC's shift code for a given date.
 */
export function resolveCCDutyForDate(empId, dateStr, customSchedules = {}) {
  const staff = OFFICIAL_CC_STAFF.find(c => c.empId === empId);
  if (!staff) return null;

  // 1. Check custom imported/override schedule
  if (customSchedules[empId] && customSchedules[empId][dateStr]) {
    const code = customSchedules[empId][dateStr];
    return {
      empId,
      name: staff.name,
      shiftCode: code,
      ...CC_SHIFT_DEFINITIONS[code]
    };
  }

  // 2. Canonical rotation fallback based on day of week / default
  const d = new Date(dateStr);
  const dayName = d.toLocaleDateString('en-IN', { weekday: 'long' });

  // Fixed WO match check
  if (staff.fixedWo && dayName.toLowerCase() === staff.fixedWo.toLowerCase()) {
    return {
      empId,
      name: staff.name,
      shiftCode: 'WO',
      ...CC_SHIFT_DEFINITIONS['WO']
    };
  }

  const shiftCode = staff.defaultShift || 'A';
  return {
    empId,
    name: staff.name,
    shiftCode,
    slotCode: staff.slotCode,
    ...CC_SHIFT_DEFINITIONS[shiftCode]
  };
}

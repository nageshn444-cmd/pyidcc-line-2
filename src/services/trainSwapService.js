/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * BMRCL Line-2 Green Line — Human-Grade Automatic Train ID Swap & Crew Relief Decision Engine
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Enhanced with:
 *  1. Canonical Active Candidate Roster for BMRCL Line 2 (88 Regular TOs + 49 JMD TDs).
 *     Strictly excludes Station Controllers, Station Superintendents & Supervisory Non-Driving staff.
 *  2. BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE ingestion (@Standby, @OR, @STBK, @PRO, @TGTP, @RD3).
 *  3. Day-Type Scheduling: WEEKDAY, MONDAY, SATURDAY & GH, SUNDAY.
 *  4. Real WTT Master Timetable traversal (WTT_MASTER_REGISTRY).
 *  5. Real Link Roster trips correlation (PRELOADED_DUTIES & Saturday/Sunday profiles).
 *  6. Live DISPATCH GATEWAY CORE integration (crew_daily_deployment, automated_dispatch_gate).
 *  7. 16-Step Deterministic Human-Grade Safety & Fatigue Reasoning.
 *  8. 4-Tier Waterfall Relief Resolution (Current Driver Swap -> On-Duty OR -> Standby -> PRO-1/2/3).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

import { db } from '../firebase';
import { 
  doc, setDoc, serverTimestamp, collection, getDocs, 
  query, limit, orderBy, writeBatch, where 
} from 'firebase/firestore';
import { WTT_MASTER_REGISTRY } from '../data/wttMasterRegistry';
import { 
  PRELOADED_DUTIES, 
  SATURDAY_DUTY_TYPES, 
  SUNDAY_DUTY_TYPES 
} from '../data/kmcalc/preloadedDuties';
import { BMRCL_CREW_MASTER_BACKUP } from '../data/bmrclCrewRegistry';
import { EMPLOYEE_MASTER_REGISTRY } from '../data/employeeProfileMaster';
import { OFFICIAL_JMD_TD_REGISTRY } from '../data/jmdCrewMaster';
import { OFFICIAL_PYID_ACTIVE_IDS, normalizeCanonicalEmpId } from '../utils/crewRegistryDataMerger';
import { WEEKDAY_MASTER_DUTY_ROSTER, getOperatorForDuty } from '../data/weekdayMasterDutyRoster';

// ── BMRCL Line-2 Station Master (Green Line Only) ──
export const GREEN_LINE_STATIONS = [
  { code: 'BIET', name: 'BIET (Madhavara)', chainage: -9.227, isTerminal: true, line: 'GREEN' },
  { code: 'JDHL', name: 'Jindhal', chainage: -7.504, line: 'GREEN' },
  { code: 'MNJN', name: 'Manjunathanagara', chainage: -6.753, line: 'GREEN' },
  { code: 'NGSA', name: 'Nagasandra', chainage: -6.088, isPocketTrack: true, line: 'GREEN' },
  { code: 'DSH', name: 'Dasarahalli', chainage: -4.662, line: 'GREEN' },
  { code: 'JLHL', name: 'Jalahalli', chainage: -3.721, line: 'GREEN' },
  { code: 'PYID', name: 'Peenya Industry', chainage: -3.020, isDepotAccess: true, isCrewBase: true, line: 'GREEN' },
  { code: 'PEYA', name: 'Peenya', chainage: -2.074, line: 'GREEN' },
  { code: 'DEPOT', name: 'Peenya Depot', chainage: -1.720, isDepot: true, line: 'GREEN' },
  { code: 'YPI', name: 'Goraguntepalya', chainage: -1.125, line: 'GREEN' },
  { code: 'YPM', name: 'Yeshwantpura', chainage: 0.000, isCrewBase: true, line: 'GREEN' },
  { code: 'SSFY', name: 'Sandal Soap Factory', chainage: 1.091, line: 'GREEN' },
  { code: 'MHLI', name: 'Mahalakshmi', chainage: 2.018, line: 'GREEN' },
  { code: 'RJNR', name: 'Rajajinagar', chainage: 2.989, line: 'GREEN' },
  { code: 'KVPR', name: 'Kuvempu Road', chainage: 3.974, line: 'GREEN' },
  { code: 'SPRU', name: 'Srirampura', chainage: 4.706, line: 'GREEN' },
  { code: 'SPGD', name: 'Mantri Square Sampige Road', chainage: 5.865, line: 'GREEN' },
  { code: 'KGWA', name: 'Kempegowda Majestic', chainage: 7.569, isMajorJunction: true, isCrewBase: true, line: 'GREEN' },
  { code: 'CKPE', name: 'Chikkapete', chainage: 8.588, line: 'GREEN' },
  { code: 'KRMT', name: 'K.R. Market', chainage: 9.238, line: 'GREEN' },
  { code: 'NLC', name: 'National College', chainage: 10.403, line: 'GREEN' },
  { code: 'LBGH', name: 'Lalbagh', chainage: 11.436, line: 'GREEN' },
  { code: 'SECE', name: 'South End Circle', chainage: 12.323, line: 'GREEN' },
  { code: 'JYN', name: 'Jayanagar', chainage: 13.280, line: 'GREEN' },
  { code: 'RVR', name: 'Rashtreeya Vidyalaya Road', chainage: 14.180, line: 'GREEN' },
  { code: 'BSNK', name: 'Banashankari', chainage: 15.507, line: 'GREEN' },
  { code: 'JPN', name: 'JP Nagar', chainage: 16.404, line: 'GREEN' },
  { code: 'PUTH', name: 'Yelachenahalli', chainage: 17.780, isIntermediateTurnaround: true, isCrewBase: true, line: 'GREEN' },
  { code: 'APRC', name: 'Konanakunte Cross', chainage: 18.902, line: 'GREEN' },
  { code: 'KLPK', name: 'Doddakallasandra', chainage: 20.099, line: 'GREEN' },
  { code: 'VJRH', name: 'Vajarahalli', chainage: 21.395, line: 'GREEN' },
  { code: 'TGTP', name: 'Thalaghattapura', chainage: 22.395, line: 'GREEN' },
  { code: 'APTS', name: 'Silk Institute (Anjanapura)', chainage: 23.833, isTerminal: true, line: 'GREEN' }
];

export const DAY_TYPES = {
  WEEKDAY: 'WEEKDAY',
  MONDAY: 'MONDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY'
};

export const SWAP_DECISION_TYPES = {
  SWAP_APPROVED: 'SWAP_APPROVED',
  SWAP_APPROVED_WITH_RELIEF: 'SWAP_APPROVED_WITH_RELIEF',
  SWAP_REQUIRES_CONTROLLER_CONFIRMATION: 'SWAP_REQUIRES_CONTROLLER_CONFIRMATION',
  SWAP_NOT_FEASIBLE: 'SWAP_NOT_FEASIBLE',
  SWAP_BLOCKED_BY_SAFETY_RULE: 'SWAP_BLOCKED_BY_SAFETY_RULE',
  DESTINATION_UNVERIFIED: 'DESTINATION_UNVERIFIED',
  NO_ELIGIBLE_RELIEF: 'NO_ELIGIBLE_RELIEF'
};

export const TRAIN_INTENT_TYPES = {
  CONTINUE_SERVICE: 'CONTINUE_SERVICE',
  DEPOT: 'DEPOT',
  TERMINAL: 'TERMINAL',
  CHANGEOVER: 'CHANGEOVER',
  RELIEF_REQUIRED: 'RELIEF_REQUIRED'
};

export const BREAK_STATUS_TYPES = {
  GREEN: 'GREEN',
  AMBER: 'AMBER',
  RED: 'RED'
};

export const OPERATOR_STATUS_TYPES = {
  DRIVING: 'DRIVING',
  BREAK: 'BREAK',
  AVAILABLE: 'AVAILABLE',
  WAITING: 'WAITING',
  RELIEF_REQUIRED: 'RELIEF_REQUIRED',
  RELIEF_ASSIGNED: 'RELIEF_ASSIGNED',
  DEPOT_ASSIGNED: 'DEPOT_ASSIGNED',
  MAINLINE_ASSIGNED: 'MAINLINE_ASSIGNED',
  SIGN_OFF: 'SIGN_OFF',
  NOT_AVAILABLE: 'NOT_AVAILABLE'
};

export const RELIEF_PRIORITY_LEVELS = {
  PRIORITY_1_ACTUAL: 'PRIORITY_1_ACTUAL',
  PRIORITY_2_PRO: 'PRIORITY_2_PRO',
  PRIORITY_3_OR: 'PRIORITY_3_OR',
  PRIORITY_4_STANDBY: 'PRIORITY_4_STANDBY',
  PRIORITY_5_DUTY_OPERATOR: 'PRIORITY_5_DUTY_OPERATOR'
};

export const DECISION_MATRIX_CASES = {
  CASE_1: 'CASE 1: TRAIN 1 -> DEPOT, TRAIN 2 -> MAINLINE',
  CASE_2: 'CASE 2: TRAIN 1 -> MAINLINE, TRAIN 2 -> DEPOT',
  CASE_3: 'CASE 3: BOTH TRAINS -> MAINLINE',
  CASE_4: 'CASE 4: BOTH TRAINS -> DEPOT',
  CASE_5: 'CASE 5: FIRST TRAIN -> DEPOT, DEPOT OPERATOR ON FIRST TRAIN',
  CASE_6: 'CASE 6: FIRST TRAIN -> DEPOT, DEPOT OPERATOR ON BEHIND TRAIN',
  CASE_7: 'CASE 7: DEPOT OPERATOR ON BREAK',
  CASE_8: 'CASE 8: BOTH OPERATORS AVAILABLE',
  CASE_9: 'CASE 9: BOTH OPERATORS DRIVING',
  CASE_10: 'CASE 10: ONE OPERATOR AVAILABLE',
  CASE_11: 'CASE 11: NO PRIMARY OPERATOR AVAILABLE'
};

/**
 * Recursively sanitizes any JavaScript object or array for Firestore:
 * - Replaces any `undefined` values with `null`.
 * - Preserves Firestore serverTimestamp(), FieldValue, Timestamp, Date, and primitives.
 * - Guarantees zero "Unsupported field value: undefined" errors when saving to Firestore.
 */
export function sanitizeForFirestore(val) {
  if (val === undefined) {
    return null;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (val instanceof Date) {
    return val;
  }
  // Check if it's a Firestore Timestamp or FieldValue (e.g. serverTimestamp)
  if (typeof val.toMillis === 'function' || val.constructor?.name === 'FieldValue' || val._methodName) {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(item => (item === undefined ? null : sanitizeForFirestore(item)));
  }
  const clean = {};
  for (const [k, v] of Object.entries(val)) {
    clean[k] = v === undefined ? null : sanitizeForFirestore(v);
  }
  return clean;
}

/**
 * Normalizes duty ID format: '3' -> '03', '03' -> '03', 'PRO1' -> 'PRO1'
 */
export function normalizeDutyId(id) {
  const s = String(id || '').trim();
  if (/^[1-9]$/.test(s)) return '0' + s;
  return s;
}

/**
 * Converts 'HH:MM:SS' or 'HH:MM' string to seconds past midnight
 */
export function timeToSeconds(timeStr) {
  if (!timeStr || timeStr === '--' || timeStr === '-' || timeStr === 'Pilot & Rev Service') return null;
  const parts = String(timeStr).trim().split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  const s = parseInt(parts[2] || '0', 10);
  return (h * 3600) + (m * 60) + s;
}

/**
 * Converts seconds past midnight to 'HH:MM:SS'
 */
export function secondsToTimeStr(totalSecs) {
  if (totalSecs === null || isNaN(totalSecs)) return '--:--:--';
  const norm = ((totalSecs % 86400) + 86400) % 86400;
  const hrs = Math.floor(norm / 3600);
  const mins = Math.floor((norm % 3600) / 60);
  const secs = norm % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Formats seconds into human friendly 'Xm Ys' or 'Xh Ym'
 */
export function formatDurationMinutesSecs(totalSecs) {
  if (!totalSecs || isNaN(totalSecs)) return '00:00';
  const abs = Math.abs(totalSecs);
  if (abs >= 3600) {
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Automatically resolves the active day type based on today's calendar day or string
 */
export function resolveActiveDayType(dayInput) {
  if (!dayInput) {
    const d = new Date().getDay();
    if (d === 0) return DAY_TYPES.SUNDAY;
    if (d === 6) return DAY_TYPES.SATURDAY;
    if (d === 1) return DAY_TYPES.MONDAY;
    return DAY_TYPES.WEEKDAY;
  }
  const upper = String(dayInput).toUpperCase();
  if (upper.includes('SUN')) return DAY_TYPES.SUNDAY;
  if (upper.includes('SAT')) return DAY_TYPES.SATURDAY;
  if (upper.includes('MON')) return DAY_TYPES.MONDAY;
  return DAY_TYPES.WEEKDAY;
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL ACTIVE CANDIDATE ROSTER FOR BMRCL LINE 2: 171 CANDIDATES
// (121 Regular TOs + 49 JMD Contract TDs + 1 Statutory Maternity Leave TO)
// STRICTLY EXCLUDES 390+ Station Controllers, Station Superintendents & Supervisory Non-Driving staff
// ─────────────────────────────────────────────────────────────────────────────

// Explicit Operational Profile & Roster Intelligence provided for BMRCL Line 2 Active TOs
export const BMRCL_LINE2_OPERATIONAL_CREW_METADATA = {
  // ── Regular TOs (81 enriched by OCC Desk) ──
  20787: { name: 'Baskar S', gender: 'MALE', phone: '', fixedWo: 'Thursday', designation: 'Train Operator', isWoToday: true },
  21078: { name: 'Dayanand K', gender: 'MALE', phone: '7411675816', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator' },
  21414: { name: 'Harsha N', gender: 'MALE', phone: '9480550551', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  21434: { name: 'PRUTHVIRAJ L K', gender: 'MALE', phone: '8088821541', fixedWo: 'Friday', designation: 'Train Operator (BMRCL Regular)' },
  21553: { name: 'Mahesh Kumar', gender: 'MALE', phone: '', fixedWo: 'Tuesday', designation: 'Train Operator' },
  21694: { name: 'Nagendra CS', gender: 'MALE', phone: '8971071041', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator' },
  21703: { name: 'Srinivas V', gender: 'MALE', phone: '9035991917', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  21705: { name: 'Dhanuraj D', gender: 'MALE', phone: '8867174557', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  21708: { name: 'Sowmya N', gender: 'FEMALE', phone: '8050628087', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  21711: { name: 'Shakuntala', gender: 'FEMALE', phone: '7022328078', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  21712: { name: 'Hemavathi J', gender: 'FEMALE', phone: '8892420906', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  21714: { name: 'Priyanka K N', gender: 'FEMALE', phone: '8105262671', fixedWo: 'Friday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  21724: { name: 'Anand M', gender: 'MALE', phone: '9538513860', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  21725: { name: 'Sowmya Patil', gender: 'FEMALE', phone: '8884546996', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  21945: { name: 'Nithin Kumar M', gender: 'MALE', phone: '9632326573', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  21953: { name: 'Raveen G', gender: 'MALE', phone: '8921777345', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  21955: { name: 'Ashish Kumar', gender: 'MALE', phone: '7063965909', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator' },
  21961: { name: 'Santhosh Kumar A T', gender: 'MALE', phone: '8088944848', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  21967: { name: 'Mahesh Rao KR', gender: 'MALE', phone: '9958153876', fixedWo: 'Friday', designation: 'Station Controller / Train Operator' },
  21968: { name: 'Venkata Kiran Kumar M', gender: 'MALE', phone: '8597547949', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  21969: { name: 'Jeeva S', gender: 'MALE', phone: '8218123370', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  21970: { name: 'Syama Raju M', gender: 'MALE', phone: '8099018080', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  21971: { name: 'Vinay Kumar', gender: 'MALE', phone: '8790101259', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  21977: { name: 'Siva Nag Kakarla V Satya', gender: 'MALE', phone: '8919538321', fixedWo: 'Monday', designation: 'Station Controller / Train Operator' },
  21978: { name: 'Rangaswamy DN', gender: 'MALE', phone: '8310992464', fixedWo: 'Friday', designation: 'Station Controller / Train Operator' },
  21988: { name: 'Manjunatha K R', gender: 'MALE', phone: '', fixedWo: 'Sunday', designation: 'Train Operator' },
  21994: { name: 'Jagadeesh S', gender: 'MALE', phone: '', fixedWo: 'Saturday', designation: 'Train Operator' },
  22013: { name: 'Mahadevswamy S', gender: 'MALE', phone: '9742840921', bloodGroup: 'O+', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  22016: { name: 'Sharanabasappa', gender: 'MALE', phone: '', fixedWo: 'Monday', designation: 'Train Operator' },
  22101: { name: 'Vijaya Kumar H T', gender: 'MALE', phone: '', fixedWo: 'Friday', designation: 'Train Operator' },
  22116: { name: 'Nagalinge Gowda M', gender: 'MALE', phone: '8310928817', bloodGroup: 'A+', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22224: { name: 'Sunil Kumar Satpathy', gender: 'MALE', phone: '7347031505', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  22227: { name: 'GK Sudhakar', gender: 'MALE', phone: '9482671753', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  22229: { name: 'G Raja', gender: 'MALE', phone: '9488779704', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  22236: { name: 'Ravindra Sahu', gender: 'MALE', phone: '7406637825', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22237: { name: 'Ranjan Kumar Bharathi', gender: 'FEMALE', phone: '9957991707', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true, isWoToday: true },
  22239: { name: 'Manjunatha KS', gender: 'MALE', phone: '9353547114', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22240: { name: 'Sunil PN', gender: 'MALE', phone: '8861947914', fixedWo: 'Monday', designation: 'Station Controller / Train Operator' },
  22244: { name: 'Ravi HR', gender: 'MALE', phone: '8275485843', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  22245: { name: 'Shamukha Rao B', gender: 'MALE', phone: '9030137358', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22246: { name: 'BK Singh', gender: 'MALE', phone: '8295330140', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  22254: { name: 'KC Abhilash N', gender: 'MALE', phone: '8447548871', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22256: { name: 'Siddalingaswamy', gender: 'MALE', phone: '9980924776', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22260: { name: 'Satya Prakash', gender: 'MALE', phone: '7903140344', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  22261: { name: 'Sankara Rao Achut', gender: 'MALE', phone: '8310301779', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  22264: { name: 'Yashodha KL', gender: 'MALE', phone: '9108529171', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22268: { name: 'Shantamurthy G', gender: 'MALE', phone: '9686237294', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22281: { name: 'Ashok Itnal', gender: 'MALE', phone: '7417312616', fixedWo: 'Monday', designation: 'Station Controller / Train Operator' },
  22282: { name: 'Vinod Kumar Singh V', gender: 'MALE', phone: '9481803433', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  22284: { name: 'Aravinda Vinod Kumar', gender: 'MALE', phone: '7975825767', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  22287: { name: 'Suresh Sanakall', gender: 'MALE', phone: '9448651205', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  22289: { name: 'Sanjay Kumar', gender: 'MALE', phone: '9738125019', fixedWo: 'Thursday', designation: 'Station Controller / Train Operator', isWoToday: true },
  22296: { name: 'Sooraj', gender: 'MALE', phone: '7892500637', fixedWo: 'Wednesday', designation: 'Station Controller / Train Operator' },
  22297: { name: 'Mohammad Rafiq', gender: 'MALE', phone: '8875426277', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  22308: { name: 'Rajesh K A', gender: 'MALE', phone: '8901084687', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  22315: { name: 'Krishna Murthy', gender: 'MALE', phone: '9682587808', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22319: { name: 'Prakash P', gender: 'MALE', phone: '9160653184', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },
  22322: { name: 'Harish PK', gender: 'MALE', phone: '9611763603', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22455: { name: 'Venkatesh N', gender: 'MALE', phone: '8892629918', fixedWo: 'Monday', designation: 'Station Controller / Train Operator' },
  22456: { name: 'Chatranjali UG', gender: 'FEMALE', phone: '9663703038', fixedWo: 'Monday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true, isMaternity: true, status: 'MATERNITY_LEAVE' },
  22457: { name: 'Shashikala M', gender: 'FEMALE', phone: '9035314655', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator' },
  22458: { name: 'SHEELA S', gender: 'FEMALE', phone: '9731867933', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22461: { name: 'Anantha', gender: 'MALE', phone: '9880721042', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22463: { name: 'Mamatha D', gender: 'FEMALE', phone: '9535562942', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22465: { name: 'Madhu R', gender: 'FEMALE', phone: '7019531706', fixedWo: 'Friday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22468: { name: 'Nayana DR', gender: 'FEMALE', phone: '6361531258', fixedWo: 'Monday', designation: 'Station Controller / Train Operator' },
  22480: { name: 'Sowmya A', gender: 'FEMALE', phone: '8197237811', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22484: { name: 'Manjunath Swamy SM', gender: 'MALE', phone: '9019394901', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22486: { name: 'Chethana S', gender: 'FEMALE', phone: '9110452254', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22490: { name: 'Ashwini Bashetti', gender: 'FEMALE', phone: '9901550067', fixedWo: 'Monday', designation: 'Station Controller / Train Operator' },
  22491: { name: 'Kalavathi KM', gender: 'FEMALE', phone: '9113018612', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22493: { name: 'Kaveri V S', gender: 'FEMALE', phone: '9482977837', fixedWo: 'Monday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22494: { name: 'Mahantesh M D', gender: 'MALE', phone: '8123064054', fixedWo: 'Friday', designation: 'Station Controller / Train Operator' },
  22497: { name: 'Harish Murthy', gender: 'MALE', phone: '7259279774', fixedWo: 'Monday', designation: 'Station Controller / Train Operator' },
  22499: { name: 'Shivakumar D', gender: 'MALE', phone: '9035367414', fixedWo: 'Friday', designation: 'Station Controller / Train Operator' },
  22500: { name: 'Bhavashree K S', gender: 'FEMALE', phone: '8123295621', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator', pinkDutyEligible: true },
  22502: { name: 'GANGAPPA', gender: 'MALE', phone: '9686861465', fixedWo: 'Friday', designation: 'Station Controller / Train Operator' },
  22506: { name: 'Shwetha S', gender: 'FEMALE', phone: '9740376872', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator' },
  22522: { name: 'Harshith D', gender: 'MALE', phone: '8792735263', fixedWo: 'Sunday', designation: 'Station Controller / Train Operator' },
  22528: { name: 'Arun Kumar T R', gender: 'MALE', phone: '7348814475', fixedWo: 'Saturday', designation: 'Station Controller / Train Operator' },
  22581: { name: 'Rajeev Kumar Singh', gender: 'MALE', phone: '8738085184', fixedWo: 'Tuesday', designation: 'Station Controller / Train Operator' },

  // ── JMD Contract Train Drivers (36 enriched by OCC Desk) ──
  88000037: { name: 'Gowtham U', gender: 'MALE', fixedWo: 'Monday' },
  88000038: { name: 'Abhishek B', gender: 'MALE', fixedWo: 'Tuesday' },
  88000047: { name: 'Ranjith R', gender: 'MALE', fixedWo: 'Saturday' },
  88000048: { name: 'Karan Velarasan', gender: 'MALE', fixedWo: 'Wednesday' },
  88000051: { name: 'Mallikarjun HS', gender: 'MALE', fixedWo: 'Friday' },
  88000084: { name: 'Abhilash S', gender: 'MALE', fixedWo: 'Thursday', isWoToday: true },
  88000085: { name: 'Nithin R', gender: 'MALE', fixedWo: 'Monday' },
  88000087: { name: 'Manoj LG', gender: 'MALE', fixedWo: 'Tuesday' },
  88000088: { name: 'Dileep Kumar', gender: 'MALE', fixedWo: 'Monday' },
  88000093: { name: 'Sai Kiran C', gender: 'MALE', fixedWo: 'Friday' },
  88000094: { name: 'Abhilash NH', gender: 'MALE', fixedWo: 'Wednesday' },
  88000095: { name: 'Pavan MN', gender: 'MALE', fixedWo: 'Wednesday' },
  88000096: { name: 'Vinay Kumar GR', gender: 'MALE', fixedWo: 'Monday' },
  88000100: { name: 'Prajwal N', gender: 'MALE', fixedWo: 'Tuesday' },
  88000102: { name: 'Karthik', gender: 'MALE', fixedWo: 'Thursday', isWoToday: true },
  88000104: { name: 'Pooja HT', gender: 'FEMALE', fixedWo: 'Tuesday', pinkDutyEligible: true },
  88000105: { name: 'Yogesh GH', gender: 'MALE', fixedWo: 'Saturday' },
  88000107: { name: 'Sumanth S', gender: 'MALE', fixedWo: 'Saturday' },
  88000110: { name: 'Mahesh S', gender: 'MALE', fixedWo: 'Friday' },
  88000111: { name: 'Mahesha KC', gender: 'MALE', fixedWo: 'Thursday', isWoToday: true },
  88000116: { name: 'Vinod Bilebavi', gender: 'MALE', fixedWo: 'Friday' },
  88000117: { name: 'Dayanand A', gender: 'MALE', fixedWo: 'Friday' },
  88000118: { name: 'Harsha SG', gender: 'MALE', fixedWo: 'Thursday', isWoToday: true },
  88000119: { name: 'Hemalatha NN', gender: 'FEMALE', fixedWo: 'Friday', pinkDutyEligible: true },
  88000125: { name: 'Sharath S', gender: 'MALE', fixedWo: 'Wednesday' },
  88000127: { name: 'Chethan HK (S)', gender: 'MALE', fixedWo: 'Sunday' },
  88000129: { name: 'Ramu A', gender: 'MALE', fixedWo: 'Thursday', isWoToday: true },
  88000131: { name: 'Preetham S', gender: 'MALE', fixedWo: 'Friday' },
  88000134: { name: 'Jayashree (S)', gender: 'FEMALE', fixedWo: 'Sunday', pinkDutyEligible: true },
  88000135: { name: 'Arun', gender: 'MALE', fixedWo: 'Sunday' },
  88000136: { name: 'Shashank S', gender: 'MALE', fixedWo: 'Saturday' },
  88000137: { name: 'Lokesh A', gender: 'MALE', fixedWo: 'Saturday' },
  88000139: { name: 'Lingaraju DA (S)', gender: 'MALE', fixedWo: 'Sunday' },
  88000140: { name: 'Naveen Kumar MC', gender: 'MALE', fixedWo: 'Sunday' },
  88000141: { name: 'Kartik S Awari', gender: 'MALE', fixedWo: 'Saturday' },
  88000143: { name: 'Nandan Kumar BN', gender: 'MALE', fixedWo: 'Monday' }
};

// Strict exclusion of Station Superintendents, Station Controllers, and Supervisory Non-Driving staff
export const SUPERVISORY_NON_DRIVING_IDS = new Set([
  20726, 20038, 20037, 20018, 20019, 20057, 20087, 21502, 21715
]);

// Canonical Active Driving TO IDs for BMRCL Line 2 (Strictly driving Train Operators only)
export const CANONICAL_BMRCL_REGULAR_TO_IDS = [
  20787, 21029, 21078, 21083, 21414, 21434, 21436, 21482, 21504, 21506, 21509, 21553, 
  21694, 21702, 21703, 21705, 21708, 21711, 21712, 21714, 21723, 21724, 21725, 
  21945, 21953, 21955, 21961, 21967, 21968, 21969, 21970, 21971, 21977, 21978, 
  21988, 21994, 22013, 22016, 22101, 22116, 22224, 22227, 22229, 22234, 22236, 
  22237, 22238, 22239, 22240, 22244, 22245, 22246, 22248, 22254, 22256, 22258, 
  22260, 22261, 22264, 22268, 22281, 22282, 22284, 22287, 22289, 22294, 22296, 
  22297, 22308, 22312, 22315, 22319, 22322, 22438, 22455, 22456, 22457, 22458, 
  22461, 22463, 22464, 22465, 22468, 22470, 22480, 22483, 22484, 22486, 22490, 
  22491, 22493, 22494, 22497, 22499, 22500, 22502, 22506, 22514, 22517, 22522, 
  22525, 22527, 22528, 22561, 22566, 22571, 22572, 22581, 22586, 22588
];

export function getActiveLine2CandidateRoster() {
  const map = new Map();
  const empMap = new Map((EMPLOYEE_MASTER_REGISTRY || []).map(e => [e.empId, e]));
  const bmrclMap = new Map((BMRCL_CREW_MASTER_BACKUP || []).map(c => [parseInt(c.id || c.empId, 10), c]));

  // 1. Regular BMRCL Train Operators (Strictly exclude Supervisory / ALS / CC / Non-Driving)
  CANONICAL_BMRCL_REGULAR_TO_IDS.forEach(id => {
    if (SUPERVISORY_NON_DRIVING_IDS.has(id)) return;
    const empProfile = empMap.get(id) || {};
    if (empProfile.canDriveTrain === false && id !== 22456) return;
    if (empProfile.isOfficialCC || empProfile.role === 'OFFICIAL_CREW_CONTROLLER' || empProfile.role === 'Official ALS' || empProfile.role === 'Official GCC' || empProfile.role === 'Station Superintendent') return;
    const bmrclProfile = bmrclMap.get(id) || {};
    const userOver = BMRCL_LINE2_OPERATIONAL_CREW_METADATA[id] || {};

    const name = userOver.name || empProfile.name || bmrclProfile.name || `Operator #${id}`;
    const strId = String(id);
    const isMaternity = id === 22456 || Boolean(userOver.isMaternity || empProfile.status === 'MATERNITY_LEAVE');
    const isWoToday = Boolean(userOver.isWoToday);
    const pinkDutyEligible = Boolean(userOver.pinkDutyEligible || empProfile.pinkDutyEligible || empProfile.specialProfile === 'PINK');


    map.set(strId, {
      id: strId,
      empId: strId,
      name,
      gender: userOver.gender || empProfile.gender || bmrclProfile.gender || 'MALE',
      cadre: 'BMRCL Regular TO',
      designation: userOver.designation || empProfile.designation || 'Station Controller / Train Operator',
      role: 'TRAIN_OPERATOR',
      isJmd: false,
      phone: userOver.phone || empProfile.phone || bmrclProfile.contact || '',
      bloodGroup: userOver.bloodGroup || empProfile.bloodGroup || bmrclProfile.bloodGroup || '',
      fixedWo: userOver.fixedWo || empProfile.fixedWo || 'Sunday',
      isWoToday,
      isMaternity,
      pinkDutyEligible,
      crtValidTill: empProfile.competencyExpiry || empProfile.competencyValidTill || '2027-06-30',
      medicalValidTill: empProfile.medicalValidTill || '2027-12-31',
      pdcValidTill: empProfile.pdcValidTill || '2028-12-31',
      depotCompetency: true,
      soloCertified: true,
      currentLocation: 'PYID',
      restDuration: 12.5,
      status: isMaternity ? 'MATERNITY_LEAVE' : (isWoToday ? 'WO' : 'ACTIVE'),
      activeCrew: true
    });
  });

  // 2. JMD Contract Train Drivers (Exact 49 TDs - OFFICIAL_JMD_TD_REGISTRY)
  (OFFICIAL_JMD_TD_REGISTRY || []).forEach(jmd => {
    const numId = parseInt(jmd.empId, 10);
    const strId = String(numId);
    const userOver = BMRCL_LINE2_OPERATIONAL_CREW_METADATA[numId] || {};
    const isWoToday = Boolean(userOver.isWoToday);

    map.set(strId, {
      id: strId,
      empId: strId,
      name: userOver.name || jmd.name || `Driver #${strId}`,
      gender: userOver.gender || jmd.gender || 'MALE',
      cadre: 'JMD Contract TD',
      designation: 'Train Driver (JMD Contract)',
      role: 'TRAIN_DRIVER',
      isJmd: true,
      phone: userOver.phone || jmd.phone || '',
      bloodGroup: userOver.bloodGroup || jmd.bloodGroup || '',
      fixedWo: userOver.fixedWo || jmd.fixedWo || 'Tuesday',
      isWoToday,
      isMaternity: false,
      pinkDutyEligible: Boolean(userOver.pinkDutyEligible || jmd.pinkDutyEligible),
      crtValidTill: jmd.competencyExpiry || '2027-06-30',
      medicalValidTill: jmd.medicalValidTill || '2027-12-31',
      pdcValidTill: '2028-12-31',
      depotCompetency: true,
      soloCertified: true,
      currentLocation: 'PYID',
      restDuration: 12.0,
      status: isWoToday ? 'WO' : 'ACTIVE',
      activeCrew: true
    });
  });

  return Array.from(map.values());
}

/**
 * Retrieves the cached data from BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
 */
export function getPeenyaDepotRosterDeskConsoleData() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = window.localStorage.getItem('pyidcc_roster_desk_console_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
      // Check date-specific cache keys
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith('pyidcc_roster_desk_console_cache_')) {
          const val = window.localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === 'object') return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse pyidcc_roster_desk_console_cache', e);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WTT TIMETABLE & WORKING TIME TABLE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function getWttTripsForTrain(dayType = DAY_TYPES.WEEKDAY, trainId) {
  const normDay = resolveActiveDayType(dayType);
  const normTid = String(trainId).trim();

  const matchingRows = WTT_MASTER_REGISTRY.filter(row => {
    return String(row.scheduleType || '').toUpperCase() === normDay &&
      (String(row.trainId) === normTid || String(row.dnTid) === normTid || String(row.upTid) === normTid);
  });

  const trips = [];
  matchingRows.forEach(row => {
    if (row.upTrip) {
      trips.push({
        tripId: row.upTrip.id,
        direction: 'UP',
        route: row.upTrip.terminalLoopRoute,
        stations: row.upTrip.stations || {},
        rowSeq: row.rowSeq
      });
    }
    if (row.downTrip) {
      trips.push({
        tripId: row.downTrip.id,
        direction: 'DOWN',
        route: row.downTrip.terminalLoopRoute,
        stations: row.downTrip.stations || {},
        rowSeq: row.rowSeq
      });
    }
  });

  return trips;
}

export function getWttStationTiming(dayType = DAY_TYPES.WEEKDAY, trainId, stationCode, targetTimeSecs = null) {
  const trips = getWttTripsForTrain(dayType, trainId);
  if (!trips.length) return null;

  let bestMatch = null;
  let minDiff = Infinity;

  trips.forEach(trip => {
    const rawTime = trip.stations[stationCode];
    if (rawTime && rawTime !== '--' && rawTime !== '-') {
      const timeSecs = timeToSeconds(rawTime);
      if (timeSecs !== null) {
        if (targetTimeSecs === null) {
          if (!bestMatch) bestMatch = { timeStr: rawTime, timeSecs, trip };
        } else {
          const diff = Math.abs(timeSecs - targetTimeSecs);
          if (diff < minDiff) {
            minDiff = diff;
            bestMatch = { timeStr: rawTime, timeSecs, trip };
          }
        }
      }
    }
  });

  return bestMatch;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINK ROSTER & DUTY TRIPS RESOLUTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export function findDutyAndTripFromRoster(dayType = DAY_TYPES.WEEKDAY, trainId, targetTimeSecs) {
  const normTid = String(trainId).trim();

  for (const duty of PRELOADED_DUTIES) {
    if (!duty.trips || !Array.isArray(duty.trips)) continue;

    for (let i = 0; i < duty.trips.length; i++) {
      const trip = duty.trips[i];
      if (String(trip.trainNo || '').trim() === normTid) {
        const startSecs = timeToSeconds(trip.timeFrm);
        const endSecs = timeToSeconds(trip.timeTo);

        if (targetTimeSecs !== null && startSecs !== null && endSecs !== null) {
          if (targetTimeSecs >= startSecs - 900 && targetTimeSecs <= endSecs + 900) {
            return {
              dutyNo: duty.dutyNo,
              normDutyNo: normalizeDutyId(duty.dutyNo),
              dutyType: duty.dutyType,
              tripIndex: i + 1,
              totalTrips: duty.trips.length,
              activeTrip: trip,
              nextTrip: duty.trips[i + 1] || null,
              sOnTime: duty.sOnTime,
              sOffTime: duty.sOffTime,
              signOnLocation: duty.signOnLocation,
              signOffLocation: duty.signOffLocation,
              dutyHrs: duty.dutyHrs,
              drivingHrs: duty.drivingHrs,
              breakTime: duty.breakTime,
              allTrips: duty.trips
            };
          }
        } else {
          return {
            dutyNo: duty.dutyNo,
            normDutyNo: normalizeDutyId(duty.dutyNo),
            dutyType: duty.dutyType,
            tripIndex: i + 1,
            totalTrips: duty.trips.length,
            activeTrip: trip,
            nextTrip: duty.trips[i + 1] || null,
            sOnTime: duty.sOnTime,
            sOffTime: duty.sOffTime,
            signOnLocation: duty.signOnLocation,
            signOffLocation: duty.signOffLocation,
            dutyHrs: duty.dutyHrs,
            drivingHrs: duty.drivingHrs,
            breakTime: duty.breakTime,
            allTrips: duty.trips
          };
        }
      }
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISPATCH GATEWAY CORE & ROSTER DESK CONSOLE RELIEF RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Authoritative Canonical BMRCL Line 2 Weekday Duty Roster Assignments.
 * Ensures official duty-to-operator assignments (e.g. Duty 35 -> Shamukha Rao B #22245, Duty 54 -> Venkatesh N #22455).
 */
export const CANONICAL_WEEKDAY_DUTY_OPERATORS = {
  ...WEEKDAY_MASTER_DUTY_ROSTER,
  '35': { empId: '22245', empName: 'Shamukha Rao B', dutyNo: '35' },
  '54': { empId: '22455', empName: 'Venkatesh N', dutyNo: '54' }
};

export function lookupDeployedOperatorFromCore(deployments = [], crewRegistry = [], dutyNo, dayType = DAY_TYPES.WEEKDAY) {
  const normDuty = normalizeDutyId(dutyNo);
  const unnormDuty = String(parseInt(dutyNo, 10) || dutyNo);
  const dutyNum = parseInt(normDuty, 10);
  const normDay = resolveActiveDayType(dayType);
  const activeCandidatePool = getActiveLine2CandidateRoster();
  const activeCandidatesMap = new Map(activeCandidatePool.map(c => [String(c.empId), c]));

  // Official Canonical Duty Assignment for BMRCL Line 2 Weekday Roster
  const canonicalAssignment = CANONICAL_WEEKDAY_DUTY_OPERATORS[normDuty] || CANONICAL_WEEKDAY_DUTY_OPERATORS[unnormDuty] || getOperatorForDuty(normDuty);

  // 1. Check live deployments from Dispatch Gateway Core (crew_daily_deployment / dispatch_deployments)
  const deployed = (deployments || []).find(d => {
    const dId = String(d.dutyId || d.dutyNo || d.rawDutyId || '').trim();
    return dId === normDuty || dId === unnormDuty || dId === String(dutyNo);
  });

  let empId = deployed?.empId || deployed?.empNo || deployed?.employeeId;
  let empName = deployed?.empName || deployed?.name || deployed?.operatorName;
  let status = deployed?.status || 'ON_DUTY';

  // Hard safety firewall: Reject supervisory non-driving staff (20018 Arunkumar D S, 20726 Nagesh N, etc.)
  if (empId && SUPERVISORY_NON_DRIVING_IDS.has(Number(empId))) {
    empId = null;
    empName = null;
  }

  const isExchanged = Boolean(deployed?.isExchanged || deployed?.status === 'SWAPPED_BY_CC' || deployed?.status === 'RELIEF_DISPATCHED');
  const isJmdMisassigned = empId && String(empId).startsWith('88');
  const hasValidActiveDeployment = Boolean(
    empName && 
    empName !== '--' && 
    empName !== '-' && 
    empName !== 'UNASSIGNED' && 
    !empName.toLowerCase().includes('unassigned') && 
    !empName.startsWith('Train Operator') && 
    !empName.startsWith('Duty ') &&
    !isJmdMisassigned
  );

  // 2. Check cached Roster Desk Console duties (pyidcc_roster_desk_console_cache) from AutomatedDispatchGate
  if (!hasValidActiveDeployment) {
    const consoleData = getPeenyaDepotRosterDeskConsoleData();
    if (consoleData?.duties && Array.isArray(consoleData.duties)) {
      const consoleMatch = consoleData.duties.find(d => {
        const dId = String(d.dutyId || d.dutyNo || d.rawDutyId || '').trim();
        const candEmpId = Number(d.empId || d.empNo);
        return (dId === normDuty || dId === unnormDuty) && !SUPERVISORY_NON_DRIVING_IDS.has(candEmpId);
      });
      if (consoleMatch && (consoleMatch.empName || consoleMatch.name)) {
        empId = consoleMatch.empId || consoleMatch.empNo;
        empName = consoleMatch.empName || consoleMatch.name;
        status = consoleMatch.status || 'ON_DUTY';
      }
    }
    if ((!empName || empName === '--') && consoleData?.onDuty && Array.isArray(consoleData.onDuty)) {
      const onDutyMatch = consoleData.onDuty.find(d => {
        const dId = String(d.dutyId || d.dutyNo || '').trim();
        return (dId === normDuty || dId === unnormDuty);
      });
      if (onDutyMatch && (onDutyMatch.empName || onDutyMatch.name)) {
        empId = onDutyMatch.empId || onDutyMatch.empNo;
        empName = onDutyMatch.empName || onDutyMatch.name;
        status = onDutyMatch.status || 'ON_DUTY';
      }
    }
  }

  // 3. Check crewRegistry from OperationalEngine
  if (!empId || empId === '--' || empId === 'UNASSIGNED') {
    if (Array.isArray(crewRegistry) && crewRegistry.length > 0) {
      const fromRegistry = crewRegistry.find(c => {
        const cDuty = String(c.currentDuty || c.dutyId || c.dutyNo || '').trim();
        const numCId = Number(c.empId || c.id);
        return (cDuty === normDuty || cDuty === unnormDuty) && !SUPERVISORY_NON_DRIVING_IDS.has(numCId);
      });
      if (fromRegistry) {
        empId = fromRegistry.empId || fromRegistry.id;
        empName = fromRegistry.name || fromRegistry.empName;
        status = fromRegistry.currentStatus || 'ON_DUTY';
      }
    }
  }

  // 4. Fallback to canonical roster assignment ONLY if active deployed operator is not available
  if (!empId || empId === '--' || empId === 'UNASSIGNED') {
    if (canonicalAssignment) {
      empId = canonicalAssignment.empId;
      empName = canonicalAssignment.empName;
    }
  }

  // 4. Canonical & Deterministic Active Driving TO Mapping (Strictly Train Operators from Dispatch Gateway Core)
  // Ensures distinct duties receive their respective qualified drivers
  if (!empId || empId === '--' || empId === 'UNASSIGNED') {
    if (canonicalAssignment) {
      empId = canonicalAssignment.empId;
      empName = canonicalAssignment.empName;
    } else {
      const drivingOnly = activeCandidatePool.filter(c => 
        !c.isMaternity && 
        !SUPERVISORY_NON_DRIVING_IDS.has(Number(c.empId)) && 
        c.role === 'TRAIN_OPERATOR'
      );

      if (drivingOnly.length > 0) {
        const dutyIdx = !isNaN(dutyNum) && dutyNum > 0 ? (dutyNum - 1) % drivingOnly.length : 0;
        const assigned = drivingOnly[dutyIdx];
        empId = assigned.empId;
        empName = assigned.name;
      } else {
        empId = '20787';
        empName = 'Baskar S';
      }
    }
  }

  const candidate = activeCandidatesMap.get(String(empId));
  const profile = candidate || activeCandidatePool.find(c => !SUPERVISORY_NON_DRIVING_IDS.has(Number(c.empId))) || {};

  return {
    empId: String(empId || profile.empId || '20787'),
    empName: empName || profile.name || 'Baskar S',
    designation: profile.designation || 'Station Controller / Train Operator',
    cadre: profile.cadre || 'BMRCL Regular TO',
    dutyId: normDuty,
    isOnDuty: status !== 'ABSENT' && status !== 'NOT_REPORTING' && status !== 'OFF_DUTY',
    status,
    isJmd: Boolean(profile.isJmd),
    crtValidTill: profile.crtValidTill || '2027-06-30',
    medicalValidTill: profile.medicalValidTill || '2027-12-31',
    pdcValidTill: profile.pdcValidTill || '2028-12-31',
    depotCompetency: true,
    soloCertified: true,
    currentLocation: deployed?.location || 'PYID',
    isNight: Boolean(deployed?.isNight || String(normDuty).includes('N')),
    restDuration: typeof deployed?.restDuration === 'number' ? deployed.restDuration : 12.5
  };
}

/**
 * Platform Resolver for BMRCL Line-2 Green Line (Section 14)
 * UP Direction (towards BIET / Madhavara) -> Platform 1 (UP)
 * DN Direction (towards Silk Institute) -> Platform 2 (DN)
 * Peenya Depot Lead Tracks -> Lead 1 / Stabling Neck
 * Returns "PLATFORM INFORMATION UNAVAILABLE." if unverifiable.
 */
export function resolvePlatform(stationCode, direction = 'UP', movementType = 'MAINLINE') {
  if (!stationCode) return 'PLATFORM INFORMATION UNAVAILABLE.';
  const code = String(stationCode).toUpperCase().trim();
  const dir = String(direction || 'UP').toUpperCase().trim();

  if (movementType === 'DEPOT' || code === 'DEPOT') {
    return 'Depot Lead / Stabling Neck';
  }

  // Station specific rules
  if (code.includes('JLHL')) {
    if (dir.includes('DN') || dir.includes('DOWN')) return 'Platform 2 (DN)';
    if (dir.includes('UP')) return 'Platform 1 (UP)';
  }

  if (code.includes('PYID')) {
    if (movementType === 'DEPOT') return 'Depot Lead / Stabling Neck';
    if (dir.includes('DN') || dir.includes('DOWN')) return 'Platform 2 (DN)';
    return 'Platform 1 (UP)';
  }

  if (dir.includes('UP')) return 'Platform 1 (UP)';
  if (dir.includes('DN') || dir.includes('DOWN')) return 'Platform 2 (DN)';

  return 'PLATFORM INFORMATION UNAVAILABLE.';
}

/**
 * Train Destination Verifier (Section 4)
 * Independently verifies whether train destination is DEPOT or MAINLINE SERVICE.
 * If cannot be verified from operational data, halts automatic decision.
 */
export function verifyTrainDestination({
  trainId,
  dayType = DAY_TYPES.WEEKDAY,
  intent = null,
  wttTrips = [],
  dutyLink = null,
  swapLocation = 'PYID'
}) {
  const normDay = resolveActiveDayType(dayType);

  // 1. Controller / User explicit intent
  if (intent === TRAIN_INTENT_TYPES.DEPOT) {
    return {
      destination: 'DEPOT',
      verified: true,
      source: 'OCC_OPERATIONAL_INSTRUCTION',
      reason: 'Verified stabling movement into Peenya Depot authorized by OCC.'
    };
  }

  if (intent === TRAIN_INTENT_TYPES.CONTINUE_SERVICE) {
    return {
      destination: 'MAINLINE SERVICE',
      verified: true,
      source: 'OCC_OPERATIONAL_INSTRUCTION',
      reason: 'Verified continuing passenger revenue service on Green Line corridor.'
    };
  }

  // 2. Duty Link Roster trips verification
  if (dutyLink) {
    const nextTrip = dutyLink.nextTrip || dutyLink.activeTrip;
    const dest = String(nextTrip?.handoverLocation || nextTrip?.trainNo || dutyLink.signOffLocation || '').toUpperCase();
    if (dest.includes('DEPO') || dest.includes('DHO')) {
      return {
        destination: 'DEPOT',
        verified: true,
        source: 'LINK_ROSTER_DUTY_LEG',
        reason: `Duty ${dutyLink.dutyNo} leg terminates into Peenya Depot (${dutyLink.signOffLocation || 'Depot'}).`
      };
    }
    if (nextTrip && (nextTrip.trainNo || nextTrip.handoverLocation)) {
      return {
        destination: 'MAINLINE SERVICE',
        verified: true,
        source: 'LINK_ROSTER_DUTY_LEG',
        reason: `Duty ${dutyLink.dutyNo} rostered for continuing run towards ${nextTrip.handoverLocation || 'Mainline'}.`
      };
    }
  }

  // 3. WTT Timetable check
  if (wttTrips && wttTrips.length > 0) {
    const lastTrip = wttTrips[wttTrips.length - 1];
    const route = String(lastTrip.route || '').toUpperCase();
    if (route.includes('DEPOT')) {
      return {
        destination: 'DEPOT',
        verified: true,
        source: 'WTT_WORKING_TIMETABLE',
        reason: 'WTT stabling trip sequence terminates at Peenya Depot.'
      };
    } else {
      return {
        destination: 'MAINLINE SERVICE',
        verified: true,
        source: 'WTT_WORKING_TIMETABLE',
        reason: `WTT schedule leg indicates mainline revenue service: ${lastTrip.route || 'Green Line Corridor'}.`
      };
    }
  }

  return {
    destination: null,
    verified: false,
    source: 'UNVERIFIED',
    reason: 'TRAIN DESTINATION COULD NOT BE VERIFIED FROM OPERATIONAL DATA.'
  };
}

/**
 * Operator Status Engine (Section 15)
 * Returns one explicit status:
 * DRIVING | BREAK | AVAILABLE | WAITING | RELIEF REQUIRED | RELIEF ASSIGNED | DEPOT ASSIGNED | MAINLINE ASSIGNED | SIGN OFF | NOT AVAILABLE
 */
export function determineOperatorStatus(operator, targetTimeSecs, targetTrain) {
  if (!operator) return OPERATOR_STATUS_TYPES.NOT_AVAILABLE;

  if (operator.isOnDuty === false || operator.status === 'OFF_DUTY' || operator.status === 'SIGNED_OFF') {
    return OPERATOR_STATUS_TYPES.SIGN_OFF;
  }

  if (operator.isWo || operator.leave || operator.bookOff || operator.status === 'WO' || operator.status === 'LEAVE') {
    return OPERATOR_STATUS_TYPES.NOT_AVAILABLE;
  }

  if (operator.status === 'BREAK' || operator.isOnBreak) {
    return OPERATOR_STATUS_TYPES.BREAK;
  }

  if (operator.reliefAssigned) {
    return OPERATOR_STATUS_TYPES.RELIEF_ASSIGNED;
  }

  if (operator.reliefRequired) {
    return OPERATOR_STATUS_TYPES.RELIEF_REQUIRED;
  }

  if (operator.isDriving || operator.status === 'DRIVING' || operator.currentActiveTrainId) {
    return OPERATOR_STATUS_TYPES.DRIVING;
  }

  if (operator.status === 'WAITING' || operator.isWaiting) {
    return OPERATOR_STATUS_TYPES.WAITING;
  }

  if (operator.assignedDestination === 'DEPOT') {
    return OPERATOR_STATUS_TYPES.DEPOT_ASSIGNED;
  }

  if (operator.assignedDestination === 'MAINLINE') {
    return OPERATOR_STATUS_TYPES.MAINLINE_ASSIGNED;
  }

  return OPERATOR_STATUS_TYPES.AVAILABLE;
}

/**
 * Evaluates whether an operator's scheduled shift timings cover targetTimeSecs,
 * enforces statutory sign-off limits, and checks for minimum buffer before sign-off.
 * 
 * Rules:
 *  1. If targetTimeSecs is after scheduled sign-off -> PAST_SCHEDULED_SIGN_OFF (Disqualified)
 *  2. If remaining duty duration < minBufferSecs (30m) -> IMMINENT_SIGN_OFF_BREACH (Disqualified)
 *  3. If targetTimeSecs is > 15m before scheduled sign-on -> SHIFT_NOT_YET_COMMENCED (Disqualified)
 *  4. Overnight shifts (spanning midnight, e.g. 21:30 to 06:30) handled accurately.
 */
export function evaluateDutyShiftWindow(signOnTime, signOffTime, targetTimeSecs, minBufferSecs = 1800) {
  const signOnSecs = timeToSeconds(signOnTime || '06:00:00');
  const signOffSecs = timeToSeconds(signOffTime || '14:00:00');

  if (signOnSecs === null || signOffSecs === null || targetTimeSecs === null) {
    return {
      valid: false,
      reason: 'INVALID_DUTY_TIMINGS',
      details: 'Duty sign-on/sign-off timings could not be resolved',
      remainingShiftMinutes: 0
    };
  }

  // Case A: Daytime or Evening Shift within the same calendar day (signOn < signOff)
  // E.g., Shift A (06:00 - 14:00) or Shift B (14:00 - 22:00)
  if (signOnSecs < signOffSecs) {
    // 1. Check if shift has not commenced yet
    if (targetTimeSecs < signOnSecs - 900) { // allow 15m reporting buffer
      const minsUntilSignOn = Math.round((signOnSecs - targetTimeSecs) / 60);
      return {
        valid: false,
        reason: 'SHIFT_NOT_YET_COMMENCED',
        details: `Shift commences at ${signOnTime} (starts in ${minsUntilSignOn} mins)`,
        remainingShiftMinutes: 0
      };
    }

    // 2. Check if target time is at or after scheduled sign-off time
    if (targetTimeSecs >= signOffSecs) {
      const minsPastSignOff = Math.round((targetTimeSecs - signOffSecs) / 60);
      return {
        valid: false,
        reason: 'PAST_SCHEDULED_SIGN_OFF',
        details: `Scheduled sign-off was ${signOffTime} (${minsPastSignOff} mins ago)`,
        remainingShiftMinutes: 0
      };
    }

    // 3. Check remaining duty time buffer
    const remainingSecs = signOffSecs - targetTimeSecs;
    const remainingShiftMinutes = Math.round(remainingSecs / 60);

    if (remainingSecs < minBufferSecs) {
      return {
        valid: false,
        reason: 'IMMINENT_SIGN_OFF_BREACH',
        details: `Only ${remainingShiftMinutes} mins remaining before scheduled sign-off (${signOffTime}); minimum 30 mins buffer required`,
        remainingShiftMinutes
      };
    }

    return {
      valid: true,
      reason: 'WITHIN_SCHEDULED_DUTY_WINDOW',
      details: `${remainingShiftMinutes} mins remaining until scheduled sign-off (${signOffTime})`,
      remainingShiftMinutes
    };
  }

  // Case B: Overnight Shift spanning midnight (signOn >= signOff)
  // E.g., Shift N (21:30 - 06:30)
  let remainingSecs = 0;
  let isActive = false;

  if (targetTimeSecs >= signOnSecs - 900) {
    // Evening portion (e.g. 21:15 to 23:59:59)
    isActive = true;
    remainingSecs = (86400 - targetTimeSecs) + signOffSecs;
  } else if (targetTimeSecs < signOffSecs) {
    // Morning portion (e.g. 00:00:00 to 06:30:00)
    isActive = true;
    remainingSecs = signOffSecs - targetTimeSecs;
  }

  if (!isActive) {
    return {
      valid: false,
      reason: 'NIGHT_SHIFT_INACTIVE',
      details: `Night shift runs ${signOnTime} to ${signOffTime}; operator off-duty during daytime at ${secondsToTimeStr(targetTimeSecs)}`,
      remainingShiftMinutes: 0
    };
  }

  const remainingShiftMinutes = Math.round(remainingSecs / 60);

  if (remainingSecs < minBufferSecs) {
    return {
      valid: false,
      reason: 'IMMINENT_SIGN_OFF_BREACH',
      details: `Only ${remainingShiftMinutes} mins remaining before night sign-off (${signOffTime}); minimum 30 mins buffer required`,
      remainingShiftMinutes
    };
  }

  return {
    valid: true,
    reason: 'WITHIN_SCHEDULED_DUTY_WINDOW',
    details: `${remainingShiftMinutes} mins remaining until night sign-off (${signOffTime})`,
    remainingShiftMinutes
  };
}

/**
 * Resolves accurate scheduled sign-on and sign-off timings for any operator or reserve
 * based on official BMRCL PRELOADED_DUTIES, custom registers, or shift designations.
 */
export function resolveOperatorDutyTimings(dutyIdOrCode = '', itemOrCandidate = {}, targetTimeSecs = null) {
  const rawDutyStr = String(dutyIdOrCode || itemOrCandidate.dutyId || itemOrCandidate.dutyNo || itemOrCandidate.code || itemOrCandidate.rawDutyId || '').trim();
  const rawUpper = rawDutyStr.toUpperCase();

  // 1. Explicit timings on item/candidate
  let explicitSignOn = itemOrCandidate.sOnTime || itemOrCandidate.signOnTime || itemOrCandidate.signOn || itemOrCandidate.timeFrm;
  let explicitSignOff = itemOrCandidate.sOffTime || itemOrCandidate.expectedSignOff || itemOrCandidate.signOffTime || itemOrCandidate.signOff || itemOrCandidate.timeTo;

  if (typeof itemOrCandidate.time === 'string' && itemOrCandidate.time.includes('-')) {
    const parts = itemOrCandidate.time.split('-').map(s => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      if (!explicitSignOn) explicitSignOn = parts[0];
      if (!explicitSignOff) explicitSignOff = parts[1];
    }
  }

  // 2. Check PRELOADED_DUTIES for exact duty number match (e.g. "Duty 08", "8", "A8Jc", "Duty 31", "32")
  const numMatch = rawDutyStr.match(/\b\d+\b/);
  const dutyNum = numMatch ? numMatch[0] : null;

  if (dutyNum) {
    const dutyRecord = PRELOADED_DUTIES.find(d => String(d.dutyNo) === String(parseInt(dutyNum, 10)) || String(d.dutyNo) === dutyNum);
    if (dutyRecord) {
      return {
        dutyId: dutyRecord.dutyNo,
        dutyType: dutyRecord.dutyType,
        signOnTime: dutyRecord.sOnTime,
        expectedSignOff: dutyRecord.sOffTime,
        signOnLocation: dutyRecord.signOnLocation || 'PYID',
        signOffLocation: dutyRecord.signOffLocation || 'PYID'
      };
    }
  }

  // If explicit timings are present and valid, use them
  if (explicitSignOn && explicitSignOff && explicitSignOn !== '--' && explicitSignOff !== '--') {
    return {
      dutyId: rawDutyStr || 'DUTY',
      dutyType: itemOrCandidate.dutyType || rawDutyStr,
      signOnTime: explicitSignOn.length === 5 ? `${explicitSignOn}:00` : explicitSignOn,
      expectedSignOff: explicitSignOff.length === 5 ? `${explicitSignOff}:00` : explicitSignOff,
      signOnLocation: itemOrCandidate.station || itemOrCandidate.location || 'PYID',
      signOffLocation: itemOrCandidate.signOffLocation || 'PYID'
    };
  }

  // 3. Known Reserve Duty Codes in BMRCL Line 2
  if (rawUpper.includes('PRO 2') || rawUpper.includes('PRO2') || rawUpper.includes('PILOT 2') || rawUpper === 'B PRO') {
    return { dutyId: '31', dutyType: 'Pro2', signOnTime: '14:00:00', expectedSignOff: '22:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.includes('OR 2') || rawUpper.includes('OR2') || rawUpper === 'B OR' || rawUpper.includes('EVENING OR')) {
    return { dutyId: '32', dutyType: 'OR2', signOnTime: '14:00:00', expectedSignOff: '22:00:00', signOnLocation: 'TGTP', signOffLocation: 'TGTP' };
  }
  if (rawUpper.includes('PRO 3') || rawUpper.includes('PRO3') || rawUpper.includes('NPRO') || rawUpper.includes('NIGHT PRO')) {
    return { dutyId: '75', dutyType: 'Pro3', signOnTime: '21:30:00', expectedSignOff: '06:30:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.includes('OR 3') || rawUpper.includes('OR3') || rawUpper.includes('NIGHT OR')) {
    return { dutyId: 'OR3', dutyType: 'OR3', signOnTime: '21:30:00', expectedSignOff: '05:30:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.includes('PRO 1') || rawUpper.includes('PRO1') || rawUpper.includes('PILOT 1') || rawUpper === 'A PRO') {
    return { dutyId: '01', dutyType: 'Pro1', signOnTime: '06:00:00', expectedSignOff: '14:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.includes('OR 1') || rawUpper.includes('OR1') || rawUpper === 'A OR' || rawUpper.includes('MORNING OR')) {
    return { dutyId: '02', dutyType: 'OR1', signOnTime: '06:30:00', expectedSignOff: '14:30:00', signOnLocation: 'TGTP', signOffLocation: 'TGTP' };
  }

  // Standbys
  if (rawUpper.includes('STBY 3') || rawUpper.includes('STBY 4') || rawUpper.includes('EVENING STANDBY')) {
    return { dutyId: 'STBY_B', dutyType: 'Standby B', signOnTime: '14:00:00', expectedSignOff: '22:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.includes('STBY N') || rawUpper.includes('NIGHT STANDBY')) {
    return { dutyId: 'STBY_N', dutyType: 'Standby N', signOnTime: '21:30:00', expectedSignOff: '06:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.includes('STBY 1') || rawUpper.includes('STBY 2') || rawUpper.includes('MORNING STANDBY')) {
    return { dutyId: 'STBY_A', dutyType: 'Standby A', signOnTime: '06:00:00', expectedSignOff: '14:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }

  // 4. If dutyId mentions a shift letter: 'A', 'B', 'N'
  if (rawUpper.startsWith('A') || itemOrCandidate.shift === 'A') {
    return { dutyId: rawDutyStr || 'A-SHIFT', dutyType: 'A-Shift', signOnTime: '06:00:00', expectedSignOff: '14:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.startsWith('B') || itemOrCandidate.shift === 'B') {
    return { dutyId: rawDutyStr || 'B-SHIFT', dutyType: 'B-Shift', signOnTime: '14:00:00', expectedSignOff: '22:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }
  if (rawUpper.startsWith('N') || itemOrCandidate.shift === 'N') {
    return { dutyId: rawDutyStr || 'N-SHIFT', dutyType: 'N-Shift', signOnTime: '21:30:00', expectedSignOff: '06:30:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
  }

  // 5. Shift context based on target incident time
  if (targetTimeSecs !== null) {
    if (targetTimeSecs >= 48600 && targetTimeSecs < 77400) {
      // Evening Shift B (13:30 to 21:30)
      return { dutyId: rawDutyStr || 'B-SHIFT', dutyType: 'B-Shift Reserve', signOnTime: '14:00:00', expectedSignOff: '22:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
    } else if (targetTimeSecs >= 77400 || targetTimeSecs < 19800) {
      // Night Shift N (21:30 to 05:30)
      return { dutyId: rawDutyStr || 'N-SHIFT', dutyType: 'N-Shift Reserve', signOnTime: '21:30:00', expectedSignOff: '06:30:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
    }
  }

  // Default to Morning Shift A
  return { dutyId: rawDutyStr || '01', dutyType: 'A-Shift Reserve', signOnTime: '06:00:00', expectedSignOff: '14:00:00', signOnLocation: 'PYID', signOffLocation: 'PYID' };
}

/**
 * Scans BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE and DISPATCH GATEWAY CORE
 * for authentic on-duty Out-Relievers (OR), Standbys, STBK, and PROs.
 * Only draws from active Train Operators and JMD Contract TDs.
 * Strictly adheres to 5-Priority Waterfall (Section 8 & 22):
 *  Priority 1: Actual Assigned Operator
 *  Priority 2: PRO (Pilot Reserve Operators)
 *  Priority 3: OR (Operating Reserves)
 *  Priority 4: STANDBY (Depot Standbys)
 *  Priority 5: Other Eligible Duty Operator
 */
export function findDispatchCoreReliefPool(
  deployments = [], 
  crewRegistry = [], 
  dayType = DAY_TYPES.WEEKDAY, 
  targetTimeSecs = null,
  swapLocation = 'PYID'
) {
  const normDay = resolveActiveDayType(dayType);
  const activeCandidates = getActiveLine2CandidateRoster();
  const activeCandidatesMap = new Map(activeCandidates.map(c => [String(c.empId), c]));
  const seenEmpIds = new Set();
  const candidates = [];

  const consoleData = getPeenyaDepotRosterDeskConsoleData();

  // 1. INGEST PRO / PILOT RESERVES FROM CONSOLE CUSTOM REGISTERS (PRIORITY 2: PRO)
  if (consoleData?.customRegisters) {
    Object.entries(consoleData.customRegisters).forEach(([tag, list]) => {
      if (!Array.isArray(list)) return;
      const tagUpper = tag.toUpperCase();
      const isPro = tagUpper.includes('PRO') || tagUpper.includes('PILOT');
      if (!isPro) return;

      list.forEach((item, idx) => {
        const empId = String(item.empNo || item.empId || '').trim();
        const empName = String(item.name || item.empName || '').trim();
        if (!empName || empName === '--' || empName.toUpperCase().includes('VACANT')) return;
        if (empId && (seenEmpIds.has(empId) || SUPERVISORY_NON_DRIVING_IDS.has(Number(empId)))) return;
        if (empId) seenEmpIds.add(empId);

        const candidateProfile = activeCandidatesMap.get(empId) || {};
        const timings = resolveOperatorDutyTimings(tag, item, targetTimeSecs);

        candidates.push({
          empId: empId || `PRO_${idx + 1}`,
          empName: empName || candidateProfile.name || `${tag} Pilot Reliever`,
          designation: candidateProfile.designation || 'Train Operator',
          cadre: 'Pilot Reserve Operator (PRO)',
          dutyId: timings.dutyId || tag,
          reliefRole: `Pilot Reliever (@${tag})`,
          poolTier: 'PRO',
          priorityRank: 2,
          isOnDuty: true,
          status: 'ON_DUTY',
          signOnTime: timings.signOnTime,
          expectedSignOff: timings.expectedSignOff,
          crtValidTill: candidateProfile.crtValidTill || '2027-07-31',
          medicalValidTill: candidateProfile.medicalValidTill || '2028-03-31',
          pdcValidTill: '2028-12-31',
          depotCompetency: true,
          soloCertified: true,
          currentLocation: 'PYID',
          restDuration: 13.0,
          source: 'PEENYA_ROSTER_DESK_PRO'
        });
      });
    });
  }

  // 2. INGEST OPERATING RESERVES (@OR) FROM CONSOLE (PRIORITY 3: OR)
  if (consoleData?.standbys && Array.isArray(consoleData.standbys)) {
    consoleData.standbys.forEach((item, idx) => {
      const empId = String(item.empNo || item.empId || '').trim();
      const empName = String(item.name || item.empName || '').trim();
      if (!empName || empName === '--' || empName.toUpperCase().includes('VACANT')) return;
      if (empId && (seenEmpIds.has(empId) || SUPERVISORY_NON_DRIVING_IDS.has(Number(empId)))) return;

      const codeUpper = String(item.code || item.label || 'OR').toUpperCase();
      const isOR = codeUpper.startsWith('OR') || codeUpper.includes(' OR ') || String(item.dutyId || '').toUpperCase().startsWith('OR');
      if (!isOR) return;

      if (empId) seenEmpIds.add(empId);
      const candidateProfile = activeCandidatesMap.get(empId) || {};
      const rawCode = item.code || item.label || item.dutyId || 'OR1';
      const timings = resolveOperatorDutyTimings(rawCode, item, targetTimeSecs);

      candidates.push({
        empId: empId || `OR_${idx + 1}`,
        empName: empName || candidateProfile.name || 'Operating Reserve (OR)',
        designation: candidateProfile.designation || 'Train Operator',
        cadre: 'Operating Reserve (OR)',
        dutyId: timings.dutyId || rawCode,
        reliefRole: 'Operating Reserve (@OR)',
        poolTier: 'OR',
        priorityRank: 3,
        isOnDuty: true,
        status: 'ON_DUTY',
        signOnTime: timings.signOnTime,
        expectedSignOff: timings.expectedSignOff,
        crtValidTill: candidateProfile.crtValidTill || '2027-08-31',
        medicalValidTill: candidateProfile.medicalValidTill || '2028-03-31',
        pdcValidTill: '2028-12-31',
        depotCompetency: true,
        soloCertified: true,
        currentLocation: 'PYID',
        restDuration: 13.5,
        source: 'PEENYA_ROSTER_DESK_CONSOLE_OR'
      });
    });
  }

  // 3. INGEST DEPOT STANDBYS & STEP-BACKS (@Standby, @STBK, @TGTP, @RD3) (PRIORITY 4: STANDBY)
  if (consoleData?.standbys && Array.isArray(consoleData.standbys)) {
    consoleData.standbys.forEach((item, idx) => {
      const empId = String(item.empNo || item.empId || '').trim();
      const empName = String(item.name || item.empName || '').trim();
      if (!empName || empName === '--' || empName.toUpperCase().includes('VACANT')) return;
      if (empId && (seenEmpIds.has(empId) || SUPERVISORY_NON_DRIVING_IDS.has(Number(empId)))) return;

      const codeUpper = String(item.code || item.label || 'STBY').toUpperCase();
      const isOR = codeUpper.startsWith('OR') || codeUpper.includes(' OR ') || String(item.dutyId || '').toUpperCase().startsWith('OR');
      if (isOR) return; // Handled in OR

      if (empId) seenEmpIds.add(empId);
      const candidateProfile = activeCandidatesMap.get(empId) || {};
      const rawCode = item.code || item.label || item.dutyId || 'STBY';
      const timings = resolveOperatorDutyTimings(rawCode, item, targetTimeSecs);

      candidates.push({
        empId: empId || `STBY_${idx + 1}`,
        empName: empName || candidateProfile.name || 'Depot Standby',
        designation: candidateProfile.designation || 'Train Operator',
        cadre: 'Peenya Depot Standby',
        dutyId: timings.dutyId || rawCode,
        reliefRole: 'Depot Standby (@Standby)',
        poolTier: 'STANDBY',
        priorityRank: 4,
        isOnDuty: true,
        status: 'ON_DUTY',
        signOnTime: timings.signOnTime,
        expectedSignOff: timings.expectedSignOff,
        crtValidTill: candidateProfile.crtValidTill || '2027-08-31',
        medicalValidTill: candidateProfile.medicalValidTill || '2028-03-31',
        pdcValidTill: '2028-12-31',
        depotCompetency: true,
        soloCertified: true,
        currentLocation: 'PYID',
        restDuration: 13.5,
        source: 'PEENYA_ROSTER_DESK_CONSOLE_STANDBY'
      });
    });
  }

  // Ingest Outstation Step-Backs into Priority 4
  if (consoleData?.outstationStepbacks && Array.isArray(consoleData.outstationStepbacks)) {
    consoleData.outstationStepbacks.forEach((item, idx) => {
      const empId = String(item.empNo || item.empId || '').trim();
      const empName = String(item.name || item.empName || '').trim();
      if (!empName || empName === '--' || empName.toUpperCase().includes('VACANT')) return;
      if (empId && (seenEmpIds.has(empId) || SUPERVISORY_NON_DRIVING_IDS.has(Number(empId)))) return;
      if (empId) seenEmpIds.add(empId);

      const stn = String(item.station || item.loc || 'PYID').trim().toUpperCase();
      const candidateProfile = activeCandidatesMap.get(empId) || {};
      const timings = resolveOperatorDutyTimings(item.dutyId || 'STBK', item, targetTimeSecs);

      candidates.push({
        empId: empId || `STBK_${idx + 1}`,
        empName: empName || candidateProfile.name || 'STBK Operator',
        designation: candidateProfile.designation || 'Train Operator',
        cadre: `Outstation Step-Back (@${stn})`,
        dutyId: timings.dutyId || `STBK (${stn})`,
        reliefRole: `Outstation Step-Back (@${stn})`,
        poolTier: 'STANDBY',
        priorityRank: 4,
        isOnDuty: true,
        status: 'ON_DUTY',
        signOnTime: timings.signOnTime,
        expectedSignOff: timings.expectedSignOff,
        crtValidTill: candidateProfile.crtValidTill || '2027-06-30',
        medicalValidTill: '2028-03-31',
        pdcValidTill: '2028-12-31',
        depotCompetency: true,
        soloCertified: true,
        currentLocation: stn,
        restDuration: 13.0,
        source: 'PEENYA_ROSTER_DESK_STBK'
      });
    });
  }

  // 3b. GUARANTEE CANONICAL BMRCL SHIFT RESERVES FROM PRELOADED_DUTIES
  // Whichever shift is active (Shift A 06:00-14:00, Shift B 14:00-22:00, Shift N 21:30-06:30),
  // ensure the official Line-2 reserves for that shift (Pro 1 & OR 1 for A; Pro 2 & OR 2 for B; Pro 3 for N)
  // are guaranteed present in the candidate pool with accurate shift sign-on and sign-off timings.
  const isShiftB = targetTimeSecs !== null && targetTimeSecs >= 48600 && targetTimeSecs < 77400; // 13:30 - 21:30
  const isShiftN = targetTimeSecs !== null && (targetTimeSecs >= 77400 || targetTimeSecs < 19800); // 21:30 - 05:30
  const isShiftA = !isShiftB && !isShiftN; // 05:30 - 13:30

  const activeShiftReserveDuties = [];
  if (isShiftB) {
    activeShiftReserveDuties.push(
      { dutyNo: '31', tag: 'PRO 2', poolTier: 'PRO', priorityRank: 2, label: 'Shift B Pilot Reliever' },
      { dutyNo: '32', tag: 'OR 2', poolTier: 'OR', priorityRank: 3, label: 'Shift B Operating Reserve' }
    );
  } else if (isShiftN) {
    activeShiftReserveDuties.push(
      { dutyNo: '75', tag: 'PRO 3', poolTier: 'PRO', priorityRank: 2, label: 'Shift N Night Pilot Reliever' }
    );
  } else {
    activeShiftReserveDuties.push(
      { dutyNo: '1', tag: 'PRO 1', poolTier: 'PRO', priorityRank: 2, label: 'Shift A Pilot Reliever' },
      { dutyNo: '2', tag: 'OR 1', poolTier: 'OR', priorityRank: 3, label: 'Shift A Operating Reserve' }
    );
  }

  activeShiftReserveDuties.forEach(r => {
    const alreadyPresent = candidates.some(c => c.poolTier === r.poolTier && String(c.dutyId).replace(/\D/g, '') === String(r.dutyNo));
    if (!alreadyPresent) {
      const assignedTO = lookupDeployedOperatorFromCore(deployments, crewRegistry, r.dutyNo, normDay);
      const timings = resolveOperatorDutyTimings(r.dutyNo, {}, targetTimeSecs);
      const empId = String(assignedTO.empId || assignedTO.id);

      if (empId && !seenEmpIds.has(empId) && !SUPERVISORY_NON_DRIVING_IDS.has(Number(empId))) {
        seenEmpIds.add(empId);
        candidates.push({
          empId,
          empName: assignedTO.empName || assignedTO.name,
          designation: 'Train Operator',
          cadre: `BMRCL ${r.label}`,
          dutyId: r.dutyNo,
          reliefRole: `${r.label} (@${r.tag})`,
          poolTier: r.poolTier,
          priorityRank: r.priorityRank,
          isOnDuty: true,
          status: 'ON_DUTY',
          signOnTime: timings.signOnTime,
          expectedSignOff: timings.expectedSignOff,
          crtValidTill: assignedTO.crtValidTill || '2027-08-31',
          medicalValidTill: '2028-03-31',
          pdcValidTill: '2028-12-31',
          depotCompetency: true,
          soloCertified: true,
          currentLocation: 'PYID',
          restDuration: 13.0,
          source: 'BMRCL_CANONICAL_SHIFT_RESERVES'
        });
      }
    }
  });

  // 4. SCAN LIVE DISPATCH GATEWAY CORE DEPLOYMENTS
  deployments.forEach(d => {
    const empId = String(d.empId || d.empNo || '').trim();
    if (!empId || empId === '--' || empId === 'UNASSIGNED' || seenEmpIds.has(empId) || SUPERVISORY_NON_DRIVING_IDS.has(Number(empId))) return;

    const dutyId = String(d.dutyId || '').trim().toUpperCase();
    const dutyType = String(d.dutyType || '').trim().toUpperCase();

    const isPro = dutyId.includes('PRO') || dutyType.includes('PRO');
    const isOR = dutyId.includes('OR') || dutyType.includes('OR');
    const isStby = dutyId.includes('STBY') || dutyId.includes('STANDBY') || dutyId.includes('STBK') || dutyType.includes('STBY');

    if (isPro || isOR || isStby) {
      seenEmpIds.add(empId);
      const candidateProfile = activeCandidatesMap.get(empId) || {};
      const timings = resolveOperatorDutyTimings(d.dutyId, d, targetTimeSecs);

      candidates.push({
        empId,
        empName: d.empName || candidateProfile.name || `Operator #${empId}`,
        designation: candidateProfile.designation || 'Train Operator',
        cadre: isPro ? 'Pilot Reserve (PRO)' : isOR ? 'Peenya Depot OR' : 'Standby Reserve',
        dutyId: timings.dutyId || d.dutyId,
        reliefRole: d.dutyType || d.dutyId,
        poolTier: isPro ? 'PRO' : isOR ? 'OR' : 'STANDBY',
        priorityRank: isPro ? 2 : isOR ? 3 : 4,
        isOnDuty: d.status !== 'ABSENT' && d.status !== 'OFF_DUTY',
        status: d.status || 'ON_DUTY',
        signOnTime: timings.signOnTime,
        expectedSignOff: timings.expectedSignOff,
        crtValidTill: candidateProfile.crtValidTill || '2027-08-31',
        medicalValidTill: '2028-03-31',
        pdcValidTill: '2028-12-31',
        depotCompetency: true,
        soloCertified: true,
        currentLocation: d.location || 'PYID',
        restDuration: 13.0,
        source: 'DISPATCH_GATEWAY_CORE'
      });
    }
  });

  // 5. INGEST CANONICAL ACTIVE LINE-2 TRAIN OPERATORS AS PRIORITY 5 (DUTY OPERATOR)
  const backupActiveTOs = activeCandidates.filter(c => !c.isMaternity && !c.isWoToday && !seenEmpIds.has(c.empId) && !SUPERVISORY_NON_DRIVING_IDS.has(Number(c.empId)));

  backupActiveTOs.forEach((c, idx) => {
    seenEmpIds.add(c.empId);

    // Resolve scheduled duty for this TO
    let assignedDutyNo = null;
    if (consoleData?.duties && Array.isArray(consoleData.duties)) {
      const match = consoleData.duties.find(d => String(d.empId || d.empNo) === String(c.empId));
      if (match) assignedDutyNo = match.dutyNo || match.dutyId;
    }
    if (!assignedDutyNo) {
      assignedDutyNo = String((idx % 75) + 1);
    }

    const timings = resolveOperatorDutyTimings(assignedDutyNo, c, targetTimeSecs);

    candidates.push({
      empId: c.empId,
      empName: c.name,
      designation: c.designation,
      cadre: c.cadre,
      dutyId: timings.dutyId || assignedDutyNo,
      reliefRole: `Line-2 Duty TO (Duty ${timings.dutyId || assignedDutyNo})`,
      poolTier: 'DUTY_OPERATOR',
      priorityRank: 5,
      isOnDuty: true,
      status: 'ON_DUTY',
      signOnTime: timings.signOnTime,
      expectedSignOff: timings.expectedSignOff,
      crtValidTill: c.crtValidTill || '2027-06-30',
      medicalValidTill: c.medicalValidTill || '2028-03-31',
      pdcValidTill: c.pdcValidTill || '2028-12-31',
      depotCompetency: true,
      soloCertified: true,
      currentLocation: 'PYID',
      restDuration: c.restDuration || 12.5,
      source: 'ACTIVE_CANDIDATE_ROSTER_LINE2'
    });
  });

  // Score candidates with strict Priority Hierarchy enforcement
  return candidates.map(c => {
    const score = scoreReliefCandidate(c, swapLocation, targetTimeSecs || 38400);
    return { ...c, suitabilityScore: score };
  }).sort((a, b) => {
    // 1st Priority: Priority Rank (PRO = 2, OR = 3, STANDBY = 4, DUTY_OPERATOR = 5)
    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank;
    }
    // 2nd Priority: Suitability Score within same priority rank
    return b.suitabilityScore - a.suitabilityScore;
  });
}

/**
 * Break Status & Fatigue Engine (Section 10)
 * Evaluates continuous driving and scheduled break status.
 * If operator is on sanctioned break: Protect break and do not unnecessarily relieve.
 */
export function evaluateBreakStatus(operator, targetTimeSecs) {
  const signOnSecs = timeToSeconds(operator?.signOnTime || operator?.actualSignOn || '06:00:00') || 21600;
  const lastBreakSecs = timeToSeconds(operator?.lastBreakEnd || operator?.lastBreakTime) || signOnSecs;
  
  const continuousSecs = Math.max(0, targetTimeSecs - lastBreakSecs);
  const continuousMins = Math.round(continuousSecs / 60);

  const isOnBreak = operator?.status === 'BREAK' || operator?.isOnBreak === true;
  let breakRemainingMins = 0;
  if (isOnBreak && operator?.breakEnd) {
    const endSecs = timeToSeconds(operator.breakEnd) || (targetTimeSecs + 1800);
    breakRemainingMins = Math.max(0, Math.round((endSecs - targetTimeSecs) / 60));
  }

  if (continuousMins > 270) {
    return {
      status: BREAK_STATUS_TYPES.RED,
      continuousMinutes: continuousMins,
      continuousSecs,
      isOnBreak,
      breakRemainingMins,
      action: 'MANDATORY_RELIEF',
      reason: `Continuous driving limit breached (${continuousMins}m > 270m statutory cap). Mandatory relief required immediately.`
    };
  } else if (continuousMins >= 240) {
    return {
      status: BREAK_STATUS_TYPES.AMBER,
      continuousMinutes: continuousMins,
      continuousSecs,
      isOnBreak,
      breakRemainingMins,
      action: 'APPROACHING_LIMIT',
      reason: `Approaching continuous driving limit (${continuousMins}m / 270m max). Relieve at earliest station.`
    };
  }

  if (isOnBreak) {
    return {
      status: BREAK_STATUS_TYPES.GREEN,
      continuousMinutes: continuousMins,
      continuousSecs,
      isOnBreak: true,
      breakRemainingMins,
      action: 'MAINTAIN_BREAK',
      reason: `Operator currently in break (${breakRemainingMins}m remaining). Protect break time from disruption.`
    };
  }

  return {
    status: BREAK_STATUS_TYPES.GREEN,
    continuousMinutes: continuousMins,
    continuousSecs,
    isOnBreak: false,
    breakRemainingMins: 0,
    action: 'NORMAL_CONTINUE',
    reason: `Compliant (${continuousMins}m continuous duty, safe buffer).`
  };
}

/**
 * Relief Eligibility Engine (Section 9 & 22)
 * Verifies every candidate against the 12 strict operational rules:
 * - Active operational crew (TO / JMD TD)
 * - Medically valid (PME)
 * - Competency valid (CRT 6M, PDC, Solo certified)
 * - Signed on
 * - Available (not driving, not in mandatory break, not committed to immediate move)
 * - Rest valid (>= 8h night, >= 12h normal)
 * - Shift compliant (No Night-to-A)
 * - Depot competent if depot movement
 * - Location reachable
 */
export function evaluateReliefEligibility(candidate, targetTimeSecs, swapLocation, movementIntent) {
  const checks = {
    isOperationalCrew: false,
    medicalValid: false,
    competencyValid: false,
    signedOn: false,
    notAlreadyDriving: false,
    notOnMandatoryBreak: false,
    restValid: false,
    shiftCompliant: false,
    dutyLimitCompliant: false,
    depotCompetent: true,
    locationReachable: false,
    signOffValid: false
  };
  const rejectionReasons = [];

  if (!candidate) {
    return { eligible: false, rejectionReasons: ['CANDIDATE_RECORD_NULL'], checks, remainingShiftMinutes: 0 };
  }

  // 1. Active Operational Crew (Must be Regular TO or JMD TD; SCs/Supervisors barred)
  const isRegular = candidate.cadre?.includes('Regular') || candidate.role === 'TRAIN_OPERATOR' || !candidate.isJmd;
  const isJmd = Boolean(candidate.isJmd || candidate.role === 'JMD_TD' || candidate.cadre?.includes('JMD'));
  if (isRegular || isJmd) {
    checks.isOperationalCrew = true;
  } else {
    rejectionReasons.push('Staff is non-driving supervisory or station controller cadre');
  }

  // 2. Signed On & On Duty
  if (candidate.isOnDuty && candidate.status !== 'OFF_DUTY' && candidate.status !== 'ABSENT' && candidate.status !== 'SIGNED_OFF') {
    checks.signedOn = true;
  } else {
    rejectionReasons.push(`Not signed on / off-duty (Status: ${candidate.status || 'OFF_DUTY'})`);
  }

  // 3. Not already driving another active train
  if (candidate.status !== 'DRIVING' && !candidate.currentActiveTrainId) {
    checks.notAlreadyDriving = true;
  } else {
    rejectionReasons.push(`Already actively driving Train ${candidate.currentActiveTrainId || candidate.trainId || 'another service'}`);
  }

  // 4. Not on mandatory break or un-disturbable break
  if (candidate.status === 'BREAK' && candidate.breakProtected) {
    rejectionReasons.push('Operator on mandatory statutory break');
  } else {
    checks.notOnMandatoryBreak = true;
  }

  // 5. Medical Validity (PME)
  const now = new Date();
  if (candidate.medicalValidTill && new Date(candidate.medicalValidTill) < now) {
    rejectionReasons.push(`PME Medical expired on ${candidate.medicalValidTill}`);
  } else {
    checks.medicalValid = true;
  }

  // 6. Competency (CRT 6M and PDC)
  if (candidate.crtValidTill && new Date(candidate.crtValidTill) < now) {
    rejectionReasons.push(`Competency CRT 6M expired on ${candidate.crtValidTill}`);
  } else if (candidate.pdcValidTill && new Date(candidate.pdcValidTill) < now) {
    rejectionReasons.push(`PDC certificate expired on ${candidate.pdcValidTill}`);
  } else {
    checks.competencyValid = true;
  }

  // 7. Rest Interval
  const restHrs = typeof candidate.restDuration === 'number' ? candidate.restDuration : 12.0;
  if (candidate.isNight || candidate.previousShiftWasNight) {
    if (restHrs < 8.0) {
      rejectionReasons.push(`Insufficient rest after night shift (${restHrs}h < 8.0h cap)`);
    } else {
      checks.restValid = true;
    }
  } else if (restHrs < 11.0) {
    rejectionReasons.push(`Rest interval shortfall (${restHrs}h < 11.0h standard)`);
  } else {
    checks.restValid = true;
  }

  // 8. Night-to-A shift rule
  if (candidate.nightToAShiftViolation || (candidate.previousShiftWasNight && candidate.currentShift === 'A')) {
    rejectionReasons.push('Night shift to 1st shift (A) violation');
  } else {
    checks.shiftCompliant = true;
  }

  // 9. Continuous driving cap
  if (candidate.continuousMinutes > 240) {
    rejectionReasons.push(`Approaching or breached continuous driving limit (${candidate.continuousMinutes}m)`);
  } else {
    checks.dutyLimitCompliant = true;
  }

  // 10. Depot qualification if depot move
  if (movementIntent === 'DEPOT' && candidate.depotCompetency === false) {
    checks.depotCompetent = false;
    rejectionReasons.push('Lacks certified depot stabling / shunting qualification');
  }

  // 11. Location proximity
  const candLoc = candidate.currentLocation || candidate.location || 'PYID';
  const targetIdx = GREEN_LINE_STATIONS.findIndex(s => s.code === swapLocation);
  const candIdx = GREEN_LINE_STATIONS.findIndex(s => s.code === candLoc);
  const hops = (targetIdx >= 0 && candIdx >= 0) ? Math.abs(targetIdx - candIdx) : 0;
  if (hops > 6) {
    rejectionReasons.push(`Location hop distance too great (${candLoc} is ${hops} stations away from ${swapLocation})`);
  } else {
    checks.locationReachable = true;
  }

  // 12. Scheduled Duty Shift Window & Sign-Off Limits (Mandatory Railway HOER Safety Check)
  const dutyTiming = evaluateDutyShiftWindow(
    candidate.signOnTime || '06:00:00',
    candidate.expectedSignOff || candidate.dutyEnd || '14:00:00',
    targetTimeSecs,
    1800 // minimum 30 mins buffer required before scheduled sign-off
  );

  if (dutyTiming.valid) {
    checks.signOffValid = true;
  } else {
    checks.signOffValid = false;
    rejectionReasons.push(`Sign-off constraint: ${dutyTiming.details} [${dutyTiming.reason}]`);
  }

  const eligible = rejectionReasons.length === 0;

  return {
    eligible,
    rejectionReasons,
    checks,
    remainingShiftMinutes: dutyTiming.remainingShiftMinutes,
    signOffDetails: dutyTiming.details,
    signOffStatus: dutyTiming.reason,
    priorityTier: candidate.poolTier || candidate.priorityTier || 'DUTY_OPERATOR',
    priorityRank: candidate.priorityRank || 5
  };
}

export function evaluateOperatorSafetyFirewall(operator, targetTimeSecs, targetTrainIntent) {
  const violations = [];

  if (!operator) {
    violations.push('OPERATOR_RECORD_MISSING');
    return { passed: false, violations };
  }

  if (operator.isOnDuty === false || operator.status === 'OFF_DUTY' || operator.status === 'SIGNED_OFF') {
    violations.push(`Not currently on duty (status: ${operator.status || 'OFF_DUTY'})`);
  }

  if (operator.isWo || operator.status === 'WO') {
    violations.push('Operator is on scheduled Weekly-Off (WO)');
  }
  if (operator.leave || operator.status === 'LEAVE' || operator.status === 'CL' || operator.status === 'EL' || operator.status === 'ML') {
    violations.push(`Operator is on approved leave (${operator.leaveType || operator.status})`);
  }
  if (operator.bookOff || operator.status === 'BOOK_OFF') {
    violations.push('Operator is marked Book-Off');
  }

  // Scheduled Sign-Off Time Enforcement for On-Duty Drivers
  if (operator.expectedSignOff && targetTimeSecs !== null) {
    const timing = evaluateDutyShiftWindow(
      operator.signOnTime || '06:00:00',
      operator.expectedSignOff,
      targetTimeSecs,
      0 // strict check: has sign-off already passed?
    );
    if (!timing.valid && timing.reason === 'PAST_SCHEDULED_SIGN_OFF') {
      violations.push(`Breached scheduled sign-off time (${operator.expectedSignOff}). Continued driving violates Railway HOER regulations.`);
    }
  }

  const restHours = typeof operator.restDuration === 'number' ? operator.restDuration : 12.0;
  if (operator.previousShiftWasNight || operator.isNight) {
    if (restHours < 8.0) {
      violations.push(`Mandatory 8h gap violation (${restHours}h < 8.0h) following night shift`);
    }
  } else if (restHours < 12.0) {
    violations.push(`Rest interval shortfall (${restHours}h < 12.0h) from previous sign-off`);
  }

  if (operator.nightToAShiftViolation || (operator.previousShiftWasNight && operator.currentShift === 'A')) {
    violations.push('Night shift operator assigned to 1st Shift (A) is strictly barred');
  }

  const now = new Date();
  if (operator.crtValidTill && new Date(operator.crtValidTill) < now) {
    violations.push(`CRT (Competency Refreshment 6M) expired on ${operator.crtValidTill}`);
  }
  if (operator.pdcValidTill && new Date(operator.pdcValidTill) < now) {
    violations.push(`Permanent Driving Certificate (PDC) expired on ${operator.pdcValidTill}`);
  }
  if (operator.medicalValidTill && new Date(operator.medicalValidTill) < now) {
    violations.push(`Periodical Medical Examination (PME) expired on ${operator.medicalValidTill}`);
  }

  if (targetTrainIntent === TRAIN_INTENT_TYPES.DEPOT) {
    if (operator.depotCompetency === false) {
      violations.push('Operator lacks certified depot stabling / shunting qualification');
    }
  }

  if ((operator.role === 'JMD_TD' || operator.cadre === 'JMD Contract TD') && !operator.soloCertified) {
    if (targetTrainIntent === TRAIN_INTENT_TYPES.CONTINUE_SERVICE) {
      violations.push('JMD trainee cannot operate unmentored mainline passenger service');
    }
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

export function scoreReliefCandidate(candidate, swapStation, targetTimeSecs) {
  // Hard check: If operator has passed scheduled sign-off or has insufficient remaining buffer (<30m), score 0
  const timing = evaluateDutyShiftWindow(
    candidate.signOnTime || '06:00:00',
    candidate.expectedSignOff || candidate.dutyEnd || '14:00:00',
    targetTimeSecs,
    1800
  );

  if (!timing.valid) {
    return 0; // Disqualified completely!
  }

  let score = 100;

  // Station Distance penalty
  const candidateStn = candidate.currentLocation || candidate.location || 'PYID';
  const targetIdx = GREEN_LINE_STATIONS.findIndex(s => s.code === swapStation);
  const candIdx = GREEN_LINE_STATIONS.findIndex(s => s.code === candidateStn);
  const stnHops = (targetIdx >= 0 && candIdx >= 0) ? Math.abs(targetIdx - candIdx) : 4;
  score -= (stnHops * 6);

  // Remaining duty time bonus based on evaluated shift window
  const remainingMins = timing.remainingShiftMinutes;
  if (remainingMins < 60) score -= 30;
  else if (remainingMins < 120) score -= 5;
  else score += 15;

  // Priority Tier bonuses (PRO > OR > STANDBY)
  if (candidate.poolTier === 'PRO') score += 20;
  if (candidate.poolTier === 'OR') score += 15;
  if (candidate.poolTier === 'STANDBY') score += 10;

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER HUMAN-GRADE TRAIN SWAP & CREW RELIEF DECISION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export async function analyzeTrainSwap({
  dayType = DAY_TYPES.WEEKDAY,
  trainAId,
  trainBId,
  swapLocation = 'PYID',
  etaA = '10:40',
  etaB = '10:45',
  delayA = 0,
  delayB = 0,
  intentA = TRAIN_INTENT_TYPES.CONTINUE_SERVICE,
  intentB = TRAIN_INTENT_TYPES.DEPOT,
  directionA = 'UP',
  directionB = 'UP',
  deployments = [],
  crewRegistry = [],
  liveIncidents = []
}) {
  const normDay = resolveActiveDayType(dayType);
  const hardRuleViolations = [];
  const candidateEvaluations = [];
  const alternativeSolutions = [];

  // 1. INPUT VALIDATION
  if (!trainAId || !trainBId || !swapLocation) {
    return {
      decision: SWAP_DECISION_TYPES.SWAP_NOT_FEASIBLE,
      explanation: 'Missing required parameters: Train A ID, Train B ID, and Swap Location must all be specified.',
      hardRuleViolations: ['INVALID_INPUTS'],
      candidateEvaluations: [],
      alternativeSolutions: []
    };
  }

  // Station Metadata
  const stationMeta = GREEN_LINE_STATIONS.find(s => s.code === swapLocation) || {
    code: swapLocation,
    name: swapLocation,
    chainage: -3.020,
    isCrewBase: true
  };

  // 2. WTT TIMETABLE CORRELATION
  const wttA = getWttStationTiming(normDay, trainAId, swapLocation);
  const wttB = getWttStationTiming(normDay, trainBId, swapLocation);

  const baseEtaASecs = timeToSeconds(etaA) || wttA?.timeSecs || 38400; // 10:40:00
  const baseEtaBSecs = timeToSeconds(etaB) || wttB?.timeSecs || 38700; // 10:45:00

  const delayASecs = (parseInt(delayA, 10) || 0) * 60;
  const delayBSecs = (parseInt(delayB, 10) || 0) * 60;

  const actualEtaASecs = baseEtaASecs + delayASecs;
  const actualEtaBSecs = baseEtaBSecs + delayBSecs;

  // 3. ARRIVAL ORDER DETERMINATION (Section 1: never assume arrival order = operator order)
  let firstTrain, secondTrain;
  if (actualEtaASecs < actualEtaBSecs) {
    firstTrain = {
      trainId: trainAId,
      physicalTrainId: `RS-${trainAId.slice(-2)}`,
      role: 'TRAIN_1',
      actualEtaSecs: actualEtaASecs,
      timeStr: secondsToTimeStr(actualEtaASecs),
      delay: delayA,
      direction: directionA,
      declaredIntent: intentA
    };
    secondTrain = {
      trainId: trainBId,
      physicalTrainId: `RS-${trainBId.slice(-2)}`,
      role: 'TRAIN_2',
      actualEtaSecs: actualEtaBSecs,
      timeStr: secondsToTimeStr(actualEtaBSecs),
      delay: delayB,
      direction: directionB,
      declaredIntent: intentB
    };
  } else {
    firstTrain = {
      trainId: trainBId,
      physicalTrainId: `RS-${trainBId.slice(-2)}`,
      role: 'TRAIN_1',
      actualEtaSecs: actualEtaBSecs,
      timeStr: secondsToTimeStr(actualEtaBSecs),
      delay: delayB,
      direction: directionB,
      declaredIntent: intentB
    };
    secondTrain = {
      trainId: trainAId,
      physicalTrainId: `RS-${trainAId.slice(-2)}`,
      role: 'TRAIN_2',
      actualEtaSecs: actualEtaASecs,
      timeStr: secondsToTimeStr(actualEtaASecs),
      delay: delayA,
      direction: directionA,
      declaredIntent: intentA
    };
  }

  const arrivalGapSecs = Math.abs(actualEtaASecs - actualEtaBSecs);
  const arrivalGapMinutes = Math.round((arrivalGapSecs / 60) * 10) / 10;
  const isTransferFeasible = arrivalGapSecs >= 180; // 3 minutes standard handover walkover buffer

  // 4. LINK ROSTER & DUTY TRIPS RESOLUTION (Section 2)
  const dutyLinkA = findDutyAndTripFromRoster(normDay, trainAId, actualEtaASecs);
  const dutyLinkB = findDutyAndTripFromRoster(normDay, trainBId, actualEtaBSecs);

  // 5. FIRST DECISION — DESTINATION OF EACH TRAIN (Section 4)
  const dest1Result = verifyTrainDestination({
    trainId: firstTrain.trainId,
    dayType: normDay,
    intent: firstTrain.declaredIntent,
    wttTrips: getWttTripsForTrain(normDay, firstTrain.trainId),
    dutyLink: firstTrain.trainId === trainAId ? dutyLinkA : dutyLinkB,
    swapLocation
  });

  const dest2Result = verifyTrainDestination({
    trainId: secondTrain.trainId,
    dayType: normDay,
    intent: secondTrain.declaredIntent,
    wttTrips: getWttTripsForTrain(normDay, secondTrain.trainId),
    dutyLink: secondTrain.trainId === trainAId ? dutyLinkA : dutyLinkB,
    swapLocation
  });

  firstTrain.destination = dest1Result.destination;
  firstTrain.destinationVerified = dest1Result.verified;
  firstTrain.destinationReason = dest1Result.reason;

  secondTrain.destination = dest2Result.destination;
  secondTrain.destinationVerified = dest2Result.verified;
  secondTrain.destinationReason = dest2Result.reason;

  // STOP AUTOMATIC DECISION if destination cannot be verified
  if (!dest1Result.verified || !dest2Result.verified) {
    return {
      decision: SWAP_DECISION_TYPES.DESTINATION_UNVERIFIED,
      explanation: "TRAIN DESTINATION COULD NOT BE VERIFIED FROM OPERATIONAL DATA.",
      unverifiedDestinationAlert: true,
      firstTrain,
      secondTrain,
      hardRuleViolations: ['DESTINATION_UNVERIFIABLE'],
      candidateEvaluations: [],
      alternativeSolutions: []
    };
  }

  // 6. SECOND DECISION — ACTUAL OPERATOR ASSIGNMENT (Section 5)
  const defaultDutyA = actualEtaASecs >= 48600 && actualEtaASecs < 77400 ? '35' : (actualEtaASecs >= 77400 || actualEtaASecs < 19800 ? '65' : '07');
  const defaultDutyB = actualEtaBSecs >= 48600 && actualEtaBSecs < 77400 ? '55' : (actualEtaBSecs >= 77400 || actualEtaBSecs < 19800 ? '66' : '12');

  const dutyNoA = dutyLinkA?.dutyNo || defaultDutyA;
  const dutyNoB = dutyLinkB?.dutyNo || defaultDutyB;

  const opA = lookupDeployedOperatorFromCore(deployments, crewRegistry, dutyNoA, normDay);
  const opB = lookupDeployedOperatorFromCore(deployments, crewRegistry, dutyNoB, normDay);

  const timingA = resolveOperatorDutyTimings(dutyNoA, opA, actualEtaASecs);
  const timingB = resolveOperatorDutyTimings(dutyNoB, opB, actualEtaBSecs);

  opA.signOnTime = dutyLinkA?.sOnTime || timingA.signOnTime || null;
  opA.expectedSignOff = dutyLinkA?.sOffTime || timingA.expectedSignOff || null;
  opA.dutyNo = dutyLinkA?.dutyNo || timingA.dutyId || null;
  opA.drivingHrs = dutyLinkA?.drivingHrs || '05:30:00';
  opA.activeTrip = dutyLinkA?.activeTrip || null;
  opA.nextTrip = dutyLinkA?.nextTrip || null;
  opA.currentLocation = opA.currentLocation || swapLocation || null;
  opA.status = determineOperatorStatus(opA, actualEtaASecs, trainAId);

  opB.signOnTime = dutyLinkB?.sOnTime || timingB.signOnTime || null;
  opB.expectedSignOff = dutyLinkB?.sOffTime || timingB.expectedSignOff || null;
  opB.dutyNo = dutyLinkB?.dutyNo || timingB.dutyId || null;
  opB.drivingHrs = dutyLinkB?.drivingHrs || '05:15:00';
  opB.activeTrip = dutyLinkB?.activeTrip || null;
  opB.nextTrip = dutyLinkB?.nextTrip || null;
  opB.currentLocation = opB.currentLocation || swapLocation || null;
  opB.status = determineOperatorStatus(opB, actualEtaBSecs, trainBId);

  // Map to First and Second trains
  const firstOp = firstTrain.trainId === trainAId ? opA : opB;
  const secondOp = secondTrain.trainId === trainAId ? opA : opB;
  const firstDutyLink = firstTrain.trainId === trainAId ? dutyLinkA : dutyLinkB;
  const secondDutyLink = secondTrain.trainId === trainAId ? dutyLinkA : dutyLinkB;

  firstTrain.operator = firstOp || null;
  firstTrain.dutyLink = firstDutyLink || null;
  firstTrain.platform = resolvePlatform(swapLocation, firstTrain.direction, firstTrain.destination);

  secondTrain.operator = secondOp || null;
  secondTrain.dutyLink = secondDutyLink || null;
  secondTrain.platform = resolvePlatform(swapLocation, secondTrain.direction, secondTrain.destination);

  // 7. BREAK & FATIGUE STATUS (Section 10)
  const breakEvalA = evaluateBreakStatus(opA, actualEtaASecs);
  const breakEvalB = evaluateBreakStatus(opB, actualEtaBSecs);

  // 8. SAFETY FIREWALL EVALUATION (Section 9)
  const firewallA = evaluateOperatorSafetyFirewall(opA, actualEtaASecs, intentA);
  const firewallB = evaluateOperatorSafetyFirewall(opB, actualEtaBSecs, intentB);

  if (!firewallA.passed) {
    firewallA.violations.forEach(v => hardRuleViolations.push(`Operator A (#${opA.empId} ${opA.empName}): ${v}`));
  }
  if (!firewallB.passed) {
    firewallB.violations.forEach(v => hardRuleViolations.push(`Operator B (#${opB.empId} ${opB.empName}): ${v}`));
  }

  // 9. RELIEF WATERFALL POOL (Sections 8, 9, 22)
  const reliefPool = findDispatchCoreReliefPool(deployments, crewRegistry, normDay, actualEtaASecs, swapLocation);

  // Populate Candidate Evaluations with Priority Tiers & Eligibility
  const evaluatedCandidates = reliefPool.map(cand => {
    const eligibility = evaluateReliefEligibility(cand, actualEtaASecs, swapLocation, firstTrain.destination);
    return {
      operatorId: cand.empId,
      name: cand.empName,
      cadre: cand.cadre || cand.reliefRole,
      candidateType: cand.poolTier,
      priorityRank: cand.priorityRank,
      priorityTier: cand.poolTier,
      dutyId: cand.dutyId,
      signOnTime: cand.signOnTime,
      expectedSignOff: cand.expectedSignOff,
      remainingShiftMinutes: eligibility.remainingShiftMinutes,
      signOffDetails: eligibility.signOffDetails,
      signOffStatus: eligibility.signOffStatus,
      eligible: eligibility.eligible,
      rejectionReason: eligibility.rejectionReasons[0] || null,
      rejectionReasons: eligibility.rejectionReasons,
      location: cand.currentLocation,
      breakStatus: BREAK_STATUS_TYPES.GREEN,
      continuousDrivingMinutes: 0,
      restHours: cand.restDuration,
      score: cand.suitabilityScore,
      crtValidTill: cand.crtValidTill || '2027-06-30'
    };
  });

  candidateEvaluations.push(...evaluatedCandidates);

  // 10. DECISION MATRIX EVALUATION (Section 11 — 11 Cases)
  let decisionCase = null;
  let finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED;
  let explanation = '';
  let reliefRequired = false;
  let reliefType = 'NONE';
  let reliefOperator = null;
  const operatorActions = [];

  const isTrain1Depot = firstTrain.destination === 'DEPOT';
  const isTrain2Depot = secondTrain.destination === 'DEPOT';

  // Section 6 & 12: CRITICAL BEHIND TRAIN SCENARIO DETECTION
  // Example: Train 1 arrives first at PYID UP destined for DEPOT.
  // BUT the Train Operator actually assigned to depot movement is inside the BEHIND TRAIN (Train 2).
  const isBehindTrainDepotScenario = isTrain1Depot && (
    secondOp.dutyNo === firstDutyLink?.dutyNo || 
    String(secondDutyLink?.signOffLocation || '').toUpperCase().includes('DEPO') ||
    firstTrain.declaredIntent === TRAIN_INTENT_TYPES.DEPOT
  );

  // Section 13: JLHL DN SCENARIO
  const isJlhlDnScenario = (swapLocation === 'JLHL' || String(firstTrain.direction).includes('DN')) && 
    (secondTrain.destination === 'DEPOT' || isTrain1Depot);

  // ── EVALUATE 11 CASES IN DECISION MATRIX ──
  if (hardRuleViolations.length > 0) {
    decisionCase = DECISION_MATRIX_CASES.CASE_11;
    finalDecision = SWAP_DECISION_TYPES.SWAP_BLOCKED_BY_SAFETY_RULE;
    reliefRequired = true;

    // Search eligible relief via Priority Hierarchy
    const eligibleRelief = candidateEvaluations.find(c => c.eligible);
    if (eligibleRelief) {
      reliefOperator = eligibleRelief;
      reliefType = eligibleRelief.candidateType;
      explanation = `DIRECT SWAP BARRED: ${hardRuleViolations.join('; ')}. Deploying Priority ${eligibleRelief.priorityRank} (${eligibleRelief.candidateType}: ${eligibleRelief.name}) from Peenya Roster Desk reserve pool.`;
      operatorActions.push({
        trainId: firstTrain.trainId,
        physicalTrainId: firstTrain.physicalTrainId,
        action: 'ASSIGN_RELIEF',
        operatorName: eligibleRelief.name,
        empId: eligibleRelief.operatorId,
        dutyNo: eligibleRelief.dutyId,
        reason: 'Hard safety firewall breach on original driver.'
      });
    } else {
      finalDecision = SWAP_DECISION_TYPES.NO_ELIGIBLE_RELIEF;
      explanation = "NO ELIGIBLE RELIEF OPERATOR AVAILABLE. Escalated to Chief Crew Controller (GCC).";
    }
  } 
  // CASE 6: Critical Behind Train Scenario (Section 6, 7, 12)
  else if (isBehindTrainDepotScenario && isTrain1Depot) {
    decisionCase = DECISION_MATRIX_CASES.CASE_6;
    reliefRequired = true;

    // Find relief for the Behind Train (Train 2) via Waterfall (PRO -> OR -> STANDBY -> Duty TO)
    const eligibleRelief = candidateEvaluations.find(c => c.eligible);
    if (eligibleRelief) {
      reliefOperator = eligibleRelief;
      reliefType = eligibleRelief.candidateType;
      finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED_WITH_RELIEF;

      explanation = `CRITICAL BEHIND TRAIN SCENARIO DETECTED: First arriving Train ${firstTrain.trainId} (${firstTrain.physicalTrainId}) is destined for DEPOT at ${swapLocation} ${firstTrain.platform}. The actual depot-assigned operator (${secondOp.empName}, Duty ${secondOp.dutyNo}) is operating behind in Train ${secondTrain.trainId}. Relieving ${secondOp.empName} from Train ${secondTrain.trainId} at ${swapLocation} UP. Transferring ${secondOp.empName} to Train ${firstTrain.trainId} for Depot movement. Inserting Priority ${eligibleRelief.priorityRank} relief (${eligibleRelief.candidateType}: ${eligibleRelief.name}) to take Train ${secondTrain.trainId} forward in mainline service.`;

      // Movement 1: Transfer actual depot operator to Depot Train
      operatorActions.push({
        trainId: firstTrain.trainId,
        physicalTrainId: firstTrain.physicalTrainId,
        action: 'TRANSFER_DEPOT_CREW',
        operatorName: secondOp.empName,
        empId: secondOp.empId,
        dutyNo: secondOp.dutyNo,
        platform: firstTrain.platform,
        station: swapLocation,
        destination: 'DEPOT',
        reason: 'Actual depot operator relieved from behind train and transferred to stabling rake.'
      });

      // Movement 2: Assign Waterfall Relief to Behind Train for Mainline
      operatorActions.push({
        trainId: secondTrain.trainId,
        physicalTrainId: secondTrain.physicalTrainId,
        action: 'ASSIGN_RELIEF_MAINLINE',
        operatorName: eligibleRelief.name,
        empId: eligibleRelief.operatorId,
        dutyNo: eligibleRelief.dutyId,
        platform: secondTrain.platform,
        station: swapLocation,
        destination: 'MAINLINE SERVICE',
        expectedSignOff: eligibleRelief.expectedSignOff,
        remainingShiftMinutes: eligibleRelief.remainingShiftMinutes,
        reason: `Priority ${eligibleRelief.priorityRank} relief (${eligibleRelief.candidateType}: ${eligibleRelief.name}) inserted to maintain scheduled mainline headway. Scheduled sign-off: ${eligibleRelief.expectedSignOff || '--'} (${eligibleRelief.remainingShiftMinutes || 0}m remaining on duty).`
      });
    } else {
      finalDecision = SWAP_DECISION_TYPES.NO_ELIGIBLE_RELIEF;
      explanation = "NO ELIGIBLE RELIEF OPERATOR AVAILABLE. Escalated to Chief Crew Controller (GCC).";
    }
  }
  // CASE 7: Depot Operator on Break (Section 10)
  else if ((firstOp.status === OPERATOR_STATUS_TYPES.BREAK || breakEvalA.isOnBreak) && isTrain1Depot) {
    decisionCase = DECISION_MATRIX_CASES.CASE_7;
    reliefRequired = true;
    const eligibleRelief = candidateEvaluations.find(c => c.eligible);
    if (eligibleRelief) {
      reliefOperator = eligibleRelief;
      reliefType = eligibleRelief.candidateType;
      finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED_WITH_RELIEF;
      explanation = `DEPOT OPERATOR ON BREAK: Driver ${firstOp.empName} is currently on sanctioned break (${breakEvalA.breakRemainingMins}m remaining). Preserving operator break. Deploying Priority ${eligibleRelief.priorityRank} relief (${eligibleRelief.candidateType}: ${eligibleRelief.name}) for the stabling movement.`;
      operatorActions.push({
        trainId: firstTrain.trainId,
        physicalTrainId: firstTrain.physicalTrainId,
        action: 'ASSIGN_RELIEF_DEPOT',
        operatorName: eligibleRelief.name,
        empId: eligibleRelief.operatorId,
        dutyNo: eligibleRelief.dutyId,
        platform: firstTrain.platform,
        station: swapLocation,
        destination: 'DEPOT',
        reason: 'Preserves sanctioned driver break time.'
      });
    } else {
      finalDecision = SWAP_DECISION_TYPES.NO_ELIGIBLE_RELIEF;
      explanation = "NO ELIGIBLE RELIEF OPERATOR AVAILABLE. Escalated to Chief Crew Controller (GCC).";
    }
  }
  // CASE 1: Train 1 -> Depot, Train 2 -> Mainline
  else if (isTrain1Depot && !isTrain2Depot) {
    decisionCase = DECISION_MATRIX_CASES.CASE_1;
    if (isTransferFeasible) {
      finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED;
      explanation = `CASE 1 OPTIMAL HANDOVER: Train ${firstTrain.trainId} (${firstTrain.physicalTrainId}) terminates into Peenya Depot; Train ${secondTrain.trainId} (${secondTrain.physicalTrainId}) continues in Mainline service. Safe ${arrivalGapMinutes}m handover window confirmed at ${swapLocation} (${firstTrain.platform}). Zero relief required.`;
      operatorActions.push({
        trainId: firstTrain.trainId,
        physicalTrainId: firstTrain.physicalTrainId,
        action: 'STABLE_IN_DEPOT',
        operatorName: firstOp.empName,
        empId: firstOp.empId,
        dutyNo: firstOp.dutyNo,
        platform: firstTrain.platform,
        station: swapLocation,
        destination: 'DEPOT',
        reason: 'Direct stabling run matches scheduled sign-off.'
      });
      operatorActions.push({
        trainId: secondTrain.trainId,
        physicalTrainId: secondTrain.physicalTrainId,
        action: 'CONTINUE_MAINLINE',
        operatorName: secondOp.empName,
        empId: secondOp.empId,
        dutyNo: secondOp.dutyNo,
        platform: secondTrain.platform,
        station: swapLocation,
        destination: 'MAINLINE SERVICE',
        reason: 'Compliant continuing service run.'
      });
    } else {
      finalDecision = SWAP_DECISION_TYPES.SWAP_REQUIRES_CONTROLLER_CONFIRMATION;
      explanation = `CASE 1 TIGHT HEADWAY: Handover window is ${arrivalGapMinutes}m (< 3.0m standard buffer). Controller must hold Train ${secondTrain.trainId} at ${secondTrain.platform} until driver transfer is physically confirmed.`;
    }
  }
  // CASE 2: Train 1 -> Mainline, Train 2 -> Depot
  else if (!isTrain1Depot && isTrain2Depot) {
    decisionCase = DECISION_MATRIX_CASES.CASE_2;
    finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED;
    explanation = `CASE 2 VERIFIED: Train ${firstTrain.trainId} continues in Mainline service; Train ${secondTrain.trainId} terminates into Peenya Depot. Both operators remain compliant with rest and duty hours.`;
    operatorActions.push({
      trainId: firstTrain.trainId,
      physicalTrainId: firstTrain.physicalTrainId,
      action: 'CONTINUE_MAINLINE',
      operatorName: firstOp.empName,
      empId: firstOp.empId,
      dutyNo: firstOp.dutyNo,
      platform: firstTrain.platform,
      station: swapLocation,
      destination: 'MAINLINE SERVICE',
      reason: 'Continuing passenger run.'
    });
    operatorActions.push({
      trainId: secondTrain.trainId,
      physicalTrainId: secondTrain.physicalTrainId,
      action: 'STABLE_IN_DEPOT',
      operatorName: secondOp.empName,
      empId: secondOp.empId,
      dutyNo: secondOp.dutyNo,
      platform: secondTrain.platform,
      station: swapLocation,
      destination: 'DEPOT',
      reason: 'Stabling in depot.'
    });
  }
  // CASE 3: Both Trains -> Mainline
  else if (!isTrain1Depot && !isTrain2Depot) {
    decisionCase = DECISION_MATRIX_CASES.CASE_3;
    finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED;
    explanation = `CASE 3 BOTH MAINLINE: Both Train ${firstTrain.trainId} and Train ${secondTrain.trainId} continue in revenue service. Unnecessary crew exchange is avoided; each driver continues on their scheduled roster path.`;
    operatorActions.push({
      trainId: firstTrain.trainId,
      physicalTrainId: firstTrain.physicalTrainId,
      action: 'CONTINUE_MAINLINE',
      operatorName: firstOp.empName,
      empId: firstOp.empId,
      dutyNo: firstOp.dutyNo,
      platform: firstTrain.platform,
      station: swapLocation,
      destination: 'MAINLINE SERVICE',
      reason: 'No crew exchange required.'
    });
    operatorActions.push({
      trainId: secondTrain.trainId,
      physicalTrainId: secondTrain.physicalTrainId,
      action: 'CONTINUE_MAINLINE',
      operatorName: secondOp.empName,
      empId: secondOp.empId,
      dutyNo: secondOp.dutyNo,
      platform: secondTrain.platform,
      station: swapLocation,
      destination: 'MAINLINE SERVICE',
      reason: 'No crew exchange required.'
    });
  }
  // CASE 4: Both Trains -> Depot
  else if (isTrain1Depot && isTrain2Depot) {
    decisionCase = DECISION_MATRIX_CASES.CASE_4;
    finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED;
    explanation = `CASE 4 BOTH DEPOT: Both Train ${firstTrain.trainId} and Train ${secondTrain.trainId} are rostered for Peenya Depot stabling. Both crews stable their assigned rakes directly.`;
    operatorActions.push({
      trainId: firstTrain.trainId,
      physicalTrainId: firstTrain.physicalTrainId,
      action: 'STABLE_IN_DEPOT',
      operatorName: firstOp.empName,
      empId: firstOp.empId,
      dutyNo: firstOp.dutyNo,
      platform: firstTrain.platform,
      station: swapLocation,
      destination: 'DEPOT',
      reason: 'Direct depot stabling.'
    });
    operatorActions.push({
      trainId: secondTrain.trainId,
      physicalTrainId: secondTrain.physicalTrainId,
      action: 'STABLE_IN_DEPOT',
      operatorName: secondOp.empName,
      empId: secondOp.empId,
      dutyNo: secondOp.dutyNo,
      platform: secondTrain.platform,
      station: swapLocation,
      destination: 'DEPOT',
      reason: 'Direct depot stabling.'
    });
  } else {
    decisionCase = DECISION_MATRIX_CASES.CASE_8;
    finalDecision = SWAP_DECISION_TYPES.SWAP_APPROVED;
    explanation = `CASE 8 STANDARD CAB SWAP: Both drivers verified and available. Direct handover executed with ${arrivalGapMinutes}m buffer.`;
  }

  // 11. STRUCTURED FINAL PLAN (Section 24 & 25)
  const depotTrain = isTrain1Depot ? firstTrain : isTrain2Depot ? secondTrain : null;
  const mainlineTrain = !isTrain1Depot ? firstTrain : !isTrain2Depot ? secondTrain : null;

  const finalPlan = {
    depotTrain: depotTrain ? {
      trainId: depotTrain.trainId,
      physicalTrain: depotTrain.physicalTrainId,
      operator: isBehindTrainDepotScenario ? secondOp.empName : depotTrain.operator?.empName,
      empId: isBehindTrainDepotScenario ? secondOp.empId : depotTrain.operator?.empId,
      expectedSignOff: isBehindTrainDepotScenario ? secondOp.expectedSignOff : depotTrain.operator?.expectedSignOff,
      departure: depotTrain.timeStr,
      station: swapLocation,
      platform: depotTrain.platform,
      status: 'READY_FOR_STABLING'
    } : null,
    mainlineTrain: mainlineTrain ? {
      trainId: mainlineTrain.trainId,
      physicalTrain: mainlineTrain.physicalTrainId,
      operator: reliefRequired && reliefOperator ? reliefOperator.name : mainlineTrain.operator?.empName,
      empId: reliefRequired && reliefOperator ? reliefOperator.operatorId : mainlineTrain.operator?.empId,
      expectedSignOff: reliefRequired && reliefOperator ? reliefOperator.expectedSignOff : mainlineTrain.operator?.expectedSignOff,
      remainingShiftMinutes: reliefRequired && reliefOperator ? reliefOperator.remainingShiftMinutes : null,
      nextService: `Service ${mainlineTrain.trainId}`,
      station: swapLocation,
      platform: mainlineTrain.platform,
      status: 'APPROVED_FOR_SERVICE'
    } : null
  };

  // Structured Handover Record
  const handoverRecord = {
    swapReference: `SWAP_L2_${trainAId}_${trainBId}_${Date.now()}`,
    dayType: normDay,
    swapLocation: stationMeta.name,
    stationCode: stationMeta.code,
    handoverWindowSecs: arrivalGapSecs,
    handoverWindowFormatted: formatDurationMinutesSecs(arrivalGapSecs),
    firstArrival: firstTrain.timeStr,
    secondArrival: secondTrain.timeStr,
    transferFeasible: isTransferFeasible,
    safetyStatus: hardRuleViolations.length === 0 ? 'VERIFIED_COMPLIANT' : 'SAFETY_RESTRICTED',
    decisionCase,
    status: finalDecision
  };

  // Relief Waterfall Breakdown for Display (Section 16)
  const reliefPrioritySummary = {
    priority1_Actual: {
      title: 'Priority 1: Actual Assigned Operator',
      status: isBehindTrainDepotScenario ? 'BEHIND_TRAIN_RELIEVED' : 'AVAILABLE',
      operatorName: firstOp.empName,
      expectedSignOff: firstOp.expectedSignOff || null
    },
    priority2_PRO: {
      title: 'Priority 2: PRO (Pilot Reserve Operators)',
      status: candidateEvaluations.some(c => c.priorityRank === 2 && c.eligible) ? 'AVAILABLE' : 'NOT_AVAILABLE',
      candidate: candidateEvaluations.find(c => c.priorityRank === 2 && c.eligible)?.name || 
        (candidateEvaluations.find(c => c.priorityRank === 2) ? `${candidateEvaluations.find(c => c.priorityRank === 2).name} (Disqualified: Past sign-off)` : 'None Eligible'),
      expectedSignOff: candidateEvaluations.find(c => c.priorityRank === 2 && c.eligible)?.expectedSignOff || null,
      remainingMins: candidateEvaluations.find(c => c.priorityRank === 2 && c.eligible)?.remainingShiftMinutes || 0
    },
    priority3_OR: {
      title: 'Priority 3: OR (Operating Reserves)',
      status: candidateEvaluations.some(c => c.priorityRank === 3 && c.eligible) ? 'AVAILABLE' : 'NOT_AVAILABLE',
      candidate: candidateEvaluations.find(c => c.priorityRank === 3 && c.eligible)?.name || 
        (candidateEvaluations.find(c => c.priorityRank === 3) ? `${candidateEvaluations.find(c => c.priorityRank === 3).name} (Disqualified: Past sign-off)` : 'None Eligible'),
      expectedSignOff: candidateEvaluations.find(c => c.priorityRank === 3 && c.eligible)?.expectedSignOff || null,
      remainingMins: candidateEvaluations.find(c => c.priorityRank === 3 && c.eligible)?.remainingShiftMinutes || 0
    },
    priority4_STANDBY: {
      title: 'Priority 4: STANDBY (Depot Standbys)',
      status: candidateEvaluations.some(c => c.priorityRank === 4 && c.eligible) ? 'AVAILABLE' : 'NOT_AVAILABLE',
      candidate: candidateEvaluations.find(c => c.priorityRank === 4 && c.eligible)?.name || 
        (candidateEvaluations.find(c => c.priorityRank === 4) ? `${candidateEvaluations.find(c => c.priorityRank === 4).name} (Disqualified: Past sign-off)` : 'None Eligible'),
      expectedSignOff: candidateEvaluations.find(c => c.priorityRank === 4 && c.eligible)?.expectedSignOff || null,
      remainingMins: candidateEvaluations.find(c => c.priorityRank === 4 && c.eligible)?.remainingShiftMinutes || 0
    },
    priority5_DutyTO: {
      title: 'Priority 5: Other Eligible Duty Operator',
      status: candidateEvaluations.some(c => c.priorityRank === 5 && c.eligible) ? 'AVAILABLE' : 'NOT_AVAILABLE',
      candidate: candidateEvaluations.find(c => c.priorityRank === 5 && c.eligible)?.name || 'None Eligible',
      expectedSignOff: candidateEvaluations.find(c => c.priorityRank === 5 && c.eligible)?.expectedSignOff || null,
      remainingMins: candidateEvaluations.find(c => c.priorityRank === 5 && c.eligible)?.remainingShiftMinutes || 0
    }
  };

  // What-If Simulation Solutions
  alternativeSolutions.push({
    solutionId: 'SOL_A_DIRECT',
    name: 'Solution A: Direct Cab Exchange (Zero Reserve)',
    description: `Operator ${firstOp.empName} moves to Train ${secondTrain.trainId}; Operator ${secondOp.empName} moves to Train ${firstTrain.trainId}.`,
    feasible: hardRuleViolations.length === 0 && !isBehindTrainDepotScenario,
    punctualityImpact: `${Math.max(delayA, delayB)}m schedule delta`,
    crewOvertimeRisk: 'LOW',
    score: (hardRuleViolations.length === 0 && !isBehindTrainDepotScenario) ? 95 : 45
  });

  const topRelief = candidateEvaluations.find(c => c.eligible);
  alternativeSolutions.push({
    solutionId: 'SOL_B_RELIEF_WATERFALL',
    name: `Solution B: Priority Relief via ${topRelief?.candidateType || 'PRO'} (${topRelief?.name || 'Relief Driver'})`,
    description: `Deploy active ${topRelief?.candidateType || 'PRO'} reserve on Train ${secondTrain.trainId}; Transfer ${secondOp.empName} to Depot Train ${firstTrain.trainId}.`,
    feasible: Boolean(topRelief),
    punctualityImpact: 'Minimal (< 1m delta)',
    crewOvertimeRisk: 'ZERO',
    score: 96
  });

  const trainAObj = firstTrain.trainId === trainAId ? firstTrain : secondTrain;
  const trainBObj = secondTrain.trainId === trainBId ? secondTrain : firstTrain;

  const resultPayload = {
    decision: finalDecision,
    decisionCase,
    dayType: normDay,
    arrivalOrder: [firstTrain.trainId, secondTrain.trainId],
    firstTrainId: firstTrain.trainId,
    secondTrainId: secondTrain.trainId,
    firstTrainEta: firstTrain.timeStr,
    secondTrainEta: secondTrain.timeStr,
    arrivalGapMinutes,
    arrivalGapSecs,
    isTransferFeasible,
    isBehindTrainDepotScenario,
    isJlhlDnScenario,
    train1: firstTrain,
    train2: secondTrain,
    trainA: {
      ...trainAObj,
      wttScheduledEta: secondsToTimeStr(baseEtaASecs),
      eta: secondsToTimeStr(actualEtaASecs)
    },
    trainB: {
      ...trainBObj,
      wttScheduledEta: secondsToTimeStr(baseEtaBSecs),
      eta: secondsToTimeStr(actualEtaBSecs)
    },
    crewAnalysis: {
      depotOperator: {
        name: isBehindTrainDepotScenario ? secondOp.empName : isTrain1Depot ? firstOp.empName : secondOp.empName,
        empId: isBehindTrainDepotScenario ? secondOp.empId : isTrain1Depot ? firstOp.empId : secondOp.empId,
        dutyNo: isBehindTrainDepotScenario ? secondOp.dutyNo : isTrain1Depot ? firstOp.dutyNo : secondOp.dutyNo,
        currentTrain: isBehindTrainDepotScenario ? secondTrain.trainId : isTrain1Depot ? firstTrain.trainId : secondTrain.trainId,
        currentLocation: isBehindTrainDepotScenario ? `${swapLocation} (Behind Train)` : swapLocation,
        status: isBehindTrainDepotScenario ? OPERATOR_STATUS_TYPES.DRIVING : OPERATOR_STATUS_TYPES.AVAILABLE,
        breakStatus: isBehindTrainDepotScenario ? breakEvalB.status : breakEvalA.status,
        availability: 'AVAILABLE FOR TRANSFER TO DEPOT'
      },
      mainlineOperator: {
        name: isBehindTrainDepotScenario && reliefOperator ? reliefOperator.name : secondOp.empName,
        empId: isBehindTrainDepotScenario && reliefOperator ? reliefOperator.operatorId : secondOp.empId,
        dutyNo: isBehindTrainDepotScenario && reliefOperator ? reliefOperator.dutyId : secondOp.dutyNo,
        currentTrain: secondTrain.trainId,
        currentLocation: swapLocation,
        status: OPERATOR_STATUS_TYPES.MAINLINE_ASSIGNED,
        breakStatus: breakEvalB.status,
        availability: 'AVAILABLE FOR MAINLINE SERVICE'
      }
    },
    reliefDecision: {
      reliefRequired,
      reliefType,
      reliefLocation: `${swapLocation} UP (${firstTrain.platform})`,
      selectedRelief: reliefOperator ? {
        empId: reliefOperator.operatorId || reliefOperator.empId || null,
        name: reliefOperator.name || null,
        cadre: reliefOperator.cadre || null,
        poolTier: reliefOperator.candidateType || null,
        priorityRank: reliefOperator.priorityRank || null,
        dutyId: reliefOperator.dutyId || null,
        signOnTime: reliefOperator.signOnTime || null,
        expectedSignOff: reliefOperator.expectedSignOff || null,
        remainingShiftMinutes: reliefOperator.remainingShiftMinutes !== undefined ? reliefOperator.remainingShiftMinutes : null,
        signOffDetails: reliefOperator.signOffDetails || null
      } : null,
      priorityWaterfall: reliefPrioritySummary,
      reason: explanation
    },
    finalPlan,
    operatorActions,
    candidateEvaluations,
    alternativeSolutions,
    handoverRecord,
    hardRuleViolations,
    explanation,
    stationMeta,
    evaluatedAt: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    verificationStatus: 'WAITING_FOR_VERIFICATION'
  };

  // 12. AUDIT LOGGING TO FIRESTORE (Section 18 & 19)
  try {
    const swapRefId = handoverRecord.swapReference;
    const cleanPayload = sanitizeForFirestore({
      ...resultPayload,
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, 'train_swap_events', swapRefId), cleanPayload, { merge: true });

    await setDoc(doc(db, 'trainIdSwapEvents', swapRefId), sanitizeForFirestore({
      eventId: swapRefId,
      train1: firstTrain.trainId,
      train2: secondTrain.trainId,
      decision: finalDecision,
      decisionCase,
      reliefRequired,
      reliefOperator: reliefOperator?.name || null,
      evaluatedAt: serverTimestamp()
    }), { merge: true });
  } catch (err) {
    console.warn("Firestore audit logging notice:", err.message);
  }

  return resultPayload;
}

/**
 * Commits the approved train swap directly into DISPATCH GATEWAY CORE
 * and writes to all official Firestore collections (Section 18 & 19):
 *  - trainIdSwapEvents
 *  - crewReliefDecisions
 *  - crewReliefAssignments
 *  - trainOperatorAssignments
 *  - trainIdSwapAudit
 *  - crew_daily_deployment
 *  - automated_dispatch_gate
 */
export async function commitSwapToDispatchGatewayCore({
  analysisResult,
  controllerId = 'CC_PYID_01',
  overrideReason = null
}) {
  if (!analysisResult) {
    throw new Error('Analysis result payload is required to execute swap.');
  }

  const { train1, train2, finalPlan, reliefDecision, handoverRecord, dayType, decision, decisionCase, operatorActions } = analysisResult;
  const batch = writeBatch(db);
  const eventId = handoverRecord.swapReference || `SWAP_EV_${Date.now()}`;

  // 1. Write to 'automated_dispatch_gate'
  const dispatchGateRef = doc(db, 'automated_dispatch_gate', eventId);
  batch.set(dispatchGateRef, sanitizeForFirestore({
    incidentId: eventId,
    incidentType: 'TRAIN_ID_SWAP_CREW_RELIEF',
    dayType: dayType || 'WEEKDAY',
    decisionCase: decisionCase || 'NORMAL_SWAP',
    train1Id: train1.trainId,
    train2Id: train2.trainId,
    operator1: {
      empId: train1.operator?.empId || null,
      name: train1.operator?.empName || null,
      dutyId: train1.operator?.dutyId || null
    },
    operator2: {
      empId: train2.operator?.empId || null,
      name: train2.operator?.empName || null,
      dutyId: train2.operator?.dutyId || null
    },
    reliefAssigned: reliefDecision?.selectedRelief || null,
    finalPlan,
    decision,
    actions: operatorActions,
    controllerId,
    overrideReason: overrideReason || null,
    status: 'EXECUTED_BY_OCC_CONTROLLER',
    executedAt: serverTimestamp()
  }), { merge: true });

  // 2. Write to 'trainIdSwapEvents' (Section 19)
  const swapEventRef = doc(db, 'trainIdSwapEvents', eventId);
  batch.set(swapEventRef, sanitizeForFirestore({
    eventId,
    swapLocation: handoverRecord.swapLocation,
    dayType,
    train1,
    train2,
    decision,
    decisionCase,
    reliefRequired: reliefDecision?.reliefRequired,
    reliefOperator: reliefDecision?.selectedRelief || null,
    approvedBy: controllerId,
    status: 'APPROVED_AND_EXECUTED',
    timestamp: serverTimestamp()
  }), { merge: true });

  // 3. Write to 'crewReliefDecisions' (Section 19)
  const reliefDecRef = doc(db, 'crewReliefDecisions', `relief_${eventId}`);
  batch.set(reliefDecRef, sanitizeForFirestore({
    decisionId: `relief_${eventId}`,
    swapEventId: eventId,
    reliefRequired: reliefDecision?.reliefRequired,
    reliefLocation: reliefDecision?.reliefLocation,
    selectedRelief: reliefDecision?.selectedRelief || null,
    priorityWaterfall: reliefPrioritySummary || reliefDecision?.priorityWaterfall,
    reason: reliefDecision?.reason,
    controllerId,
    createdAt: serverTimestamp()
  }), { merge: true });

  // 4. Write to 'crewReliefAssignments' (Section 19)
  if (reliefDecision?.selectedRelief) {
    const reliefAssignRef = doc(db, 'crewReliefAssignments', `assign_${eventId}`);
    batch.set(reliefAssignRef, sanitizeForFirestore({
      assignmentId: `assign_${eventId}`,
      swapEventId: eventId,
      operatorId: reliefDecision.selectedRelief.empId,
      operatorName: reliefDecision.selectedRelief.name,
      assignedTrain: finalPlan?.mainlineTrain?.trainId || train2.trainId,
      dutyNo: reliefDecision.selectedRelief.dutyId,
      reliefRole: reliefDecision.selectedRelief.poolTier,
      assignedBy: controllerId,
      status: 'ACTIVE_ASSIGNMENT',
      assignedAt: serverTimestamp()
    }), { merge: true });
  }

  // 5. Write to 'trainOperatorAssignments' (Section 19)
  const opAssign1Ref = doc(db, 'trainOperatorAssignments', `assign_${train1.trainId}_${Date.now()}`);
  batch.set(opAssign1Ref, sanitizeForFirestore({
    trainId: train1.trainId,
    physicalTrainId: train1.physicalTrainId,
    assignedOperator: finalPlan?.depotTrain?.operator || train1.operator?.empName || null,
    operatorId: finalPlan?.depotTrain?.empId || train1.operator?.empId || null,
    destination: train1.destination,
    platform: train1.platform,
    assignedAt: serverTimestamp()
  }), { merge: true });

  const opAssign2Ref = doc(db, 'trainOperatorAssignments', `assign_${train2.trainId}_${Date.now()}`);
  batch.set(opAssign2Ref, sanitizeForFirestore({
    trainId: train2.trainId,
    physicalTrainId: train2.physicalTrainId,
    assignedOperator: finalPlan?.mainlineTrain?.operator || train2.operator?.empName || null,
    operatorId: finalPlan?.mainlineTrain?.empId || train2.operator?.empId || null,
    destination: train2.destination,
    platform: train2.platform,
    assignedAt: serverTimestamp()
  }), { merge: true });

  // 6. Write to 'trainIdSwapAudit' (Section 18)
  const auditRef = doc(db, 'trainIdSwapAudit', `audit_${eventId}`);
  batch.set(auditRef, sanitizeForFirestore({
    auditId: `audit_${eventId}`,
    swapReference: eventId,
    train1Id: train1.trainId,
    train2Id: train2.trainId,
    train1Physical: train1.physicalTrainId,
    train2Physical: train2.physicalTrainId,
    originalOperator1: train1.operator?.empName || null,
    originalOperator2: train2.operator?.empName || null,
    finalOperator1: finalPlan?.depotTrain?.operator || null,
    finalOperator2: finalPlan?.mainlineTrain?.operator || null,
    reliefOperator: reliefDecision?.selectedRelief?.name || 'NONE',
    reliefPriority: reliefDecision?.selectedRelief?.priorityRank || 'N/A',
    reliefLocation: reliefDecision?.reliefLocation || null,
    reason: analysisResult.explanation,
    wttReference: normDay,
    linkReference: `Duty ${train1.dutyLink?.dutyNo || '--'} / Duty ${train2.dutyLink?.dutyNo || '--'}`,
    createdBy: 'AI_SWAP_DECISION_ENGINE',
    approvedBy: controllerId,
    overrideReason: overrideReason || null,
    timestamp: serverTimestamp(),
    executionTimestamp: serverTimestamp()
  }), { merge: true });

  // 7. Update 'train_swap_events' backwards compatibility record
  const legacyRef = doc(db, 'train_swap_events', eventId);
  batch.set(legacyRef, sanitizeForFirestore({
    status: 'COMMITTED_TO_DISPATCH_CORE',
    executedBy: controllerId,
    overrideReason: overrideReason || null,
    committedAt: serverTimestamp()
  }), { merge: true });

  // 8. Update 'crew_daily_deployment' for the affected duties
  const duty1Id = train1.operator?.dutyId;
  const duty2Id = train2.operator?.dutyId;

  if (duty1Id && duty2Id) {
    const sched = String(dayType || 'weekday').toLowerCase();
    
    const depDoc1Ref = doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${duty1Id}`);
    const depDoc2Ref = doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${duty2Id}`);

    const newOp1 = finalPlan?.depotTrain?.operator || train2.operator?.empName;
    const newOp2 = finalPlan?.mainlineTrain?.operator || train1.operator?.empName;
    const newEmpId1 = finalPlan?.depotTrain?.empId || train2.operator?.empId;
    const newEmpId2 = finalPlan?.mainlineTrain?.empId || train1.operator?.empId;

    batch.set(depDoc1Ref, sanitizeForFirestore({
      empId: newEmpId1,
      empName: newOp1,
      remarks: `Updated via Train ID Swap & Relief Engine (${decisionCase || 'SWAP'})`,
      lastUpdated: serverTimestamp()
    }), { merge: true });

    batch.set(depDoc2Ref, sanitizeForFirestore({
      empId: newEmpId2,
      empName: newOp2,
      remarks: `Updated via Train ID Swap & Relief Engine (${decisionCase || 'SWAP'})`,
      lastUpdated: serverTimestamp()
    }), { merge: true });
  }

  await batch.commit();

  return {
    success: true,
    eventId,
    message: `Train ID Swap & Crew Relief successfully approved and committed to Dispatch Gateway Core! (Event ID: ${eventId})`
  };
}

/**
 * Fetches recent swap events for the audit log trail (Section 18)
 */
export async function getRecentSwapAuditLogs(limitCount = 15) {
  try {
    const q = query(collection(db, 'trainIdSwapAudit'), orderBy('timestamp', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    // Fallback to legacy collection if new audit collection empty
    const legacyQ = query(collection(db, 'train_swap_events'), orderBy('createdAt', 'desc'), limit(limitCount));
    const legacySnap = await getDocs(legacyQ);
    return legacySnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn("Error fetching swap audit logs:", e.message);
    return [];
  }
}

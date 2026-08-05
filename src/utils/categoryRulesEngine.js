import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export const DEFAULT_CATEGORY_RULES = {
  STBK: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Standby Pool"
  },
  RD3: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Standby Pool"
  },
  OR: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Extra Pool"
  },
  PRO: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Extra Pool"
  },
  TGTP: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Extra Pool"
  },
  EXTRA: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Extra Pool"
  },
  Reserve: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Reserve Pool"
  },
  "Depot Standby": {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: true,
    requiresAdminOverride: false,
    destinationPool: "Standby Pool"
  },
  CC1: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Crew Control"
  },
  CC2: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Crew Control"
  },
  CC3: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Crew Control"
  },
  "Weekly Off": {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Weekly Off Register"
  },
  WO: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Weekly Off Register"
  },
  CL: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  EL: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  HPL: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  ML: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  PL: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  SCL: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  LWP: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  BMRTI: {
    availableForRelief: false,
    countsAsActiveCrew: true,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Training / Competency Board"
  },
  CRT: {
    availableForRelief: false,
    countsAsActiveCrew: true,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Training / Competency Board"
  },
  Training: {
    availableForRelief: false,
    countsAsActiveCrew: true,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Training / Competency Board"
  },
  "Extra Duty": {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: false,
    requiresAdminOverride: false,
    destinationPool: "Extra Duty Tracker"
  },
  Medical: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Restricted Registry"
  },
  Suspended: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Restricted Registry"
  },
  Absent: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Restricted Registry"
  },
  "Not Reporting": {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Restricted Registry"
  },
  NR: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Restricted Registry"
  },
  "HPL/ML": {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  "HPL.ML": {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  Weekly_Off: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Weekly Off Register"
  },
  Weekly_Off_CIT: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Weekly Off Register"
  },
  Leave_Ex: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  Leave_Re: {
    availableForRelief: false,
    countsAsActiveCrew: false,
    visibleInExtraPool: false,
    requiresAdminOverride: true,
    destinationPool: "Leave Management Dashboard"
  },
  Extra_Duty: {
    availableForRelief: true,
    countsAsActiveCrew: true,
    visibleInExtraPool: false,
    requiresAdminOverride: false,
    destinationPool: "Extra Duty Tracker"
  }
};

export const SAFE_FALLBACK_RULE = {
  availableForRelief: false,
  countsAsActiveCrew: false,
  visibleInExtraPool: false,
  requiresAdminOverride: true,
  destinationPool: "Restricted Registry"
};

/**
 * Normalizes a category string and returns matching rule, falling back to defaults or safe fallback.
 */
export const resolveCategoryRule = (categoryStr, customRules = {}) => {
  if (!categoryStr) return SAFE_FALLBACK_RULE;
  const key = String(categoryStr).trim().toUpperCase();

  // 1. Try matching custom rules from Firestore (case insensitive)
  const customKey = Object.keys(customRules || {}).find(k => k.toUpperCase() === key);
  if (customKey && customRules[customKey]) {
    return customRules[customKey];
  }

  // 2. Try matching DEFAULT_CATEGORY_RULES (case insensitive)
  const defaultKey = Object.keys(DEFAULT_CATEGORY_RULES).find(k => k.toUpperCase() === key);
  if (defaultKey) {
    return DEFAULT_CATEGORY_RULES[defaultKey];
  }

  // 3. Fallback to restricted default
  return SAFE_FALLBACK_RULE;
};

/**
 * Maps a destination pool string to a Firestore collection path.
 */
export const resolveDestinationCollection = (destinationPool) => {
  switch (destinationPool) {
    case "Standby Pool":
    case "Extra Pool":
    case "Reserve Pool":
      return "crew_extra_operators";
    case "Weekly Off Register":
      return "weekly_off_register";
    case "Leave Management Dashboard":
      return "leave_requests";
    case "Training / Competency Board":
    case "Restricted Registry":
      return "restricted_registry";
    case "Extra Duty Tracker":
      return "extra_duty_roster";
    default:
      return null;
  }
};

/**
 * Fetches category rules from Firestore.
 */
export const getCategoryRules = async () => {
  try {
    const docRef = doc(db, 'system_settings', 'category_rules');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data().rules || DEFAULT_CATEGORY_RULES;
    }
  } catch (err) {
    console.error("Error reading category rules from Firestore:", err);
  }
  return DEFAULT_CATEGORY_RULES;
};

/**
 * Saves category rules to Firestore.
 */
export const saveCategoryRules = async (rules) => {
  const docRef = doc(db, 'system_settings', 'category_rules');
  await setDoc(docRef, {
    rules,
    lastUpdated: new Date().toISOString(),
    version: "1.0.0"
  });
};

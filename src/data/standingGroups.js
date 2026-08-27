/**
 * BMRCL Peenya Industry Depot Standing Off-Line Groups
 * 
 * Sourced from BMRCL Crew Master Invariants:
 * 1. PINK_LINE_4: 10 crew members stationed on Pink Line 4 support (tag = "OD" on Weekday/Mon/Sat, "WO" on Sun)
 * 2. BMRTI_R5: 3 crew members on open-ended BMRTI training
 */

export const PINK_LINE_4_CREW_IDS = [
  21414, 21482, 21723, 21724, 22224, 22237, 22294, 22296, 22297, 22315
];

export const BMRTI_R5_CREW_IDS = [
  21490, 21487, 21496
];

export const STANDING_GROUPS = {
  PINK_LINE_4: PINK_LINE_4_CREW_IDS,
  BMRTI_R5: BMRTI_R5_CREW_IDS
};

export function isStandingOfflineGroup(empId) {
  const numId = parseInt(empId, 10);
  if (PINK_LINE_4_CREW_IDS.includes(numId)) return 'PINK_LINE_4';
  if (BMRTI_R5_CREW_IDS.includes(numId)) return 'BMRTI_R5';
  return null;
}

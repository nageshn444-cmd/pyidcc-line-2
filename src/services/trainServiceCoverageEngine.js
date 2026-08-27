/**
 * BMRCL Line 2 (Peenya Depot) — Train Service Coverage Engine
 * 
 * CORE PRINCIPLE:
 * Train count is an OPERATIONAL INPUT to the coverage engine, NOT a duty count.
 * - WEEKDAY: 23 Active Trains, 161+ Trips -> 79 derived duties
 * - MONDAY: 23 Active Trains, 161+ Trips -> 80 derived slots (slot 79 blank)
 * - SATURDAY / GH: 21 Active Trains -> 74 derived duties (dual Npro)
 * - SUNDAY: 17 Active Trains -> 65 derived duties (15 nights)
 */

export const TRAIN_SERVICE_CONFIGS = {
  WEEKDAY: {
    dayType: 'WEEKDAY',
    activeTrainCount: 23,
    scheduledTrips: 161,
    trainIds: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', '222', '223'],
    peakHeadwayMin: 5,
    nonPeakHeadwayMin: 8,
    requiredDrivingDuties: 77, // Total 79 minus 2 OR
    totalDerivedDuties: 79
  },
  MON: {
    dayType: 'MON',
    activeTrainCount: 23,
    scheduledTrips: 161,
    trainIds: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221', '222', '223'],
    peakHeadwayMin: 5,
    nonPeakHeadwayMin: 8,
    requiredDrivingDuties: 77,
    totalDerivedDuties: 80
  },
  SAT: {
    dayType: 'SAT',
    activeTrainCount: 21,
    scheduledTrips: 145,
    trainIds: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221'],
    peakHeadwayMin: 6,
    nonPeakHeadwayMin: 10,
    requiredDrivingDuties: 72, // 74 minus 2 OR
    totalDerivedDuties: 74
  },
  SUN: {
    dayType: 'SUN',
    activeTrainCount: 17,
    scheduledTrips: 118,
    trainIds: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217'],
    peakHeadwayMin: 8,
    nonPeakHeadwayMin: 12,
    requiredDrivingDuties: 63, // 65 minus 2 OR
    totalDerivedDuties: 65
  },
  GH: {
    dayType: 'GH',
    activeTrainCount: 21,
    scheduledTrips: 145,
    trainIds: ['201', '202', '203', '204', '205', '206', '207', '208', '209', '210', '211', '212', '213', '214', '215', '216', '217', '218', '219', '220', '221'],
    peakHeadwayMin: 6,
    nonPeakHeadwayMin: 10,
    requiredDrivingDuties: 72,
    totalDerivedDuties: 74
  }
};

/**
 * Validates Train Coverage against Available Qualified Crew
 */
export function validateTrainCoverage({
  dayType = 'WEEKDAY',
  assignments = [],
  availableCrewCount = 0
}) {
  const config = TRAIN_SERVICE_CONFIGS[dayType] || TRAIN_SERVICE_CONFIGS.WEEKDAY;
  const activeDuties = assignments.filter(a => a.assignmentCategory === 'ACTIVE_DUTY' && a.empId);
  const coveredCount = activeDuties.length;
  const requiredCount = config.requiredDrivingDuties;

  const isCovered = coveredCount >= requiredCount;
  const shortageCount = Math.max(0, requiredCount - coveredCount);

  let shortageReport = null;

  if (!isCovered) {
    shortageReport = {
      severity: 'CRITICAL_MANPOWER_SHORTAGE',
      dayType,
      activeTrainsRequired: config.activeTrainCount,
      scheduledTrips: config.scheduledTrips,
      requiredDrivingDuties: requiredCount,
      coveredDrivingDuties: coveredCount,
      shortageCount,
      availableCrewCount,
      recommendedActions: [
        'Deploy from Rostered Operating Reserve (OR1 / OR2)',
        'Deploy from Station Standby Pool (PUTH, NGSA, KGWA, RVR, APTS, BIET)',
        'Check qualified trainees eligible for solo graduation'
      ]
    };
  }

  return {
    isCovered,
    activeTrainCount: config.activeTrainCount,
    scheduledTrips: config.scheduledTrips,
    requiredDrivingDuties: requiredCount,
    coveredDrivingDuties: coveredCount,
    shortageCount,
    shortageReport
  };
}

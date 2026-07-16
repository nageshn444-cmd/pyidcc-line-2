export const DUTY_CATEGORIES = {
  PLANNER: ['WEEKLY OFF', 'WO', 'REST'],
  LEAVE: ['CL', 'EL', 'GHEL', 'HPL', 'ABSENT', 'LWP'],
  EXTRA_DUTY: ['NGSA STBK', 'PUTH STBK', 'TGTP STBK', 'BRMM TRAINING', 'TEST TRACK', 'BMRTI', 'CC1', 'CC2', 'CC3']
};

// Helper function to categorize a duty
export const getDutyCategory = (dutyCode) => {
  const code = String(dutyCode || '').toUpperCase().trim();
  
  if (DUTY_CATEGORIES.PLANNER.includes(code)) return 'PLANNER';
  if (DUTY_CATEGORIES.LEAVE.includes(code)) return 'LEAVE';
  if (DUTY_CATEGORIES.EXTRA_DUTY.includes(code)) return 'EXTRA_DUTY';
  
  return 'UNKNOWN'; // Trigger for Manual Fallback
};

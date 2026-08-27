/**
 * BMRCL Line 2 (Peenya Depot) — Special & Auxiliary Duty Registry
 * Distinct from mainline train-driving duties.
 * 
 * Includes:
 * - OR1, OR2 (Operating Reserve)
 * - 1Stbk, 2Stbk (Standby / Station Relievers)
 * - Station Posts: NGSA, PUTH, KGWA, RVR, BYPH CC, RVR CC
 * - SPORTS (Sports Quota Deputation)
 * - Pink Duty Standbys / Light Depot Support
 */

export const SPECIAL_AUX_DUTY_REGISTRY = [
  {
    dutyCode: 'OR1',
    label: 'Operating Reserve 1 (Morning)',
    shift: 'PRO',
    sOnTime: '06:00',
    sOffTime: '14:00',
    sOnLoc: 'PYID',
    sOffLoc: 'PYID',
    category: 'SPECIAL_AUX_DUTY',
    description: 'Mainline Depot Operating Reserve 1'
  },
  {
    dutyCode: 'OR2',
    label: 'Operating Reserve 2 (Afternoon)',
    shift: 'PRO',
    sOnTime: '13:45',
    sOffTime: '21:45',
    sOnLoc: 'PYID',
    sOffLoc: 'PYID',
    category: 'SPECIAL_AUX_DUTY',
    description: 'Mainline Depot Operating Reserve 2'
  },
  {
    dutyCode: '1Stbk',
    label: '1st Standby (Emergency Backup)',
    shift: 'STBY',
    sOnTime: '06:00',
    sOffTime: '14:00',
    sOnLoc: 'PYID',
    sOffLoc: 'PYID',
    category: 'SPECIAL_AUX_DUTY',
    description: 'First-call emergency relief for same-day book-offs'
  },
  {
    dutyCode: '2Stbk',
    label: '2nd Standby (Afternoon Backup)',
    shift: 'STBY',
    sOnTime: '14:00',
    sOffTime: '22:00',
    sOnLoc: 'PYID',
    sOffLoc: 'PYID',
    category: 'SPECIAL_AUX_DUTY',
    description: 'Second-call relief for afternoon shift coverage'
  },
  {
    dutyCode: 'NGSA_STBY',
    label: 'Nagasandra Station Standby',
    shift: 'STBY',
    sOnTime: '06:30',
    sOffTime: '14:30',
    sOnLoc: 'NGSA',
    sOffLoc: 'NGSA',
    category: 'SPECIAL_AUX_DUTY',
    description: 'Station post reserve at Nagasandra'
  },
  {
    dutyCode: 'PUTH_STBY',
    label: 'Puttenahalli Station Standby',
    shift: 'STBY',
    sOnTime: '14:00',
    sOffTime: '22:00',
    sOnLoc: 'PUTH',
    sOffLoc: 'PUTH',
    category: 'SPECIAL_AUX_DUTY',
    description: 'Station post reserve at Puttenahalli'
  },
  {
    dutyCode: 'KGWA_STBY',
    label: 'Kengeri / KGWA Station Standby',
    shift: 'STBY',
    sOnTime: '06:30',
    sOffTime: '14:30',
    sOnLoc: 'KGWA',
    sOffLoc: 'KGWA',
    category: 'SPECIAL_AUX_DUTY',
    description: 'Station post reserve at KGWA'
  },
  {
    dutyCode: 'SPORTS',
    label: 'Sports Quota Deputation',
    shift: 'SPECIAL',
    sOnTime: '09:00',
    sOffTime: '17:00',
    sOnLoc: 'BMRCL HQ',
    sOffLoc: 'BMRCL HQ',
    category: 'SPECIAL_AUX_DUTY',
    description: 'Deputed on sports training / tournament duty'
  }
];

export function isSpecialAuxDuty(dutyCode) {
  if (!dutyCode) return false;
  const upper = String(dutyCode).toUpperCase().trim();
  return (
    upper === 'OR1' ||
    upper === 'OR2' ||
    upper === '1STBK' ||
    upper === '2STBK' ||
    upper === 'SPORTS' ||
    upper === 'SPECIAL_DUTY' ||
    upper.includes('STBK') ||
    upper.includes('STBY')
  );
}

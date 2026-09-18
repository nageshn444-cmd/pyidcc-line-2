/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * Master Reliever ID Chart for WEEKDAY Link dated 03/Sep/2026 (BIET-APTS)
 * 
 * Defines the authoritative handover schedule and duty assignments across
 * Mainline Running Fleets (Trains 201 to 223) and Counseling Shift (Couns).
 */

export const WEEKDAY_RELIEF_ID_CHART = {
  '201': [
    { from: '04:25', to: '06:33', duty: '71' },
    { from: '06:33', to: '08:48', duty: '11' },
    { from: '08:48', to: '10:58', duty: '09' },
    { from: '10:58', to: '13:13', duty: '19' },
    { from: '13:13', to: '13:47', duty: '17' },
    { from: '13:45', to: '15:29', duty: '30' },
    { from: '15:29', to: '17:46', duty: '36' },
    { from: '17:46', to: '19:57', duty: '54' },
    { from: '19:57', to: '21:50', duty: '43' },
    { from: '21:48', to: '00:10', duty: '64' }
  ],
  '202': [
    { from: '04:00', to: '06:48', duty: '69' },
    { from: '06:48', to: '08:58', duty: '17' },
    { from: '08:58', to: '11:08', duty: '14' },
    { from: '11:08', to: '13:21', duty: '30' },
    { from: '13:21', to: '15:37', duty: '34' },
    { from: '15:37', to: '17:57', duty: '52' },
    { from: '17:57', to: '20:07', duty: '48' },
    { from: '20:07', to: '21:58', duty: '51' },
    { from: '21:56', to: '23:30', duty: '74' }
  ],
  '203': [
    { from: '04:15', to: '06:43', duty: '73' },
    { from: '06:41', to: '07:37', duty: '13' },
    { from: '07:35', to: '09:18', duty: '27' },
    { from: '09:18', to: '12:05', duty: '10' },
    { from: '16:10', to: '18:47', duty: '58' },
    { from: '18:47', to: '21:45', duty: '45' }
  ],
  '204': [
    { from: '04:45', to: '06:58', duty: '70' },
    { from: '06:58', to: '07:47', duty: '19' },
    { from: '07:47', to: '09:28', duty: '28' },
    { from: '09:28', to: '11:41', duty: '15' },
    { from: '11:41', to: '13:53', duty: '09' },
    { from: '13:53', to: '14:27', duty: '20' },
    { from: '14:27', to: '16:08', duty: '45' },
    { from: '16:08', to: '18:17', duty: '37' },
    { from: '18:17', to: '20:27', duty: '34' },
    { from: '20:27', to: '21:34', duty: '50' },
    { from: '21:32', to: '00:15', duty: '61' }
  ],
  '205': [
    { from: '04:45', to: '07:13', duty: '72' },
    { from: '07:11', to: '07:33', duty: '24' },
    { from: '07:33', to: '09:48', duty: '26' },
    { from: '09:48', to: '11:58', duty: '21' },
    { from: '11:58', to: '14:09', duty: '14' },
    { from: '14:09', to: '16:25', duty: '41' },
    { from: '16:25', to: '18:37', duty: '35' },
    { from: '18:37', to: '20:47', duty: '57' },
    { from: '20:47', to: '21:34', duty: '48' },
    { from: '21:28', to: '00:10', duty: '67' }
  ],
  '206': [
    { from: '04:15', to: '06:15', duty: '68' },
    { from: '06:13', to: '07:48', duty: '03' },
    { from: '07:48', to: '09:58', duty: '24' },
    { from: '09:58', to: '12:12', duty: '23' },
    { from: '12:12', to: '14:25', duty: '28' },
    { from: '14:25', to: '16:41', duty: '46' },
    { from: '16:41', to: '18:32', duty: '38' },
    { from: '18:32', to: '20:55', duty: '33' }
  ],
  '207': [
    { from: '04:20', to: '06:30', duty: '63' },
    { from: '06:28', to: '07:58', duty: '08' },
    { from: '07:58', to: '10:08', duty: '13' },
    { from: '10:08', to: '12:18', duty: '29' },
    { from: '12:18', to: '14:13', duty: '15' },
    { from: '14:13', to: '14:33', duty: '42' },
    { from: '14:33', to: '16:48', duty: '47' },
    { from: '16:48', to: '18:57', duty: '41' },
    { from: '18:57', to: '21:07', duty: '38' },
    { from: '21:07', to: '21:36', duty: '58' },
    { from: '21:32', to: '23:55', duty: '69' }
  ],
  '208': [
    { from: '04:15', to: '06:27', duty: '62' },
    { from: '06:25', to: '08:08', duty: '07' },
    { from: '08:08', to: '10:18', duty: '19' },
    { from: '10:18', to: '12:33', duty: '03' },
    { from: '12:33', to: '14:49', duty: '21' },
    { from: '14:49', to: '17:04', duty: '42' },
    { from: '17:04', to: '19:17', duty: '46' },
    { from: '19:17', to: '21:31', duty: '60' },
    { from: '21:31', to: '22:05', duty: '57' }
  ],
  '209': [
    { from: '04:30', to: '06:37', duty: '65' },
    { from: '06:35', to: '08:18', duty: '12' },
    { from: '08:18', to: '10:28', duty: '30' },
    { from: '10:28', to: '12:41', duty: '24' },
    { from: '12:41', to: '13:15', duty: '22' },
    { from: '13:13', to: '14:37', duty: '24' },
    { from: '14:37', to: '14:57', duty: '48' },
    { from: '14:57', to: '17:13', duty: '53' },
    { from: '17:13', to: '19:02', duty: '47' },
    { from: '19:02', to: '21:25', duty: '35' }
  ],
  '210': [
    { from: '04:35', to: '06:47', duty: '61' },
    { from: '06:45', to: '08:28', duty: '16' },
    { from: '08:28', to: '10:38', duty: '04' },
    { from: '10:38', to: '12:49', duty: '08' },
    { from: '12:49', to: '14:45', duty: '23' },
    { from: '14:45', to: '15:05', duty: '50' },
    { from: '15:05', to: '17:20', duty: '54' },
    { from: '17:20', to: '19:12', duty: '49' },
    { from: '19:12', to: '20:52', duty: '58' },
    { from: '20:52', to: '21:44', duty: '56' },
    { from: '21:42', to: '00:15', duty: '71' }
  ],
  '211': [
    { from: '04:40', to: '06:57', duty: '64' },
    { from: '06:55', to: '08:38', duty: '20' },
    { from: '08:38', to: '11:35', duty: '05' },
    { from: '16:50', to: '19:27', duty: '43' },
    { from: '19:27', to: '21:37', duty: '47' },
    { from: '21:37', to: '00:20', duty: '70' }
  ],
  '212': [
    { from: '06:12', to: '08:03', duty: '04' },
    { from: '08:03', to: '09:43', duty: '29' },
    { from: '09:43', to: '11:23', duty: '27' },
    { from: '11:23', to: '13:37', duty: '20' },
    { from: '13:37', to: '14:11', duty: '10' },
    { from: '14:09', to: '15:53', duty: '39' },
    { from: '15:53', to: '18:07', duty: '33' },
    { from: '18:07', to: '20:17', duty: '56' },
    { from: '20:17', to: '21:50', duty: '42' },
    { from: '21:48', to: '00:15', duty: '65' }
  ],
  '213': [
    { from: '06:20', to: '08:13', duty: '05' },
    { from: '08:13', to: '09:53', duty: '03' },
    { from: '09:53', to: '11:34', duty: '28' },
    { from: '11:34', to: '13:45', duty: '11' },
    { from: '13:45', to: '16:01', duty: '35' },
    { from: '16:01', to: '17:52', duty: '34' },
    { from: '17:52', to: '19:32', duty: '51' },
    { from: '19:32', to: '21:46', duty: '44' },
    { from: '21:46', to: '23:55', duty: '63' }
  ],
  '214': [
    { from: '06:30', to: '08:23', duty: '09' },
    { from: '08:23', to: '10:03', duty: '08' },
    { from: '10:03', to: '12:04', duty: '22' },
    { from: '12:04', to: '14:17', duty: '27' },
    { from: '14:17', to: '16:33', duty: '44' },
    { from: '16:33', to: '18:22', duty: '45' },
    { from: '18:22', to: '20:50', duty: '52' }
  ],
  '215': [
    { from: '06:40', to: '08:33', duty: '14' },
    { from: '08:33', to: '10:13', duty: '07' },
    { from: '10:13', to: '12:25', duty: '26' },
    { from: '12:25', to: '14:41', duty: '18' },
    { from: '14:41', to: '16:57', duty: '49' },
    { from: '16:57', to: '19:07', duty: '44' },
    { from: '19:07', to: '21:17', duty: '59' },
    { from: '21:17', to: '21:46', duty: '39' },
    { from: '21:44', to: '00:15', duty: '72' }
  ],
  '216': [
    { from: '06:20', to: '08:43', duty: '06' },
    { from: '08:43', to: '11:10', duty: '12' },
    { from: '16:20', to: '18:42', duty: '59' },
    { from: '18:42', to: '21:05', duty: '37' }
  ],
  '217': [
    { from: '06:30', to: '07:27', duty: '66' },
    { from: '07:25', to: '09:08', duty: '25' },
    { from: '09:08', to: '11:18', duty: '06' },
    { from: '11:18', to: '13:29', duty: '04' },
    { from: '13:29', to: '14:03', duty: '25' },
    { from: '14:01', to: '15:45', duty: '37' },
    { from: '15:45', to: '17:41', duty: '56' },
    { from: '17:41', to: '19:22', duty: '40' },
    { from: '19:22', to: '21:25', duty: '41' },
    { from: '21:25', to: '21:56', duty: '55' },
    { from: '21:54', to: '00:05', duty: '73' }
  ],
  '218': [
    { from: '06:30', to: '08:53', duty: '10' },
    { from: '08:53', to: '11:20', duty: '16' },
    { from: '16:30', to: '18:52', duty: '60' },
    { from: '18:52', to: '20:32', duty: '39' },
    { from: '20:32', to: '21:20', duty: '53' }
  ],
  '219': [
    { from: '06:40', to: '09:03', duty: '15' },
    { from: '09:03', to: '10:43', duty: '20' },
    { from: '10:43', to: '12:57', duty: '13' },
    { from: '12:57', to: '15:13', duty: '29' },
    { from: '15:13', to: '17:28', duty: '48' },
    { from: '17:28', to: '19:37', duty: '42' },
    { from: '19:37', to: '20:30', duty: '49' }
  ],
  '220': [
    { from: '06:50', to: '09:13', duty: '18' },
    { from: '09:13', to: '10:53', duty: '11' },
    { from: '10:53', to: '13:05', duty: '07' },
    { from: '13:05', to: '15:01', duty: '26' },
    { from: '15:01', to: '15:21', duty: '52' },
    { from: '15:21', to: '17:36', duty: '50' },
    { from: '17:36', to: '19:47', duty: '53' },
    { from: '19:47', to: '21:42', duty: '40' },
    { from: '21:42', to: '23:50', duty: '62' }
  ],
  '221': [
    { from: '07:00', to: '09:38', duty: '22' },
    { from: '09:38', to: '11:48', duty: '18' },
    { from: '11:48', to: '14:01', duty: '06' },
    { from: '14:01', to: '16:17', duty: '38' },
    { from: '16:17', to: '18:27', duty: '39' },
    { from: '18:27', to: '20:37', duty: '55' },
    { from: '20:37', to: '21:24', duty: '54' },
    { from: '21:22', to: '23:35', duty: '66' }
  ],
  '222': [
    { from: '07:00', to: '09:23', duty: '21' },
    { from: '09:23', to: '11:45', duty: '17' },
    { from: '15:50', to: '18:12', duty: '57' },
    { from: '18:12', to: '20:35', duty: '36' }
  ],
  '223': [
    { from: '07:10', to: '09:33', duty: '23' },
    { from: '09:33', to: '11:55', duty: '25' },
    { from: '15:45', to: '18:02', duty: '55' },
    { from: '18:02', to: '19:42', duty: '50' },
    { from: '19:42', to: '21:34', duty: '46' },
    { from: '21:34', to: '22:40', duty: '68' }
  ],
  'Couns': [
    { from: '12:10', to: '14:10', duty: '12' },
    { from: '12:35', to: '13:30', duty: '05' },
    { from: '12:35', to: '14:15', duty: '16' },
    { from: '12:57', to: '13:27', duty: '13' },
    { from: '12:58', to: '13:28', duty: '03' },
    { from: '13:05', to: '15:30', duty: '33' },
    { from: '13:06', to: '14:50', duty: '24' },
    { from: '13:14', to: '13:44', duty: '08' },
    { from: '13:38', to: '14:35', duty: '19' },
    { from: '13:45', to: '15:05', duty: '36' },
    { from: '13:55', to: '17:15', duty: '40' },
    { from: '14:00', to: '16:25', duty: '43' }
  ]
};

// Converts HH:MM or HH:MM:SS string to seconds, shifting late night trips (00:00-02:59) to next day
export function timeStringToSeconds(timeStr) {
  if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
  const parts = String(timeStr).trim().split(':');
  let secs = 0;
  if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
  if (parts[1]) secs += parseInt(parts[1], 10) * 60;
  if (parts[2]) secs += parseInt(parts[2], 10);
  if (secs < 3 * 3600) {
    secs += 24 * 3600;
  }
  return secs;
}

// Inverted mapping: Duty ID -> array of ordered legs
export const WEEKDAY_DUTY_LEGS_FROM_ID_CHART = (() => {
  const map = {};
  Object.entries(WEEKDAY_RELIEF_ID_CHART).forEach(([trainId, legs]) => {
    legs.forEach(leg => {
      const d = String(leg.duty).padStart(2, '0');
      if (!map[d]) map[d] = [];
      map[d].push({
        trainId,
        from: leg.from,
        to: leg.to,
        startSec: timeStringToSeconds(leg.from),
        endSec: timeStringToSeconds(leg.to)
      });
    });
  });

  Object.keys(map).forEach(d => {
    map[d].sort((a, b) => a.startSec - b.startSec);
  });

  return map;
})();

/**
 * Builds the complete Live Train Tracking Map for WEEKDAY schedule
 * using the official ID chart and active deployments.
 * 
 * @param {Array} allDeployments - Deployed crew data with dutyId, empName, empId, etc.
 * @param {number} evalSecs - Current evaluation time in seconds
 * @returns {Object} { [trainId]: { current, previous, nextReliver } }
 */
export function buildWeekdayLiveTrainTrackingMap(allDeployments = [], evalSecs) {
  const deployMap = new Map();
  (allDeployments || []).forEach(d => {
    const rawDuty = String(d.dutyId || d.dutyNo || '').trim();
    if (!rawDuty) return;
    const norm = rawDuty.padStart(2, '0');
    // Prioritize active, operational, or filled deployment records
    if (!deployMap.has(norm) || (d.empName && d.empName !== '--')) {
      deployMap.set(norm, d);
    }
  });

  const calculatedTracking = {};

  Object.entries(WEEKDAY_RELIEF_ID_CHART).forEach(([trainId, legs]) => {
    const timeline = legs.map(leg => {
      const normDuty = String(leg.duty).padStart(2, '0');
      const deployed = deployMap.get(normDuty);

      const startSec = timeStringToSeconds(leg.from);
      const endSec = timeStringToSeconds(leg.to);
      const startStr = leg.from.includes(':') && leg.from.split(':').length === 2 ? `${leg.from}:00` : leg.from;
      const endStr = leg.to.includes(':') && leg.to.split(':').length === 2 ? `${leg.to}:00` : leg.to;

      return {
        dutyId: normDuty,
        empName: deployed?.empName || `Duty ${normDuty}`,
        empId: deployed?.empId || '--',
        startSec,
        endSec,
        startStr,
        endStr,
        isExchanged: deployed?.isExchanged || false,
        originalEmpName: deployed?.originalEmpName || '',
        originalEmpId: deployed?.originalEmpId || '',
        exchangeId: deployed?.exchangeId || '',
        approvedBy: deployed?.approvedBy || '',
        approvedDateTime: deployed?.approvedDateTime || ''
      };
    }).sort((a, b) => a.startSec - b.startSec);

    // 1. Current active operator
    const current = timeline.find(c => evalSecs >= c.startSec && evalSecs <= c.endSec) || null;

    // 2. Finished/previous operator
    const finished = timeline.filter(c => c.endSec < evalSecs);
    const previous = finished.length > 0 ? finished[finished.length - 1] : null;

    // 3. Upcoming reliever operator
    let nextReliver = null;
    if (current) {
      const futureLegs = timeline.filter(c => c.startSec >= current.endSec - 300);
      const distinctReliever = futureLegs.find(c => 
        (c.dutyId !== current.dutyId || c.empId !== current.empId || c.empName !== current.empName) &&
        c.empName && c.empName !== '--' && !c.empName.toLowerCase().includes('unassigned')
      );
      nextReliver = distinctReliever || futureLegs[0] || null;
    } else {
      nextReliver = timeline.find(c => 
        c.startSec > evalSecs && 
        c.empName && c.empName !== '--' && 
        !c.empName.toLowerCase().includes('unassigned')
      ) || timeline.find(c => c.startSec > evalSecs) || null;
    }

    calculatedTracking[trainId] = {
      current,
      previous,
      nextReliver
    };
  });

  return calculatedTracking;
}

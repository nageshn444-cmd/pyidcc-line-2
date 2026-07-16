import { timeToSeconds, secondsToHHMMSS } from '../utils/timeHelpers';

class DrivingHourService {
  calculateDutyDrivingHours(dutyRow) {
    // Sum trip seconds across all 4 legs
    const leg1 = timeToSeconds(dutyRow.leg1TripTime || '00:00:00');
    const leg2 = timeToSeconds(dutyRow.leg2TimeTo || '00:00:00');
    const leg3 = timeToSeconds(dutyRow.leg3TimeTo || '00:00:00');
    const leg4 = timeToSeconds(dutyRow.leg4TimeTo || '00:00:00');

    const totalSeconds = leg1 + leg2 + leg3 + leg4;
    return {
      totalSeconds,
      formattedTime: secondsToHHMMSS(totalSeconds)
    };
  }

  filterDutiesByDayType(duties, activeDayType) {
    // Standard link roster naming convention check (e.g. MON for Monday, SUN for Sunday, etc.)
    const dt = String(activeDayType).toUpperCase();
    return duties.filter(duty => {
      const rosterType = String(duty.rosterType || duty.dayType || '').toUpperCase();
      if (rosterType) return rosterType === dt;
      
      // Fallback fallback checks
      if (dt === 'SUNDAY') return String(duty.dutyId).startsWith('SUN') || String(duty.dutyId).endsWith('SUN');
      if (dt === 'SATURDAY') return String(duty.dutyId).startsWith('SAT') || String(duty.dutyId).endsWith('SAT');
      if (dt === 'MONDAY') return String(duty.dutyId).startsWith('MON') || String(duty.dutyId).endsWith('MON');
      return !String(duty.dutyId).includes('SUN') && !String(duty.dutyId).includes('SAT') && !String(duty.dutyId).includes('MON');
    });
  }
}

export const drivingHourService = new DrivingHourService();
export default drivingHourService;

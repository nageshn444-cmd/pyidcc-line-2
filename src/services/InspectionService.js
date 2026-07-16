import { STATION_ORDER_LIST } from '../utils/stationHelpers';

class InspectionService {
  generateInspectionSchedule(duties, wttMatrix) {
    const schedules = [];

    duties.forEach(duty => {
      // Find matching train details in working timetable matrix
      const matchedTrain = wttMatrix.find(t => 
        String(t.trainId) === String(duty.leg1TrainNo || duty.leg2TrainNo || duty.leg3TrainNo)
      );

      if (matchedTrain) {
        // Build exact inspection checkpoints based on uploaded WTT matrix path
        schedules.push({
          dutyId: duty.dutyId,
          operatorName: duty.empName || '--',
          trainNo: matchedTrain.trainNo || matchedTrain.trainId,
          boardingStation: matchedTrain.origin || STATION_ORDER_LIST[3], // NGSA
          deboardingStation: matchedTrain.destination || STATION_ORDER_LIST[31], // APTS
          boardingTime: matchedTrain.departureTime || duty.leg1TimeFrom || '08:00',
          deboardingTime: matchedTrain.arrivalTime || duty.leg1TimeTo || '10:30',
          platform: matchedTrain.platform || 'PF-1',
          walkingTimeMinutes: 5,
        });
      }
    });

    return schedules;
  }
}

export const inspectionService = new InspectionService();
export default inspectionService;

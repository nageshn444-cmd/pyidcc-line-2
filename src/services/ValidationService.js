import { STATION_ORDER_LIST } from '../utils/stationHelpers';
import { auditService } from './auditService';

class ValidationService {
  validateCrewExists(empId, crewRegistry) {
    if (!empId || empId === '--') return true;
    const exists = crewRegistry.some(c => String(c.employeeId) === String(empId) || String(c.id) === String(empId));
    if (!exists) {
      const errMsg = `Crew Validation Failure: Employee ID ${empId} not found in master registry.`;
      auditService.logSystemIntegrity('CRITICAL', 'VALIDATION_ENGINE', errMsg);
      throw new Error(errMsg);
    }
    return true;
  }

  validateDutyExists(dutyId, linkRoster) {
    if (!dutyId) return true;
    const exists = linkRoster.some(d => String(d.dutyId).trim().toLowerCase() === String(dutyId).trim().toLowerCase());
    if (!exists) {
      const errMsg = `Duty Validation Failure: Duty ID ${dutyId} not found in roster links.`;
      auditService.logSystemIntegrity('CRITICAL', 'VALIDATION_ENGINE', errMsg);
      throw new Error(errMsg);
    }
    return true;
  }

  validateStationExists(stationCode) {
    if (!stationCode || stationCode === '--') return true;
    const exists = STATION_ORDER_LIST.includes(stationCode.toUpperCase());
    if (!exists) {
      const errMsg = `Station Validation Failure: Code "${stationCode}" is not registered on Green Line path.`;
      auditService.logSystemIntegrity('ERROR', 'VALIDATION_ENGINE', errMsg);
      throw new Error(errMsg);
    }
    return true;
  }

  validateTrainExists(trainId, wttMatrix) {
    if (!trainId || trainId === '--') return true;
    const exists = wttMatrix.some(t => String(t.trainId) === String(trainId) || String(t.trainNo) === String(trainId));
    if (!exists) {
      const errMsg = `Train Validation Failure: Train ID/Number ${trainId} not found in master Working Timetable.`;
      auditService.logSystemIntegrity('WARNING', 'VALIDATION_ENGINE', errMsg);
      // Warning only, do not block (some overrides are manually typed)
    }
    return true;
  }
}

export const validationService = new ValidationService();
export default validationService;

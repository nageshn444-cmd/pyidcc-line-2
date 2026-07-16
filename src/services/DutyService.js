import { db } from '../firebase';
import { doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { validationService } from './ValidationService';
import { auditService } from './auditService';

class DutyService {
  async assignOperatorToDuty(dutyId, empId, empName, updatedByUserId, updatedByUserName, crewRegistry) {
    try {
      // Pre-flight validations
      validationService.validateCrewExists(empId, crewRegistry);

      const docRef = doc(db, 'crew_daily_deployment', dutyId);
      await updateDoc(docRef, {
        empId: empId,
        empName: empName,
        lastModified: serverTimestamp()
      });

      await auditService.logAction(
        "DUTY_ASSIGNMENT",
        updatedByUserId,
        updatedByUserName,
        `Assigned operator ${empName} (${empId}) to Duty ID ${dutyId}`
      );
      return true;
    } catch (err) {
      console.error("DutyService assignment failed:", err);
      throw err;
    }
  }

  async bulkUpdateDuties(dutyIds, fieldName, fieldValue, updatedByUserId, updatedByUserName) {
    try {
      const batch = writeBatch(db);
      dutyIds.forEach(id => {
        const docRef = doc(db, 'crew_daily_deployment', id);
        batch.update(docRef, {
          [fieldName]: fieldValue,
          lastModified: serverTimestamp()
        });
      });
      await batch.commit();

      await auditService.logAction(
        "BULK_DUTY_UPDATE",
        updatedByUserId,
        updatedByUserName,
        `Bulk updated ${dutyIds.length} duties field "${fieldName}" to "${fieldValue}"`
      );
      return true;
    } catch (err) {
      console.error("DutyService bulk update failed:", err);
      throw err;
    }
  }
}

export const dutyService = new DutyService();
export default dutyService;

import { db } from '../firebase';
import { doc, addDoc, collection, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auditService } from './auditService';

class EmergencyService {
  async triggerReliefDriver(incidentId, reliefEmpId, reliefEmpName, updatedByUserId, updatedByUserName) {
    try {
      const docRef = doc(db, 'wtt_live_incidents', incidentId);
      await updateDoc(docRef, {
        reliefEmpId,
        reliefEmpName,
        status: 'RELIEF_ASSIGNED',
        lastModified: serverTimestamp()
      });

      await auditService.logAction(
        "EMERGENCY_RELIEF_ASSIGN",
        updatedByUserId,
        updatedByUserName,
        `Assigned emergency relief driver ${reliefEmpName} (${reliefEmpId}) to Incident ${incidentId}`
      );
      return true;
    } catch (err) {
      console.error("EmergencyService trigger failed:", err);
      throw err;
    }
  }

  async resolveIncident(incidentId, updatedByUserId, updatedByUserName) {
    try {
      const docRef = doc(db, 'wtt_live_incidents', incidentId);
      await updateDoc(docRef, {
        status: 'RESOLVED',
        resolvedAt: serverTimestamp()
      });

      await auditService.logAction(
        "EMERGENCY_INCIDENT_RESOLVE",
        updatedByUserId,
        updatedByUserName,
        `Marked Incident ${incidentId} as RESOLVED`
      );
      return true;
    } catch (err) {
      console.error("EmergencyService resolve failed:", err);
      throw err;
    }
  }
}

export const emergencyService = new EmergencyService();
export default emergencyService;

import { db } from '../firebase';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auditService } from './auditService';

class TrainService {
  async registerRake(rakeId, model, status, lastInspDate, details, updatedByUserId, updatedByUserName) {
    try {
      const docRef = doc(db, 'rake_registry', rakeId);
      const payload = {
        rakeId,
        model,
        status,
        lastInspection: lastInspDate,
        details,
        lastModified: serverTimestamp()
      };
      await setDoc(docRef, payload);

      await auditService.logAction(
        "RAKE_REGISTER",
        updatedByUserId,
        updatedByUserName,
        `Registered train rake ${rakeId} (${model}) with status ${status}`
      );
      return true;
    } catch (err) {
      console.error("TrainService registerRake failed:", err);
      throw err;
    }
  }

  async updateRakeStatus(rakeId, newStatus, updatedByUserId, updatedByUserName) {
    try {
      const docRef = doc(db, 'rake_registry', rakeId);
      await updateDoc(docRef, {
        status: newStatus,
        lastModified: serverTimestamp()
      });

      await auditService.logAction(
        "RAKE_STATUS_UPDATE",
        updatedByUserId,
        updatedByUserName,
        `Updated train rake ${rakeId} status to ${newStatus}`
      );
      return true;
    } catch (err) {
      console.error("TrainService status update failed:", err);
      throw err;
    }
  }
}

export const trainService = new TrainService();
export default trainService;

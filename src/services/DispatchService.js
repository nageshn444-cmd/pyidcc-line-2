import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auditService } from './auditService';

class DispatchService {
  async triggerGateDispatch(dispatchId, operatorId, operatorName, status, updatedByUserId, updatedByUserName) {
    try {
      const docRef = doc(db, 'automated_dispatch_gate', dispatchId);
      await updateDoc(docRef, {
        status: status,
        dispatchedAt: serverTimestamp(),
        dispatchedBy: updatedByUserName
      });

      await auditService.logAction(
        "GATE_DISPATCH",
        updatedByUserId,
        updatedByUserName,
        `Dispatched operator ${operatorName} (${operatorId}) on duty ${dispatchId} (status: ${status})`
      );
      return true;
    } catch (err) {
      console.error("DispatchService gate dispatch failed:", err);
      throw err;
    }
  }

  async recordManualOverride(overrideDetails, updatedByUserId, updatedByUserName) {
    try {
      const payload = {
        ...overrideDetails,
        overrideBy: updatedByUserName,
        timestamp: serverTimestamp()
      };
      await addDoc(collection(db, 'manual_dispatch_overrides'), payload);

      await auditService.logAction(
        "DISPATCH_OVERRIDE",
        updatedByUserId,
        updatedByUserName,
        `Recorded manual dispatch override for duty ${overrideDetails.dutyId} (Operator: ${overrideDetails.empName})`
      );
      return true;
    } catch (err) {
      console.error("DispatchService manual override failed:", err);
      throw err;
    }
  }
}

export const dispatchService = new DispatchService();
export default dispatchService;

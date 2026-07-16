import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auditService } from './auditService';

class LeaveService {
  async approveLeaveRequest(requestId, operatorId, operatorName, approvedByUserId, approvedByUserName) {
    try {
      const docRef = doc(db, 'leave_requests', requestId);
      await updateDoc(docRef, {
        status: 'APPROVED',
        approvedBy: approvedByUserName,
        approvedAt: serverTimestamp()
      });

      await auditService.logAction(
        "LEAVE_APPROVE",
        approvedByUserId,
        approvedByUserName,
        `Approved leave request for operator ${operatorName} (${operatorId})`
      );
      return true;
    } catch (err) {
      console.error("LeaveService approve failed:", err);
      throw err;
    }
  }

  async rejectLeaveRequest(requestId, operatorId, operatorName, rejectedByUserId, rejectedByUserName) {
    try {
      const docRef = doc(db, 'leave_requests', requestId);
      await updateDoc(docRef, {
        status: 'REJECTED',
        rejectedBy: rejectedByUserName,
        rejectedAt: serverTimestamp()
      });

      await auditService.logAction(
        "LEAVE_REJECT",
        rejectedByUserId,
        rejectedByUserName,
        `Rejected leave request for operator ${operatorName} (${operatorId})`
      );
      return true;
    } catch (err) {
      console.error("LeaveService reject failed:", err);
      throw err;
    }
  }
}

export const leaveService = new LeaveService();
export default leaveService;

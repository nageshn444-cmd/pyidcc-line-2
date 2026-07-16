import { db } from '../firebase';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auditService } from './auditService';

class CrewService {
  async toggleOperatorStatus(user, updatedByUserId, updatedByUserName) {
    const newStatus = !user.active;
    const empId = String(user.employeeId);

    try {
      // 1. Update in system_users
      await updateDoc(doc(db, 'system_users', user.id), { active: newStatus });
      
      // 2. Update in users collection
      await setDoc(doc(db, 'users', empId), { 
        active: newStatus, 
        status: newStatus ? "ACTIVE" : "INACTIVE" 
      }, { merge: true });

      // 3. Update in userAccessControl collection
      await setDoc(doc(db, 'userAccessControl', empId), { 
        canLogin: newStatus, 
        canAccessWebApp: newStatus,
        deviceStatus: newStatus ? "ACTIVE" : "BLOCKED"
      }, { merge: true });

      // Log audit
      await auditService.logAction(
        "USER_STATUS_CHANGE",
        updatedByUserId,
        updatedByUserName,
        `Toggled operator ${user.employeeName} (${empId}) active state to ${newStatus}`
      );

      return true;
    } catch (err) {
      console.error("CrewService status update failed:", err);
      throw err;
    }
  }

  isOperatorAvailable(empId, leaveRequests, selectedDate) {
    if (!empId || empId === '--') return true;
    // Check if there is an approved leave request on the selected date
    const onLeave = leaveRequests.some(req => 
      String(req.employeeId) === String(empId) &&
      req.status === 'APPROVED' &&
      req.leaveDate === selectedDate
    );
    return !onLeave;
  }
}

export const crewService = new CrewService();
export default crewService;

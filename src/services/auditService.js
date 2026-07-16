import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

class AuditService {
  async logAction(action, userId, userName, details) {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        action,
        performedBy: userId || 'system',
        performedByName: userName || 'System Engine',
        details,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("AuditService log failed:", e);
    }
  }

  async logSystemIntegrity(severity, module, message) {
    try {
      await addDoc(collection(db, 'integrity_audit_logs'), {
        severity,
        module,
        message,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("AuditService integrity log failed:", e);
    }
  }
}

export const auditService = new AuditService();
export default auditService;

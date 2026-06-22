import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const logAuditEvent = async (user, action, details) => {
  try {
    await addDoc(collection(db, 'integrity_audit_logs'), {
      user: user.email,
      action,
      details,
      timestamp: serverTimestamp()
    });
  } catch (e) { console.error('Audit Log Error', e); }
};

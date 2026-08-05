import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, orderBy, getDocs } from 'firebase/firestore';

export const shiftReportService = {
  // Log any event/change instantly to Firestore shift reports
  logEvent: async (actionType, dutyId, operatorName, empId, details = '') => {
    try {
      await addDoc(collection(db, 'shift_handover_reports'), {
        actionType, // e.g., 'AUTHORIZE', 'EXCHANGE', 'SWAP', 'RELIEF_DISPATCHED', 'MANUAL_OVERRIDE', 'INCIDENT_LOGGED'
        dutyId: String(dutyId || '--'),
        operatorName: String(operatorName || 'UNASSIGNED'),
        empId: String(empId || '--'),
        details: String(details || ''),
        timestamp: serverTimestamp(),
        dateStr: new Date().toISOString().split('T')[0]
      });
    } catch (err) {
      console.error('Failed to log event to shift report:', err);
    }
  },

  // Fetch all events for today's shift report
  getTodayReportEvents: async () => {
    try {
      const q = query(collection(db, 'shift_handover_reports'), orderBy('timestamp', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (err) {
      console.error('Failed to fetch shift report events:', err);
      return [];
    }
  }
};

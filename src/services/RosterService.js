import { db } from '../firebase';
import { 
  doc, 
  query, 
  collection, 
  where, 
  getDocs, 
  runTransaction, 
  setDoc, 
  increment, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { auditService } from './auditService';

class RosterService {
  async pasteCellRange(grid, startRowIndex, startColIndex, columnFieldsList, rows, updatedByUserId, updatedByUserName) {
    try {
      const batch = writeBatch(db);
      const updatedCells = [];

      grid.forEach((rowVals, ri) => {
        const duty = rows[startRowIndex + ri];
        if (!duty) return;

        const updates = { lastModified: serverTimestamp() };
        rowVals.forEach((val, ci) => {
          const field = columnFieldsList[startColIndex + ci];
          if (field) {
            updates[field] = val;
            updatedCells.push(`${duty.id}:${field}`);
          }
        });

        const docRef = doc(db, 'crew_final_links', duty.id);
        batch.update(docRef, updates);
      });

      await batch.commit();

      await auditService.logAction(
        "ROSTER_RANGE_PASTE",
        updatedByUserId,
        updatedByUserName,
        `Pasted ${grid.length} rows of values starting at cell row ${startRowIndex}, col ${startColIndex}`
      );

      return updatedCells;
    } catch (err) {
      console.error("RosterService paste failed:", err);
      throw err;
    }
  }

  async approveShiftExchange(ex, userProfile, finalRemarks) {
    const id = ex.id;
    const normalizeDutyId = (idStr) => {
      if (!idStr) return '';
      const num = parseInt(idStr.replace(/\D/g, ''), 10);
      return isNaN(num) ? idStr : `gcc_duty_${num}`;
    };

    const duty1 = normalizeDutyId(ex.operator1Duty);
    const duty2 = normalizeDutyId(ex.operator2Duty);
    const unnormDuty1 = String(parseInt(ex.operator1Duty, 10));
    const unnormDuty2 = String(parseInt(ex.operator2Duty, 10));

    // 1. Fetch matching deployments
    const q1 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', duty1));
    const q2 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', duty2));
    const qu1 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', unnormDuty1));
    const qu2 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', unnormDuty2));

    const [snap1, snap2, snapu1, snapu2] = await Promise.all([
      getDocs(q1),
      getDocs(q2),
      getDocs(qu1),
      getDocs(qu2)
    ]);

    const refsToGet = [];
    const addedPaths = new Set();
    const addRef = (ref) => {
      if (!addedPaths.has(ref.path)) {
        addedPaths.add(ref.path);
        refsToGet.push(ref);
      }
    };

    [...snap1.docs, ...snap2.docs, ...snapu1.docs, ...snapu2.docs].forEach(docSnap => addRef(docSnap.ref));

    let scheduleType = '';
    const allSnaps = [...snap1.docs, ...snap2.docs, ...snapu1.docs, ...snapu2.docs];
    if (allSnaps.length > 0) {
      scheduleType = allSnaps[0].data().scheduleType || '';
    }

    const scheds = scheduleType ? [scheduleType.toLowerCase()] : ['weekday', 'monday', 'saturday', 'sunday'];
    for (const sched of scheds) {
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${duty1}`));
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${unnormDuty1}`));
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${duty2}`));
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${unnormDuty2}`));
    }

    const opDateTime = new Date().toISOString();

    // 2. Swaps Transaction
    await runTransaction(db, async (transaction) => {
      const exRef = doc(db, 'shift_exchanges', id);
      const exSnap = await transaction.get(exRef);
      if (!exSnap.exists()) {
        throw new Error("Shift exchange record not found.");
      }
      const exData = exSnap.data();
      if (exData.status === 'APPROVED' || exData.status === 'Operational') {
        throw new Error("Shift exchange is already approved/operational.");
      }

      const deploymentDocs = [];
      for (const ref of refsToGet) {
        const snap = await transaction.get(ref);
        if (snap.exists()) {
          deploymentDocs.push(snap);
        }
      }

      transaction.update(exRef, {
        status: 'APPROVED',
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'} (${userProfile?.role || 'Controller'})`,
        approvedAt: serverTimestamp(),
        approvalTime: opDateTime,
        remarks: finalRemarks
      });

      const updatePayload1 = {
        empId: String(ex.operator2Id || ''),
        empName: String(ex.operator2Name || '').toUpperCase(),
        remarks: `Shift Exchanged with ${ex.operator1Name}`,
        isExchanged: true,
        originalEmpId: String(ex.operator1Id || ''),
        originalEmpName: String(ex.operator1Name || '').toUpperCase(),
        exchangeId: id,
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
        approvedDateTime: opDateTime,
        lastUpdated: serverTimestamp()
      };

      const updatePayload2 = {
        empId: String(ex.operator1Id || ''),
        empName: String(ex.operator1Name || '').toUpperCase(),
        remarks: `Shift Exchanged with ${ex.operator2Name}`,
        isExchanged: true,
        originalEmpId: String(ex.operator2Id || ''),
        originalEmpName: String(ex.operator2Name || '').toUpperCase(),
        exchangeId: id,
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
        approvedDateTime: opDateTime,
        lastUpdated: serverTimestamp()
      };

      deploymentDocs.forEach(snap => {
        const dData = snap.data();
        const normDId = normalizeDutyId(dData.dutyId);
        if (normDId === duty1 || normDId === unnormDuty1) {
          transaction.update(snap.ref, updatePayload1);
        } else if (normDId === duty2 || normDId === unnormDuty2) {
          transaction.update(snap.ref, updatePayload2);
        }
      });

      if (deploymentDocs.length === 0) {
        const activeSched = scheduleType ? scheduleType.toUpperCase() : 'WEEKDAY';
        const ref1 = doc(db, 'crew_daily_deployment', `gcc_deploy_${activeSched.toLowerCase()}_duty_${duty1}`);
        const ref2 = doc(db, 'crew_daily_deployment', `gcc_deploy_${activeSched.toLowerCase()}_duty_${duty2}`);

        transaction.set(ref1, {
          scheduleType: activeSched,
          dutyId: duty1,
          ...updatePayload1
        }, { merge: true });

        transaction.set(ref2, {
          scheduleType: activeSched,
          dutyId: duty2,
          ...updatePayload2
        }, { merge: true });
      }

      const records = [
        {
          exchangeId: id,
          dutyNumber: duty1,
          originalEmployeeId: ex.operator1Id,
          originalEmployeeName: ex.operator1Name,
          currentEmployeeId: ex.operator2Id,
          currentEmployeeName: ex.operator2Name,
          approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
          approvedDateTime: opDateTime,
          status: "Operational",
          timestamp: serverTimestamp()
        },
        {
          exchangeId: id,
          dutyNumber: duty2,
          originalEmployeeId: ex.operator2Id,
          originalEmployeeName: ex.operator2Name,
          currentEmployeeId: ex.operator1Id,
          currentEmployeeName: ex.operator1Name,
          approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
          approvedDateTime: opDateTime,
          status: "Operational",
          timestamp: serverTimestamp()
        }
      ];

      for (const rec of records) {
        transaction.set(doc(db, "shift_exchanges_operational", `${id}_${rec.dutyNumber}`), rec);
      }

      const auditLogRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditLogRef, {
        action: 'SHIFT_EXCHANGE_APPROVED',
        exchangeId: id,
        operator1Id: ex.operator1Id,
        operator2Id: ex.operator2Id,
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'} (${userProfile?.role || 'Controller'})`,
        timestamp: serverTimestamp(),
        oldDuty: `${duty1} ⇄ ${duty2}`,
        newDuty: `${duty2} ⇄ ${duty1}`,
        details: `Shift exchange APPROVED: ${ex.operator1Name} (Duty ${ex.operator1Duty}) ⇄ ${ex.operator2Name} (Duty ${ex.operator2Duty}). Remarks: ${finalRemarks}`
      });
    });

    // 3. Increment counters
    const monthKey = ex.exchangeDate ? ex.exchangeDate.substring(0, 7) : new Date().toISOString().substring(0, 7);
    const updateCount = async (opId, opName) => {
      if (!opId) return;
      await setDoc(doc(db, 'shift_exchange_counts', `${opId}_${monthKey}`), {
        empId: opId, empName: opName, month: monthKey,
        exchangeCount: increment(1), lastUpdated: serverTimestamp()
      }, { merge: true });
    };
    await updateCount(ex.operator1Id, ex.operator1Name);
    await updateCount(ex.operator2Id, ex.operator2Name);
  }
}

export const rosterService = new RosterService();
export default rosterService;

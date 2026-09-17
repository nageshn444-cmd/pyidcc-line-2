import { db } from '../firebase';
import { 
  doc, 
  query, 
  collection, 
  where, 
  getDocs, 
  getDoc,
  runTransaction, 
  setDoc, 
  increment, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { auditService } from './auditService';

export const swapOperatorsInConsoleData = (consoleData, op1Id, op1Name, op2Id, op2Name) => {
  if (!consoleData) return consoleData;
  const updated = JSON.parse(JSON.stringify(consoleData));
  
  const swapInArray = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(item => {
      const currentEmp = String(item.empNo || item.empId || '').trim();
      if (currentEmp === String(op1Id).trim()) {
        item.empNo = String(op2Id).trim();
        if (item.empId !== undefined) item.empId = String(op2Id).trim();
        item.name = op2Name;
      } else if (currentEmp === String(op2Id).trim()) {
        item.empNo = String(op1Id).trim();
        if (item.empId !== undefined) item.empId = String(op1Id).trim();
        item.name = op1Name;
      }
    });
  };

  swapInArray(updated.coOperators);
  swapInArray(updated.controlDesks);
  swapInArray(updated.leaves);
  swapInArray(updated.standbys);
  swapInArray(updated.outstationStepbacks);
  swapInArray(updated.crtTraining);
  swapInArray(updated.bmrtiTraining);
  swapInArray(updated.weeklyOffs);
  swapInArray(updated.relievedOperators);
  swapInArray(updated.pmeOperators);
  swapInArray(updated.routeLearning);
  swapInArray(updated.notReporting);
  swapInArray(updated.absents);
  swapInArray(updated.onDuty);
  if (Array.isArray(updated.duties)) {
    updated.duties.forEach(item => {
      const currentEmp = String(item.empNo || item.empId || '').trim();
      if (currentEmp === String(op1Id).trim()) {
        item.empNo = String(op2Id).trim();
        item.empId = String(op2Id).trim();
        item.empName = op2Name;
        item.name = op2Name;
      } else if (currentEmp === String(op2Id).trim()) {
        item.empNo = String(op1Id).trim();
        item.empId = String(op1Id).trim();
        item.empName = op1Name;
        item.name = op1Name;
      }
    });
  }

  if (updated.customRegisters && typeof updated.customRegisters === 'object') {
    Object.values(updated.customRegisters).forEach(arr => swapInArray(arr));
  }

  return updated;
};

export const rotateTripleOperatorsInConsoleData = (consoleData, op1Id, op1Name, op2Id, op2Name, op3Id, op3Name) => {
  if (!consoleData) return consoleData;
  const updated = JSON.parse(JSON.stringify(consoleData));

  // Standard Cyclic Rotation:
  // Op 1 (Duty 1) ➔ receives Duty 2: so position of Op 2 gets assigned Op 1
  // Op 2 (Duty 2) ➔ receives Duty 3: so position of Op 3 gets assigned Op 2
  // Op 3 (Duty 3) ➔ receives Duty 1: so position of Op 1 gets assigned Op 3
  const rotateInArray = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(item => {
      const currentEmp = String(item.empNo || item.empId || '').trim();
      if (currentEmp === String(op1Id).trim()) {
        item.empNo = String(op3Id).trim();
        if (item.empId !== undefined) item.empId = String(op3Id).trim();
        item.name = op3Name;
      } else if (currentEmp === String(op2Id).trim()) {
        item.empNo = String(op1Id).trim();
        if (item.empId !== undefined) item.empId = String(op1Id).trim();
        item.name = op1Name;
      } else if (currentEmp === String(op3Id).trim()) {
        item.empNo = String(op2Id).trim();
        if (item.empId !== undefined) item.empId = String(op2Id).trim();
        item.name = op2Name;
      }
    });
  };

  rotateInArray(updated.coOperators);
  rotateInArray(updated.controlDesks);
  rotateInArray(updated.leaves);
  rotateInArray(updated.standbys);
  rotateInArray(updated.outstationStepbacks);
  rotateInArray(updated.crtTraining);
  rotateInArray(updated.bmrtiTraining);
  rotateInArray(updated.weeklyOffs);
  rotateInArray(updated.relievedOperators);
  rotateInArray(updated.pmeOperators);
  rotateInArray(updated.routeLearning);
  rotateInArray(updated.notReporting);
  rotateInArray(updated.absents);
  rotateInArray(updated.onDuty);

  if (Array.isArray(updated.duties)) {
    updated.duties.forEach(item => {
      const currentEmp = String(item.empNo || item.empId || '').trim();
      if (currentEmp === String(op1Id).trim()) {
        item.empNo = String(op3Id).trim();
        item.empId = String(op3Id).trim();
        item.empName = op3Name;
        item.name = op3Name;
      } else if (currentEmp === String(op2Id).trim()) {
        item.empNo = String(op1Id).trim();
        item.empId = String(op1Id).trim();
        item.empName = op1Name;
        item.name = op1Name;
      } else if (currentEmp === String(op3Id).trim()) {
        item.empNo = String(op2Id).trim();
        item.empId = String(op2Id).trim();
        item.empName = op2Name;
        item.name = op2Name;
      }
    });
  }

  if (updated.customRegisters && typeof updated.customRegisters === 'object') {
    Object.values(updated.customRegisters).forEach(arr => rotateInArray(arr));
  }

  return updated;
};

export class RosterService {
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

  async pasteRosterExcelData(parsedRows, scheduleType = 'WEEKDAY') {
    // ... existing paste logic ...
    try {
      const batch = writeBatch(db);
      for (const row of parsedRows) {
        if (!row.dutyId) continue;
        const normId = ['1','2','3','4','5','6','7','8','9'].includes(String(row.dutyId).trim()) 
          ? '0' + String(row.dutyId).trim() 
          : String(row.dutyId).trim();
        const docId = `gcc_deploy_${scheduleType.toLowerCase()}_duty_${normId}`;
        const ref = doc(db, 'crew_daily_deployment', docId);
        batch.set(ref, {
          ...row,
          dutyId: normId,
          scheduleType,
          lastUpdated: serverTimestamp()
        }, { merge: true });
      }
      await batch.commit();
      return true;
    } catch (err) {
      console.error("RosterService paste failed:", err);
      throw err;
    }
  }

  async approveShiftExchange(ex, userProfile, finalRemarks) {
    const id = ex.id;
    const isPureNumericDuty = (s) => /^\d{1,2}$/.test(String(s || '').trim());
    const normalizeDutyId = (idStr) => {
      if (!idStr) return '';
      const s = String(idStr).trim();
      if (!isPureNumericDuty(s)) return s;
      const num = parseInt(s, 10);
      return isNaN(num) ? s : `gcc_duty_${num}`;
    };

    const isTriple = Boolean(ex.isTriple && ex.operator3Id);

    const duty1 = normalizeDutyId(ex.operator1Duty);
    const duty2 = normalizeDutyId(ex.operator2Duty);
    const duty3 = isTriple ? normalizeDutyId(ex.operator3Duty) : '';
    const unnormDuty1 = isPureNumericDuty(ex.operator1Duty) ? String(parseInt(ex.operator1Duty, 10)) : String(ex.operator1Duty || '');
    const unnormDuty2 = isPureNumericDuty(ex.operator2Duty) ? String(parseInt(ex.operator2Duty, 10)) : String(ex.operator2Duty || '');
    const unnormDuty3 = isTriple && isPureNumericDuty(ex.operator3Duty) ? String(parseInt(ex.operator3Duty, 10)) : String(ex.operator3Duty || '');

    // 1. Fetch matching deployments
    const q1 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', duty1));
    const q2 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', duty2));
    const qu1 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', unnormDuty1));
    const qu2 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', unnormDuty2));

    const queries = [getDocs(q1), getDocs(q2), getDocs(qu1), getDocs(qu2)];
    if (isTriple) {
      const q3 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', duty3));
      const qu3 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', unnormDuty3));
      queries.push(getDocs(q3), getDocs(qu3));
    }

    const snapResults = await Promise.all(queries);
    const snap1 = snapResults[0];
    const snap2 = snapResults[1];
    const snapu1 = snapResults[2];
    const snapu2 = snapResults[3];
    const snap3 = isTriple ? snapResults[4] : null;
    const snapu3 = isTriple ? snapResults[5] : null;

    const refsToGet = [];
    const addedPaths = new Set();
    const addRef = (ref) => {
      if (!addedPaths.has(ref.path)) {
        addedPaths.add(ref.path);
        refsToGet.push(ref);
      }
    };

    [...snap1.docs, ...snap2.docs, ...snapu1.docs, ...snapu2.docs, ...(snap3 ? snap3.docs : []), ...(snapu3 ? snapu3.docs : [])].forEach(docSnap => addRef(docSnap.ref));

    let scheduleType = '';
    const allSnaps = [...snap1.docs, ...snap2.docs, ...snapu1.docs, ...snapu2.docs, ...(snap3 ? snap3.docs : []), ...(snapu3 ? snapu3.docs : [])];
    if (allSnaps.length > 0) {
      scheduleType = allSnaps[0].data().scheduleType || '';
    }

    const scheds = scheduleType ? [scheduleType.toLowerCase()] : ['weekday', 'monday', 'saturday', 'sunday'];
    for (const sched of scheds) {
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${duty1}`));
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${unnormDuty1}`));
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${duty2}`));
      addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${unnormDuty2}`));
      if (isTriple) {
        addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${duty3}`));
        addRef(doc(db, 'crew_daily_deployment', `gcc_deploy_${sched}_duty_${unnormDuty3}`));
      }
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

      // Cyclic Rotation in Triple Mode:
      // Op 1 (Duty 1) ➔ Duty 2 (Duty 2 gets Op 1)
      // Op 2 (Duty 2) ➔ Duty 3 (Duty 3 gets Op 2)
      // Op 3 (Duty 3) ➔ Duty 1 (Duty 1 gets Op 3)
      const updatePayload1 = isTriple ? {
        empId: String(ex.operator3Id || ''),
        empName: String(ex.operator3Name || '').toUpperCase(),
        remarks: `Triple Shift Exchanged with ${ex.operator3Name}`,
        isExchanged: true,
        originalEmpId: String(ex.operator1Id || ''),
        originalEmpName: String(ex.operator1Name || '').toUpperCase(),
        exchangeId: id,
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
        approvedDateTime: opDateTime,
        lastUpdated: serverTimestamp()
      } : {
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

      const updatePayload2 = isTriple ? {
        empId: String(ex.operator1Id || ''),
        empName: String(ex.operator1Name || '').toUpperCase(),
        remarks: `Triple Shift Exchanged with ${ex.operator1Name}`,
        isExchanged: true,
        originalEmpId: String(ex.operator2Id || ''),
        originalEmpName: String(ex.operator2Name || '').toUpperCase(),
        exchangeId: id,
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
        approvedDateTime: opDateTime,
        lastUpdated: serverTimestamp()
      } : {
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

      const updatePayload3 = isTriple ? {
        empId: String(ex.operator2Id || ''),
        empName: String(ex.operator2Name || '').toUpperCase(),
        remarks: `Triple Shift Exchanged with ${ex.operator2Name}`,
        isExchanged: true,
        originalEmpId: String(ex.operator3Id || ''),
        originalEmpName: String(ex.operator3Name || '').toUpperCase(),
        exchangeId: id,
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
        approvedDateTime: opDateTime,
        lastUpdated: serverTimestamp()
      } : null;

      deploymentDocs.forEach(snap => {
        const dData = snap.data();
        const normDId = normalizeDutyId(dData.dutyId);
        if (normDId === duty1 || normDId === unnormDuty1) {
          transaction.update(snap.ref, updatePayload1);
        } else if (normDId === duty2 || normDId === unnormDuty2) {
          transaction.update(snap.ref, updatePayload2);
        } else if (isTriple && (normDId === duty3 || normDId === unnormDuty3)) {
          transaction.update(snap.ref, updatePayload3);
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

        if (isTriple) {
          const ref3 = doc(db, 'crew_daily_deployment', `gcc_deploy_${activeSched.toLowerCase()}_duty_${duty3}`);
          transaction.set(ref3, {
            scheduleType: activeSched,
            dutyId: duty3,
            ...updatePayload3
          }, { merge: true });
        }
      }

      const records = [
        {
          exchangeId: id,
          dutyNumber: duty1,
          originalEmployeeId: ex.operator1Id,
          originalEmployeeName: ex.operator1Name,
          currentEmployeeId: isTriple ? ex.operator3Id : ex.operator2Id,
          currentEmployeeName: isTriple ? ex.operator3Name : ex.operator2Name,
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

      if (isTriple) {
        records.push({
          exchangeId: id,
          dutyNumber: duty3,
          originalEmployeeId: ex.operator3Id,
          originalEmployeeName: ex.operator3Name,
          currentEmployeeId: ex.operator2Id,
          currentEmployeeName: ex.operator2Name,
          approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
          approvedDateTime: opDateTime,
          status: "Operational",
          timestamp: serverTimestamp()
        });
      }

      for (const rec of records) {
        transaction.set(doc(db, "shift_exchanges_operational", `${id}_${rec.dutyNumber}`), rec);
      }

      const auditLogRef = doc(collection(db, 'auditLogs'));
      transaction.set(auditLogRef, {
        action: isTriple ? 'SHIFT_EXCHANGE_TRIPLE_APPROVED' : 'SHIFT_EXCHANGE_APPROVED',
        exchangeId: id,
        operator1Id: ex.operator1Id,
        operator2Id: ex.operator2Id,
        operator3Id: isTriple ? ex.operator3Id : null,
        isTriple,
        approvedBy: `${userProfile?.employeeName || 'GCC/CC'} (${userProfile?.role || 'Controller'})`,
        timestamp: serverTimestamp(),
        oldDuty: isTriple ? `${duty1} ➔ ${duty2} ➔ ${duty3}` : `${duty1} ⇄ ${duty2}`,
        newDuty: isTriple ? `${duty2} ➔ ${duty3} ➔ ${duty1}` : `${duty2} ⇄ ${duty1}`,
        details: isTriple
          ? `Triple shift exchange APPROVED: Op 1 ${ex.operator1Name} (Duty ${ex.operator1Duty}) ➔ Duty ${ex.operator2Duty} | Op 2 ${ex.operator2Name} (Duty ${ex.operator2Duty}) ➔ Duty ${ex.operator3Duty} | Op 3 ${ex.operator3Name} (Duty ${ex.operator3Duty}) ➔ Duty ${ex.operator1Duty}. Remarks: ${finalRemarks}`
          : `Shift exchange APPROVED: ${ex.operator1Name} (Duty ${ex.operator1Duty}) ⇄ ${ex.operator2Name} (Duty ${ex.operator2Duty}). Remarks: ${finalRemarks}`
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
    if (isTriple && ex.operator3Id) {
      await updateCount(ex.operator3Id, ex.operator3Name);
    }

    // 4. Synchronize swap across BMRCL Line 2 Peenya Depot Roster Desk Console
    try {
      const consoleDocSnap = await getDoc(doc(db, 'roster_desk_console', 'current'));
      if (consoleDocSnap.exists()) {
        const currentConsole = consoleDocSnap.data();
        const updatedConsole = isTriple
          ? rotateTripleOperatorsInConsoleData(
              currentConsole,
              ex.operator1Id,
              ex.operator1Name,
              ex.operator2Id,
              ex.operator2Name,
              ex.operator3Id,
              ex.operator3Name
            )
          : swapOperatorsInConsoleData(
              currentConsole,
              ex.operator1Id,
              ex.operator1Name,
              ex.operator2Id,
              ex.operator2Name
            );
        updatedConsole.lastUpdated = serverTimestamp();
        await setDoc(doc(db, 'roster_desk_console', 'current'), updatedConsole, { merge: true });
        await setDoc(doc(db, 'roster_desk_console', 'latest'), updatedConsole, { merge: true });
        await setDoc(doc(db, 'dispatch_excel_cache', 'current'), updatedConsole, { merge: true });
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('pyidcc_roster_desk_console_cache', JSON.stringify(updatedConsole));
        }
      }
    } catch (consoleSyncErr) {
      console.warn("Roster Desk Console swap synchronization warning:", consoleSyncErr);
    }
  }
}

export const rosterService = new RosterService();
export default rosterService;

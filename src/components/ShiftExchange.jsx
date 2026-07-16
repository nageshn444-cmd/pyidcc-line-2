import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, where, setDoc, increment, getDoc, deleteDoc, runTransaction, writeBatch } from 'firebase/firestore';
import { Repeat, CheckCircle, Clock, ShieldCheck, UserCheck, CheckSquare, X, Check, Trash2 } from 'lucide-react';
import { BMRCL_CREW_REGISTRY, BMRCL_CREW_MASTER_BACKUP } from '../data/bmrclCrewRegistry';
import { useAuth } from '../context/AuthContext';
import { rosterService } from '../services/RosterService';

// Normalize duty ID: pad single digits to match Firestore doc ID format "01"
const normalizeDutyId = (raw) => {
  const s = String(raw || '').trim();
  return ['1','2','3','4','5','6','7','8','9'].includes(s) ? '0' + s : s;
};

const STATUS_OPTIONS = [
  'PRESENT',
  'ABSENT (AB)',
  'LEAVE',
  'NOT REPORTING (NR)',
  'BMRTI',
  'CRT',
  'CL',
  'EL',
  'WO'
];

const DUTY_OPTIONS = [
  ...Array.from({ length: 100 }, (_, i) => (i + 1).toString()),
  '06:30 OR',
  '07:00 OR',
  '07:30 OR',
  '08:00 OR',
  '09:00 OR',
  '10:00 OR',
  '10:30 OR',
  '11:00 OR',
  '12:00 OR',
  '13:00 OR',
  '13:30 OR',
  '14:00 OR',
  '14:30 OR',
  'PUTH STBK 07:00',
  'PUTH STBK 14:00',
  'NGSA STBK 07:00',
  'NGSA STBK 14:00'
];

export default function ShiftExchange() {
  const { userProfile } = useAuth();
  const [exchanges, setExchanges] = useState([]);
  const [formData, setFormData] = useState({
    exchangeDate: '',
    operator1Search: '',
    operator2Search: '',
    operator1Id: '',
    operator1Name: '',
    operator1Duty: '',
    operator1Status: 'PRESENT',
    operator2Id: '',
    operator2Name: '',
    operator2Duty: '',
    operator2Status: 'PRESENT'
  });

  const [crewList, setCrewList] = useState([]);
  const [op1Query, setOp1Query] = useState('');
  const [op2Query, setOp2Query] = useState('');

  // Sync crew data with Firestore crewRegistry collection or local registry backups
  useEffect(() => {
    // 1. Initial fallback load
    if (BMRCL_CREW_REGISTRY && BMRCL_CREW_REGISTRY.length > 0) {
      setCrewList(BMRCL_CREW_REGISTRY);
    } else {
      setCrewList(BMRCL_CREW_MASTER_BACKUP);
    }

    // 2. Real-time Firestore sync
    const qRegistry = query(collection(db, 'crewRegistry'));
    const unsubRegistry = onSnapshot(qRegistry, (snapshot) => {
      if (snapshot.empty) {
        setCrewList(BMRCL_CREW_REGISTRY && BMRCL_CREW_REGISTRY.length > 0 ? BMRCL_CREW_REGISTRY : BMRCL_CREW_MASTER_BACKUP);
        return;
      }
      
      const activeList = [];
      snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        const active = (data.operationalCrew === 'YES' || data.operationalCrew === true) && data.deleted !== true;
        if (active) {
          activeList.push({
            id: String(data.employeeId || data.id || docSnap.id),
            name: data.employeeName || data.name || '',
            designation: data.designation || '',
            contact: data.mobileNumber || data.contact || '',
            email: data.email || '',
            competencyExpiry: data.competencyExpiry || '',
            activeCrew: true,
            department: data.department || 'Operations',
            role: data.role || 'Train Operator',
            depot: data.depot || 'Peenya Depot (PYID)',
            badgeNumber: data.badgeNumber || '',
            competencyNumber: data.competencyNumber || '',
            competencyValidTill: data.competencyValidTill || '',
            medicalValidTill: data.medicalValidTill || '',
            doj: data.doj || '',
            retirementDate: data.retirementDate || '',
            currentStatus: data.currentStatus || 'DUTY',
            bloodGroup: data.bloodGroup || '',
            emergencyContact: data.emergencyContact || '',
            remarks: data.remarks || '',
            photo: data.photo || '',
            systemUser: data.systemUser || false,
            activeUser: data.activeUser || false,
            availableForDeployment: data.availableForDeployment !== false,
            availableForRelief: data.availableForRelief !== false
          });
        }
      });
      
      if (activeList.length > 0) {
        setCrewList(activeList);
      } else {
        setCrewList(BMRCL_CREW_REGISTRY && BMRCL_CREW_REGISTRY.length > 0 ? BMRCL_CREW_REGISTRY : BMRCL_CREW_MASTER_BACKUP);
      }
    });

    return () => unsubRegistry();
  }, []);

  const filteredCrew1 = React.useMemo(() => {
    const q = op1Query.toLowerCase().trim();
    const isSelectedMatch = formData.operator1Id && `${formData.operator1Id} - ${formData.operator1Name}`.toLowerCase() === q;
    
    let list = crewList;
    if (q && !isSelectedMatch) {
      list = crewList.filter(c => 
        String(c.id).includes(q) || 
        c.name.toLowerCase().includes(q)
      );
    }
    
    if (formData.operator1Id && !list.some(c => String(c.id) === String(formData.operator1Id))) {
      const selectedObj = crewList.find(c => String(c.id) === String(formData.operator1Id));
      if (selectedObj) list = [selectedObj, ...list];
    }
    return list;
  }, [op1Query, formData.operator1Id, formData.operator1Name, crewList]);

  const filteredCrew2 = React.useMemo(() => {
    const q = op2Query.toLowerCase().trim();
    const isSelectedMatch = formData.operator2Id && `${formData.operator2Id} - ${formData.operator2Name}`.toLowerCase() === q;
    
    let list = crewList;
    if (q && !isSelectedMatch) {
      list = crewList.filter(c => 
        String(c.id).includes(q) || 
        c.name.toLowerCase().includes(q)
      );
    }
    
    if (formData.operator2Id && !list.some(c => String(c.id) === String(formData.operator2Id))) {
      const selectedObj = crewList.find(c => String(c.id) === String(formData.operator2Id));
      if (selectedObj) list = [selectedObj, ...list];
    }
    return list;
  }, [op2Query, formData.operator2Id, formData.operator2Name, crewList]);

  useEffect(() => {
    const q = query(collection(db, 'shift_exchanges'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExchanges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const swapDeployment = async (exchangeId, dutyId, scheduleType, newEmpId, newEmpName, oldEmpId, oldEmpName, exchangedWith, isReversing = false) => {
    if (!dutyId) return;

    const normId = normalizeDutyId(dutyId);
    const unnormId = String(parseInt(dutyId, 10));

    const updatePayload = {
      empId: String(newEmpId || ''),
      empName: String(newEmpName || '').toUpperCase(),
      remarks: isReversing ? "Roster Reset (Exchange Reversed)" : `Shift Exchanged with ${exchangedWith}`,
      isExchanged: !isReversing,
      originalEmpId: isReversing ? "" : String(oldEmpId || ''),
      originalEmpName: isReversing ? "" : String(oldEmpName || '').toUpperCase(),
      exchangeId: isReversing ? "" : exchangeId,
      approvedBy: isReversing ? "" : "GCC/Crew Controller",
      approvedDateTime: isReversing ? "" : new Date().toISOString(),
      lastUpdated: serverTimestamp()
    };

    let updatedAny = false;

    // 1. Query by both normalized and unnormalized dutyId formats
    const q1 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', normId));
    const q2 = query(collection(db, 'crew_daily_deployment'), where('dutyId', '==', unnormId));

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    for (const docSnap of snap1.docs) {
      await updateDoc(doc(db, 'crew_daily_deployment', docSnap.id), updatePayload);
      updatedAny = true;
    }
    for (const docSnap of snap2.docs) {
      if (!snap1.docs.some(d => d.id === docSnap.id)) {
        await updateDoc(doc(db, 'crew_daily_deployment', docSnap.id), updatePayload);
        updatedAny = true;
      }
    }

    // 2. Direct Doc ID check fallback for all common schedules
    const scheds = scheduleType ? [scheduleType.toLowerCase()] : ['weekday', 'monday', 'saturday', 'sunday'];
    for (const sched of scheds) {
      const id1 = `gcc_deploy_${sched}_duty_${normId}`;
      const id2 = `gcc_deploy_${sched}_duty_${unnormId}`;
      
      const [doc1, doc2] = await Promise.all([
        getDoc(doc(db, 'crew_daily_deployment', id1)),
        getDoc(doc(db, 'crew_daily_deployment', id2))
      ]);

      if (doc1.exists()) {
        await updateDoc(doc1.ref, updatePayload);
        updatedAny = true;
      }
      if (doc2.exists() && id2 !== id1) {
        await updateDoc(doc2.ref, updatePayload);
        updatedAny = true;
      }
    }

    console.log(`Swap complete for duty ${dutyId}. Updated docs: ${updatedAny}`);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmitRequest = async () => {
    if (!formData.exchangeDate || !formData.operator1Id || !formData.operator2Id) {
      alert("Please fill in at least the Date and Employee IDs for both operators.");
      return;
    }

    const exchangeRef = await addDoc(collection(db, 'shift_exchanges'), {
      ...formData,
      operator1Confirmed: true, // requester implicitly confirms
      operator2Confirmed: false,
      status: 'Awaiting Second Operator Confirmation',
      timestamp: serverTimestamp()
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_REQUESTED",
      exchangeId: exchangeRef.id,
      operator1Id: formData.operator1Id,
      operator2Id: formData.operator2Id,
      performedBy: formData.operator1Id,
      performedByName: formData.operator1Name,
      timestamp: serverTimestamp(),
      oldDuty: formData.operator1Duty,
      newDuty: formData.operator2Duty,
      details: `Shift exchange request created: Operator 1 (${formData.operator1Name}, Duty ${formData.operator1Duty}) and Operator 2 (${formData.operator2Name}, Duty ${formData.operator2Duty})`
    });

    setFormData({
      exchangeDate: '',
      operator1Search: '',
      operator2Search: '',
      operator1Id: '',
      operator1Name: '',
      operator1Duty: '',
      operator1Status: 'PRESENT',
      operator2Id: '',
      operator2Name: '',
      operator2Duty: '',
      operator2Status: 'PRESENT'
    });
    setOp1Query('');
    setOp2Query('');
  };

  const handleConfirm = async (id, operatorNum) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    const field = operatorNum === 1 ? 'operator1Confirmed' : 'operator2Confirmed';
    const timeField = operatorNum === 1 ? 'operator1ConfirmedAt' : 'operator2ConfirmedAt';
    
    const isOtherConfirmed = operatorNum === 1 ? ex.operator2Confirmed : ex.operator1Confirmed;
    const newStatus = isOtherConfirmed ? 'Awaiting GCC Approval' : 'Awaiting Second Operator Confirmation';

    await updateDoc(doc(db, 'shift_exchanges', id), {
      [field]: true,
      [timeField]: serverTimestamp(),
      status: newStatus
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_CONFIRMED",
      exchangeId: id,
      operator1Id: ex.operator1Id,
      operator2Id: ex.operator2Id,
      performedBy: operatorNum === 1 ? ex.operator1Id : ex.operator2Id,
      performedByName: operatorNum === 1 ? ex.operator1Name : ex.operator2Name,
      timestamp: serverTimestamp(),
      oldDuty: operatorNum === 1 ? ex.operator1Duty : ex.operator2Duty,
      newDuty: operatorNum === 1 ? ex.operator2Duty : ex.operator1Duty,
      details: `Operator ${operatorNum} (${operatorNum === 1 ? ex.operator1Name : ex.operator2Name}) confirmed shift exchange request`
    });
  };

  // Safety validation engine
  const validateSafetyRules = (ex) => {
    const op1 = crewList.find(c => String(c.id) === String(ex.operator1Id));
    const op2 = crewList.find(c => String(c.id) === String(ex.operator2Id));
    
    if (!op1 || !op2) {
      return { valid: false, errors: ["One or both operators not found in the Crew Registry."] };
    }
    
    const errors = [];
    const warnings = [];
    
    // 1. Line / Designation Compatibility: Designation must contain Train Operator / Station Controller
    const op1RoleOk = op1.designation?.toLowerCase().includes('operator') || op1.designation?.toLowerCase().includes('controller');
    const op2RoleOk = op2.designation?.toLowerCase().includes('operator') || op2.designation?.toLowerCase().includes('controller');
    if (!op1RoleOk) errors.push(`Operator 1 (${op1.name}) is not certified as a Train Operator/Station Controller.`);
    if (!op2RoleOk) errors.push(`Operator 2 (${op2.name}) is not certified as a Train Operator/Station Controller.`);
    
    // 2. Competency Validity
    if (op1.competencyExpiry) {
      const exp = new Date(op1.competencyExpiry);
      const targetDate = new Date(ex.exchangeDate);
      if (exp < targetDate) errors.push(`Operator 1 (${op1.name}) Competency Cert has expired or will be expired by target date.`);
    }
    if (op2.competencyExpiry) {
      const exp = new Date(op2.competencyExpiry);
      const targetDate = new Date(ex.exchangeDate);
      if (exp < targetDate) errors.push(`Operator 2 (${op2.name}) Competency Cert has expired or will be expired by target date.`);
    }

    // 3. Medical Validity (Mock Check)
    const mockMedicalExpiry = "2027-04-18";
    if (new Date(mockMedicalExpiry) < new Date(ex.exchangeDate)) {
      errors.push("Medical certificate has expired for one or both operators.");
    }
    
    // 4. Fatigue Check (Mock Check based on duty length)
    // Shift Rules: A minimum rest interval of 11 hours is mandatory.
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  };

  const handleAuthorize = async (id) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    // Validate approval authority
    const userRole = userProfile?.role || '';
    const isAuthorized = ['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(userRole);
    if (!isAuthorized) {
      alert("❌ Unauthorized: Only GCC, Crew Controller, or ALS are authorized to approve shift exchanges.");
      return;
    }

    // Run Safety Validation before GCC/CC Approval
    const safety = validateSafetyRules(ex);
    if (!safety.valid) {
      alert(`⚠️ OPERATIONAL SAFETY REJECTION:\n\n${safety.errors.join("\n")}`);
      return;
    }

    // Prompt for Remarks
    const remarks = window.prompt("Enter approval remarks:", `Approved by ${userProfile?.employeeName || 'GCC/CC'}`);
    if (remarks === null) return; // user cancelled
    const finalRemarks = remarks.trim() || `Approved by ${userProfile?.employeeName || 'GCC/CC'}`;

    try {
      await rosterService.approveShiftExchange(ex, userProfile, finalRemarks);
      alert("🚀 Shift exchange approved and operational swapped successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to approve exchange: " + err.message);
    }
  };

  const handleMakeOperational = async (id) => {
    console.log("handleMakeOperational deprecated - swap executed immediately on approval.");
  };

  const handleReverseExchange = async (id) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    if (!window.confirm(`Are you sure you want to REVERSE this shift exchange and restore the original operators?`)) {
      return;
    }

    const duty1 = normalizeDutyId(ex.operator1Duty);
    const duty2 = normalizeDutyId(ex.operator2Duty);
    const unnormDuty1 = String(parseInt(ex.operator1Duty, 10));
    const unnormDuty2 = String(parseInt(ex.operator2Duty, 10));

    try {
      // Query existing deployments by dutyId
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

      await runTransaction(db, async (transaction) => {
        // A. Read exchange document
        const exRef = doc(db, 'shift_exchanges', id);
        const exDoc = await transaction.get(exRef);
        if (!exDoc.exists()) {
          throw new Error("Shift exchange record not found.");
        }

        // B. Read deployments
        const deploymentDocs = [];
        for (const ref of refsToGet) {
          const snap = await transaction.get(ref);
          if (snap.exists()) {
            deploymentDocs.push(snap);
          }
        }

        // C. Restore original operators
        const updatePayload1 = {
          empId: String(ex.operator1Id || ''),
          empName: String(ex.operator1Name || '').toUpperCase(),
          remarks: "Roster Reset (Exchange Reversed)",
          isExchanged: false,
          originalEmpId: "",
          originalEmpName: "",
          exchangeId: "",
          approvedBy: "",
          approvedDateTime: "",
          lastUpdated: serverTimestamp()
        };

        const updatePayload2 = {
          empId: String(ex.operator2Id || ''),
          empName: String(ex.operator2Name || '').toUpperCase(),
          remarks: "Roster Reset (Exchange Reversed)",
          isExchanged: false,
          originalEmpId: "",
          originalEmpName: "",
          exchangeId: "",
          approvedBy: "",
          approvedDateTime: "",
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

        // D. Delete operational entries
        transaction.delete(doc(db, "shift_exchanges_operational", `${id}_${duty1}`));
        transaction.delete(doc(db, "shift_exchanges_operational", `${id}_${duty2}`));

        // E. Set status to Cancelled
        transaction.update(exRef, {
          status: 'Cancelled',
          cancelledAt: serverTimestamp()
        });

        // F. Audit Log
        const auditLogRef = doc(collection(db, 'auditLogs'));
        transaction.set(auditLogRef, {
          action: 'SHIFT_EXCHANGE_REVERSED',
          exchangeId: id,
          dutyNumber: `${duty1}, ${duty2}`,
          originalOperator: `${ex.operator2Name}, ${ex.operator1Name}`,
          newOperator: `${ex.operator1Name}, ${ex.operator2Name}`,
          approvedBy: `${userProfile?.employeeName || 'GCC/CC'}`,
          timestamp: serverTimestamp(),
          details: `Shift exchange reversed and duties restored: ${ex.operator1Name} (Duty ${duty1}) and ${ex.operator2Name} (Duty ${duty2})`
        });
      });

      alert("🔄 Exchange reversed successfully! Original operators restored across all modules.");
    } catch (err) {
      console.error(err);
      alert("Failed to reverse exchange: " + err.message);
    }
  };

  const handleReject = async (id) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    await updateDoc(doc(db, 'shift_exchanges', id), {
      status: 'Rejected',
      rejectedBy: 'GCC/Crew Controller',
      rejectedAt: serverTimestamp()
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_REJECTED",
      exchangeId: id,
      operator1Id: ex.operator1Id,
      operator2Id: ex.operator2Id,
      approvedBy: 'GCC/Crew Controller',
      timestamp: serverTimestamp(),
      oldDuty: ex.operator1Duty,
      newDuty: ex.operator2Duty,
      details: `Shift exchange rejected by GCC/CC between ${ex.operator1Name} and ${ex.operator2Name}`
    });
  };

  const handleCancel = async (id) => {
    const ex = exchanges.find(e => e.id === id);
    if (!ex) return;

    await updateDoc(doc(db, 'shift_exchanges', id), {
      status: 'Cancelled',
      cancelledAt: serverTimestamp()
    });

    await addDoc(collection(db, 'auditLogs'), {
      action: "SHIFT_EXCHANGE_CANCELLED",
      exchangeId: id,
      operator1Id: ex.operator1Id,
      operator2Id: ex.operator2Id,
      timestamp: serverTimestamp(),
      oldDuty: ex.operator1Duty,
      newDuty: ex.operator2Duty,
      details: `Shift exchange request cancelled by operator`
    });
  };

  const handleClearAllLogs = async () => {
    const userRole = userProfile?.role || '';
    const isAuthorized = ['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(userRole);
    if (!isAuthorized) {
      alert("❌ Unauthorized: Only GCC, Crew Controller, or ALS are authorized to clear shift exchange logs.");
      return;
    }

    if (!window.confirm("⚠️ WARNING: This will permanently delete all shift exchange logs from the database. This action cannot be undone. Proceed?")) {
      return;
    }
    if (!window.confirm("ARE YOU ABSOLUTELY SURE? This deletes the entire live log history.")) {
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // Delete from shift_exchanges
      exchanges.forEach(ex => {
        batch.delete(doc(db, 'shift_exchanges', ex.id));
      });

      // Also clean up operational records if any
      const opSnap = await getDocs(collection(db, 'shift_exchanges_operational'));
      opSnap.docs.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();

      // Log audit
      await addDoc(collection(db, 'auditLogs'), {
        action: 'SHIFT_EXCHANGE_LOG_CLEARED',
        approvedBy: `${userProfile?.employeeName || 'Admin'}`,
        timestamp: serverTimestamp(),
        details: `Shift exchange log and operational records cleared completely by ${userProfile?.employeeName || 'Admin'}.`
      });

      alert("🧹 Live shift exchange log cleared successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to clear logs: " + err.message);
    }
  };


  return (
    <div className='space-y-6 max-w-[100vw] font-mono'>
      {/* HEADER */}
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 shadow-lg flex items-center gap-3">
        <Repeat className="h-6 w-6 text-emerald-400" />
        <h2 className="text-xl font-black tracking-wider text-slate-100">TRAIN OPERATOR SHIFT EXCHANGE DESK</h2>
      </div>

      {/* CREATE REQUEST FORM */}
      <div className='bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl'>
        <h3 className='text-emerald-400 font-bold mb-4 border-b border-slate-800 pb-2 flex items-center gap-2'>
          <Clock size={16} /> Initiate New Exchange Request
        </h3>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* Operator 1 */}
          <div className='bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3'>
            <h4 className='text-amber-400 font-semibold text-xs tracking-wider border-b border-slate-800 pb-1'>OPERATOR 1 (REQUESTER)</h4>
            
            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l1">Search Operator ID / Name</label>
              <input id="shiftexchange-i1" name="shiftexchange-i1" 
                type="text"
                placeholder="Type to filter..."
                value={op1Query}
                onChange={(e) => setOp1Query(e.target.value)}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-250 focus:border-amber-500 focus:outline-none mb-2'
              />
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l2">Select Operator</label>
              <select id="shiftexchange-i2" name="shiftexchange-i2" 
                value={formData.operator1Id}
                onChange={(e) => {
                  const val = e.target.value;
                  const sel = crewList.find(c => String(c.id) === val);
                  if (sel) {
                    setFormData({
                      ...formData,
                      operator1Id: sel.id,
                      operator1Name: sel.name,
                      operator1Search: `${sel.id} - ${sel.name}`
                    });
                    setOp1Query(`${sel.id} - ${sel.name}`);
                  } else {
                    setFormData({
                      ...formData,
                      operator1Id: '',
                      operator1Name: '',
                      operator1Search: ''
                    });
                  }
                }}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-250 focus:border-amber-500 focus:outline-none'
              >
                <option value="">-- Select Operator --</option>
                {filteredCrew1.map(crew => (
                  <option key={`op1-select-${crew.id}`} value={crew.id}>
                    {crew.id} - {crew.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l3">Status</label>
              <select name="operator1Status" value={formData.operator1Status || 'PRESENT'} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none'>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l4">Current Duty Number</label>
              <select name="operator1Duty" value={formData.operator1Duty} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none'>
                <option value="" disabled>Select Duty</option>
                {DUTY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>

          {/* Operator 2 */}
          <div className='bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3'>
            <h4 className='text-cyan-400 font-semibold text-xs tracking-wider border-b border-slate-800 pb-1'>OPERATOR 2 (TARGET)</h4>
            
            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l5">Search Operator ID / Name</label>
              <input id="shiftexchange-i3" name="shiftexchange-i3" 
                type="text"
                placeholder="Type to filter..."
                value={op2Query}
                onChange={(e) => setOp2Query(e.target.value)}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-250 focus:border-cyan-500 focus:outline-none mb-2'
              />
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l6">Select Operator</label>
              <select id="shiftexchange-i4" name="shiftexchange-i4" 
                value={formData.operator2Id}
                onChange={(e) => {
                  const val = e.target.value;
                  const sel = crewList.find(c => String(c.id) === val);
                  if (sel) {
                    setFormData({
                      ...formData,
                      operator2Id: sel.id,
                      operator2Name: sel.name,
                      operator2Search: `${sel.id} - ${sel.name}`
                    });
                    setOp2Query(`${sel.id} - ${sel.name}`);
                  } else {
                    setFormData({
                      ...formData,
                      operator2Id: '',
                      operator2Name: '',
                      operator2Search: ''
                    });
                  }
                }}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-250 focus:border-cyan-500 focus:outline-none'
              >
                <option value="">-- Select Operator --</option>
                {filteredCrew2.map(crew => (
                  <option key={`op2-select-${crew.id}`} value={crew.id}>
                    {crew.id} - {crew.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l7">Status</label>
              <select name="operator2Status" value={formData.operator2Status || 'PRESENT'} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none'>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l8">Current Duty Number</label>
              <select name="operator2Duty" value={formData.operator2Duty} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none'>
                <option value="" disabled>Select Duty</option>
                {DUTY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className='mt-4 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4'>
          <div className='w-full sm:w-1/3'>
            <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l9">Target Date for Exchange</label>
            <input type="date" name="exchangeDate" value={formData.exchangeDate} onChange={handleInputChange} className='w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none' />
          </div>
          <button onClick={handleSubmitRequest} className='w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded text-white font-bold text-xs shadow-md transition-colors'>
            RAISE EXCHANGE REQUEST
          </button>
        </div>
      </div>

      {/* PENDING & AUTHORIZED EXCHANGES */}
      <div className='bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl'>
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-slate-200 font-mono text-xs font-bold">
          <span className="flex items-center gap-2"><UserCheck size={16} className="text-emerald-400" /> LIVE SHIFT EXCHANGE LOG</span>
          {['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(userProfile?.role) && (
            <button 
              onClick={handleClearAllLogs}
              className="bg-rose-950 border border-rose-600 hover:bg-rose-900 text-rose-300 font-bold px-3 py-1 rounded text-[9px] uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1"
            >
              <Trash2 size={10}/> Clear Log
            </button>
          )}
        </div>
        <div className='overflow-x-auto'>
          <table className='w-full text-left text-xs'>
            <thead className='bg-slate-900 border-b-2 border-slate-800 text-slate-400 uppercase tracking-wider'>
              <tr>
                <th className='p-3 w-28'>Date</th>
                <th className='p-3 border-r border-slate-800/50 bg-slate-900/50'>Operator 1 (Requester)</th>
                <th className='p-3 border-r border-slate-800/50 bg-slate-900/50'>Operator 2 (Target)</th>
                <th className='p-3 text-center'>Status</th>
                <th className='p-3 text-center'>Crew Controller Action</th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-800/50'>
              {exchanges.length === 0 && (
                <tr><td colSpan="5" className='p-6 text-center text-slate-500 italic'>No shift exchange requests found.</td></tr>
              )}
              {exchanges.map((ex) => {
                const canApprove = ex.status === 'Awaiting GCC Approval';
                const showCancel = ex.status === 'Awaiting Second Operator Confirmation' || ex.status === 'Awaiting GCC Approval';

                // Status formatting
                let statusBadge = null;
                switch (ex.status) {
                  case 'Awaiting Second Operator Confirmation':
                    statusBadge = <span className='text-yellow-500 font-bold uppercase tracking-wider text-[10px]'>AWAITING 2ND OP CONFIRM</span>;
                    break;
                  case 'Awaiting GCC Approval':
                    statusBadge = <span className='text-orange-400 font-bold uppercase tracking-wider text-[10px] animate-pulse'>AWAITING GCC APPROVAL</span>;
                    break;
                  case 'Approved':
                  case 'APPROVED':
                    statusBadge = <span className='text-emerald-400 font-bold uppercase tracking-wider text-[10px] flex justify-center items-center gap-1'><CheckCircle size={12}/> APPROVED</span>;
                    break;
                  case 'Operational':
                    statusBadge = <span className='text-emerald-400 font-bold uppercase tracking-wider text-[10px] flex justify-center items-center gap-1'><CheckCircle size={12}/> OPERATIONAL</span>;
                    break;
                  case 'Rejected':
                    statusBadge = <span className='text-rose-400 font-bold uppercase tracking-wider text-[10px] flex justify-center items-center gap-1'><X size={12}/> REJECTED</span>;
                    break;
                  case 'Cancelled':
                    statusBadge = <span className='text-slate-500 font-bold uppercase tracking-wider text-[10px]'>CANCELLED</span>;
                    break;
                  default:
                    statusBadge = <span className='text-orange-400 font-bold uppercase tracking-wider text-[10px]'>{ex.status}</span>;
                }

                return (
                  <tr key={ex.id} className='hover:bg-slate-800/20 bg-slate-950/40 transition-colors border-b border-slate-850'>
                    <td className='p-3 text-emerald-400 font-semibold'>{ex.exchangeDate}</td>
                    
                    {/* Operator 1 Block */}
                    <td className='p-3 border-r border-slate-800/50'>
                      <div className='flex flex-col gap-1'>
                        <span className='text-amber-400 font-bold'>{ex.operator1Name || ex.operator1Id}</span>
                        <span className='text-slate-500 text-[10px]'>Duty: {ex.operator1Duty || '--'} | Status: {ex.operator1Status || 'PRESENT'}</span>
                        {ex.operator1Confirmed ? (
                          <span className='text-emerald-500 flex items-center gap-1 text-[10px] font-bold mt-1'><CheckCircle size={10}/> CONFIRMED</span>
                        ) : (
                          (ex.status === 'Awaiting Second Operator Confirmation' || ex.status === 'Pending') && (
                            <button onClick={() => handleConfirm(ex.id, 1)} className='mt-1 bg-amber-900/40 border border-amber-700 hover:bg-amber-800/60 text-amber-400 text-[10px] py-1 px-2 rounded w-max transition-colors'>
                              CONFIRM REQUEST
                            </button>
                          )
                        )}
                      </div>
                    </td>

                    {/* Operator 2 Block */}
                    <td className='p-3 border-r border-slate-800/50'>
                      <div className='flex flex-col gap-1'>
                        <span className='text-cyan-400 font-bold'>{ex.operator2Name || ex.operator2Id}</span>
                        <span className='text-slate-500 text-[10px]'>Duty: {ex.operator2Duty || '--'} | Status: {ex.operator2Status || 'PRESENT'}</span>
                        {ex.operator2Confirmed ? (
                          <span className='text-emerald-500 flex items-center gap-1 text-[10px] font-bold mt-1'><CheckCircle size={10}/> CONFIRMED</span>
                        ) : (
                          (ex.status === 'Awaiting Second Operator Confirmation' || ex.status === 'Pending') && (
                            <button onClick={() => handleConfirm(ex.id, 2)} className='mt-1 bg-cyan-900/40 border border-cyan-700 hover:bg-cyan-800/60 text-cyan-400 text-[10px] py-1 px-2 rounded w-max transition-colors'>
                              CONFIRM REQUEST
                            </button>
                          )
                        )}
                      </div>
                    </td>

                    <td className='p-3 text-center'>
                      {statusBadge}
                    </td>

                    <td className='p-3 text-center'>
                      {ex.status === 'Awaiting GCC Approval' ? (
                        <div className='flex flex-col gap-1.5 items-center justify-center'>
                          <div className='flex gap-1.5 justify-center'>
                            <button 
                              onClick={() => handleAuthorize(ex.id)} 
                              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-2.5 py-1.5 rounded text-[10px] tracking-wider uppercase transition-colors shadow-sm flex items-center gap-0.5"
                            >
                              <Check size={10}/> Approve
                            </button>
                            <button 
                              onClick={() => handleReject(ex.id)} 
                              className="bg-rose-950 border border-rose-500 hover:bg-rose-900 text-rose-300 font-bold px-2.5 py-1.5 rounded text-[10px] tracking-wider uppercase transition-colors shadow-sm flex items-center gap-0.5"
                            >
                              <X size={10}/> Reject
                            </button>
                          </div>
                          {showCancel && (
                            <button 
                              onClick={() => handleCancel(ex.id)}
                              className="text-slate-500 hover:text-slate-400 font-bold text-[9px] uppercase tracking-wider"
                            >
                              Cancel Request
                            </button>
                          )}
                        </div>
                      ) : (ex.status === 'Awaiting Second Operator Confirmation') ? (
                        <div className='flex flex-col items-center gap-1.5'>
                          <span className='text-[10px] text-slate-500 font-bold uppercase'>Awaiting Op 2</span>
                          {showCancel && (
                            <button 
                              onClick={() => handleCancel(ex.id)}
                              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 px-2 py-1 rounded text-[9px] uppercase tracking-wider font-bold"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      ) : (ex.status === 'APPROVED' || ex.status === 'Approved' || ex.status === 'Operational') ? (
                        <div className='flex flex-col items-center gap-1.5'>
                          <button 
                            onClick={() => handleReverseExchange(ex.id)} 
                            className="bg-rose-950 border border-rose-500 hover:bg-rose-900 text-rose-300 font-bold px-3 py-1.5 rounded text-[10px] tracking-wider uppercase transition-colors shadow-sm flex items-center gap-0.5"
                          >
                            Reverse Exchange
                          </button>
                          <span className='text-[8px] text-slate-500'>Approved by {ex.approvedBy || 'GCC/CC'}</span>
                        </div>
                      ) : ex.status === 'Rejected' ? (
                        <div className='flex flex-col items-center gap-0.5 text-[9px] text-slate-500'>
                          <span className='font-bold text-slate-400'>By: {ex.rejectedBy || 'GCC/CC'}</span>
                          {ex.rejectedAt && <span>{ex.rejectedAt.toDate ? ex.rejectedAt.toDate().toLocaleString() : 'Rejected'}</span>}
                        </div>
                      ) : ex.status === 'Cancelled' ? (
                        <div className='flex flex-col items-center gap-0.5 text-[9px] text-slate-500 font-bold uppercase text-slate-650'>
                          <span>Cancelled</span>
                        </div>
                      ) : (
                        <span className='text-slate-600 text-[10px]'>--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

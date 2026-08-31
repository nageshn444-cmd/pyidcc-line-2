import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, addDoc, query, orderBy, onSnapshot, updateDoc, doc, serverTimestamp, getDocs, where, setDoc, getDoc, runTransaction, writeBatch } from 'firebase/firestore';
import { 
  Repeat, CheckCircle, Clock, UserCheck, X, Check, Trash2,
  Cpu, FileSpreadsheet, Users, Search, ArrowRightLeft
} from 'lucide-react';
import { BMRCL_CREW_REGISTRY, BMRCL_CREW_MASTER_BACKUP } from '../data/bmrclCrewRegistry';
import { useAuth } from '../context/AuthContext';
import { rosterService, swapOperatorsInConsoleData } from '../services/RosterService';

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
  'WO',
  'REL',
  'PME',
  'LRD',
  'OD',
  'CRRC TRAINING',
  'STANDBY (OR)'
];

const BASE_DUTY_OPTIONS = [
  ...Array.from({ length: 100 }, (_, i) => (i + 1).toString().padStart(2, '0')),
  '06:30 OR',
  '07:00 OR',
  '07:30 OR',
  '08:00 OR',
  '08:30 OR',
  '09:00 OR',
  '10:00 OR',
  '10:30 OR',
  '11:00 OR',
  '12:00 OR',
  '13:00 OR',
  '13:30 OR',
  '14:00 OR',
  '14:30 OR',
  'Standby RD3',
  'PUTH STBK 07:00',
  'PUTH STBK 14:00',
  'NGSA STBK 07:00',
  'NGSA STBK 14:00',
  'CC1',
  'CC2',
  'CC3',
  'CC4',
  'CC5',
  'CC Night',
  'GCC Controller',
  'ALS Controller',
  'Co-Op Duty 01',
  'Co-Op Duty 02',
  'Co-Op Duty 03',
  'Co-Op Duty 04',
  'Co-Op Duty 05',
  'Co-Op Duty 06',
  'Co-Op Duty 07',
  'Co-Op Duty 08',
  'Co-Op Duty 09',
  'Co-Op Duty 10',
  'Co-Op Duty 11',
  'Co-Op Duty 12',
  'Co-Op Duty 13',
  'Co-Op Duty 14',
  'Co-Op Duty 15',
  'Co-Op Duty 16',
  'Co-Op Duty 17',
  'Co-Op Duty 18',
  'Co-Op Duty 19',
  'Co-Op Duty 20',
  'CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL)',
  'CRT Training',
  'BMRTI Training',
  'Weekly Off (WO)',
  'Leave (CL)',
  'Leave (EL)',
  'Relieved (REL)',
  'PME (Medical Exam)',
  'LRD (Route Learning)',
  'OD (On Duty)',
  'NR (Not Reporting)',
  'AB (Absent)'
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

  // Live Roster Desk Console and Deployment states
  const [consoleData, setConsoleData] = useState(() => {
    try {
      const cached = localStorage.getItem("pyidcc_roster_desk_console_cache");
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn("Could not load roster console cache", e);
    }
    return {};
  });
  const [deployments, setDeployments] = useState([]);
  const [selectedConsoleCategory, setSelectedConsoleCategory] = useState(null);

  // 1. Sync live deployments & Roster Desk Console snapshots
  useEffect(() => {
    const unsubDeskCurrent = onSnapshot(doc(db, "roster_desk_console", "current"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setConsoleData(prev => ({ ...prev, ...d }));
      }
    });
    const unsubDeskLatest = onSnapshot(doc(db, "roster_desk_console", "latest"), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        setConsoleData(prev => ({ ...prev, ...d }));
      }
    });
    const unsubDeploy = onSnapshot(collection(db, "crew_daily_deployment"), (snap) => {
      setDeployments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubDeskCurrent();
      unsubDeskLatest();
      unsubDeploy();
    };
  }, []);

  // 2. Sync crew data with Firestore crewRegistry collection or local registry backups
  useEffect(() => {
    if (BMRCL_CREW_REGISTRY && BMRCL_CREW_REGISTRY.length > 0) {
      setCrewList(BMRCL_CREW_REGISTRY);
    } else {
      setCrewList(BMRCL_CREW_MASTER_BACKUP);
    }

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

  // 3. Consolidated Deployed Crew Map across ALL Roster Desk Console Columns & Mainline Duties
  const deployedCrewMap = useMemo(() => {
    const map = new Map();

    // A. Mainline numeric train duties from crew_daily_deployment
    (deployments || []).forEach(d => {
      const empId = String(d.empId || '').trim();
      if (!empId || empId === '--' || empId === 'UNASSIGNED') return;
      const dutyId = String(d.dutyId || '').padStart(2, '0');
      map.set(empId, {
        empId,
        name: d.empName || '',
        category: 'Mainline Train Duty',
        duty: dutyId,
        status: d.status || 'PRESENT',
        trainId: d.trainId || '',
        time: d.signOnTime && d.signOffTime ? `${d.signOnTime} - ${d.signOffTime}` : (d.signOnTime || ''),
        tagColor: 'border-emerald-500/40 text-emerald-300'
      });
    });

    // B. Co-Operators & 2nd Crew (consoleData.coOperators)
    (consoleData.coOperators || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'Co-Operators & 2nd Crew',
        duty: item.dutyId ? `Co-Op Duty ${item.dutyId}` : 'Co-Op Duty',
        status: 'PRESENT',
        trainId: item.trainId || '',
        time: item.time || `${item.signOn || ''} - ${item.signOff || ''}`,
        tagColor: 'border-amber-500/40 text-amber-300'
      });
    });

    // C. Crew Controllers (consoleData.controlDesks)
    (consoleData.controlDesks || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'Crew Controllers',
        duty: item.code || item.label || 'CC Desk',
        status: 'PRESENT',
        time: item.time || '06:30 - 14:00',
        tagColor: 'border-amber-400/40 text-amber-400'
      });
    });

    // D. Standbys & OR (consoleData.standbys)
    (consoleData.standbys || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      const code = item.code || item.label || 'OR';
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'Standby',
        duty: code,
        status: 'STANDBY (OR)',
        time: item.time || '',
        tagColor: 'border-emerald-400/40 text-emerald-400'
      });
    });

    // E. Outstation Step-Back STBK (consoleData.outstationStepbacks)
    (consoleData.outstationStepbacks || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      const stn = item.station || 'PUTH';
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'STBK',
        duty: `${stn} STBK 07:00`,
        status: 'PRESENT',
        time: item.time || '',
        tagColor: 'border-purple-400/40 text-purple-400'
      });
    });

    // F. CRT Training (consoleData.crtTraining)
    (consoleData.crtTraining || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'CRT',
        duty: 'CRT Training',
        status: 'CRT',
        time: item.time || '',
        tagColor: 'border-teal-400/40 text-teal-400'
      });
    });

    // G. BMRTI Training (consoleData.bmrtiTraining)
    (consoleData.bmrtiTraining || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'BMRTI',
        duty: 'BMRTI Training',
        status: 'BMRTI',
        time: item.date || item.time || '',
        tagColor: 'border-sky-400/40 text-sky-400'
      });
    });

    // H. Weekly Off (consoleData.weeklyOffs)
    (consoleData.weeklyOffs || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'Weekly Off',
        duty: 'Weekly Off (WO)',
        status: 'WO',
        time: item.date || '',
        tagColor: 'border-rose-400/40 text-rose-400'
      });
    });

    // I. Leave & Rest (consoleData.leaves)
    (consoleData.leaves || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      const leaveType = item.type || 'CL';
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'Leave & Rest',
        duty: `Leave (${leaveType})`,
        status: leaveType,
        time: item.from || '',
        tagColor: 'border-cyan-400/40 text-cyan-400'
      });
    });

    // J. Relieved Operators (consoleData.relievedOperators)
    (consoleData.relievedOperators || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'REL',
        duty: 'Relieved (REL)',
        status: 'REL',
        time: item.time || '',
        tagColor: 'border-fuchsia-400/40 text-fuchsia-400'
      });
    });

    // K. Periodical Medical Examination PME (consoleData.pmeOperators)
    (consoleData.pmeOperators || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'PME',
        duty: 'PME (Medical Exam)',
        status: 'PME',
        time: item.time || '',
        tagColor: 'border-lime-400/40 text-lime-400'
      });
    });

    // L. Route Learning LRD (consoleData.routeLearning)
    (consoleData.routeLearning || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'LRD',
        duty: 'LRD (Route Learning)',
        status: 'LRD',
        time: item.time || '',
        tagColor: 'border-indigo-400/40 text-indigo-400'
      });
    });

    // M. On Duty OD (consoleData.onDuty)
    (consoleData.onDuty || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'OD',
        duty: 'OD (On Duty)',
        status: 'OD',
        time: item.info || '',
        tagColor: 'border-amber-300/40 text-amber-300'
      });
    });

    // N. Not Reporting NR (consoleData.notReporting)
    (consoleData.notReporting || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'NR',
        duty: 'NR (Not Reporting)',
        status: 'NOT REPORTING (NR)',
        time: '',
        tagColor: 'border-rose-300/40 text-rose-300'
      });
    });

    // O. Absent AB (consoleData.absents)
    (consoleData.absents || []).forEach(item => {
      const empId = String(item.empNo || item.empId || '').trim();
      if (!empId || empId === '--') return;
      map.set(empId, {
        empId,
        name: item.name || '',
        category: 'AB',
        duty: 'AB (Absent)',
        status: 'ABSENT (AB)',
        time: '',
        tagColor: 'border-red-400/40 text-red-400'
      });
    });

    // P. Custom Registers (CRRC 4RS DM-DTG TRAINING AT PEENYA DEPOT (RBL) and dynamic registers)
    if (consoleData.customRegisters) {
      Object.entries(consoleData.customRegisters).forEach(([tag, list]) => {
        if (!Array.isArray(list)) return;
        const isCrrc = tag.toUpperCase().includes('CRRC');
        list.forEach(item => {
          const empId = String(item.empNo || item.empId || '').trim();
          if (!empId || empId === '--') return;
          map.set(empId, {
            empId,
            name: item.name || '',
            category: tag,
            duty: tag,
            status: isCrrc ? 'CRRC TRAINING' : 'PRESENT',
            time: item.info || '',
            tagColor: 'border-cyan-500/40 text-cyan-300'
          });
        });
      });
    }

    return map;
  }, [consoleData, deployments]);

  // 4. Enriched Crew List incorporating all console deployments with priority
  const enrichedCrewList = useMemo(() => {
    const seenIds = new Set();
    const result = [];

    deployedCrewMap.forEach((deployInfo, empId) => {
      seenIds.add(empId);
      const registryMatch = crewList.find(c => String(c.id) === empId);
      result.push({
        id: empId,
        name: deployInfo.name || registryMatch?.name || '',
        designation: registryMatch?.designation || 'Train Operator',
        contact: registryMatch?.contact || '',
        role: registryMatch?.role || 'Train Operator',
        isDeployedToday: true,
        deployedDuty: deployInfo.duty,
        deployedStatus: deployInfo.status,
        deployedCategory: deployInfo.category,
        deployedTime: deployInfo.time,
        deployedTrainId: deployInfo.trainId,
        tagColor: deployInfo.tagColor
      });
    });

    crewList.forEach(c => {
      const idStr = String(c.id);
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        result.push({
          ...c,
          isDeployedToday: false,
          deployedDuty: '',
          deployedStatus: 'PRESENT',
          deployedCategory: 'Off Roster'
        });
      }
    });

    return result;
  }, [crewList, deployedCrewMap]);

  // 5. Dynamic Duty Options combining base duties, console duties, and current selections
  const dynamicDutyOptions = useMemo(() => {
    const set = new Set(BASE_DUTY_OPTIONS);
    if (formData.operator1Duty) set.add(formData.operator1Duty);
    if (formData.operator2Duty) set.add(formData.operator2Duty);
    deployedCrewMap.forEach(d => {
      if (d.duty) set.add(d.duty);
    });
    return Array.from(set);
  }, [formData.operator1Duty, formData.operator2Duty, deployedCrewMap]);

  // 6. Zero Manual Entry Selection Handlers
  const handleSelectOperator1 = (empId) => {
    const sel = enrichedCrewList.find(c => String(c.id) === String(empId));
    if (sel) {
      const deployInfo = deployedCrewMap.get(String(empId));
      const autoDuty = deployInfo?.duty || sel.deployedDuty || '';
      const autoStatus = deployInfo?.status || sel.deployedStatus || 'PRESENT';
      const autoDate = formData.exchangeDate || consoleData.date || new Date().toISOString().split('T')[0];

      setFormData(prev => ({
        ...prev,
        operator1Id: sel.id,
        operator1Name: sel.name,
        operator1Search: `${sel.id} - ${sel.name}${autoDuty ? ` [${autoDuty}]` : ''}`,
        operator1Duty: autoDuty || prev.operator1Duty,
        operator1Status: autoStatus,
        exchangeDate: autoDate
      }));
      setOp1Query(`${sel.id} - ${sel.name}`);
    } else {
      setFormData(prev => ({
        ...prev,
        operator1Id: '',
        operator1Name: '',
        operator1Search: '',
        operator1Duty: '',
        operator1Status: 'PRESENT'
      }));
    }
  };

  const handleSelectOperator2 = (empId) => {
    const sel = enrichedCrewList.find(c => String(c.id) === String(empId));
    if (sel) {
      const deployInfo = deployedCrewMap.get(String(empId));
      const autoDuty = deployInfo?.duty || sel.deployedDuty || '';
      const autoStatus = deployInfo?.status || sel.deployedStatus || 'PRESENT';
      const autoDate = formData.exchangeDate || consoleData.date || new Date().toISOString().split('T')[0];

      setFormData(prev => ({
        ...prev,
        operator2Id: sel.id,
        operator2Name: sel.name,
        operator2Search: `${sel.id} - ${sel.name}${autoDuty ? ` [${autoDuty}]` : ''}`,
        operator2Duty: autoDuty || prev.operator2Duty,
        operator2Status: autoStatus,
        exchangeDate: autoDate
      }));
      setOp2Query(`${sel.id} - ${sel.name}`);
    } else {
      setFormData(prev => ({
        ...prev,
        operator2Id: '',
        operator2Name: '',
        operator2Search: '',
        operator2Duty: '',
        operator2Status: 'PRESENT'
      }));
    }
  };

  // 7. Filtered crew list with multi-field search (ID, name, duty, category)
  const filteredCrew1 = useMemo(() => {
    const q = op1Query.toLowerCase().trim();
    const isSelectedMatch = formData.operator1Id && `${formData.operator1Id} - ${formData.operator1Name}`.toLowerCase() === q;
    
    let list = enrichedCrewList;
    if (q && !isSelectedMatch) {
      list = enrichedCrewList.filter(c => 
        String(c.id).toLowerCase().includes(q) || 
        c.name.toLowerCase().includes(q) ||
        (c.deployedDuty && c.deployedDuty.toLowerCase().includes(q)) ||
        (c.deployedCategory && c.deployedCategory.toLowerCase().includes(q))
      );
    }
    
    if (formData.operator1Id && !list.some(c => String(c.id) === String(formData.operator1Id))) {
      const selectedObj = enrichedCrewList.find(c => String(c.id) === String(formData.operator1Id));
      if (selectedObj) list = [selectedObj, ...list];
    }
    return list;
  }, [op1Query, formData.operator1Id, formData.operator1Name, enrichedCrewList]);

  const filteredCrew2 = useMemo(() => {
    const q = op2Query.toLowerCase().trim();
    const isSelectedMatch = formData.operator2Id && `${formData.operator2Id} - ${formData.operator2Name}`.toLowerCase() === q;
    
    let list = enrichedCrewList;
    if (q && !isSelectedMatch) {
      list = enrichedCrewList.filter(c => 
        String(c.id).toLowerCase().includes(q) || 
        c.name.toLowerCase().includes(q) ||
        (c.deployedDuty && c.deployedDuty.toLowerCase().includes(q)) ||
        (c.deployedCategory && c.deployedCategory.toLowerCase().includes(q))
      );
    }
    
    if (formData.operator2Id && !list.some(c => String(c.id) === String(formData.operator2Id))) {
      const selectedObj = enrichedCrewList.find(c => String(c.id) === String(formData.operator2Id));
      if (selectedObj) list = [selectedObj, ...list];
    }
    return list;
  }, [op2Query, formData.operator2Id, formData.operator2Name, enrichedCrewList]);

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
    const op1 = enrichedCrewList.find(c => String(c.id) === String(ex.operator1Id)) || crewList.find(c => String(c.id) === String(ex.operator1Id));
    const op2 = enrichedCrewList.find(c => String(c.id) === String(ex.operator2Id)) || crewList.find(c => String(c.id) === String(ex.operator2Id));
    
    if (!op1 || !op2) {
      return { valid: false, errors: ["One or both operators not found in the Crew Registry."] };
    }
    
    const errors = [];
    const warnings = [];
    
    // 1. Line / Designation Compatibility: Designation must contain Train Operator / Station Controller / Deployed Console Role
    const isOpRoleValid = (op) => {
      const des = (op.designation || '').toLowerCase();
      const role = (op.role || '').toLowerCase();
      const cat = (op.deployedCategory || '').toLowerCase();
      return (
        des.includes('operator') || 
        des.includes('controller') || 
        role.includes('operator') || 
        role.includes('controller') || 
        cat.includes('crew') || 
        cat.includes('co-operator') || 
        cat.includes('standby') || 
        cat.includes('training') || 
        op.isDeployedToday
      );
    };
    const op1RoleOk = isOpRoleValid(op1);
    const op2RoleOk = isOpRoleValid(op2);
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

      // Reverse console desk swap if any
      try {
        const consoleDocSnap = await getDoc(doc(db, 'roster_desk_console', 'current'));
        if (consoleDocSnap.exists()) {
          const currentConsole = consoleDocSnap.data();
          const restoredConsole = swapOperatorsInConsoleData(
            currentConsole,
            ex.operator2Id,
            ex.operator2Name,
            ex.operator1Id,
            ex.operator1Name
          );
          restoredConsole.lastUpdated = serverTimestamp();
          await setDoc(doc(db, 'roster_desk_console', 'current'), restoredConsole, { merge: true });
          await setDoc(doc(db, 'roster_desk_console', 'latest'), restoredConsole, { merge: true });
          await setDoc(doc(db, 'dispatch_excel_cache', 'current'), restoredConsole, { merge: true });
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem('pyidcc_roster_desk_console_cache', JSON.stringify(restoredConsole));
          }
        }
      } catch (consoleErr) {
        console.warn("Error restoring console data:", consoleErr);
      }

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


  const consoleCategories = useMemo(() => {
    const cats = [
      { key: 'coOperators', label: 'Co-Operators & 2nd Crew', count: consoleData.coOperators?.length || 0, max: null, color: 'text-amber-300 border-amber-500/40 bg-amber-950/40' },
      { key: 'controlDesks', label: 'Crew Controllers', count: consoleData.controlDesks?.length || 0, max: 10, color: 'text-amber-400 border-slate-800 bg-slate-950' },
      { key: 'leaves', label: 'Leave & Rest', count: consoleData.leaves?.length || 0, max: 50, color: 'text-cyan-400 border-slate-800 bg-slate-950' },
      { key: 'standbys', label: 'Standby', count: consoleData.standbys?.length || 0, max: 50, color: 'text-emerald-400 border-slate-800 bg-slate-950' },
      { key: 'outstationStepbacks', label: 'STBK', count: consoleData.outstationStepbacks?.length || 0, max: 20, color: 'text-purple-400 border-slate-800 bg-slate-950' },
      { key: 'crtTraining', label: 'CRT', count: consoleData.crtTraining?.length || 0, max: 15, color: 'text-teal-400 border-slate-800 bg-slate-950' },
      { key: 'bmrtiTraining', label: 'BMRTI', count: consoleData.bmrtiTraining?.length || 0, max: 50, color: 'text-sky-400 border-slate-800 bg-slate-950' },
      { key: 'weeklyOffs', label: 'Weekly Off', count: consoleData.weeklyOffs?.length || 0, max: 50, color: 'text-rose-400 border-slate-800 bg-slate-950' },
      { key: 'relievedOperators', label: 'REL', count: consoleData.relievedOperators?.length || 0, max: 10, color: 'text-fuchsia-400 border-slate-800 bg-slate-950' },
      { key: 'pmeOperators', label: 'PME', count: consoleData.pmeOperators?.length || 0, max: 20, color: 'text-lime-400 border-slate-800 bg-slate-950' },
      { key: 'routeLearning', label: 'LRD', count: consoleData.routeLearning?.length || 0, max: 20, color: 'text-indigo-400 border-slate-800 bg-slate-950' },
      { key: 'onDuty', label: 'OD', count: consoleData.onDuty?.length || 0, max: 20, color: 'text-amber-300 border-slate-800 bg-slate-950' },
      { key: 'notReporting', label: 'NR', count: consoleData.notReporting?.length || 0, max: 20, color: 'text-rose-300 border-slate-800 bg-slate-950' },
      { key: 'absents', label: 'AB', count: consoleData.absents?.length || 0, max: 20, color: 'text-red-400 border-slate-800 bg-slate-950' }
    ];

    if (consoleData.customRegisters) {
      Object.keys(consoleData.customRegisters).forEach(tagName => {
        const isCrrc = tagName.toUpperCase().includes('CRRC');
        cats.push({
          key: `custom_${tagName}`,
          isCustom: true,
          tagName,
          label: tagName,
          count: consoleData.customRegisters[tagName]?.length || 0,
          max: null,
          color: isCrrc 
            ? 'text-emerald-300 border-emerald-500/50 bg-emerald-950/60 font-black' 
            : 'text-cyan-300 border-cyan-800/60 bg-cyan-950/40'
        });
      });
    }

    return cats;
  }, [consoleData]);

  const activeCategoryOperators = useMemo(() => {
    if (!selectedConsoleCategory) return [];
    if (selectedConsoleCategory.startsWith('custom_')) {
      const tagName = selectedConsoleCategory.replace('custom_', '');
      return consoleData.customRegisters?.[tagName] || [];
    }
    return consoleData[selectedConsoleCategory] || [];
  }, [selectedConsoleCategory, consoleData]);

  const activeCategoryObj = useMemo(() => {
    return consoleCategories.find(c => c.key === selectedConsoleCategory);
  }, [selectedConsoleCategory, consoleCategories]);

  return (
    <div className='space-y-6 max-w-[100vw] font-mono'>
      {/* HEADER */}
      <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/40 p-4 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-500/40">
            <Repeat className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-black tracking-wider text-slate-100 flex items-center gap-2">
              SWAP DUTIES (CC/GCC/ALS) & TRAIN OPERATOR SHIFT EXCHANGE DESK
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-[10px] text-cyan-400 font-bold tracking-widest uppercase">
                ZERO MANUAL ENTRY ENGINE
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-[10px] text-emerald-400 font-mono">
                BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="bg-emerald-950/80 text-emerald-300 text-[10px] font-black px-3 py-1 rounded-full border border-emerald-700/50 flex items-center gap-1.5 shadow-sm">
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
            AUTO-READER LINKED
          </span>
        </div>
      </div>

      {/* BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE STRIP */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3 font-mono">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-black text-slate-100 tracking-wider">
              BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE
            </h3>
            <span className="text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              {consoleData.date || (new Date().toISOString().split('T')[0])}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Click any column badge to quick-select operators for swap
          </span>
        </div>

        {/* 15+ Column Badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          {consoleCategories.map(cat => {
            const isSelected = selectedConsoleCategory === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedConsoleCategory(isSelected ? null : cat.key)}
                className={`px-2.5 py-1 rounded border transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected 
                    ? 'ring-2 ring-emerald-400 border-emerald-400 bg-emerald-950 text-emerald-200 shadow-md scale-105' 
                    : `${cat.color} hover:brightness-125`
                }`}
              >
                <span>{cat.label}</span>
                <span className="font-mono px-1 rounded bg-black/40 text-[9px]">
                  {cat.max !== null ? `${cat.count}/${cat.max}` : cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Quick Pick Drawer if a category is selected */}
        {selectedConsoleCategory && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 mt-2 transition-all">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-cyan-400" />
                Deployed Operators in <span className="text-emerald-400 font-black">{activeCategoryObj?.label}</span> ({activeCategoryOperators.length})
              </span>
              <button
                type="button"
                onClick={() => setSelectedConsoleCategory(null)}
                className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-900 border border-slate-800 cursor-pointer"
              >
                Close ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1 text-xs">
              {activeCategoryOperators.length === 0 ? (
                <div className="col-span-full py-4 text-center text-slate-500 italic text-xs">
                  No operators currently deployed in this column for this day.
                </div>
              ) : (
                activeCategoryOperators.map((item, idx) => {
                  const empId = item.empNo || item.empId || '';
                  return (
                    <div key={idx} className="bg-slate-900/90 border border-slate-800 p-2 rounded flex justify-between items-center hover:border-slate-700 transition">
                      <div className="space-y-0.5 min-w-0 pr-2">
                        <div className="font-bold text-slate-200 truncate flex items-center gap-1.5">
                          <span className="text-amber-400 font-mono text-[10px]">#{empId}</span>
                          <span className="truncate">{item.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {item.duty || item.code || item.label || activeCategoryObj?.label} {item.time ? `• ${item.time}` : ''}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectOperator1(empId)}
                          className="bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/40 text-[9px] font-bold px-2 py-0.5 rounded transition uppercase cursor-pointer"
                          title="Set as Operator 1 (Requester)"
                        >
                          + Op 1
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectOperator2(empId)}
                          className="bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 border border-cyan-500/40 text-[9px] font-bold px-2 py-0.5 rounded transition uppercase cursor-pointer"
                          title="Set as Operator 2 (Target)"
                        >
                          + Op 2
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* CREATE REQUEST FORM (ZERO MANUAL ENTRY ENGINE) */}
      <div className='bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl'>
        <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-4">
          <h3 className='text-emerald-400 font-bold flex items-center gap-2 text-sm'>
            <Clock size={16} /> Initiate New Exchange Request
          </h3>
          <span className="text-[10px] text-slate-400 font-mono bg-slate-950 px-2.5 py-0.5 rounded border border-slate-800">
            ⚡ Zero Manual Entry Active
          </span>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
          {/* Operator 1 (Requester) */}
          <div className='bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3'>
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <h4 className='text-amber-400 font-semibold text-xs tracking-wider'>OPERATOR 1 (REQUESTER)</h4>
              {formData.operator1Duty && (
                <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 font-bold font-mono">
                  {formData.operator1Duty}
                </span>
              )}
            </div>
            
            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l1">Search Operator ID / Name</label>
              <div className="relative">
                <input id="shiftexchange-i1" name="shiftexchange-i1" 
                  type="text"
                  placeholder="Type to filter by ID, name, duty, or column..."
                  value={op1Query}
                  onChange={(e) => setOp1Query(e.target.value)}
                  className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none mb-2 pl-7 font-mono'
                />
                <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2 top-2 pointer-events-none" />
              </div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l2">Select Operator</label>
              <select id="shiftexchange-i2" name="shiftexchange-i2" 
                value={formData.operator1Id}
                onChange={(e) => handleSelectOperator1(e.target.value)}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none font-mono'
              >
                <option value="">-- Select Operator --</option>
                {filteredCrew1.map(crew => (
                  <option key={`op1-select-${crew.id}`} value={crew.id}>
                    {crew.id} - {crew.name} {crew.deployedDuty ? `[${crew.deployedDuty}]` : (crew.deployedCategory ? `[${crew.deployedCategory}]` : '')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className='block text-[10px] text-slate-500' htmlFor="shiftexchange-l3">Status</label>
                <span className="text-[9px] text-emerald-400 font-mono">AUTO-DETECTED</span>
              </div>
              <select name="operator1Status" value={formData.operator1Status || 'PRESENT'} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none font-mono'>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className='block text-[10px] text-slate-500' htmlFor="shiftexchange-l4">Current Duty Number</label>
                <span className="text-[9px] text-cyan-400 font-mono">ZERO MANUAL ENTRY</span>
              </div>
              <select name="operator1Duty" value={formData.operator1Duty} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none font-mono'>
                <option value="" disabled>Select Duty</option>
                {dynamicDutyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>

          {/* Operator 2 (Target) */}
          <div className='bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3'>
            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
              <h4 className='text-cyan-400 font-semibold text-xs tracking-wider'>OPERATOR 2 (TARGET)</h4>
              {formData.operator2Duty && (
                <span className="text-[10px] bg-cyan-500/10 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30 font-bold font-mono">
                  {formData.operator2Duty}
                </span>
              )}
            </div>
            
            <div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l5">Search Operator ID / Name</label>
              <div className="relative">
                <input id="shiftexchange-i3" name="shiftexchange-i3" 
                  type="text"
                  placeholder="Type to filter by ID, name, duty, or column..."
                  value={op2Query}
                  onChange={(e) => setOp2Query(e.target.value)}
                  className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none mb-2 pl-7 font-mono'
                />
                <Search className="h-3.5 w-3.5 text-slate-500 absolute left-2 top-2 pointer-events-none" />
              </div>
              <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l6">Select Operator</label>
              <select id="shiftexchange-i4" name="shiftexchange-i4" 
                value={formData.operator2Id}
                onChange={(e) => handleSelectOperator2(e.target.value)}
                className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none font-mono'
              >
                <option value="">-- Select Operator --</option>
                {filteredCrew2.map(crew => (
                  <option key={`op2-select-${crew.id}`} value={crew.id}>
                    {crew.id} - {crew.name} {crew.deployedDuty ? `[${crew.deployedDuty}]` : (crew.deployedCategory ? `[${crew.deployedCategory}]` : '')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className='block text-[10px] text-slate-500' htmlFor="shiftexchange-l7">Status</label>
                <span className="text-[9px] text-emerald-400 font-mono">AUTO-DETECTED</span>
              </div>
              <select name="operator2Status" value={formData.operator2Status || 'PRESENT'} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none font-mono'>
                {STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className='block text-[10px] text-slate-500' htmlFor="shiftexchange-l8">Current Duty Number</label>
                <span className="text-[9px] text-cyan-400 font-mono">ZERO MANUAL ENTRY</span>
              </div>
              <select name="operator2Duty" value={formData.operator2Duty} onChange={handleInputChange} className='w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none font-mono'>
                <option value="" disabled>Select Duty</option>
                {dynamicDutyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className='mt-4 flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4'>
          <div className='w-full sm:w-1/3'>
            <label className='block text-[10px] text-slate-500 mb-1' htmlFor="shiftexchange-l9">Target Date for Exchange</label>
            <input type="date" name="exchangeDate" value={formData.exchangeDate} onChange={handleInputChange} className='w-full bg-slate-950 border border-slate-700 rounded p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none font-mono' />
          </div>
          <button onClick={handleSubmitRequest} className='w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 px-6 py-2 rounded text-white font-bold text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5'>
            <ArrowRightLeft className="h-4 w-4" />
            <span>RAISE EXCHANGE REQUEST</span>
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

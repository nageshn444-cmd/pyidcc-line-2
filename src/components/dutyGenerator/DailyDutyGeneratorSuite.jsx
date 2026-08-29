import React, { useState, useMemo, useEffect } from 'react';
import { 
  Sparkles, Calendar, Moon, History, ShieldAlert, ShieldCheck,
  Send, Layers, RefreshCw, BarChart2, Compass, Lock, Users, UserMinus, UserX, CheckCircle2,
  Database, ArrowRightLeft, Briefcase, Zap, ChevronRight, Activity, Star
} from 'lucide-react';
import GeneratorDraftConsole from './GeneratorDraftConsole';
import NextDayRequirementsCenter from './NextDayRequirementsCenter';
import WeekOffControlManager from './WeekOffControlManager';
import NightShiftBalancingDesk from './NightShiftBalancingDesk';
import DutyHistoryIntelligence from './DutyHistoryIntelligence';
import ActiveCrewManagerModal from './ActiveCrewManagerModal';
import RelievedCrewManagerModal from './RelievedCrewManagerModal';
import NewStaffLRDModal from './NewStaffLRDModal';
import CCWillingDeskModal from './CCWillingDeskModal';
import JmdCrewManagerModal from './JmdCrewManagerModal';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { OFFICIAL_JMD_TD_REGISTRY } from '../../data/jmdCrewMaster';
import { resolveDayType, DAY_TYPE_PROFILES } from '../../data/dayTypeProfiles';
import { useOperationalEngine } from '../../context/OperationalEngine';
import { useAuth } from '../../context/AuthContext';
import { buildUnifiedEmployeeProfile, mergeCrewRegistryToFirestore, purgeDuplicateFirestoreCrewDocuments, normalizeCanonicalEmpId, OFFICIAL_PYID_ACTIVE_IDS } from '../../utils/crewRegistryDataMerger';
import { db } from '../../firebase';
import { doc, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import OperationalErrorBoundary from '../common/OperationalErrorBoundary';

export default function DailyDutyGeneratorSuite() {
  const [activeTab, setActiveTab] = useState('DRAFT_GENERATOR');
  const [targetDate, setTargetDate] = useState('2026-08-19');
  const [dayType, setDayType] = useState(() => resolveDayType('2026-08-19'));
  const [isSyncingWithDb, setIsSyncingWithDb] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');
  
  // Real-Time Firebase Context Listeners
  const operationalEngine = useOperationalEngine();
  const auth = useAuth();
  const liveCrewRegistry = operationalEngine?.crewRegistry || [];
  const liveLeaveRequests = operationalEngine?.leaveRequests || [];
  const liveShiftExchanges = operationalEngine?.shiftExchanges || [];
  const liveDeployments = operationalEngine?.deployments || [];
  const currentUser = auth?.currentUser;

  const [localCrewOverrides, setLocalCrewOverrides] = useState({});

  // Active Crew Master: Reads from live Firestore `crewRegistry` with seamless master fallback and strict canonical integer deduplication
  const crewList = useMemo(() => {
    const crewMap = new Map();
    const masterMap = new Map();
    
    // Combine 88 BMRCL TOs + 49 JMD TDs (137 total active operational driving crew)
    const combinedMaster = [
      ...EMPLOYEE_MASTER_REGISTRY,
      ...OFFICIAL_JMD_TD_REGISTRY
    ];

    combinedMaster.forEach(m => {
      const nid = normalizeCanonicalEmpId(m.empId);
      if (nid) masterMap.set(nid, m);
    });

    if (liveCrewRegistry && liveCrewRegistry.length > 0) {
      liveCrewRegistry.forEach(docSnap => {
        const empId = normalizeCanonicalEmpId(docSnap.empId || docSnap.employeeId || docSnap.id);
        if (!empId) return; // Discard corrupted documents with no valid numeric ID
        
        const unified = buildUnifiedEmployeeProfile(empId);
        const masterEmp = masterMap.get(empId);
        const isMasterActive = !!masterEmp || OFFICIAL_PYID_ACTIVE_IDS.has(empId);

        // Partition active vs relieved strictly
        let isRelieved = false;
        let status = 'ACTIVE';
        let activeCrew = true;

        if (docSnap.maternityLeave && docSnap.maternityLeave.active && !docSnap.maternityLeave.actualReportDate) {
          status = 'MATERNITY_LEAVE';
          activeCrew = true;
          isRelieved = false;
        } else if (docSnap.isRelieved === true || docSnap.status === 'RELIEVED' || docSnap.status === 'INACTIVE' || docSnap.activeCrew === false) {
          isRelieved = true;
          status = 'RELIEVED';
          activeCrew = false;
        } else if (docSnap.isRelieved === false || docSnap.status === 'ACTIVE' || docSnap.activeCrew === true) {
          isRelieved = false;
          status = 'ACTIVE';
          activeCrew = true;
        } else {
          isRelieved = !isMasterActive;
          status = isRelieved ? 'RELIEVED' : 'ACTIVE';
          activeCrew = !isRelieved;
        }

        const existing = crewMap.get(empId) || {};

        const cleanDocName = (docSnap.name && !String(docSnap.name).startsWith('Employee #')) ? docSnap.name : null;
        const cleanEmpName = (docSnap.employeeName && !String(docSnap.employeeName).startsWith('Employee #')) ? docSnap.employeeName : null;
        const cleanExistingName = (existing.name && !String(existing.name).startsWith('Employee #')) ? existing.name : null;
        const cleanUnifiedName = (unified.name && !String(unified.name).startsWith('Employee #')) ? unified.name : null;
        const resolvedStaffName = cleanDocName || cleanEmpName || masterEmp?.name || cleanUnifiedName || cleanExistingName || `Staff #${empId}`;

        const merged = {
          ...unified,
          ...existing,
          ...docSnap,
          empId,
          name: resolvedStaffName,
          gender: docSnap.gender || existing.gender || unified.gender,
          role: docSnap.role || existing.role || unified.role,
          isOfficialCC: docSnap.isOfficialCC !== undefined ? docSnap.isOfficialCC : (existing.isOfficialCC !== undefined ? existing.isOfficialCC : unified.isOfficialCC),
          ccWilling: docSnap.ccWilling !== undefined ? docSnap.ccWilling : (existing.ccWilling !== undefined ? existing.ccWilling : unified.ccWilling),
          fixedWo: docSnap.fixedWo || docSnap.weeklyOffDay || existing.fixedWo || unified.fixedWo || 'Sunday',
          status,
          activeCrew,
          isRelieved,
          relievedReason: isRelieved ? (docSnap.relievedReason || existing.relievedReason || unified.relievedReason || 'Working as Station Controller / Transferred from PYID CC') : null,
          ...(localCrewOverrides[empId] || localCrewOverrides[String(empId)] || {})
        };
        crewMap.set(empId, merged);
      });

      // Ensure all master employees (both 88 BMRCL TOs and 49 JMD TDs) are present
      combinedMaster.forEach(masterEmp => {
        if (!masterEmp || !masterEmp.empId) return;
        const empId = normalizeCanonicalEmpId(masterEmp.empId);
        if (!empId) return;
        const localOver = localCrewOverrides[empId] || localCrewOverrides[String(empId)] || {};
        if (localOver.isDeleted === true) return;
        if (!crewMap.has(empId)) {
          const unified = buildUnifiedEmployeeProfile(empId);
          crewMap.set(empId, {
            ...unified,
            ...masterEmp,
            empId,
            ...localOver
          });
        }
      });
    } else {
      combinedMaster.forEach(masterEmp => {
        if (!masterEmp || !masterEmp.empId) return;
        const empId = normalizeCanonicalEmpId(masterEmp.empId);
        if (!empId) return;
        const localOver = localCrewOverrides[empId] || localCrewOverrides[String(empId)] || {};
        if (localOver.isDeleted === true) return;
        if (!crewMap.has(empId)) {
          const unified = buildUnifiedEmployeeProfile(empId);
          crewMap.set(empId, {
            ...unified,
            ...masterEmp,
            empId,
            ...localOver
          });
        }
      });
    }

    return Array.from(crewMap.values()).sort((a, b) => a.empId - b.empId);
  }, [liveCrewRegistry, localCrewOverrides]);

  const [isActiveCrewModalOpen, setIsActiveCrewModalOpen] = useState(false);
  const [isJmdCrewModalOpen, setIsJmdCrewModalOpen] = useState(false);
  const [isRelievedCrewModalOpen, setIsRelievedCrewModalOpen] = useState(false);
  const [isLRDModalOpen, setIsLRDModalOpen] = useState(false);
  const [isCCWillingModalOpen, setIsCCWillingModalOpen] = useState(false);

  // Count staff pending LRD
  const pendingLRDCount = crewList.filter(e => e.lrd && e.lrd.required && (e.lrd.daysCompleted < e.lrd.daysRequired)).length;

  // Operational Requirements State: combines live Firestore leave requests with preloaded items
  const [localRequests, setLocalRequests] = useState([
    {
      id: 'REQ_001',
      type: 'TRAINING',
      date: '2026-08-19',
      empId: 22116,
      empName: 'Nagalinge Gowda M',
      topic: 'Emergency Evacuation Skill Enhancement',
      startTime: '10:00',
      endTime: '13:00',
      location: 'PYID',
      priority: 'HIGH',
      status: 'APPROVED'
    },
    {
      id: 'REQ_002',
      type: 'SPECIAL_DUTY',
      date: '2026-08-19',
      empId: 21083,
      empName: 'Bharathi A',
      topic: 'Pink Duty Profile (Light Daylight/Standby)',
      startTime: '06:00',
      endTime: '14:00',
      location: 'PYID',
      priority: 'CRITICAL',
      status: 'APPROVED'
    }
  ]);

  const activeRequests = useMemo(() => {
    const formattedLiveLeaves = liveLeaveRequests.map(r => ({
      id: r.id || `LEAVE_${r.employeeId}_${r.date || r.startDate}`,
      type: r.type || 'LEAVE',
      leaveType: r.leaveType || 'CL',
      date: r.date || r.startDate || r.fromDate,
      fromDate: r.fromDate || r.startDate || r.date,
      toDate: r.toDate || r.endDate || r.date,
      durationDays: r.durationDays || r.days || 1,
      empId: parseInt(r.employeeId || r.empId, 10) || r.employeeId,
      empName: r.employeeName || r.name,
      reason: r.reason || `${r.leaveType || 'Leave'} Approved in Leave Desk`,
      priority: r.priority || 'HIGH',
      status: r.status || 'APPROVED'
    }));

    const combined = [...localRequests];
    formattedLiveLeaves.forEach(liveReq => {
      if (!combined.some(c => c.id === liveReq.id || (c.empId === liveReq.empId && c.date === liveReq.date))) {
        combined.push(liveReq);
      }
    });
    return combined;
  }, [liveLeaveRequests, localRequests]);

  // Week-off Overrides State
  const [woOverrides, setWoOverrides] = useState({});

  const activeCandidateDrivingCrew = useMemo(() => {
    return crewList.filter(e => {
      if (!e) return false;
      const canonicalId = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
      if (!canonicalId) return false;
      const isRelieved = e.status === 'RELIEVED' || e.isRelieved === true || e.status === 'INACTIVE' || e.activeCrew === false;
      if (isRelieved) return false;
      if (e.isOfficialCC === true || e.role === 'OFFICIAL_CREW_CONTROLLER' || e.specialProfile === 'CC') return false;
      if (e.role === 'Official ALS' || e.role === 'Official GCC' || e.role === 'STATION_CONTROLLER') return false;
      if ([20726, 20038, 20037, 20018, 20019, 20057, 20087].includes(canonicalId)) return false;
      return e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active) || OFFICIAL_PYID_ACTIVE_IDS.has(canonicalId);
    });
  }, [crewList]);

  const activeCount = activeCandidateDrivingCrew.length;
  const jmdCount = activeCandidateDrivingCrew.filter(e => String(e.empId || '').startsWith('8')).length;
  const bmrclCount = Math.max(0, activeCount - jmdCount);
  const relievedCount = crewList.filter(e => e.status === 'RELIEVED' || e.isRelieved || e.status === 'INACTIVE' || e.activeCrew === false).length;

  // Handlers with Live Firestore Persistence
  const handleAddNewStaff = async (newStaff) => {
    const strId = String(newStaff.empId).trim();
    setLocalCrewOverrides(prev => ({
      ...prev,
      [strId]: { ...(prev[strId] || {}), ...newStaff }
    }));
    try {
      const docRef = doc(db, 'crewRegistry', `crew_${newStaff.empId}`);
      await setDoc(docRef, { ...newStaff, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn("Firestore crew write error (offline fallback active):", err);
    }
  };

  const handleUpdateStaffLRD = async (empId, lrdUpdate) => {
    const strId = String(empId).trim();
    setLocalCrewOverrides(prev => ({
      ...prev,
      [strId]: { ...(prev[strId] || {}), lrd: { ...(prev[strId]?.lrd || {}), ...lrdUpdate } }
    }));
    try {
      const docRef = doc(db, 'crewRegistry', `crew_${empId}`);
      await setDoc(docRef, { ...lrdUpdate, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn("Firestore LRD write error:", err);
    }
  };

  const handleUpdateCrewStatus = async (empId, statusUpdate) => {
    const strId = String(empId).trim();
    setLocalCrewOverrides(prev => ({
      ...prev,
      [strId]: { ...(prev[strId] || {}), ...statusUpdate }
    }));

    try {
      const docRef = doc(db, 'crewRegistry', `crew_${empId}`);
      await setDoc(docRef, { ...statusUpdate, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.warn("Firestore crew status update error:", err);
    }
  };

  const handleBatchUpdateCrewStatus = async (updatesList) => {
    // updatesList: [{ empId, ...statusUpdates }]
    setLocalCrewOverrides(prev => {
      const next = { ...prev };
      updatesList.forEach(u => {
        const strId = String(u.empId).trim();
        next[strId] = { ...(next[strId] || {}), ...u };
      });
      return next;
    });

    try {
      const batch = writeBatch(db);
      updatesList.forEach(u => {
        const docRef = doc(db, 'crewRegistry', `crew_${u.empId}`);
        batch.set(docRef, { ...u, updatedAt: serverTimestamp() }, { merge: true });
      });
      await batch.commit();
      setSyncStatusMsg(`✅ Updated ${updatesList.length} crew status records in Firestore!`);
      setTimeout(() => setSyncStatusMsg(''), 3000);
    } catch (err) {
      console.warn("Firestore batch crew update error:", err);
    }
  };

  const handleUpdateCrewList = (updatedList) => {
    setLocalCrewOverrides(prev => {
      const next = { ...prev };
      (updatedList || []).forEach(u => {
        const strId = String(u.empId).trim();
        next[strId] = { ...(next[strId] || {}), ...u };
      });
      return next;
    });
  };

  const handleAddRequest = async (req) => {
    setLocalRequests([req, ...localRequests]);
    try {
      const reqId = req.id || `REQ_${Date.now()}`;
      const docRef = doc(db, 'leave_requests', reqId);
      await setDoc(docRef, {
        ...req,
        employeeId: String(req.empId),
        employeeName: req.empName,
        createdAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn("Firestore leave request write error:", err);
    }
  };

  const handleDeleteRequest = async (id) => {
    setLocalRequests(localRequests.filter(r => r.id !== id));
    try {
      const docRef = doc(db, 'leave_requests', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.warn("Firestore leave request delete error:", err);
    }
  };

  const handleOverrideWO = (empId, overrideData) => {
    setWoOverrides({
      ...woOverrides,
      [empId]: overrideData
    });
  };

  // Sync / Unify Database & Purge Duplicates action
  const handleSyncDatabase = async () => {
    setIsSyncingWithDb(true);
    setSyncStatusMsg('Merging employee profiles and purging duplicate documents from Firestore...');
    try {
      const res = await purgeDuplicateFirestoreCrewDocuments();
      setSyncStatusMsg(`✅ Database Cleaned! Purged ${res.totalDuplicatesDeleted} duplicates. Total clean unique crew: ${res.canonicalUniqueCount}.`);
      setTimeout(() => setSyncStatusMsg(''), 6000);
    } catch (err) {
      console.error("Sync error:", err);
      setSyncStatusMsg(`Sync error: ${err.message}`);
      setTimeout(() => setSyncStatusMsg(''), 5000);
    } finally {
      setIsSyncingWithDb(false);
    }
  };

  // Add Newly Reported Train Operator to PYID CC and Firestore
  const handleAddNewCrewMember = async (newMember) => {
    const strId = String(newMember.empId).trim();
    setLocalCrewOverrides(prev => ({
      ...prev,
      [strId]: { ...(prev[strId] || {}), ...newMember }
    }));

    try {
      const docRef = doc(db, 'crewRegistry', `crew_${newMember.empId}`);
      await setDoc(docRef, { ...newMember, updatedAt: serverTimestamp() }, { merge: true });
      setSyncStatusMsg(`✅ Operator ${newMember.name} (#${newMember.empId}) successfully registered and saved to Firestore crewRegistry!`);
      setTimeout(() => setSyncStatusMsg(''), 4000);
    } catch (err) {
      console.warn("Firestore error adding new crew member:", err);
    }
  };

  // Modify Staff Member (Name, Emp ID, Gender, WO, Profile, etc.)
  const handleModifyCrewMember = async (oldEmpId, updatedMember) => {
    const oldStrId = String(oldEmpId).trim();
    const newEmpId = normalizeCanonicalEmpId(updatedMember.empId) || updatedMember.empId;
    const newStrId = String(newEmpId).trim();

    setLocalCrewOverrides(prev => {
      const next = { ...prev };
      if (oldStrId !== newStrId) {
        // Mark old id as replaced/deleted in local overrides
        next[oldStrId] = { isRelieved: true, status: 'RELIEVED', isDeleted: true, activeCrew: false };
      }
      next[newStrId] = {
        ...(next[newStrId] || {}),
        ...updatedMember,
        empId: newEmpId,
        activeCrew: updatedMember.activeCrew !== false,
        isRelieved: updatedMember.isRelieved === true,
        isDeleted: false
      };
      return next;
    });

    try {
      const batch = writeBatch(db);
      if (oldStrId !== newStrId) {
        batch.delete(doc(db, 'crewRegistry', `crew_${oldEmpId}`));
        batch.delete(doc(db, 'crewRegistry', oldStrId));
      }
      const newDocRef = doc(db, 'crewRegistry', `crew_${newEmpId}`);
      batch.set(newDocRef, {
        ...updatedMember,
        empId: newEmpId,
        employeeId: String(newEmpId),
        name: updatedMember.name,
        employeeName: updatedMember.name,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await batch.commit();
      setSyncStatusMsg(`✅ Updated details for ${updatedMember.name} (#${newEmpId}) in Firestore!`);
      setTimeout(() => setSyncStatusMsg(''), 4000);
    } catch (err) {
      console.warn("Firestore modify crew error:", err);
    }
  };

  // Permanently Delete Staff Record
  const handleDeleteCrewMember = async (empId) => {
    const strId = String(empId).trim();
    setLocalCrewOverrides(prev => ({
      ...prev,
      [strId]: {
        isRelieved: true,
        status: 'RELIEVED',
        activeCrew: false,
        isDeleted: true,
        relievedReason: 'Removed / Deleted from PYID Registry'
      }
    }));

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'crewRegistry', `crew_${empId}`));
      batch.delete(doc(db, 'crewRegistry', strId));
      await batch.commit();
      setSyncStatusMsg(`🗑️ Staff #${empId} permanently deleted from registry and Firestore!`);
      setTimeout(() => setSyncStatusMsg(''), 4000);
    } catch (err) {
      console.warn("Firestore delete crew error:", err);
    }
  };

  const navTabs = [
    { id: 'DRAFT_GENERATOR', label: 'AI Duty Generator', icon: Sparkles, badge: 'LIVE', color: 'blue' },
    { id: 'NEXT_DAY_REQ', label: 'Requirements', icon: Calendar, badge: activeRequests.length, color: 'amber' },
    { id: 'WEEK_OFF_MGR', label: 'Week-Off Control', icon: Lock, badge: null, color: 'purple' },
    { id: 'NIGHT_BALANCER', label: 'Night Balance (26d)', icon: Moon, badge: '6/6', color: 'indigo' },
    { id: 'HISTORY_INTEL', label: 'History (90d)', icon: History, badge: null, color: 'teal' }
  ];

  const tabColorMap = {
    blue: 'bg-blue-600 text-white shadow-blue-600/30',
    amber: 'bg-amber-600 text-white shadow-amber-600/30',
    purple: 'bg-purple-600 text-white shadow-purple-600/30',
    indigo: 'bg-indigo-600 text-white shadow-indigo-600/30',
    teal: 'bg-teal-600 text-white shadow-teal-600/30',
  };

  const tabDotMap = {
    blue: 'bg-blue-400',
    amber: 'bg-amber-400',
    purple: 'bg-purple-400',
    indigo: 'bg-indigo-400',
    teal: 'bg-teal-400',
  };

  const dutyCount = DAY_TYPE_PROFILES[dayType]?.totalDuties || 79;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      
      {/* ═══════════════════════════════════════════════════════════
          HERO HEADER — Gradient Banner with Branding + Live Stats
      ═══════════════════════════════════════════════════════════ */}
      <div className="relative bg-gradient-to-br from-slate-900 via-blue-950/40 to-slate-900 border-b border-blue-500/20 shadow-2xl overflow-hidden">
        {/* Background decorative blur */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-72 h-72 bg-blue-600/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/4 w-48 h-48 bg-indigo-600/5 rounded-full blur-2xl" />
        </div>

        <div className="relative px-4 sm:px-6 lg:px-8 pt-5 pb-4 space-y-4">
          
          {/* Top Row: Logo + Title + Date Control + Sync */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            
            {/* Brand */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-14 h-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
                  <Sparkles className="w-7 h-7 text-white" />
                </div>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    BMRCL AI Daily Duty Generator
                  </h1>
                  <span className="text-[10px] px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full font-mono font-bold flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    FIRESTORE LIVE
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-blue-500/15 text-blue-300 border border-blue-500/30 rounded-full font-mono font-bold flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> Ultra-Advanced
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Peenya Industry Depot · Line 2 (Green Line) · Reactive Roster Engine
                </p>
              </div>
            </div>

            {/* Right Controls: Date + DayType + Duties + Sync */}
            <div className="flex flex-wrap items-center gap-3">
              
              {/* Date + Day-Type Control Card */}
              <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm border border-slate-700/80 rounded-2xl px-4 py-2.5 shadow-lg">
                <Calendar className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Operating Date</span>
                  <input 
                    type="date" 
                    value={targetDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setTargetDate(newDate);
                      const autoDt = resolveDayType(newDate);
                      setDayType(autoDt);
                    }}
                    className="bg-transparent border-0 text-white font-mono text-sm font-black focus:ring-0 focus:outline-none cursor-pointer"
                  />
                </div>
                <div className="w-px h-8 bg-slate-700" />
                <div className="flex flex-col">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Schedule Type</span>
                  <select
                    value={dayType}
                    onChange={(e) => setDayType(e.target.value)}
                    className="bg-transparent border-0 text-emerald-400 text-xs font-mono font-black focus:outline-none cursor-pointer"
                  >
                    <option value="WEEKDAY">WEEKDAY (79)</option>
                    <option value="MON">MON (80)</option>
                    <option value="SAT">SAT & GH (74)</option>
                    <option value="SUN">SUN (65)</option>
                    <option value="GH">GH (74)</option>
                  </select>
                </div>
                <span className="text-[11px] px-2 py-1 bg-blue-950 border border-blue-500/30 text-blue-300 font-mono font-bold rounded-xl">
                  {dutyCount} Duties
                </span>
              </div>

              {/* Cloud Firestore Sync Button */}
              <button
                onClick={handleSyncDatabase}
                disabled={isSyncingWithDb}
                className="px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-600/60 rounded-2xl flex items-center gap-2 text-xs text-slate-300 font-bold transition-all shadow-sm hover:border-blue-500/40 hover:text-blue-300"
                title="Merge and synchronize employee profiles into Firestore crewRegistry"
              >
                <Database className={`w-4 h-4 ${isSyncingWithDb ? 'animate-spin text-blue-400' : 'text-slate-400'}`} />
                {isSyncingWithDb ? 'Syncing...' : 'Sync DB'}
              </button>
            </div>
          </div>

          {/* Sync Status Banner */}
          {syncStatusMsg && (
            <div className="p-3 bg-blue-950/70 border border-blue-500/40 rounded-2xl text-xs text-blue-200 flex items-center gap-2 shadow-lg">
              <Database className="w-4 h-4 text-blue-400 animate-pulse flex-shrink-0" />
              <span>{syncStatusMsg}</span>
            </div>
          )}

          {/* ─── QUICK ACTION CARDS STRIP ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

            {/* Card 1: Active TOs (BMRCL) */}
            <button
              onClick={() => setIsActiveCrewModalOpen(true)}
              className="group relative bg-slate-900/80 hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-3.5 flex items-center gap-3 transition-all shadow-md hover:shadow-emerald-500/10 text-left"
              title="Manage active BMRCL Train Operators"
            >
              <div className="w-10 h-10 bg-emerald-500/15 group-hover:bg-emerald-500/25 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider">Active TOs (BMRCL)</div>
                <div className="text-xl font-black text-white leading-none mt-0.5">{bmrclCount}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Train Operators</div>
              </div>
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500" />
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
            </button>

            {/* Card 2: JMD TDs */}
            <button
              onClick={() => setIsJmdCrewModalOpen(true)}
              className="group relative bg-slate-900/80 hover:bg-amber-950/40 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-3.5 flex items-center gap-3 transition-all shadow-md hover:shadow-amber-500/10 text-left"
              title="Manage JMD Contract Train Drivers (8-Series)"
            >
              <div className="w-10 h-10 bg-amber-500/15 group-hover:bg-amber-500/25 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                <Briefcase className="w-5 h-5 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] text-amber-400 uppercase font-bold tracking-wider">JMD Contract TDs</div>
                <div className="text-xl font-black text-white leading-none mt-0.5">{jmdCount}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Driving Operators</div>
              </div>
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 transition-colors" />
            </button>

            {/* Card 3: Relieved / SC */}
            <button
              onClick={() => setIsRelievedCrewModalOpen(true)}
              className="group relative bg-slate-900/80 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-500/50 rounded-2xl p-3.5 flex items-center gap-3 transition-all shadow-md hover:shadow-rose-500/10 text-left"
              title="View Relieved crew and Station Controllers"
            >
              <div className="w-10 h-10 bg-rose-500/15 group-hover:bg-rose-500/25 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                <UserX className="w-5 h-5 text-rose-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] text-rose-400 uppercase font-bold tracking-wider">Relieved / SC Crew</div>
                <div className="text-xl font-black text-white leading-none mt-0.5">{relievedCount}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Off Operational Pool</div>
              </div>
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-slate-600 group-hover:text-rose-400 transition-colors" />
            </button>

            {/* Card 4: LRD Safety Gate */}
            <button
              onClick={() => setIsLRDModalOpen(true)}
              className={`group relative rounded-2xl p-3.5 flex items-center gap-3 transition-all shadow-md text-left border ${
                pendingLRDCount > 0
                  ? 'bg-amber-950/40 border-amber-500/50 hover:bg-amber-900/50 hover:shadow-amber-500/10'
                  : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/60'
              }`}
              title="Manage newly reported staff and LRD Refresher Status"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                pendingLRDCount > 0 ? 'bg-amber-500/25' : 'bg-orange-500/15 group-hover:bg-orange-500/25'
              }`}>
                <Compass className={`w-5 h-5 ${pendingLRDCount > 0 ? 'text-amber-400 animate-pulse' : 'text-orange-400'}`} />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] text-orange-400 uppercase font-bold tracking-wider">LRD Safety Gate</div>
                <div className="text-xl font-black text-white leading-none mt-0.5">
                  {pendingLRDCount > 0 ? pendingLRDCount : '✓'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {pendingLRDCount > 0 ? 'Restricted Operators' : 'All Qualified'}
                </div>
              </div>
              {pendingLRDCount > 0 && (
                <span className="absolute top-2 right-2 text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-black">
                  ⚠ {pendingLRDCount}
                </span>
              )}
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-slate-600 group-hover:text-orange-400 transition-colors" />
            </button>

            {/* Card 5: CC Roster Desk */}
            <button
              onClick={() => setIsCCWillingModalOpen(true)}
              className="group relative bg-slate-900/80 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-3.5 flex items-center gap-3 transition-all shadow-md hover:shadow-blue-500/10 text-left"
              title="Configure Crew Controllers and CC-Willing Relief Pool"
            >
              <div className="w-10 h-10 bg-blue-500/15 group-hover:bg-blue-500/25 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors">
                <Layers className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] text-blue-400 uppercase font-bold tracking-wider">CC Roster Desk</div>
                <div className="text-xl font-black text-white leading-none mt-0.5">7</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Official CCs</div>
              </div>
              <ChevronRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 transition-colors" />
            </button>
          </div>

          {/* ─── TAB NAVIGATION ─── */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1">
            {navTabs.map(tab => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                      ? `${tabColorMap[tab.color]} shadow-lg`
                      : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="relative">
                    <Icon className="w-4 h-4" />
                    {!isActive && tab.badge !== null && (
                      <span className={`absolute -top-1.5 -right-1.5 w-1.5 h-1.5 rounded-full ${tabDotMap[tab.color]}`} />
                    )}
                  </div>
                  <span>{tab.label}</span>
                  {tab.badge !== null && tab.badge !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-black ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Total crew pill at end */}
            <div className="ml-auto flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-xl">
              <Activity className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-[11px] font-mono font-bold text-slate-400">
                {bmrclCount + jmdCount} <span className="text-slate-600">Operational</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MAIN TAB VIEWPORT
      ═══════════════════════════════════════════════════════════ */}
      <div className="p-4 sm:p-6 lg:p-8">
        <OperationalErrorBoundary>
          <div>
            {activeTab === 'DRAFT_GENERATOR' && (
              <GeneratorDraftConsole
                targetDate={targetDate}
                setTargetDate={setTargetDate}
                dayType={dayType}
                setDayType={setDayType}
                crewList={crewList}
                activeRequests={activeRequests}
                woOverrides={woOverrides}
                onOpenActiveCrewModal={() => setIsActiveCrewModalOpen(true)}
                onOpenCCWillingModal={() => setIsCCWillingModalOpen(true)}
                onUpdateCrewStatus={handleUpdateCrewStatus}
              />
            )}

            {activeTab === 'NEXT_DAY_REQ' && (
              <NextDayRequirementsCenter
                targetDate={targetDate}
                crewList={crewList}
                activeRequests={activeRequests}
                onRequestAdded={handleAddRequest}
                onRequestDeleted={handleDeleteRequest}
              />
            )}

            {activeTab === 'WEEK_OFF_MGR' && (
              <WeekOffControlManager
                targetDate={targetDate}
                crewList={crewList}
                onUpdateCrewList={handleUpdateCrewList}
                woOverrides={woOverrides}
                onOverrideWO={handleOverrideWO}
              />
            )}

            {activeTab === 'NIGHT_BALANCER' && (
              <NightShiftBalancingDesk
                targetDate={targetDate}
                crewList={crewList}
              />
            )}

            {activeTab === 'HISTORY_INTEL' && (
              <DutyHistoryIntelligence
                crewList={crewList}
              />
            )}
          </div>
        </OperationalErrorBoundary>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          MODALS (All logic preserved exactly)
      ═══════════════════════════════════════════════════════════ */}

      {/* Active Crew Management Console */}
      <ActiveCrewManagerModal
        isOpen={isActiveCrewModalOpen}
        onClose={() => setIsActiveCrewModalOpen(false)}
        crewList={crewList}
        onUpdateCrewStatus={handleUpdateCrewStatus}
        onBatchUpdateCrewStatus={handleBatchUpdateCrewStatus}
        onAddNewCrewMember={handleAddNewCrewMember}
        onOpenRelievedModal={() => setIsRelievedCrewModalOpen(true)}
        onOpenJmdModal={() => setIsJmdCrewModalOpen(true)}
      />

      {/* Dedicated JMD TD (Train Drivers) Contract Console */}
      <JmdCrewManagerModal
        isOpen={isJmdCrewModalOpen}
        onClose={() => setIsJmdCrewModalOpen(false)}
        crewList={crewList}
        onUpdateCrewStatus={handleUpdateCrewStatus}
        onBatchUpdateCrewStatus={handleBatchUpdateCrewStatus}
        onAddNewCrewMember={handleAddNewCrewMember}
        onOpenActiveCrewModal={() => setIsActiveCrewModalOpen(true)}
      />

      {/* Dedicated Relieved Crew & Station Controllers Console */}
      <RelievedCrewManagerModal
        isOpen={isRelievedCrewModalOpen}
        onClose={() => setIsRelievedCrewModalOpen(false)}
        crewList={crewList}
        onUpdateCrewStatus={handleUpdateCrewStatus}
        onBatchUpdateCrewStatus={handleBatchUpdateCrewStatus}
        onOpenActiveCrewModal={() => setIsActiveCrewModalOpen(true)}
      />

      {/* New Staff Induction & LRD Safety Gate Modal */}
      <NewStaffLRDModal
        isOpen={isLRDModalOpen}
        onClose={() => setIsLRDModalOpen(false)}
        crewList={crewList}
        onAddNewStaff={handleAddNewStaff}
        onUpdateStaffLRD={handleUpdateStaffLRD}
      />

      {/* CC-Willing Relief Pool Modal */}
      <CCWillingDeskModal
        isOpen={isCCWillingModalOpen}
        onClose={() => setIsCCWillingModalOpen(false)}
        crewList={crewList}
        onUpdateCrewStatus={handleUpdateCrewStatus}
        onDeleteCrewMember={handleDeleteCrewMember}
        onModifyCrewMember={handleModifyCrewMember}
        onAddNewCrewMember={handleAddNewCrewMember}
      />
    </div>
  );
}

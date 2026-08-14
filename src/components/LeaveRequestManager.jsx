/* eslint-disable react/prop-types */
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, updateDoc, 
  addDoc, deleteDoc, serverTimestamp, setDoc, getDocs, getDoc, where, writeBatch 
} from 'firebase/firestore';
import { 
  Check, X, FileText, User, AlertCircle, Calendar, ShieldAlert, 
  Download, Plus, Trash2, Users, Flame, Info, CheckCircle, Search, 
  RefreshCw, BarChart2, ShieldCheck, ChevronLeft, ChevronRight, Sliders, 
  CalendarDays, PlusCircle, Sparkles, AlertOctagon, Printer, HelpCircle 
} from 'lucide-react';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { useAuth } from '../context/AuthContext';

// Normalize duty ID: pad single digits to match Firestore doc ID format "01"
const normalizeDutyId = (raw) => {
  const s = String(raw || '').trim();
  return ['1','2','3','4','5','6','7','8','9'].includes(s) ? '0' + s : s;
};

// 30+ Configurable Status Options
const STATUS_OPTIONS = [
  "DUTY", "WO", "CL", "EL", "HPL", "ML", "MATERNITY", "PATERNITY", 
  "CHILD CARE LEAVE", "COMPENSATORY OFF", "RESTRICTED HOLIDAY", 
  "SPECIAL CASUAL LEAVE", "STUDY LEAVE", "TRAINING", "OFFICIAL DUTY", 
  "DEPUTATION", "SUSPENSION", "ABSENT (AB)", "NOT REPORTING (NR)", 
  "PRO", "RD3", "CC1", "CC2", "CC3", "EXTRA", "RESERVE", "RELIEF", 
  "OJT", "REST", "HOLIDAY"
];

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function LeaveRequestManager({ userRole }) {
  const { currentUser, userProfile } = useAuth();
  const isTrainOperator = !['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_SS', 'ADMIN_Station_Superintendent', 'JMD'].includes(userRole) && 
                          !['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_SS', 'ADMIN_Station_Superintendent', 'JMD'].includes(userProfile?.role) && 
                          !String(userRole || '').toLowerCase().includes('admin') && 
                          !String(userProfile?.role || '').toLowerCase().includes('admin') && (
                            userRole === 'TRAIN_OPERATOR' || 
                            userRole === 'STATION_CONTROLLER' || 
                            userRole === 'VIEWER' ||
                            String(userRole || '').toLowerCase().includes('operator') ||
                            String(userRole || '').toLowerCase().includes('controller') ||
                            String(userProfile?.designation || '').toLowerCase().includes('operator') ||
                            String(userProfile?.designation || '').toLowerCase().includes('controller') ||
                            String(userProfile?.designation || '').toLowerCase().includes('viewer')
                          );
  
  // Tab State: REQUESTS, WEEKLY_OFF, PLANNER, DAILY_STATUS, CALENDAR, BALANCE, BLACKOUTS, REPORTS, DASHBOARD
  const [activeTab, setActiveTab] = useState('REQUESTS');
  
  // Modification States for Train Operators
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [editRequestForm, setEditRequestForm] = useState({
    startDate: '',
    endDate: '',
    leaveType: 'CL',
    reason: ''
  });
  
  // Base State preserved from original
  const [requests, setRequests] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [extraOps, setExtraOps] = useState([]);
  const [blackoutDates, setBlackoutDates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Enhanced State variables
  const [crewData, setCrewData] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState('Monday');
  const [weeklyOffs, setWeeklyOffs] = useState([]);
  const [dailyStatus, setDailyStatus] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  
  // Filtering & Search
  const [searchFilter, setSearchFilter] = useState('');
  const [depotFilter, setDepotFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dutyFilter, setDutyFilter] = useState('');

  // Admin Overrides
  const [overridePermission, setOverridePermission] = useState(false);
  const [balanceEditId, setBalanceEditId] = useState(null);
  const [balanceForm, setBalanceForm] = useState({ cl: 15, el: 30, hpl: 20, ml: 180, compOff: 5, study: 10, other: 15 });
  const [windowConfig, setWindowConfig] = useState(null);

  // GCC Open Leave Window Edit States
  const [openStartDate, setOpenStartDate] = useState('');
  const [openEndDate, setOpenEndDate] = useState('');
  const [openTargetMonth, setOpenTargetMonth] = useState('');
  const [openIsOpen, setOpenIsOpen] = useState(false);
  const [savingWindow, setSavingWindow] = useState(false);

  useEffect(() => {
    if (windowConfig) {
      setOpenStartDate(windowConfig.startDate || '');
      setOpenEndDate(windowConfig.endDate || '');
      setOpenTargetMonth(windowConfig.targetMonth || '');
      setOpenIsOpen(windowConfig.isOpen || false);
    }
  }, [windowConfig]);

  const handleSaveLeaveWindow = async (e) => {
    e.preventDefault();
    if (!openStartDate || !openEndDate || !openTargetMonth) {
      alert("Please fill all leave window configuration fields.");
      return;
    }
    setSavingWindow(true);
    try {
      await setDoc(doc(db, 'system_config', 'leave_window'), {
        startDate: openStartDate,
        endDate: openEndDate,
        targetMonth: openTargetMonth,
        isOpen: openIsOpen,
        lastUpdated: serverTimestamp()
      }, { merge: true });
      alert("🎉 Leave window configuration saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save configuration: " + err.message);
    } finally {
      setSavingWindow(false);
    }
  };

  // Blackout Date Input State (Preserved)
  const [newBlackout, setNewBlackout] = useState({
    startDate: '',
    endDate: '',
    eventType: 'Festival Rush Days',
    eventName: ''
  });

  // Report Generator State
  const [reportType, setReportType] = useState('Daily Crew Status Report');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  // Sync all required collections in real-time
  useEffect(() => {
    const qRequests = query(collection(db, 'leave_requests'), orderBy('requestDate', 'desc'));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const unsubDeployments = onSnapshot(collection(db, 'crew_daily_deployment'), (snapshot) => {
      setDeployments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubExtra = onSnapshot(collection(db, 'crew_extra_operators'), (snapshot) => {
      setExtraOps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubBlackouts = onSnapshot(collection(db, 'blackout_dates'), (snapshot) => {
      setBlackoutDates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Merged Crew Directory synchronization
    const unsubCrew = onSnapshot(collection(db, 'crewRegistry'), (snapshot) => {
      const localMap = {};
      
      if (snapshot.empty) {
        // Fallback to static array only if database registry is empty
        BMRCL_CREW_REGISTRY.forEach(m => { 
          localMap[String(m.id)] = { 
            ...m, 
            isOperational: true, 
            operationalCrew: 'YES',
            depot: m.id % 2 === 0 ? 'Peenya Depot (PYID)' : 'Challaghatta Depot'
          }; 
        });
      } else {
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const id = String(data.employeeId || doc.id);
          const active = (data.operationalCrew === 'YES' || data.operationalCrew === true) && data.deleted !== true;
          
          if (active) {
            localMap[id] = {
              id,
              name: data.employeeName || data.name || data.empName || '',
              designation: data.designation || 'Station Controller / Train Operator',
              contact: data.contact || '',
              email: data.email || '',
              competencyExpiry: data.competencyExpiry || '',
              isOperational: true,
              operationalCrew: 'YES',
              depot: data.depot || 'Peenya Depot (PYID)'
            };
          }
        });
      }
      setCrewData(Object.values(localMap));
    });

    // Real-time synchronization of Weekly Off, Daily Status, and Leave Balances
    const unsubWeeklyOff = onSnapshot(collection(db, 'weekly_off_planner'), (snap) => {
      setWeeklyOffs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubDailyStatus = onSnapshot(collection(db, 'crew_daily_status'), (snap) => {
      setDailyStatus(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubBalances = onSnapshot(collection(db, 'leave_balances'), (snap) => {
      setLeaveBalances(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubWindow = onSnapshot(doc(db, 'system_config', 'leave_window'), (docSnap) => {
      if (docSnap.exists()) {
        setWindowConfig(docSnap.data());
      }
    });

    return () => {
      unsubRequests();
      unsubDeployments();
      unsubExtra();
      unsubBlackouts();
      unsubCrew();
      unsubWeeklyOff();
      unsubDailyStatus();
      unsubBalances();
      unsubWindow();
    };
  }, []);

  const handleStartEditRequest = (req) => {
    setEditingRequestId(req.id);
    setEditRequestForm({
      startDate: req.startDate || '',
      endDate: req.endDate || '',
      leaveType: req.leaveType || 'CL',
      reason: req.reason || ''
    });
  };

  const handleSaveEditRequest = async (id) => {
    if (!editRequestForm.startDate || !editRequestForm.endDate || !editRequestForm.reason) {
      alert("Please fill all fields.");
      return;
    }
    if (new Date(editRequestForm.endDate) < new Date(editRequestForm.startDate)) {
      alert("End date cannot be before start date.");
      return;
    }
    const allowedStart = windowConfig?.startDate;
    const allowedEnd = windowConfig?.endDate;
    if (allowedStart && allowedEnd) {
      if (editRequestForm.startDate < allowedStart || editRequestForm.endDate > allowedEnd) {
        alert(`⚠️ INVALID LEAVE DATES:\nLeave dates must be strictly within the dates opened by GCC:\nStart: ${allowedStart}\nEnd: ${allowedEnd}`);
        return;
      }
    }
    try {
      await updateDoc(doc(db, 'leave_requests', id), {
        startDate: editRequestForm.startDate,
        endDate: editRequestForm.endDate,
        leaveType: editRequestForm.leaveType,
        reason: editRequestForm.reason,
        requestDate: serverTimestamp() // Refresh priority queue sorting
      });
      setEditingRequestId(null);
      alert("✅ Leave request modified successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to modify request: " + err.message);
    }
  };

  const handleCancelRequest = async (id) => {
    if (!window.confirm("Are you sure you want to cancel and delete this leave request?")) return;
    try {
      await deleteDoc(doc(db, 'leave_requests', id));
      alert("✅ Leave request cancelled and removed.");
    } catch (err) {
      console.error(err);
      alert("Failed to cancel request: " + err.message);
    }
  };

  // Filter Active Crew only (Operational status NO and Station Superintendents are excluded)
  const activeCrew = useMemo(() => {
    return crewData.filter(c => 
      c.operationalCrew !== 'NO' && 
      c.isOperational !== false &&
      (c.designation?.toLowerCase().includes('operator') || c.designation?.toLowerCase().includes('controller')) &&
      !c.designation?.toLowerCase().includes('superintendent') &&
      !c.designation?.toLowerCase().includes('ss')
    );
  }, [crewData]);

  // Derived stats
  const totalOnLeave = deployments.filter(d => d.status === 'ON_LEAVE').length;
  const totalAvailableCrew = activeCrew.length - totalOnLeave;

  // 1. Leave Priority Details
  const getPriorityDetails = (req) => {
    let score = 50;
    let label = 'Optional / Other Leave';
    let color = 'text-slate-450 bg-slate-900 border-slate-800';

    const type = String(req.leaveType || '').toUpperCase();

    if (type === 'ML') {
      score = 95;
      label = 'Medical Leave (ML)';
      color = 'text-amber-400 bg-amber-950/50 border-amber-800';
    } else if (type === 'MATERNITY') {
      score = 90;
      label = 'Maternity Leave (MatL)';
      color = 'text-fuchsia-450 bg-fuchsia-950/50 border-fuchsia-800';
    } else if (type === 'SCL') {
      score = 85;
      label = 'Special Casual Leave (SCL)';
      color = 'text-purple-405 bg-purple-950/50 border-purple-800';
    } else if (type === 'PL') {
      score = 80;
      label = 'Paternity Leave (PL)';
      color = 'text-indigo-405 bg-indigo-950/50 border-indigo-800';
    } else if (type === 'CCL') {
      score = 75;
      label = 'Child Care Leave (CCL)';
      color = 'text-yellow-505 bg-yellow-955/30 border-yellow-805';
    } else if (type === 'EL') {
      score = 70;
      label = 'Earned Leave (EL)';
      color = 'text-cyan-405 bg-cyan-950/50 border-cyan-800';
    } else if (type === 'CL') {
      score = 60;
      label = 'Casual Leave (CL)';
      color = 'text-emerald-405 bg-emerald-500/10 border-emerald-500/20';
    } else if (type === 'CO') {
      score = 55;
      label = 'Compensatory Off (CO)';
      color = 'text-orange-405 bg-orange-950/30 border-orange-850';
    } else if (type === 'STUDY') {
      score = 45;
      label = 'Study Leave (StL)';
      color = 'text-blue-405 bg-blue-955/30 border-blue-805';
    } else if (type === 'EOL') {
      score = 40;
      label = 'Extraordinary Leave (EOL)';
      color = 'text-rose-405 bg-rose-950/30 border-rose-850';
    } else if (type === 'OL') {
      score = 50;
      label = 'Optional Leave (OL)';
      color = 'text-slate-400 bg-slate-950 border-slate-800';
    }

    if (req.requestDate) {
      const now = new Date().getTime();
      const reqTime = req.requestDate?.toMillis ? req.requestDate.toMillis() : now;
      const ageInDays = (now - reqTime) / (1000 * 60 * 60 * 24);
      score += Math.min(ageInDays || 0, 10);
    }

    if (req.certificateUploaded && type === 'ML') {
      score += 5;
    }

    return { score: Math.round(score), label, color };
  };

  // 2. AI Recommendation Logic (Preserved & Enhanced with Standbys & Swaps)
  const getRecommendation = (req) => {
    const allowedStart = windowConfig?.startDate;
    const allowedEnd = windowConfig?.endDate;
    if (allowedStart && allowedEnd) {
      if (req.startDate < allowedStart || req.endDate > allowedEnd) {
        return { 
          action: 'REJECT', 
          reason: 'Date range should be within allocated dates.',
          confidence: 100
        };
      }
    }

    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    
    const activeBlackout = blackoutDates.find(bo => {
      const boStart = new Date(bo.startDate);
      const boEnd = new Date(bo.endDate || bo.startDate);
      return (start <= boEnd && end >= boStart);
    });

    const isUrgentLeave = ['ML', 'MATERNITY', 'SCL'].includes(req.leaveType);

    if (activeBlackout && !isUrgentLeave) {
      return { 
        action: 'REJECT', 
        reason: `OCC Blackout date active: ${activeBlackout.eventName} (${activeBlackout.eventType})`,
        confidence: 94
      };
    }

    const balance = getLeaveBalance(req.empId, req.leaveType);
    if (balance <= 0) {
      return {
        action: 'REJECT',
        reason: `Insufficient balance for leave type ${req.leaveType} (Current: ${balance})`,
        confidence: 98
      };
    }

    // Availability validation check
    const standbysAvailable = extraOps.filter(o => o.availabilityStatus === 'AVAILABLE' || o.status === 'AVAILABLE').length;
    if (standbysAvailable < 3 && !isUrgentLeave) {
      return { 
        action: 'WAITLIST', 
        reason: `Low Standby Pool: Only ${standbysAvailable} extra standbys available. Suggest Shift Exchange or Standby relief.`,
        confidence: 85
      };
    }

    if (isUrgentLeave) {
      return { 
        action: 'USE EXTRA OPERATOR', 
        reason: 'Urgent Medical/Special Request. Sufficient Extra Operators available for stand-by coverage.',
        confidence: 90
      };
    }

    return { 
      action: 'APPROVE', 
      reason: 'Standard verification: healthy standby operators pool & positive balance confirmed.',
      confidence: 95
    };
  };

  // Conflict Resolution Sorter (Preserved)
  const resolvedRequests = useMemo(() => {
    const pending = requests.filter(r => !r.status || r.status === 'PENDING');
    const resolved = requests.filter(r => r.status && r.status !== 'PENDING');

    const sortedPending = [...pending].sort((a, b) => {
      const priorityA = getPriorityDetails(a);
      const priorityB = getPriorityDetails(b);
      if (priorityB.score !== priorityA.score) return priorityB.score - priorityA.score;
      const dateA = a.requestDate?.toMillis ? a.requestDate.toMillis() : 0;
      const dateB = b.requestDate?.toMillis ? b.requestDate.toMillis() : 0;
      return dateA - dateB;
    });

    return [...sortedPending, ...resolved];
  }, [requests, blackoutDates]);

  // Retrieve leave balance helper
  const getLeaveBalance = (empId, type = 'EL') => {
    const record = leaveBalances.find(b => String(b.empId) === String(empId));
    if (!record) {
      // Default seeds
      if (type === 'EL') return 30;
      if (type === 'CL') return 15;
      if (type === 'HPL') return 20;
      if (type === 'ML') return 180;
      if (type === 'Comp Off') return 5;
      if (type === 'Study') return 10;
      return 15;
    }
    const t = String(type).toLowerCase();
    if (t.includes('el')) return record.el || 0;
    if (t.includes('cl')) return record.cl || 0;
    if (t.includes('hpl')) return record.hpl || 0;
    if (t.includes('ml')) return record.ml || 0;
    if (t.includes('comp') || t.includes('compensatory')) return record.compOff || 0;
    if (t.includes('study')) return record.study || 0;
    return record.other || 0;
  };

  // Operational Validation Engine before saving Daily Status or approving leave
  const validateOperationalConstraints = (empId, status, date) => {
    const errors = [];
    const warnings = [];

    const emp = activeCrew.find(c => String(c.id) === String(empId));
    if (!emp) return { valid: false, errors: ["Operator not found in active crew."] };

    // Check if the date is within allocated dates
    const allowedStart = windowConfig?.startDate;
    const allowedEnd = windowConfig?.endDate;
    if (allowedStart && allowedEnd && status !== 'DUTY') {
      if (date < allowedStart || date > allowedEnd) {
        errors.push("Date range should be within allocated dates.");
      }
    }

    // 1. Competency and Medical validity checks
    if (emp.competencyExpiry) {
      if (new Date(emp.competencyExpiry) < new Date(date)) {
        errors.push(`Competency expired for operator ${emp.name} (Valid till ${emp.competencyExpiry})`);
      }
    }
    const today = new Date();
    const mockMedicalExpiry = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    if (mockMedicalExpiry < new Date(date)) {
      warnings.push(`Medical check upcoming/expired for operator ${emp.name}`);
    }

    // 2. Weekly Off Limits
    if (status === 'WO') {
      const woCountForDay = dailyStatus.filter(s => s.status === 'WO' && s.date === date).length;
      if (woCountForDay >= 20) {
        errors.push(`Maximum Weekly Off Limit (20) reached for ${date}. (Current WO count: ${woCountForDay})`);
      }
    }

    // 3. Minimum Standby operator availability check
    if (status === 'CL' || status === 'EL' || status === 'ML') {
      const activeOps = deployments.filter(d => d.empId && d.empId !== '--' && d.status !== 'ON_LEAVE').length;
      if (activeOps < 20) {
        warnings.push(`Sourcing leave will drop active operations below 20 drivers. standby relief required.`);
      }

      // Balance check
      const bal = getLeaveBalance(empId, status);
      if (bal <= 0) {
        errors.push(`Insufficient leave balance for ${status} (Available: ${bal})`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  };

  // 3. Add Blackout Date (Preserved)
  const handleAddBlackout = async (e) => {
    e.preventDefault();
    if (!newBlackout.startDate || !newBlackout.eventName) {
      alert("Please enter a start date and event name.");
      return;
    }
    try {
      await addDoc(collection(db, 'blackout_dates'), {
        ...newBlackout,
        endDate: newBlackout.endDate || newBlackout.startDate,
        createdAt: serverTimestamp()
      });
      alert("✅ Blackout Date registered.");
      setNewBlackout({
        startDate: '',
        endDate: '',
        eventType: 'Festival Rush Days',
        eventName: ''
      });
    } catch (err) {
      console.error(err);
      alert("Failed to add blackout date.");
    }
  };

  const handleDeleteBlackout = async (id) => {
    if (window.confirm("Remove this blackout date constraint?")) {
      try {
        await deleteDoc(doc(db, 'blackout_dates', id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 4. Approve Leave Request (Preserved & Balance deduction integrated)
  const handleApproveLeave = async (req) => {
    const allowedStart = windowConfig?.startDate;
    const allowedEnd = windowConfig?.endDate;
    if (allowedStart && allowedEnd) {
      if (req.startDate < allowedStart || req.endDate > allowedEnd) {
        alert("Date range should be within allocated dates.");
        return;
      }
    }

    const opVal = validateOperationalConstraints(req.empId, req.leaveType, req.startDate);
    if (!opVal.valid && !overridePermission) {
      alert(`⚠️ OPERATIONAL REJECTION:\n\n${opVal.errors.join("\n")}\n\nCheck 'Override' checkbox if GCC override is authorized.`);
      return;
    }

    try {
      const now = new Date();
      // Deduct balance
      const currentBal = getLeaveBalance(req.empId, req.leaveType);
      const docId = `bal_${req.empId}`;
      const payload = {
        empId: String(req.empId),
        empName: String(req.empName)
      };
      const t = String(req.leaveType).toLowerCase();
      if (t.includes('el')) payload.el = Math.max(0, currentBal - 1);
      else if (t.includes('cl')) payload.cl = Math.max(0, currentBal - 1);
      else if (t.includes('hpl')) payload.hpl = Math.max(0, currentBal - 1);
      else if (t.includes('ml')) payload.ml = Math.max(0, currentBal - 1);
      await setDoc(doc(db, 'leave_balances', docId), payload, { merge: true });

      // Update Leave Request
      await updateDoc(doc(db, 'leave_requests', req.id), {
        status: 'APPROVED',
        approvedBy: userRole || 'Crew Controller',
        approvedTime: serverTimestamp()
      });

      // Update Daily Deployment
      for (const dep of deployments) {
        if (String(dep.empId) === String(req.empId)) {
          const depId = `gcc_deploy_${String(dep.scheduleType || 'weekday').toLowerCase()}_duty_${dep.dutyId}`;
          await updateDoc(doc(db, 'crew_daily_deployment', depId), {
            status: 'ON_LEAVE',
            remarks: `ON LEAVE: ${req.leaveType} approved by CC`
          });
        }
      }

      // Add to crew_daily_status log
      const logId = `status_${req.empId}_${req.startDate}`;
      await setDoc(doc(db, 'crew_daily_status', logId), {
        empId: String(req.empId),
        empName: String(req.empName),
        status: req.leaveType,
        date: req.startDate,
        timestamp: serverTimestamp()
      });

      // Emergency Relief Engine Trigger (Preserved)
      if (req.leaveType === 'ML' || req.leaveType === 'SCL') {
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        await addDoc(collection(db, 'emergency_relief_reports'), {
          incidentTime: timeStr,
          incidentType: 'Staff Shortage',
          originalOperator: {
            employeeId: req.empId,
            employeeName: req.empName,
            dutyId: 'LEAVE',
            signOnTime: '--'
          },
          reliefOperator: {
            employeeId: '--',
            employeeName: 'PENDING',
            currentDuty: 'EXTRA',
            currentLocation: 'PYID'
          },
          reliefReason: `Emergency Leave Incident: ${req.subCategory} for TO ${req.empName}`,
          dutyHours: '0h 0m',
          breakTime: 'Completed',
          recommendationScore: 100,
          recoveryTime: '15 mins',
          timestamp: serverTimestamp()
        });
      }

      alert("✅ Leave Approved. Balances & Daily deployments updated successfully.");
    } catch (err) {
      console.error(err);
      alert("Error approving leave request.");
    }
  };

  const handleRejectLeave = async (id) => {
    try {
      await updateDoc(doc(db, 'leave_requests', id), {
        status: 'REJECTED',
        approvedBy: userRole || 'Crew Controller',
        approvedTime: serverTimestamp()
      });
      alert("❌ Leave Request Rejected.");
    } catch (err) {
      console.error(err);
      alert("Error rejecting leave request.");
    }
  };

  // 5. Weekly Off Save Handler
  const handleSaveWeeklyOff = async (empId, empName, isChecked) => {
    const keyId = `wo_${empId}_${selectedDayOfWeek}`;
    
    if (isChecked) {
      // Check 20 limit rule
      const currentWoCount = weeklyOffs.filter(w => w.dayOfWeek === selectedDayOfWeek).length;
      if (currentWoCount >= 20 && !overridePermission) {
        alert(`⚠️ WEEKLY OFF LIMIT REACHED: 20 employees are already scheduled for off on ${selectedDayOfWeek}. Override option must be checked to authorize.`);
        return;
      }
      
      await setDoc(doc(db, 'weekly_off_planner', keyId), {
        empId: String(empId),
        empName: String(empName),
        dayOfWeek: selectedDayOfWeek,
        timestamp: serverTimestamp()
      });
    } else {
      await deleteDoc(doc(db, 'weekly_off_planner', keyId));
    }
  };

  // 6. Daily Planning Status Dropdown handler
  const handleUpdateDailyStatus = async (empId, empName, newStatus) => {
    const opVal = validateOperationalConstraints(empId, newStatus, selectedDate);
    if (!opVal.valid && !overridePermission) {
      alert(`⚠️ OPERATIONAL RULES VIOLATION:\n\n${opVal.errors.join("\n")}\n\nAuthorise override checks to force update.`);
      return;
    }

    const logId = `status_${empId}_${selectedDate}`;
    try {
      await setDoc(doc(db, 'crew_daily_status', logId), {
        empId: String(empId),
        empName: String(empName),
        status: newStatus,
        date: selectedDate,
        timestamp: serverTimestamp()
      });

      // Roster Synchronizations
      const matchingDeps = deployments.filter(d => String(d.empId) === String(empId));
      for (const dep of matchingDeps) {
        const depId = `gcc_deploy_${String(dep.scheduleType || 'weekday').toLowerCase()}_duty_${dep.dutyId}`;
        
        let updatePayload = {
          status: newStatus === 'DUTY' ? null : newStatus,
          remarks: `Daily planning status updated to ${newStatus}`
        };

        // Align specific duty standbys
        if (["CC1", "CC2", "CC3", "PRO", "RD3", "EXTRA", "RESERVE"].includes(newStatus)) {
          updatePayload.remarks = `Duty overridden to operational standby role: ${newStatus}`;
        }
        
        await updateDoc(doc(db, 'crew_daily_deployment', depId), updatePayload);
      }

      // If Emergency relief, log instantly
      if (newStatus === 'ABSENT (AB)' || newStatus === 'NOT REPORTING (NR)') {
        await addDoc(collection(db, 'emergency_relief_reports'), {
          incidentTime: new Date().toLocaleTimeString(),
          incidentType: 'Absenteeism',
          originalOperator: { employeeId: empId, employeeName: empName, dutyId: 'ABSENT', signOnTime: '--' },
          reliefOperator: { employeeId: '--', employeeName: 'STANDBY', currentDuty: 'EXTRA', currentLocation: 'PYID' },
          reliefReason: `Operational status updated to ${newStatus} for TO ${empName}`,
          dutyHours: '0h 0m',
          breakTime: 'Completed',
          recommendationScore: 95,
          recoveryTime: '10 mins',
          timestamp: serverTimestamp()
        });
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update status: " + err.message);
    }
  };

  // 7. Leave Balance Form Save Handler
  const handleSaveBalance = async (empId, empName) => {
    try {
      await setDoc(doc(db, 'leave_balances', `bal_${empId}`), {
        empId: String(empId),
        empName: String(empName),
        ...balanceForm,
        lastUpdated: serverTimestamp()
      });
      setBalanceEditId(null);
      alert("✅ Balances updated.");
    } catch (err) {
      console.error(err);
    }
  };

  // 8. Custom Reports Builder
  const handleGenerateReport = () => {
    if (!reportStartDate || !reportEndDate) {
      alert("Please select date period range.");
      return;
    }

    let reportData = [];
    const title = `${reportType} (${reportStartDate} to ${reportEndDate})`;

    if (reportType.includes('Leave Register')) {
      reportData = requests.filter(r => {
        return r.startDate >= reportStartDate && r.startDate <= reportEndDate;
      }).map(r => ({
        "Employee ID": r.empId,
        "Employee Name": r.empName,
        "Leave Type": r.leaveType,
        "Duration": `${r.startDate} to ${r.endDate}`,
        "Status": r.status || 'PENDING',
        "Approved By": r.approvedBy || '--'
      }));
    } else if (reportType.includes('Weekly Off')) {
      reportData = weeklyOffs.map(w => ({
        "Employee ID": w.empId,
        "Employee Name": w.empName,
        "Weekly Off Day": w.dayOfWeek,
        "Assigned At": w.timestamp?.toDate ? w.timestamp.toDate().toLocaleString() : '--'
      }));
    } else {
      // General Daily Status Log
      reportData = dailyStatus.filter(s => {
        return s.date >= reportStartDate && s.date <= reportEndDate;
      }).map(s => ({
        "Employee ID": s.empId,
        "Employee Name": s.empName,
        "Operational Status": s.status,
        "Date Logged": s.date
      }));
    }

    if (reportData.length === 0) {
      alert("No matching records found for this period.");
      return;
    }

    // Export CSV
    const headers = Object.keys(reportData[0]);
    let csvRows = [headers.join(",")];
    reportData.forEach(row => {
      csvRows.push(headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(","));
    });

    const blob = new Blob([csvRows.join('\n')], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `${title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 9. Preserved Priority Export (Original function)
  const handleExportCSV = () => {
    const approvedRequests = requests.filter(r => r.status === 'APPROVED' || r.status === 'REJECTED');
    if (approvedRequests.length === 0) {
      alert("No approved or rejected leave request records available to export.");
      return;
    }
    
    const headers = ["Employee ID", "Employee Name", "Leave Type", "Sub Category", "Priority Level", "Priority Score", "Approval Status", "Approved By", "Approval Time"];
    let csvRows = [headers.join(",")];
    
    approvedRequests.forEach(req => {
      const priority = getPriorityDetails(req);
      const row = [
        `"${req.empId || ''}"`,
        `"${req.empName || ''}"`,
        `"${req.leaveType || ''}"`,
        `"${req.subCategory || '--'}"`,
        `"${priority.label}"`,
        `"${priority.score}"`,
        `"${req.status || 'PENDING'}"`,
        `"${req.approvedBy || '--'}"`,
        `"${req.approvedTime?.toDate ? req.approvedTime.toDate().toLocaleString() : req.approvedTime || '--'}"`
      ];
      csvRows.push(row.join(","));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `Leave_Priority_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearOldRequests = async () => {
    if (!window.confirm("Are you sure you want to clear all processed (Approved/Rejected) or past-dated leave requests? This action is irreversible.")) {
      return;
    }
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const toDelete = requests.filter(r => 
        r.status === 'APPROVED' || 
        r.status === 'REJECTED' || 
        r.startDate < todayStr
      );

      if (toDelete.length === 0) {
        alert("No old or processed leave requests found to clear.");
        return;
      }

      const batch = writeBatch(db);
      toDelete.forEach(req => {
        batch.delete(doc(db, 'leave_requests', req.id));
      });
      await batch.commit();
      alert(`Successfully cleared ${toDelete.length} old/processed leave requests.`);
    } catch (err) {
      console.error(err);
      alert("Failed to clear old leave requests: " + err.message);
    }
  };

  // Helper filters
  const filteredCrewGrid = useMemo(() => {
    return activeCrew.filter(c => {
      const matchedStatus = dailyStatus.find(s => String(s.empId) === String(c.id) && s.date === selectedDate);
      const currentStatusVal = matchedStatus ? matchedStatus.status : 'DUTY';
      
      const searchOk = !searchFilter || c.name.toLowerCase().includes(searchFilter.toLowerCase()) || String(c.id).includes(searchFilter);
      const depotOk = depotFilter === 'ALL' || c.depot === depotFilter;
      const statusOk = statusFilter === 'ALL' || currentStatusVal === statusFilter;
      
      const matchedDep = deployments.find(d => normalizeDutyId(d.dutyId) === normalizeDutyId(c.id));
      const dutyOk = !dutyFilter || String(matchedDep?.dutyId || '').includes(dutyFilter);

      return searchOk && depotOk && statusOk && dutyOk;
    });
  }, [activeCrew, dailyStatus, selectedDate, searchFilter, depotFilter, statusFilter, dutyFilter, deployments]);

  // Render Status Color Labels
  const getStatusColorClass = (status) => {
    switch (status) {
      case 'WO': return 'text-purple-400 bg-purple-500/10 border-purple-500/30';
      case 'CL': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'EL': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
      case 'ML': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
      case 'ABSENT (AB)':
      case 'NOT REPORTING (NR)': return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      case 'CC1':
      case 'CC2':
      case 'CC3': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'PRO':
      case 'RD3': return 'text-blue-400 bg-blue-500/10 border-blue-500/30';
      default: return 'text-slate-400 bg-slate-900 border-slate-800';
    }
  };

  if (loading) {
    return (
      <div className="text-slate-550 animate-pulse p-6 bg-slate-900 rounded-xl border border-slate-800 text-center font-mono">
        Loading Enterprise Leave Control Center...
      </div>
    );
  }

  return (
    <div className="font-mono text-slate-200 space-y-6">
      
      {/* 1. Header & Tab Navigation */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl">
        <div>
          <h2 className="text-emerald-400 font-black flex items-center gap-2 text-lg tracking-wider uppercase">
            <Sliders size={20} /> ENTERPRISE LEAVE MANAGEMENT CENTER
          </h2>
          <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-widest">BMRCL Green Line operational crew planner & roster sync</p>
        </div>

        {/* Global override switch */}
        {!isTrainOperator && (
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs">
            <input id="override-authorized" name="leaverequestmanager-i1" 
              type="checkbox" 
              checked={overridePermission}
              onChange={(e) => setOverridePermission(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 h-3.5 w-3.5 cursor-pointer"
            />
            <label htmlFor="override-authorized" className="text-slate-400 font-bold uppercase tracking-wider cursor-pointer">
              GCC/SuperAdmin Override
            </label>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap bg-slate-900 border border-slate-800 rounded-lg p-1 gap-1 w-full text-xs">
        {[
          { id: 'REQUESTS', label: 'Leave Requests' },
          { id: 'BLACKOUTS', label: 'Blackout Dates' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-black rounded tracking-widest transition-colors ${
              activeTab === tab.id 
                ? 'bg-emerald-600 text-slate-950 shadow-md font-extrabold' 
                : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-850'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: REQUESTS (Preserved Priority Queue View) */}
      {activeTab === 'REQUESTS' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Availability stats & Open Leave settings */}
            <div className="space-y-6 xl:col-span-1">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                  <span className="font-bold text-xs uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                    <Users size={16} /> Crew Availability Check
                  </span>
                  <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold px-2 py-0.5 rounded uppercase">
                    Live Roster
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-slate-950 p-3 rounded border border-slate-850">
                    <span className="text-[9px] text-slate-550 block uppercase font-bold tracking-wider">Available Drivers</span>
                    <span className="text-lg font-black text-white">{totalAvailableCrew}</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded border border-slate-850">
                    <span className="text-[9px] text-slate-550 block uppercase font-bold tracking-wider">Extra Standbys</span>
                    <span className="text-lg font-black text-emerald-400">
                      {extraOps.filter(o => o.availabilityStatus === 'AVAILABLE' || o.status === 'AVAILABLE').length}
                    </span>
                  </div>
                </div>
              </div>

              {!isTrainOperator && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                  <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                    <span className="font-bold text-xs uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                      <CalendarDays size={16} /> Open Leave Window Settings
                    </span>
                    <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${
                      openIsOpen ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {openIsOpen ? 'Active / Open' : 'Closed'}
                    </span>
                  </div>
                  
                  <form onSubmit={handleSaveLeaveWindow} className="space-y-4 text-xs font-bold uppercase">
                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="leaverequestmanager-l1">Target Month / Period</label>
                      <input id="leaverequestmanager-i2" name="leaverequestmanager-i2"
                        type="text"
                        placeholder="e.g. AUGUST 2026"
                        value={openTargetMonth}
                        onChange={(e) => setOpenTargetMonth(e.target.value.toUpperCase())}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="leaverequestmanager-l2">Start Date (Open From)</label>
                        <input id="leaverequestmanager-i3" name="leaverequestmanager-i3"
                          type="date"
                          value={openStartDate}
                          onChange={(e) => setOpenStartDate(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="leaverequestmanager-l3">End Date (Open To)</label>
                        <input id="leaverequestmanager-i4" name="leaverequestmanager-i4"
                          type="date"
                          value={openEndDate}
                          onChange={(e) => setOpenEndDate(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="leaverequestmanager-l4">Window Status</label>
                      <select id="leaverequestmanager-i5" name="leaverequestmanager-i5"
                        value={openIsOpen ? 'true' : 'false'}
                        onChange={(e) => setOpenIsOpen(e.target.value === 'true')}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                      >
                        <option value="true">OPEN (Allow TO Leave Submissions)</option>
                        <option value="false">CLOSED (Block Submissions)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={savingWindow}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 text-slate-950 font-black py-3 rounded-lg tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
                    >
                      <PlusCircle size={16} /> {savingWindow ? 'Saving Window...' : 'Save Leave Window Config'}
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Preserved queue */}
            <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                <span className="font-bold text-xs uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                  <ShieldAlert size={16} /> Leave Requests Priority Queue
                </span>
                <div className="flex gap-2">
                  {(userRole === 'CREW_CONTROLLER' || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN_SS' || userRole === 'ADMIN_Station_Superintendent') && (
                    <button 
                      onClick={handleClearOldRequests}
                      className="bg-rose-950 border border-rose-800 hover:bg-rose-900 text-rose-300 font-bold px-3 py-1.5 rounded text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                    >
                      <Trash2 size={12} /> Clear Old Requests
                    </button>
                  )}
                  <button 
                    onClick={handleExportCSV}
                    className="bg-cyan-700 hover:bg-cyan-600 text-white font-bold px-3 py-1.5 rounded text-[10px] uppercase tracking-wider flex items-center gap-1 transition-colors"
                  >
                    <Download size={12} /> Export CSV
                  </button>
                </div>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {resolvedRequests.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 italic text-xs uppercase">No leave requests currently logged.</div>
                ) : (
                  resolvedRequests.map(req => {
                    const priority = getPriorityDetails(req);
                    const rec = getRecommendation(req);
                    const isPending = !req.status || req.status === 'PENDING';
                    return (
                      <div key={req.id} className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                          <div>
                            <span className="font-bold text-slate-100 text-xs block">{req.empName}</span>
                            <span className="text-[9px] text-slate-550">ID: {req.empId} | Leave: <strong className="text-cyan-400">{req.leaveType}</strong></span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${priority.color}`}>
                              Priority: {priority.score}
                            </span>
                            <span className={`text-[8.5px] font-black px-2 py-0.5 rounded border uppercase ${
                              req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              req.status === 'REJECTED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                              'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}>
                              {req.status || 'PENDING'}
                            </span>
                          </div>
                        </div>
                        {editingRequestId === req.id ? (
                          <div className="lg:col-span-3 bg-slate-900 p-4 rounded-xl border border-emerald-500/30 space-y-3">
                            <div className="grid grid-cols-2 gap-3 text-xs font-bold">
                              <div>
                                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1" htmlFor="leaverequestmanager-l5">Start Date</label>
                                <input id="leaverequestmanager-i6" name="leaverequestmanager-i6" 
                                  type="date"
                                  min={windowConfig?.startDate || ''}
                                  max={windowConfig?.endDate || ''}
                                  value={editRequestForm.startDate}
                                  onChange={(e) => setEditRequestForm({ ...editRequestForm, startDate: e.target.value })}
                                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1" htmlFor="leaverequestmanager-l6">End Date</label>
                                <input id="leaverequestmanager-i7" name="leaverequestmanager-i7" 
                                  type="date"
                                  min={editRequestForm.startDate || windowConfig?.startDate || ''}
                                  max={windowConfig?.endDate || ''}
                                  value={editRequestForm.endDate}
                                  onChange={(e) => setEditRequestForm({ ...editRequestForm, endDate: e.target.value })}
                                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200"
                                />
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1" htmlFor="leaverequestmanager-l7">Leave Type</label>
                                <select id="leaverequestmanager-i8" name="leaverequestmanager-i8"
                                  value={editRequestForm.leaveType}
                                  onChange={(e) => setEditRequestForm({ ...editRequestForm, leaveType: e.target.value })}
                                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                                >
                                  <option value="CL">Casual Leave (CL)</option>
                                  <option value="EL">Earned Leave (EL)</option>
                                  <option value="ML">Medical Leave (ML)</option>
                                  <option value="PL">Paternity Leave (PL)</option>
                                  <option value="MATERNITY">Maternity Leave (MatL)</option>
                                  <option value="CCL">Child Care Leave (CCL)</option>
                                  <option value="OL">Optional Leave / Restricted Holiday (OL)</option>
                                  <option value="SCL">Special Casual Leave (SCL)</option>
                                  <option value="CO">Compensatory Off (CO)</option>
                                  <option value="EOL">Extraordinary Leave (EOL)</option>
                                  <option value="STUDY">Study Leave (StL)</option>
                                </select>
                              </div>
                              <div className="col-span-2">
                                <label className="block text-[10px] text-slate-400 uppercase tracking-wider mb-1" htmlFor="leaverequestmanager-l8">Reason for Leave</label>
                                <textarea id="leaverequestmanager-i9" name="leaverequestmanager-i9"
                                  value={editRequestForm.reason}
                                  onChange={(e) => setEditRequestForm({ ...editRequestForm, reason: e.target.value })}
                                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs text-slate-200"
                                  rows={2}
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 justify-end">
                              <button onClick={() => setEditingRequestId(null)} className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded text-[10px] uppercase">Cancel</button>
                              <button onClick={() => handleSaveEditRequest(req.id)} className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-3 py-1.5 rounded text-[10px] uppercase font-black">Save Changes</button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-[10.5px]">
                            <div className="lg:col-span-2 space-y-1">
                              <div className="flex justify-between bg-slate-900 p-1.5 rounded text-[10px]">
                                <span className="text-slate-500">Duration:</span>
                                <span className="text-cyan-400 font-bold">{req.startDate} to {req.endDate}</span>
                              </div>
                              <p className="text-slate-400 italic">"{req.reason}"</p>
                              
                              {/* Option for Train Operators to edit/cancel their own pending request */}
                              {isPending && req.empId === currentUser?.uid && (
                                <div className="flex gap-2 pt-2">
                                  <button 
                                    onClick={() => handleStartEditRequest(req)} 
                                    className="bg-cyan-900/30 hover:bg-cyan-800/50 border border-cyan-800/40 text-cyan-400 font-bold px-2 py-1 rounded text-[9px] uppercase"
                                  >
                                    Modify Request
                                  </button>
                                  <button 
                                    onClick={() => handleCancelRequest(req.id)} 
                                    className="bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/40 text-rose-400 font-bold px-2 py-1 rounded text-[9px] uppercase"
                                  >
                                    Cancel Request
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="bg-slate-900 p-2 rounded border border-slate-850 space-y-2">
                              <div className="text-[9px] font-black text-slate-500 uppercase">AI Recommendation:</div>
                              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${
                                rec.action === 'APPROVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                rec.action === 'REJECT' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              }`}>{rec.action}</span>
                              <p className="text-[8.5px] text-slate-450 leading-tight">{rec.reason}</p>
                              
                              {isPending && (userRole === 'CREW_CONTROLLER' || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') && (
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => handleApproveLeave(req)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-1 rounded text-[9px] uppercase"><Check size={10} className="inline mr-0.5"/> Approve</button>
                                  <button onClick={() => handleRejectLeave(req.id)} className="flex-1 bg-rose-950 border border-rose-500 text-rose-300 font-bold py-1 rounded text-[9px] uppercase"><X size={10} className="inline mr-0.5"/> Reject</button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}



      {/* Tab: BLACKOUTS (Blackout Dates Preserved) */}
      {activeTab === 'BLACKOUTS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
          <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
            <span className="font-bold text-xs uppercase text-amber-500 tracking-wider flex items-center gap-1.5">
              <Flame size={16} className="animate-pulse" /> OCC Blackout Date Coordinator
            </span>
          </div>

          <div className={isTrainOperator ? "w-full" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
            {/* Form */}
            {!isTrainOperator && (
              <form onSubmit={handleAddBlackout} className="space-y-3 text-[11px] font-bold uppercase">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-500" htmlFor="leaverequestmanager-l9">Start Date</label>
                    <input id="leaverequestmanager-i17" name="leaverequestmanager-i17" 
                      type="date" 
                      required 
                      value={newBlackout.startDate}
                      onChange={(e) => setNewBlackout({...newBlackout, startDate: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500" htmlFor="leaverequestmanager-l10">End Date</label>
                    <input id="leaverequestmanager-i18" name="leaverequestmanager-i18" 
                      type="date" 
                      value={newBlackout.endDate}
                      onChange={(e) => setNewBlackout({...newBlackout, endDate: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-slate-500" htmlFor="leaverequestmanager-l11">Event Name</label>
                  <input id="leaverequestmanager-i19" name="leaverequestmanager-i19" 
                    type="text" 
                    placeholder="e.g. FESTIVAL RUSH"
                    required
                    value={newBlackout.eventName}
                    onChange={(e) => setNewBlackout({...newBlackout, eventName: e.target.value.toUpperCase()})}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 placeholder-slate-650"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-black p-2 rounded text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-1"
                >
                  <Plus size={14} /> Add Blackout Constraint
                </button>
              </form>
            )}

            {/* List */}
            <div className={`bg-slate-950 rounded-xl p-3 border border-slate-850 overflow-y-auto space-y-2 ${isTrainOperator ? 'h-[300px]' : 'h-[150px]'}`}>
              {blackoutDates.length === 0 ? (
                <div className="text-slate-500 italic text-[10px] text-center py-8 uppercase">No blackout dates currently scheduled.</div>
              ) : (
                blackoutDates.map(bo => (
                  <div key={bo.id} className="flex justify-between items-center text-[10px] bg-slate-900 border border-slate-800 p-2 rounded">
                    <div>
                      <span className="font-bold text-rose-400 block uppercase">{bo.eventName}</span>
                      <span className="text-[8px] text-slate-550 block uppercase">{bo.startDate} to {bo.endDate}</span>
                    </div>
                    {!isTrainOperator && (
                      <button onClick={() => handleDeleteBlackout(bo.id)} className="text-rose-500 hover:text-rose-450 p-1">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
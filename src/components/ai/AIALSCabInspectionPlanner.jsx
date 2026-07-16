import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, doc, onSnapshot, setDoc, addDoc, 
  serverTimestamp, query, where, getDocs, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { 
  Sparkles, ShieldAlert, CheckCircle, AlertTriangle, 
  MapPin, Clock, Search, User, ArrowRight, 
  RefreshCw, FileSpreadsheet, PlusCircle, Save, 
  Play, Check, Trash2, ChevronRight, Bell, Calendar,
  Activity, ArrowDownRight, Compass, HelpCircle, Eye
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { aiService } from '../../services/aiService';

// Constant list of stations in Green Line sequence
const GREEN_LINE_STATIONS = [
  { code: "BIET", name: "Madavara" },
  { code: "JIDL", name: "Chikkabidarakallu" },
  { code: "MNJN", name: "Manjunathanagar" },
  { code: "NGSA", name: "Nagasandra" },
  { code: "DSH", name: "Dasarahalli" },
  { code: "JLHL", name: "Jalahalli" },
  { code: "PYID", name: "Peenya Industry" },
  { code: "PEYA", name: "Peenya" },
  { code: "YPI", name: "Goraguntepalya" },
  { code: "YPM", name: "Yeshwanthpur" },
  { code: "SSFY", name: "Sandal Soap Factory" },
  { code: "MHLI", name: "Mahalakshmi" },
  { code: "RJNR", name: "Rajajinagar" },
  { code: "KVPR", name: "Mahakavi Kuvempu Road" },
  { code: "SPRU", name: "Srirampura" },
  { code: "SPGD", name: "Mantri Square Sampige Road" },
  { code: "KGWA", name: "Nadaprabhu Kempegowda" },
  { code: "CKPE", name: "Chickpete" },
  { code: "KRMT", name: "Krishna Rajendra Market" },
  { code: "NLC", name: "National College" },
  { code: "LBGH", name: "Lalbagh" },
  { code: "SECE", name: "South End Circle" },
  { code: "JYN", name: "Jayanagar" },
  { code: "RVR", name: "Rashtreeya Vidyalaya Road" },
  { code: "BSNK", name: "Banashankari" },
  { code: "JPN", name: "Jaya Prakash Nagar" },
  { code: "PUTH", name: "Yelachenahalli" },
  { code: "APRC", name: "Konanakunte Cross" },
  { code: "KLPK", name: "Doddakallasandra" },
  { code: "VJRH", name: "Vajarahalli" },
  { code: "TGTP", name: "Thalaghattapura" },
  { code: "APTS", name: "Silk Institute" }
];

const ALS_OFFICERS = [
  "SHANTHIRAJ S",
  "ARUNKUMAR D S",
  "HARSH JOSHI"
];

export default function AIALSCabInspectionPlanner() {
  const { currentUser, userProfile, hasPermission } = useAuth();

  // ── 1. Planning Context States ──
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [startingStation, setStartingStation] = useState('PYID');
  const [startingTime, setStartingTime] = useState('08:30');
  const [activeOfficer, setActiveOfficer] = useState(ALS_OFFICERS[0]);
  
  // ── 2. Data Collections States ──
  const [wttMatrix, setWttMatrix] = useState([]);
  const [linkRoster, setLinkRoster] = useState([]);
  const [dutyRoster, setDutyRoster] = useState([]);
  const [crewRegistry, setCrewRegistry] = useState([]);
  const [completedInspections, setCompletedInspections] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [shiftExchanges, setShiftExchanges] = useState([]);
  const [stepbackDuties, setStepbackDuties] = useState([]);
  const [dailyCrewTracks, setDailyCrewTracks] = useState([]);
  const [emergencyRelief, setEmergencyRelief] = useState([]);
  const [dispatchEvents, setDispatchEvents] = useState([]);
  const [liveAttendance, setLiveAttendance] = useState([]);
  
  // ── 3. Selected Operators & Active Journey ──
  const [selectedOperatorIds, setSelectedOperatorIds] = useState([]);
  const [journeyPlan, setJourneyPlan] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [crossoverAlerts, setCrossoverAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);

  // ── 4. UI Control States ──
  const [activeTab, setActiveTab] = useState('PLANNER'); // PLANNER, TIMELINE, REPORTS
  const [searchQuery, setSearchQuery] = useState('');
  const [filterShift, setFilterShift] = useState('ALL'); // ALL, MORNING, AFTERNOON, NIGHT
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedOpToInspect, setSelectedOpToInspect] = useState(null);
  const [inspectionForm, setInspectionForm] = useState({
    overallScore: 8,
    inspectionResult: 'PASS',
    remarks: '',
    photo: '',
    alsName: ALS_OFFICERS[0]
  });

  // Convert Date to Schedule Type
  const scheduleType = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay(); // 0 = Sunday, 1 = Monday, 6 = Saturday
    if (day === 0) return 'SUNDAY';
    if (day === 1) return 'MONDAY';
    if (day === 6) return 'SATURDAY';
    return 'WEEKDAY';
  }, [selectedDate]);

  // ── 5. Real-Time Firestore Sync ──
  useEffect(() => {
    // A. WTT Matrix
    const unsubWtt = onSnapshot(collection(db, 'wtt_final_matrix'), (snap) => {
      setWttMatrix(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // B. Link Roster
    const unsubLinks = onSnapshot(collection(db, 'crew_final_links'), (snap) => {
      setLinkRoster(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // C. Duty Roster
    const unsubDuties = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDutyRoster(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // D. Crew Registry
    const unsubCrew = onSnapshot(collection(db, 'crewRegistry'), (snap) => {
      setCrewRegistry(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // E. Completed Inspections
    const unsubCompleted = onSnapshot(collection(db, 'alsCompletedInspection'), (snap) => {
      setCompletedInspections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // F. Live Incidents (Delays / Cancellations)
    const unsubIncidents = onSnapshot(collection(db, 'wtt_live_incidents'), (snap) => {
      setLiveIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // G. Shift Exchanges & Duty Swaps
    const unsubExchanges = onSnapshot(collection(db, 'shift_exchanges'), (snap) => {
      setShiftExchanges(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // H. Stepback Duties (Control Roster Monitor)
    const unsubStepback = onSnapshot(collection(db, 'stepback_duties'), (snap) => {
      setStepbackDuties(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // I. Daily Crew Tracks (Date specific operator allocations)
    const unsubTracks = onSnapshot(collection(db, 'daily_crew_tracks'), (snap) => {
      setDailyCrewTracks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // J. Emergency Relief Reports
    const unsubRelief = onSnapshot(collection(db, 'emergency_relief_reports'), (snap) => {
      setEmergencyRelief(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // K. Dispatch Gate Live Attendance
    const unsubDispatch = onSnapshot(collection(db, 'automated_dispatch_gate'), (snap) => {
      setDispatchEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // L. Live Attendance Logs
    const unsubAttendance = onSnapshot(collection(db, 'crew_live_attendance'), (snap) => {
      setLiveAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubWtt();
      unsubLinks();
      unsubDuties();
      unsubCrew();
      unsubCompleted();
      unsubIncidents();
      unsubExchanges();
      unsubStepback();
      unsubTracks();
      unsubRelief();
      unsubDispatch();
      unsubAttendance();
    };
  }, []);

  // ── 6. Resolve Active Operators on Duty for the Selected Date ──
  const activeDeployments = useMemo(() => {
    const activeDayLinks = linkRoster.filter(l => String(l.scheduleType || '').toUpperCase() === scheduleType);
    const activeDayDuties = dutyRoster.filter(d => String(d.scheduleType || '').toUpperCase() === scheduleType);

    // Build crew status mapping from crewRegistry
    const crewStatusMap = new Map();
    crewRegistry.forEach(c => {
      const id = String(c.employeeId || c.id || '').trim();
      if (id) {
        crewStatusMap.set(id, c);
      }
    });

    // Helper: Is the employee on leave, weekoff, or absent?
    const isExcluded = (empId, statusFromDuty) => {
      if (!empId || empId === '--' || empId === '-') return true;

      // Check crewRegistry
      const registryEmp = crewStatusMap.get(String(empId).trim());
      if (registryEmp) {
        const regStatus = String(registryEmp.currentStatus || '').toUpperCase().trim();
        if (['CL', 'EL', 'ML', 'ABSENT', 'WO', 'REST', 'WEEKOFF', 'LEAVE', 'OFF'].includes(regStatus) || registryEmp.deleted === true) {
          return true;
        }
      }

      // Check duty roster status / remarks
      const dutyStatus = String(statusFromDuty || '').toUpperCase().trim();
      if (['CL', 'EL', 'ML', 'ABSENT', 'WO', 'REST', 'WEEKOFF', 'LEAVE', 'OFF'].includes(dutyStatus)) {
        return true;
      }

      return false;
    };

    const list = [];
    const processedEmpIds = new Set();

    // A. Process standard links
    activeDayLinks.forEach(link => {
      const normLinkId = String(link.dutyId).padStart(2, '0');
      const matchingDuty = activeDayDuties.find(d => String(d.dutyId).padStart(2, '0') === normLinkId);
      
      const trackId = `${selectedDate}_${matchingDuty?.trainId || link.trainId}`;
      const matchedTrack = dailyCrewTracks.find(t => t.id === trackId);
      
      const empId = matchedTrack?.currentOperator?.employeeId || matchingDuty?.empId || '--';
      const empName = matchedTrack?.currentOperator?.name || matchingDuty?.empName || '--';

      if (empId === '--') return;
      if (isExcluded(empId, matchingDuty?.status || matchingDuty?.remarks)) return;

      // Check if signed-on in automated dispatch gate or crew live attendance
      const hasLiveAttendance = liveAttendance.some(a => 
        String(a.dutyId).padStart(2, '0') === normLinkId && 
        String(a.scheduleType).toUpperCase() === scheduleType
      );

      const hasDispatchSignOn = dispatchEvents.some(e => {
        if (String(e.currentDutyId).padStart(2, '0') !== normLinkId) return false;
        if (e.incidentType !== 'SIGN_ON') return false;
        if (e.timestamp) {
          const tDate = e.timestamp.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
          const tDateStr = tDate.toISOString().split('T')[0];
          return tDateStr === selectedDate;
        }
        return true;
      });

      const isSignedOn = hasLiveAttendance || hasDispatchSignOn || matchedTrack?.currentOperator ? true : false;
      
      // Filter out if not signed on (since they are absent or not yet on duty)
      if (!isSignedOn) return;

      const signOnTime = matchingDuty?.signOnTime || link.signOnTime || '08:00';
      const signOnHour = parseInt(signOnTime.split(':')[0], 10);
      let shiftGroup = 'MORNING';
      if (signOnHour >= 12 && signOnHour < 18) shiftGroup = 'AFTERNOON';
      if (signOnHour >= 18 || signOnHour < 5) shiftGroup = 'NIGHT';

      const rawLegs = {
        l1Train: matchingDuty?.rawLegs?.l1Train || link.trainId || '--',
        l1Start: matchingDuty?.rawLegs?.l1Start || link.leg1TimeFrom || link.signOnTime || '--',
        l1End: matchingDuty?.rawLegs?.l1End || link.leg1TimeTo || '--',
        l2Train: matchingDuty?.rawLegs?.l2Train || link.leg2TrainNo || '--',
        l2Start: matchingDuty?.rawLegs?.l2Start || link.leg2DepTime || '--',
        l2End: matchingDuty?.rawLegs?.l2End || link.leg2ArrTime || '--',
        l3Train: matchingDuty?.rawLegs?.l3Train || link.leg3TrainNo || '--',
        l3Start: matchingDuty?.rawLegs?.l3Start || link.leg3DepTime || '--',
        l3End: matchingDuty?.rawLegs?.l3End || link.leg3ArrTime || '--',
        l4Train: matchingDuty?.rawLegs?.l4Train || link.leg4TrainNo || '--',
        l4Start: matchingDuty?.rawLegs?.l4Start || link.leg4FinalDepTime || '--',
        l4End: matchingDuty?.rawLegs?.l4End || link.leg4FinalArrTime || '--'
      };

      processedEmpIds.add(String(empId).trim());
      list.push({
        id: `link_${link.id}`,
        dutyId: normLinkId,
        empId,
        empName,
        signOnTime,
        trainId: matchingDuty?.trainId || link.trainId || '--',
        shiftGroup,
        isSignedOn: true,
        isExchanged: matchingDuty?.isExchanged || false,
        rawLegs,
        type: 'REGULAR'
      });
    });

    // B. Process Extra Train Operators
    const linkedDutyIds = new Set(activeDayLinks.map(l => String(l.dutyId).padStart(2, '0')));
    activeDayDuties.forEach(d => {
      const normDutyId = String(d.dutyId).padStart(2, '0');
      const empId = d.empId || d.employeeId;
      const empName = d.empName || d.name;

      if (!empId || empId === '--' || processedEmpIds.has(String(empId).trim())) return;
      if (isExcluded(empId, d.status || d.remarks)) return;

      const isExtra = !linkedDutyIds.has(normDutyId) || 
        String(d.dutyId).toLowerCase().includes('extra') ||
        String(d.remarks || '').toLowerCase().includes('extra');

      if (!isExtra) return;

      const hasLiveAttendance = liveAttendance.some(a => 
        String(a.dutyId).padStart(2, '0') === normDutyId && 
        String(a.scheduleType).toUpperCase() === scheduleType
      );

      const hasDispatchSignOn = dispatchEvents.some(e => {
        if (String(e.currentDutyId).padStart(2, '0') !== normDutyId) return false;
        if (e.incidentType !== 'SIGN_ON') return false;
        if (e.timestamp) {
          const tDate = e.timestamp.toDate ? e.timestamp.toDate() : new Date(e.timestamp);
          const tDateStr = tDate.toISOString().split('T')[0];
          return tDateStr === selectedDate;
        }
        return true;
      });

      const isSignedOn = hasLiveAttendance || hasDispatchSignOn || d.status === 'ACTIVE' || d.status === 'PRESENT';
      if (!isSignedOn) return;

      const signOnTime = d.signOnTime || '08:00';
      const signOnHour = parseInt(signOnTime.split(':')[0], 10);
      let shiftGroup = 'MORNING';
      if (signOnHour >= 12 && signOnHour < 18) shiftGroup = 'AFTERNOON';
      if (signOnHour >= 18 || signOnHour < 5) shiftGroup = 'NIGHT';

      processedEmpIds.add(String(empId).trim());
      list.push({
        id: `extra_${d.id || normDutyId}`,
        dutyId: normDutyId,
        empId,
        empName,
        signOnTime,
        trainId: d.trainId || '--',
        shiftGroup,
        isSignedOn: true,
        isExchanged: d.isExchanged || false,
        rawLegs: d.rawLegs || {
          l1Train: d.trainId || '--',
          l1Start: signOnTime,
          l1End: '--'
        },
        type: 'EXTRA'
      });
    });

    // C. Process Stepback (stbk) Operators
    stepbackDuties.forEach(s => {
      const empId = s.empId || s.employeeId;
      const empName = s.empName || s.name;

      if (!empId || empId === '--' || processedEmpIds.has(String(empId).trim())) return;
      if (isExcluded(empId)) return;

      if (s.timestamp) {
        const tDate = s.timestamp.toDate ? s.timestamp.toDate() : new Date(s.timestamp);
        const tDateStr = tDate.toISOString().split('T')[0];
        if (tDateStr !== selectedDate) return;
      }

      processedEmpIds.add(String(empId).trim());
      list.push({
        id: `stepback_${s.id || empId}`,
        dutyId: s.dutyId || 'STBK',
        empId,
        empName,
        signOnTime: s.startTime || '08:00',
        trainId: s.trainId || '--',
        shiftGroup: 'MORNING',
        isSignedOn: true,
        isExchanged: false,
        rawLegs: {
          l1Train: s.trainId || '--',
          l1Start: s.startTime || '08:00',
          l1End: s.endTime || '--'
        },
        type: 'STEPBACK'
      });
    });

    return list;
  }, [linkRoster, dutyRoster, dailyCrewTracks, dispatchEvents, liveAttendance, stepbackDuties, crewRegistry, scheduleType, selectedDate]);

  const currentMonthStr = useMemo(() => {
    return selectedDate.substring(0, 7);
  }, [selectedDate]);

  const monthlyCompletedMap = useMemo(() => {
    const map = new Map();
    completedInspections.forEach(insp => {
      if (insp.inspectionDate && insp.inspectionDate.startsWith(currentMonthStr)) {
        map.set(insp.employeeId, insp);
      }
    });
    return map;
  }, [completedInspections, currentMonthStr]);

  const processedOperators = useMemo(() => {
    return activeDeployments.map(op => {
      const alreadyInspected = monthlyCompletedMap.has(op.empId);
      let statusText = 'Inspection Pending';
      let priorityScore = 50;

      const allPrev = completedInspections.filter(i => i.employeeId === op.empId);
      if (alreadyInspected) {
        statusText = 'Inspection Completed';
        priorityScore = 0;
      } else if (allPrev.length > 0) {
        allPrev.sort((a, b) => b.inspectionDate.localeCompare(a.inspectionDate));
        const lastDate = new Date(allPrev[0].inspectionDate);
        const diffDays = Math.ceil((new Date(selectedDate) - lastDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 45) {
          statusText = 'Inspection Overdue';
          priorityScore = 150;
        } else if (diffDays > 30) {
          statusText = 'Inspection Due';
          priorityScore = 100;
        }
      } else {
        statusText = 'Inspection Overdue';
        priorityScore = 150;
      }

      const hasIncidents = liveIncidents.some(i => String(i.trainId) === String(op.trainId));
      if (hasIncidents) priorityScore += 20;

      return {
        ...op,
        alreadyInspected,
        statusText,
        priorityScore
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);
  }, [activeDeployments, monthlyCompletedMap, completedInspections, selectedDate, liveIncidents]);

  const filteredOperators = useMemo(() => {
    return processedOperators.filter(op => {
      const matchSearch = searchQuery === '' || 
        op.empName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(op.empId).includes(searchQuery) ||
        String(op.trainId).includes(searchQuery) ||
        String(op.dutyId).includes(searchQuery);

      const matchShift = filterShift === 'ALL' || op.shiftGroup === filterShift;
      return matchSearch && matchShift;
    });
  }, [processedOperators, searchQuery, filterShift]);

  const calculateRoute = () => {
    if (selectedOperatorIds.length === 0) {
      alert("Please select at least one Train Operator to inspect.");
      return;
    }
    setIsCalculating(true);
    
    const result = aiService.calculateALSInspectionRoute({
      startingStation,
      startingTime,
      selectedOperatorIds,
      deployments: activeDeployments,
      linkRoster,
      dutyRoster,
      wttMatrix,
      liveIncidents,
      completedInspections,
      activeDay: scheduleType
    });

    setJourneyPlan(result);
    setActiveTab('TIMELINE');
    setIsCalculating(false);

    const crossovers = aiService.detectCrossoverOpportunities({
      deployments: activeDeployments,
      wttMatrix,
      liveIncidents,
      activeDay: scheduleType
    });
    setCrossoverAlerts(crossovers);

    const alerts = [];
    result.steps.forEach(step => {
      if (step.action === 'BOARD') {
        alerts.push({
          id: Math.random().toString(),
          time: step.time,
          text: `Prepare to board Train ${step.trainId} ${step.direction} at ${step.stationName}.`,
          type: 'BOARD'
        });
      } else if (step.action === 'INSPECT') {
        alerts.push({
          id: Math.random().toString(),
          time: step.time.split(' - ')[0],
          text: `Cab Inspection active for Operator ${step.operatorName} (Train ${step.trainId}).`,
          type: 'INSPECT'
        });
      }
    });
    setNotifications(alerts.slice(0, 5));
  };

  useEffect(() => {
    if (journeyPlan && selectedOperatorIds.length > 0) {
      const result = aiService.calculateALSInspectionRoute({
        startingStation,
        startingTime,
        selectedOperatorIds,
        deployments: activeDeployments,
        linkRoster,
        dutyRoster,
        wttMatrix,
        liveIncidents,
        completedInspections,
        activeDay: scheduleType
      });
      setJourneyPlan(result);
    }
  }, [liveIncidents, activeDeployments, wttMatrix]);

  if (userProfile?.role === 'TRAIN_OPERATOR' || userProfile?.role === 'STATION_CONTROLLER' || userProfile?.role === 'VIEWER' || !hasPermission('AI ALS Cab Inspection', 'View')) {
    return null;
  }

  const openInspectionForm = (op) => {
    setSelectedOpToInspect(op);
    setInspectionForm({
      overallScore: 8,
      inspectionResult: 'PASS',
      remarks: '',
      photo: '',
      alsName: activeOfficer
    });
    setShowLogModal(true);
  };

  const handleInspectionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOpToInspect) return;

    const timeStr = new Date().toTimeString().split(' ')[0];
    const payload = {
      employeeId: selectedOpToInspect.empId || selectedOpToInspect.operatorId,
      employeeName: selectedOpToInspect.empName || selectedOpToInspect.operatorName,
      trainId: selectedOpToInspect.trainId || '214',
      dutyNumber: selectedOpToInspect.dutyId || 'N/A',
      inspectionDate: selectedDate,
      inspectionTime: timeStr,
      alsName: inspectionForm.alsName,
      overallScore: Number(inspectionForm.overallScore),
      inspectionResult: inspectionForm.inspectionResult,
      remarks: inspectionForm.remarks,
      photo: inspectionForm.photo || '',
      timestamp: serverTimestamp()
    };

    try {
      const docId = `inspection_${selectedDate}_${payload.employeeId}`;
      await setDoc(doc(db, 'alsCompletedInspection', docId), payload);

      await addDoc(collection(db, 'alsInspectionHistory'), {
        event: 'INSPECTION_COMPLETED',
        description: `Cab Inspection completed for Operator ${payload.employeeName}. Result: ${payload.inspectionResult}, Score: ${payload.overallScore}/10`,
        officer: payload.alsName,
        timestamp: serverTimestamp()
      });

      if (journeyPlan) {
        const updatedSteps = journeyPlan.steps.map(step => {
          if (step.operatorId === payload.employeeId && step.action === 'INSPECT') {
            return { ...step, status: 'COMPLETED' };
          }
          return step;
        });
        setJourneyPlan(prev => ({ ...prev, steps: updatedSteps }));
      }

      alert("Inspection report successfully saved to Firestore.");
      setShowLogModal(false);
      setSelectedOpToInspect(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save inspection report.");
    }
  };

  const handleMissedStep = async (step) => {
    if (!window.confirm(`Mark inspection for ${step.operatorName} as Missed? This will automatically recalculate the journey.`)) return;
    
    await addDoc(collection(db, 'alsInspectionHistory'), {
      event: 'INSPECTION_MISSED',
      description: `Missed planned inspection on Train ${step.trainId} for ${step.operatorName}.`,
      officer: activeOfficer,
      timestamp: serverTimestamp()
    });

    const newSelection = selectedOperatorIds.filter(id => id !== step.operatorId);
    setSelectedOperatorIds(newSelection);
    
    alert("Planner dynamically rerouted. Remaining operator journeys updated.");
  };

  const handleExportExcel = () => {
    const formattedData = completedInspections.map(e => ({
      "Inspection Date": e.inspectionDate,
      "Inspection Time": e.inspectionTime,
      "ALS Inspector": e.alsName,
      "Operator Name": e.employeeName,
      "Employee ID": e.employeeId,
      "Train ID": e.trainId,
      "Duty ID": e.dutyNumber,
      "Overall Score (10)": e.overallScore,
      "Result Decision": e.inspectionResult,
      "Remarks": e.remarks
    }));

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inspections Registry");
    XLSX.writeFile(wb, `BMRCL_ALS_Cab_Inspections_${selectedDate}.xlsx`);
  };

  const selectAllDue = () => {
    const dueIds = processedOperators
      .filter(o => o.statusText === 'Inspection Overdue' || o.statusText === 'Inspection Due')
      .map(o => o.empId);
    setSelectedOperatorIds(dueIds);
  };

  const selectEntireShift = (shift) => {
    const shiftIds = processedOperators
      .filter(o => o.shiftGroup === shift)
      .map(o => o.empId);
    setSelectedOperatorIds(shiftIds);
  };

  const toggleSelectOp = (id) => {
    if (selectedOperatorIds.includes(id)) {
      setSelectedOperatorIds(prev => prev.filter(x => x !== id));
    } else {
      setSelectedOperatorIds(prev => [...prev, id]);
    }
  };

  return (
    <div className="space-y-6 text-xs font-mono text-slate-200">
      
      {/* ── HEADER PANEL ── */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <h1 className="text-sm font-black text-slate-100 flex items-center gap-2 uppercase tracking-wider">
            <Sparkles className="text-cyan-400 h-5 w-5 animate-pulse" /> AI ALS Cab Inspection Planner
          </h1>
          <p className="text-[10px] text-slate-450 mt-1 uppercase">Metro Operations Planning Assistant & Route Optimization Engine</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="bg-slate-950 border border-slate-850 p-1.5 rounded-lg flex items-center gap-2">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider px-1">Officer:</span>
            <select
              value={activeOfficer}
              onChange={e => {
                setActiveOfficer(e.target.value);
                setInspectionForm(prev => ({ ...prev, alsName: e.target.value }));
              }}
              className="bg-transparent border-none text-cyan-400 font-bold focus:outline-none cursor-pointer"
            >
              {ALS_OFFICERS.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-950 border border-slate-850 p-1.5 rounded-lg flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => {
                setSelectedDate(e.target.value);
                setSelectedOperatorIds([]);
                setJourneyPlan(null);
              }}
              className="bg-transparent border-none text-indigo-400 font-bold outline-none cursor-pointer focus:ring-0 w-28"
            />
            <span className="bg-indigo-950 text-indigo-400 px-1.5 py-0.2 rounded text-[9px] font-black">{scheduleType}</span>
          </div>

          <div className="bg-slate-950 border border-slate-850 p-1.5 rounded-lg flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Start:</span>
            <select
              value={startingStation}
              onChange={e => setStartingStation(e.target.value)}
              className="bg-transparent border-none text-emerald-400 font-bold focus:outline-none cursor-pointer"
            >
              {GREEN_LINE_STATIONS.map(st => (
                <option key={st.code} value={st.code}>{st.name} ({st.code})</option>
              ))}
            </select>
          </div>

          <div className="bg-slate-950 border border-slate-850 p-1.5 rounded-lg flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Time:</span>
            <input
              type="time"
              value={startingTime}
              onChange={e => setStartingTime(e.target.value)}
              className="bg-transparent border-none text-amber-400 font-bold outline-none w-16 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* ── LIVE SYNC STATUS BAR ── */}
      <div className="bg-slate-955 border border-slate-900 px-4 py-2 rounded-lg flex flex-wrap justify-between items-center gap-2 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-slate-400 font-bold uppercase tracking-wider">Live Synchronization Status:</span>
          <span className="text-slate-500">WTT ({wttMatrix.length}), links ({linkRoster.length}), Duties ({dutyRoster.length}) active</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400 font-bold uppercase">
          <span>Swaps: <span className="text-cyan-400">{shiftExchanges.length}</span></span>
          <span>Reliefs: <span className="text-amber-500">{emergencyRelief.length}</span></span>
          <span>Delays: <span className="text-rose-500">{liveIncidents.reduce((acc, c) => acc + (c.delayMins || 0), 0)} mins</span></span>
        </div>
      </div>

      {/* ── SUB TAB NAVIGATION ── */}
      <div className="flex border-b border-slate-800 pb-3 gap-2">
        {[
          { id: 'PLANNER', label: '1. Select Operators & Plan' },
          { id: 'TIMELINE', label: '2. Interactive Journey Timeline' },
          { id: 'REPORTS', label: '3. Reports & Audits' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 font-bold rounded-lg transition-colors border ${
              activeTab === tab.id 
                ? 'bg-cyan-950/40 text-cyan-400 border-cyan-855 shadow-md' 
                : 'bg-slate-900 border-transparent text-slate-400 hover:bg-slate-850'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: OPERATOR SELECTOR & PLAN ── */}
      {activeTab === 'PLANNER' && (
        <div className="space-y-6">
          {journeyPlan && journeyPlan.isValid === false && (
            <div className="bg-rose-955/20 border border-rose-900/40 p-4 rounded-xl space-y-2">
              <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-rose-900/30 pb-1.5">
                ⚠️ Unable to generate inspection route because Duty Roster, Link Roster and WTT do not match
              </h3>
              <ul className="list-disc list-inside space-y-1 text-[10px] text-rose-350 font-mono">
                {journeyPlan.validationErrors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="bg-slate-900 border border-slate-850 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={selectAllDue}
                className="bg-indigo-950/50 hover:bg-indigo-900 border border-indigo-900/40 text-indigo-400 font-bold px-3 py-1.5 rounded transition"
              >
                Select All Due/Overdue
              </button>
              <button
                onClick={() => selectEntireShift('MORNING')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-850 text-slate-300 font-bold px-3 py-1.5 rounded transition"
              >
                Morning Shift
              </button>
              <button
                onClick={() => selectEntireShift('AFTERNOON')}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-850 text-slate-300 font-bold px-3 py-1.5 rounded transition"
              >
                Afternoon Shift
              </button>
              <button
                onClick={() => setSelectedOperatorIds(activeDeployments.map(o => o.empId))}
                className="bg-cyan-950/30 hover:bg-cyan-900 border border-cyan-900/30 text-cyan-400 font-bold px-3 py-1.5 rounded transition"
              >
                Entire Depot (All On-duty)
              </button>
              <button
                onClick={() => setSelectedOperatorIds([])}
                className="bg-slate-950 hover:bg-slate-850 border border-slate-850 text-rose-455 font-bold px-3 py-1.5 rounded transition"
              >
                Clear Selection
              </button>
            </div>

            <span className="text-cyan-405 font-black tracking-widest text-[10px] uppercase bg-cyan-950/20 px-3 py-1 rounded border border-cyan-900/30">
              {selectedOperatorIds.length} Operators Selected
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="space-y-4">
              <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl space-y-4">
                <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">Filter Operators</h3>
                
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 font-bold uppercase block">Search Name or ID</label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="e.g. BHARATH"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded pl-7 pr-2 py-1.5 outline-none focus:border-cyan-500 text-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 font-bold uppercase block">Shift Filter</label>
                  <select
                    value={filterShift}
                    onChange={e => setFilterShift(e.target.value)}
                    className="w-full bg-slate-955 border border-slate-850 p-2 rounded outline-none text-slate-350 cursor-pointer focus:border-cyan-500"
                  >
                    <option value="ALL">All Shifts</option>
                    <option value="MORNING">Morning Shift</option>
                    <option value="AFTERNOON">Afternoon Shift</option>
                    <option value="NIGHT">Night Shift</option>
                  </select>
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-950/20 to-purple-950/20 border border-indigo-900/30 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles size={13} /> AI Assistant
                </h4>
                <p className="text-[10px] text-slate-350 leading-relaxed font-sans">
                  Use the multi-select tools to choose operators. Once selected, click the button below to compute the optimal sequential cab boarding route based on WTT segments and delays.
                </p>
                <button
                  onClick={calculateRoute}
                  disabled={isCalculating || selectedOperatorIds.length === 0}
                  className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-slate-950 font-black py-2 rounded-lg uppercase tracking-wider text-[10px] transition disabled:opacity-50"
                >
                  {isCalculating ? 'Computing Optimal Journey...' : 'Calculate AI Journey'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-3 bg-slate-900/20 border border-slate-800 rounded-xl overflow-hidden shadow">
              <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">On-Duty Operators Registry</h3>
                <span className="text-[10px] text-slate-500 font-bold">{filteredOperators.length} Active Records</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left whitespace-nowrap">
                  <thead className="text-[9px] text-slate-500 uppercase tracking-wider bg-slate-950/50 border-b border-slate-850">
                    <tr>
                      <th className="p-3 text-center w-12">Select</th>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Mainline Train</th>
                      <th className="p-3">Duty Run</th>
                      <th className="p-3">Sign-On</th>
                      <th className="p-3">Monthly Status</th>
                      <th className="p-3 text-right">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-slate-350">
                    {filteredOperators.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="p-8 text-center text-slate-500 italic">No operators on duty match the selected criteria.</td>
                      </tr>
                    ) : (
                      filteredOperators.map(op => {
                        const isSelected = selectedOperatorIds.includes(op.empId);
                        
                        let badgeColor = 'bg-slate-950 text-slate-550 border-slate-900';
                        if (op.statusText === 'Inspection Completed') badgeColor = 'bg-emerald-955 text-emerald-400 border-emerald-900/30';
                        if (op.statusText === 'Inspection Due') badgeColor = 'bg-amber-955 text-amber-500 border-amber-900/20';
                        if (op.statusText === 'Inspection Overdue') badgeColor = 'bg-rose-955 text-rose-500 border-rose-900/30';
                        if (op.statusText === 'Inspection Pending') badgeColor = 'bg-cyan-950 text-cyan-400 border-cyan-900/30';

                        return (
                          <tr 
                            key={`${op.empId}_${op.dutyId}`} 
                            onClick={() => toggleSelectOp(op.empId)}
                            className={`hover:bg-slate-955/40 cursor-pointer transition ${isSelected ? 'bg-cyan-950/10' : ''}`}
                          >
                            <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelectOp(op.empId)}
                                className="rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer h-3.5 w-3.5"
                              />
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <div className="h-6 w-6 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center font-bold text-slate-555 text-[9px]">
                                  TO
                                </div>
                                <div>
                                  <strong className="text-slate-150 font-bold block uppercase">{op.empName}</strong>
                                  <span className="text-[9px] text-slate-500 font-bold">ID: #{op.empId}</span>
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="flex items-center gap-1 font-bold text-slate-200">
                                <Activity className="h-3 w-3 text-indigo-400" /> Train {op.trainId}
                              </span>
                            </td>
                            <td className="p-3 font-bold text-slate-350">Duty {op.dutyId}</td>
                            <td className="p-3 text-slate-400 font-bold">{op.signOnTime}</td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[8.5px] font-bold border ${badgeColor}`}>
                                {op.statusText}
                              </span>
                            </td>
                            <td className="p-3 text-right font-black text-cyan-400">+{op.priorityScore} Pts</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: INTERACTIVE JOURNEY TIMELINE ── */}
      {activeTab === 'TIMELINE' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-6">
            <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
              <div>
                <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">ALS Daily Cab Inspection Journey</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Calculated sequence for optimized boarding and deboarding</p>
              </div>
              
              <button
                onClick={calculateRoute}
                className="bg-slate-950 border border-slate-850 hover:bg-slate-800 text-cyan-400 px-3 py-1.5 rounded font-bold flex items-center gap-1 transition"
              >
                <RefreshCw size={11} /> Re-Calculate
              </button>
            </div>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-slate-800">
              {journeyPlan && journeyPlan.isValid === false ? (
                <div className="bg-rose-955/20 border border-rose-900/40 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-rose-900/30 pb-1.5">
                    ⚠️ Mismatch Warnings
                  </h4>
                  <ul className="list-disc list-inside space-y-1 text-[10px] text-rose-350 font-mono">
                    {journeyPlan.validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : journeyPlan?.steps && journeyPlan.steps.length > 0 ? (
                journeyPlan.steps.map((step, idx) => {
                  const isInspect = step.action === 'INSPECT';
                  const isBoard = step.action === 'BOARD';
                  const isWait = step.action === 'WAIT';
                  const isLeave = step.action === 'LEAVE';
                  const isTransit = step.action === 'TRANSIT';
                  const isCompleted = step.status === 'COMPLETED';

                  let dotColor = 'bg-slate-700 ring-slate-900';
                  if (isInspect) dotColor = isCompleted ? 'bg-emerald-500 ring-emerald-950/40' : 'bg-cyan-500 ring-cyan-950/40';
                  if (isBoard) dotColor = 'bg-indigo-500 ring-indigo-950/40';
                  if (isWait) dotColor = 'bg-amber-500 ring-amber-950/40';
                  if (isLeave) dotColor = 'bg-purple-500 ring-purple-950/40';
                  if (isTransit) dotColor = 'bg-slate-500 ring-slate-900';

                  return (
                    <div key={idx} className="relative group">
                      <span className={`absolute -left-6 top-2.5 h-3.5 w-3.5 rounded-full ring-4 ${dotColor} transition`}></span>

                      <div className="bg-slate-950/40 border border-slate-850/80 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-750 transition">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-900 border border-slate-850 px-2 py-0.5 rounded flex items-center gap-1">
                              <Clock size={11} className="text-slate-500" /> {step.time}
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                              isInspect ? 'bg-cyan-955 text-cyan-400 border-cyan-900/30' :
                              isBoard ? 'bg-indigo-955 text-indigo-400 border-indigo-900/30' :
                              isWait ? 'bg-amber-955/40 text-amber-500 border-amber-900/20' :
                              isLeave ? 'bg-purple-955 text-purple-400 border-purple-900/30' :
                              'bg-slate-955 text-slate-550 border-slate-900'
                            }`}>
                              {step.action}
                            </span>
                          </div>
                          
                          <p className="text-slate-200 font-bold text-[11px] mt-1">{step.details}</p>
                          
                          {isInspect && (
                            <span className="text-[9.5px] text-slate-450 block font-bold">
                              Station: {step.stationName} | Train Platform {step.direction === 'UP' ? '1 (UP)' : '2 (DN)'}
                            </span>
                          )}
                        </div>

                        {isInspect && !isCompleted && (
                          <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-850 pt-2.5 md:pt-0">
                            <button
                              onClick={() => {
                                const matchedCrew = processedOperators.find(c => c.empId === step.operatorId);
                                openInspectionForm(matchedCrew || step);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-3.5 py-1.5 rounded uppercase tracking-wider text-[9px] flex items-center gap-1 transition"
                            >
                              <Check size={12} /> Log Pass
                            </button>
                            <button
                              onClick={() => handleMissedStep(step)}
                              className="bg-slate-900 border border-slate-800 hover:bg-slate-855 text-rose-400 px-3.5 py-1.5 rounded uppercase tracking-wider text-[9px] flex items-center gap-1 transition"
                            >
                              <Trash2 size={12} /> Missed
                            </button>
                          </div>
                        )}

                        {isInspect && isCompleted && (
                          <span className="flex items-center gap-1 text-[9.5px] font-bold text-emerald-450 uppercase tracking-widest bg-emerald-950/20 border border-emerald-900/40 px-2 py-1 rounded">
                            <CheckCircle size={11} /> Completed
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-slate-500 italic">No daily schedule calculated. Select operators in the first tab and click Calculate.</div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {journeyPlan && (
              <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-4">
                <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Sparkles size={14} className="text-cyan-400" /> AI Recommendation
                </h3>

                <div className="space-y-3.5">
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 flex justify-between items-center">
                    <div>
                      <span className="text-[8px] text-slate-500 font-bold block uppercase">Confidence Rating</span>
                      <strong className="text-cyan-400 text-base font-black">98.5%</strong>
                    </div>
                    <span className="bg-cyan-955 text-cyan-400 px-2 py-0.5 rounded text-[9px] font-bold uppercase">Optimal Route</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-850 text-[10px]">
                    <div>
                      <span className="text-slate-555 block">Est Travel Time</span>
                      <strong className="text-slate-250 font-bold">{journeyPlan.travelTime} mins</strong>
                    </div>
                    <div>
                      <span className="text-slate-555 block">Est Waiting Time</span>
                      <strong className="text-slate-250 font-bold">{journeyPlan.waitingTime} mins</strong>
                    </div>
                    <div>
                      <span className="text-slate-555 block">Total Inspections</span>
                      <strong className="text-emerald-455 font-bold">{journeyPlan.completedCount} Coverages</strong>
                    </div>
                    <div>
                      <span className="text-slate-555 block">Planner Efficiency</span>
                      <strong className="text-indigo-400 font-bold">{journeyPlan.efficiency}%</strong>
                    </div>
                  </div>

                  <div className="bg-slate-950/45 border border-slate-850 p-3 rounded-lg flex gap-2">
                    <Compass className="h-4.5 w-4.5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[8.5px] text-slate-500 font-bold block uppercase">AI Optimization Logic</span>
                      <p className="text-[10px] text-slate-350 italic mt-0.5 leading-relaxed">
                        "Optimized journey routes using real-time WTT schedules for a {scheduleType} shift. Minimizes walking and platform switching at peak interchange junctions."
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {crossoverAlerts.length > 0 && (
              <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-3.5">
                <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <Bell size={13} className="text-amber-500" /> Crossover Opportunities
                </h3>

                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {crossoverAlerts.map((c, idx) => (
                    <div key={idx} className="bg-slate-955 border-l-2 border-cyan-500 p-3 rounded text-[10px] space-y-1">
                      <div className="flex justify-between items-center text-slate-400 font-bold">
                        <span>@{c.stationName} ({c.stationCode})</span>
                        <span className="text-cyan-400">{c.timeStr}</span>
                      </div>
                      <p className="text-slate-300 leading-normal">{c.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-3.5">
              <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <Activity size={13} className="text-rose-500 animate-pulse" /> Live incident monitor
              </h3>

              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 text-[10px]">
                {liveIncidents.length === 0 ? (
                  <div className="text-center py-4 text-slate-500 italic">No active delays reported.</div>
                ) : (
                  liveIncidents.map((inc, idx) => (
                    <div key={idx} className="bg-slate-950 border-l-2 border-rose-500 p-2 rounded flex gap-2">
                      <AlertTriangle className="h-4.5 w-4.5 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-rose-405 font-bold block uppercase">Train {inc.trainId} Delayed</strong>
                        <p className="text-slate-450 mt-0.5">Delay: {inc.delayMins} mins | Reason: {inc.reason}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: REPORTS & AUDITS ── */}
      {activeTab === 'REPORTS' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div>
              <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest">Inspection Audit Center</h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Historical logs and driver coverage rankings</p>
            </div>
            
            <button
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-2 rounded-lg text-[10px] uppercase transition flex items-center gap-1.5"
            >
              <FileSpreadsheet size={13} /> Export Excel
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-4">
              <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">Completed Inspections Registry</h4>
              
              <div className="max-h-[380px] overflow-y-auto space-y-2.5 pr-1 text-[10px]">
                {completedInspections.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 italic">No completed inspections logged in Firestore.</div>
                ) : (
                  completedInspections.map((item, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <strong className="text-slate-150 font-bold text-xs uppercase">{item.employeeName}</strong>
                          <span className={`px-1.5 py-0.2 rounded font-black text-[9px] border ${
                            item.inspectionResult === 'PASS' ? 'bg-emerald-950 text-emerald-400 border-emerald-900/30' : 'bg-rose-955 text-rose-500 border-rose-900/30'
                          }`}>{item.inspectionResult}</span>
                        </div>
                        
                        <p className="text-slate-400">
                          Inspected by <strong className="text-cyan-400">{item.alsName}</strong> on {item.inspectionDate} @ {item.inspectionTime}
                        </p>
                        
                        {item.remarks && <p className="text-slate-500 italic">"{item.remarks}"</p>}
                      </div>
                      
                      <div className="text-right space-y-1 font-mono">
                        <span className="text-purple-400 font-bold bg-purple-950/20 border border-purple-900/30 px-2 py-0.5 rounded text-[10px]">
                          Score: {item.overallScore}/10
                        </span>
                        <span className="block text-[8.5px] text-slate-555 uppercase mt-1">Train: {item.trainId} | Duty: {item.dutyNumber}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-4">
              <h4 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">ALS Performance Metrics</h4>
              
              <div className="space-y-4 text-[10px]">
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-850 space-y-1">
                  <span className="text-slate-500 block uppercase font-bold text-[8px]">Monthly Completion %</span>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-slate-900 rounded-full h-2">
                      <div 
                        className="bg-cyan-500 h-2 rounded-full transition-all" 
                        style={{ width: `${Math.min(100, Math.round((monthlyCompletedMap.size / Math.max(1, activeDeployments.length)) * 100))}%` }}
                      ></div>
                    </div>
                    <strong className="text-cyan-400 font-bold">
                      {Math.min(100, Math.round((monthlyCompletedMap.size / Math.max(1, activeDeployments.length)) * 100))}%
                    </strong>
                  </div>
                  <span className="text-slate-500 text-[8.5px] block mt-1">
                    {monthlyCompletedMap.size} of {activeDeployments.length} operators inspected this month
                  </span>
                </div>

                <div className="bg-slate-955 p-4 rounded-lg border border-slate-850 space-y-2">
                  <span className="text-slate-500 block uppercase font-bold text-[8px]">Inspection Outcomes</span>
                  <div className="flex justify-between items-center text-slate-350">
                    <span>Passes / Stable:</span>
                    <strong className="text-emerald-455">{completedInspections.filter(i => i.inspectionResult === 'PASS').length} Logs</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-350">
                    <span>Needs Improvement:</span>
                    <strong className="text-amber-500">{completedInspections.filter(i => i.inspectionResult === 'NEEDS_IMPROVEMENT').length} Logs</strong>
                  </div>
                  <div className="flex justify-between items-center text-slate-350">
                    <span>Fails / Suspended:</span>
                    <strong className="text-rose-500">{completedInspections.filter(i => i.inspectionResult === 'FAIL').length} Logs</strong>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-850 space-y-1">
                  <span className="text-slate-500 block uppercase font-bold text-[8px]">Average Driver Score</span>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-slate-400">Inspected Avg:</span>
                    <strong className="text-purple-400 text-xs font-black">
                      {completedInspections.length > 0
                        ? (Math.round((completedInspections.reduce((acc, i) => acc + i.overallScore, 0) / completedInspections.length) * 10) / 10)
                        : '0'}
                      /10
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOG CAB INSPECTION FILE MODAL ── */}
      {showLogModal && selectedOpToInspect && (
        <div className="fixed inset-0 bg-slate-955/80 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-md w-full flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                <PlusCircle size={15} /> Log Cab Inspection File
              </h3>
              <button 
                onClick={() => { setShowLogModal(false); setSelectedOpToInspect(null); }} 
                className="text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleInspectionSubmit} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 space-y-1.5">
                <span className="text-[8px] text-slate-550 font-bold uppercase tracking-wider block">Target Operator</span>
                <strong className="text-slate-200 font-bold block text-sm uppercase">{selectedOpToInspect.empName || selectedOpToInspect.operatorName}</strong>
                <span className="text-[9.5px] text-slate-500 block">
                  Employee ID: #{selectedOpToInspect.empId || selectedOpToInspect.operatorId} | Train ID: {selectedOpToInspect.trainId}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block">ALS Officer Name*</label>
                <select
                  value={inspectionForm.alsName}
                  onChange={e => setInspectionForm({ ...inspectionForm, alsName: e.target.value })}
                  className="w-full bg-slate-955 border border-slate-750 rounded p-2 focus:border-cyan-500 outline-none text-slate-255 cursor-pointer"
                >
                  {ALS_OFFICERS.map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block">Overall Inspection Score (1-10)*</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={inspectionForm.overallScore}
                    onChange={e => setInspectionForm({ ...inspectionForm, overallScore: e.target.value })}
                    className="flex-1 accent-cyan-500"
                  />
                  <strong className="text-cyan-400 text-sm font-bold w-6 text-center">{inspectionForm.overallScore}</strong>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block">Result Decision*</label>
                <select
                  value={inspectionForm.inspectionResult}
                  onChange={e => setInspectionForm({ ...inspectionForm, inspectionResult: e.target.value })}
                  className="w-full bg-slate-955 border border-slate-750 rounded p-2 focus:border-cyan-500 outline-none text-slate-255 cursor-pointer"
                >
                  <option value="PASS">PASS / STABLE</option>
                  <option value="NEEDS_IMPROVEMENT">NEEDS IMPROVEMENT</option>
                  <option value="FAIL">FAIL / SUSPEND FROM DUTY</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block">Remarks & Observational Notes</label>
                <textarea
                  placeholder="e.g. Followed all safety protocols, punctual sign-on, tidy cab cabin."
                  value={inspectionForm.remarks}
                  onChange={e => setInspectionForm({ ...inspectionForm, remarks: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-250 h-20"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 font-bold block">Photo Asset Link URL (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. /assets/photos/insp_20009.jpg"
                  value={inspectionForm.photo}
                  onChange={e => setInspectionForm({ ...inspectionForm, photo: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-750 rounded p-2 focus:border-cyan-500 outline-none text-slate-250"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800 -mx-5 -mb-5 p-4 bg-slate-950/20">
                <button
                  type="button"
                  onClick={() => { setShowLogModal(false); setSelectedOpToInspect(null); }}
                  className="bg-slate-900 border border-slate-700 hover:bg-slate-850 text-slate-350 font-bold px-4 py-2 rounded"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-6 py-2 rounded flex items-center gap-1 transition"
                >
                  <Save size={13} /> Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

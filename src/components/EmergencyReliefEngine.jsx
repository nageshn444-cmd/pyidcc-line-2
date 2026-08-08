import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, doc, onSnapshot, setDoc, deleteDoc, addDoc, 
  serverTimestamp, updateDoc 
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  evaluateReliefCandidates, 
  evaluateCascadingDelayRelief,
  STATION_INDEX,
  secondsToTime 
} from '../utils/EmergencyCrewAllocator';
import { 
  AlertTriangle, Plus, Trash2, Check, Download, FileSpreadsheet, 
  FileText, Printer, ShieldAlert, Award, User, Clock, MapPin, 
  RefreshCw, Send, ArrowRight, Activity, Calendar, Sparkles, Cpu
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Available Trigger Events
const EMERGENCY_EVENTS = [
  "Train Failure",
  "Signalling Failure",
  "OCC Train Regulation",
  "Train Delay",
  "Train Swap",
  "Service Disruption",
  "Passenger Incident",
  "Medical Emergency",
  "Staff Shortage",
  "Crew Non-Reporting",
  "Crew Sick Report",
  "Crew Booking Off",
  "Emergency Short Loop Operation"
];

const STATION_DETAILS = [
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
  { code: "KGWA", name: "Nadaprabhu Kempegowda station" },
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

const STATIONS = Object.keys(STATION_INDEX);

const TRAIN_IDS = Array.from({ length: 23 }, (_, i) => String(201 + i));

const getStationLabel = (code) => {
  const st = STATION_DETAILS.find(s => s.code === code);
  return st ? `${st.name} (${st.code})` : code;
};

export default function EmergencyReliefEngine() {
  const { userProfile } = useAuth();
  const isTrainOperator = userProfile?.role === 'TRAIN_OPERATOR' || 
                          userProfile?.role === 'STATION_CONTROLLER' || 
                          userProfile?.role === 'VIEWER' ||
                          String(userProfile?.role || '').toLowerCase().includes('operator') ||
                          String(userProfile?.role || '').toLowerCase().includes('controller') ||
                          String(userProfile?.designation || '').toLowerCase().includes('operator') ||
                          String(userProfile?.designation || '').toLowerCase().includes('controller') ||
                          String(userProfile?.designation || '').toLowerCase().includes('viewer');
  
  // Tab control inside relief module
  const [reliefTab, setReliefTab] = useState('DASHBOARD'); // DASHBOARD, EXTRA_POOL, MISSED_TRIPS, REPORTS
  
  // Real-time Firestore States
  const [extraOps, setExtraOps] = useState([]);
  const [missedTrips, setMissedTrips] = useState([]);
  const [reports, setReports] = useState([]);
  const [deployments, setDeployments] = useState([]);
  
  // Input Form States
  const [selectedTrainId, setSelectedTrainId] = useState('');
  const [selectedIncidentType, setSelectedIncidentType] = useState('Train Failure');
  const [selectedLocation, setSelectedLocation] = useState('PYID');
  const [recoveryTime, setRecoveryTime] = useState('');
  
  const [newExtraOp, setNewExtraOp] = useState({
    employeeId: '',
    employeeName: '',
    currentLocation: 'PYID',
    signOnTime: '06:00:00'
  });
  
  const [newMissedTrip, setNewMissedTrip] = useState({
    employeeId: '',
    employeeName: '',
    missedTrip: '',
    missedTime: '12:00:00'
  });
  
  // Report Filtering State
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  
  // Decision Results State
  const [evaluationResults, setEvaluationResults] = useState(null);
  const [cascadingDelayResults, setCascadingDelayResults] = useState(null);
  const [delayMinutesInput, setDelayMinutesInput] = useState('15');
  const [originalOperator, setOriginalOperator] = useState(null);
  const [activeIncidentText, setActiveIncidentText] = useState('');

  // 1. Setup onSnapshot listeners for real-time synchronization
  useEffect(() => {
    // Sync deployments (rereads daily deployment details)
    const unsubDeployments = onSnapshot(collection(db, 'crew_daily_deployment'), (snapshot) => {
      setDeployments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    // Sync extra operators
    const unsubExtraOps = onSnapshot(collection(db, 'crew_extra_operators'), (snapshot) => {
      setExtraOps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    // Sync missed trips
    const unsubMissedTrips = onSnapshot(collection(db, 'missed_trips'), (snapshot) => {
      setMissedTrips(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    
    // Sync relief reports
    const unsubReports = onSnapshot(collection(db, 'emergency_relief_reports'), (snapshot) => {
      const sortedReports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      sortedReports.sort((a, b) => {
        const tA = a.timestamp?.seconds || 0;
        const tB = b.timestamp?.seconds || 0;
        return tB - tA; // most recent first
      });
      setReports(sortedReports);
    });
    
    return () => {
      unsubDeployments();
      unsubExtraOps();
      unsubMissedTrips();
      unsubReports();
    };
  }, []);

  // 2. Identify active Train IDs and the currently assigned operators
  const activeTrains = React.useMemo(() => {
    const trainMap = new Map();
    deployments.forEach(d => {
      const tid = d.trainId || d.rawLegs?.l1Train || d.rawLegs?.l2Train || d.rawLegs?.l3Train || d.rawLegs?.l4Train;
      if (tid && tid !== '--' && tid !== '-' && d.empId && d.empId !== '--') {
        trainMap.set(tid, {
          trainId: tid,
          employeeId: d.empId,
          employeeName: d.empName,
          dutyId: d.dutyId,
          signOnTime: d.signOnTime,
          rawLegs: d.rawLegs
        });
      }
    });
    return Array.from(trainMap.values()).sort((a,b) => a.trainId.localeCompare(b.trainId, undefined, {numeric: true}));
  }, [deployments]);

  // When selected Train ID changes, find the currently running operator
  useEffect(() => {
    if (!selectedTrainId) {
      setOriginalOperator(null);
      setEvaluationResults(null);
      setCascadingDelayResults(null);
      return;
    }
    const matched = activeTrains.find(t => t.trainId === selectedTrainId);
    if (matched) {
      setOriginalOperator({
        employeeId: matched.employeeId,
        employeeName: matched.employeeName,
        dutyId: matched.dutyId,
        signOnTime: matched.signOnTime,
        rawLegs: matched.rawLegs
      });
    } else {
      setOriginalOperator(null);
    }
  }, [selectedTrainId, activeTrains]);

  // 3. Trigger Recommendation evaluation
  const handleGenerateRecommendation = (e) => {
    e.preventDefault();
    if (!selectedTrainId) {
      alert("Please select a Train ID needing relief.");
      return;
    }
    
    // Get current local time
    const now = new Date();
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const results = evaluateReliefCandidates({
      currentTimeStr,
      incidentType: selectedIncidentType,
      incidentLocation: selectedLocation,
      targetTrainId: selectedTrainId,
      currentOperator: originalOperator,
      extraOperators: extraOps,
      deployments,
      missedTrips,
      reliefReports: reports
    });

    const cascadeResults = evaluateCascadingDelayRelief({
      currentTimeStr,
      primaryTrainId: selectedTrainId,
      delayMinutes: parseInt(delayMinutesInput, 10) || 15,
      incidentLocation: selectedLocation,
      extraOperators: extraOps,
      deployments,
      missedTrips,
      reliefReports: reports
    });
    
    setEvaluationResults(results);
    setCascadingDelayResults(cascadeResults);
    setActiveIncidentText(`${selectedIncidentType} on Train ${selectedTrainId} at ${selectedLocation}`);
  };

  // 4. Manually add Extra Operator
  const handleAddExtraOp = async (e) => {
    e.preventDefault();
    if (!newExtraOp.employeeId || !newExtraOp.employeeName) {
      alert("Please provide Employee ID and Name.");
      return;
    }
    try {
      const docId = `extra_op_${newExtraOp.employeeId}`;
      await setDoc(doc(db, 'crew_extra_operators', docId), {
        employeeId: String(newExtraOp.employeeId),
        employeeName: newExtraOp.employeeName.toUpperCase(),
        currentLocation: newExtraOp.currentLocation,
        signOnTime: newExtraOp.signOnTime,
        availabilityStatus: 'AVAILABLE',
        timestamp: serverTimestamp()
      });
      alert("✅ Extra Operator added successfully.");
      setNewExtraOp({
        employeeId: '',
        employeeName: '',
        currentLocation: 'PYID',
        signOnTime: '06:00:00'
      });
    } catch (err) {
      console.error(err);
      alert("Failed to add Extra Operator.");
    }
  };

  // 5. Delete Extra Operator
  const handleDeleteExtraOp = async (empId) => {
    if (window.confirm("Remove this operator from today's extra pool?")) {
      try {
        await deleteDoc(doc(db, 'crew_extra_operators', `extra_op_${empId}`));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 6. Manually log Missed Trip
  const handleAddMissedTrip = async (e) => {
    e.preventDefault();
    if (!newMissedTrip.employeeId || !newMissedTrip.employeeName || !newMissedTrip.missedTrip) {
      alert("Please fill in all missed trip fields.");
      return;
    }
    try {
      const docId = `missed_trip_${newMissedTrip.employeeId}_${Date.now()}`;
      await setDoc(doc(db, 'missed_trips', docId), {
        employeeId: String(newMissedTrip.employeeId),
        employeeName: newMissedTrip.employeeName.toUpperCase(),
        missedTrip: newMissedTrip.missedTrip,
        missedTime: newMissedTrip.missedTime,
        timestamp: serverTimestamp()
      });
      alert("⚠️ Missed trip logged.");
      setNewMissedTrip({
        employeeId: '',
        employeeName: '',
        missedTrip: '',
        missedTime: '12:00:00'
      });
    } catch (err) {
      console.error(err);
      alert("Failed to log missed trip.");
    }
  };

  // 7. Delete Missed Trip
  const handleDeleteMissedTrip = async (id) => {
    if (window.confirm("Remove this missed trip recovery record?")) {
      try {
        await deleteDoc(doc(db, 'missed_trips', id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 8. Execute Relief Assignment
  const handleExecuteRelief = async (plan) => {
    if (!plan || !plan.available) return;
    const reliefOp = plan.operator;
    
    const confirmMsg = originalOperator
      ? `Confirm dispatcher dispatch commands: Reassign Train ID ${selectedTrainId} from ${originalOperator.employeeName} to relief operator ${reliefOp.employeeName}?`
      : `Confirm dispatcher dispatch commands: Assign relief operator ${reliefOp.employeeName} to Train ID ${selectedTrainId}?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }
    
    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const todayStr = now.toISOString().split('T')[0];
      
      // A. Update Daily Roster / Deployment for this original duty
      // Locate original duty document
      if (originalOperator) {
        const matchingDep = deployments.find(d => String(d.dutyId) === String(originalOperator.dutyId));
        if (matchingDep) {
          await updateDoc(doc(db, 'crew_daily_deployment', matchingDep.id), {
            empId: reliefOp.employeeId,
            empName: reliefOp.employeeName,
            remarks: `RELIEVED due to ${selectedIncidentType} by TO ${reliefOp.employeeName} (${reliefOp.employeeId})`
          });
        }
      }
      
      // B. If relief operator was an Extra operator, update their availability status
      if (reliefOp.currentDuty === "EXTRA") {
        await updateDoc(doc(db, 'crew_extra_operators', `extra_op_${reliefOp.employeeId}`), {
          availabilityStatus: 'ASSIGNED'
        });
      }
      
      // C. Save the relief operation details to Reports collection
      await addDoc(collection(db, 'emergency_relief_reports'), {
        incidentTime: timeStr,
        incidentType: selectedIncidentType,
        originalOperator: originalOperator ? {
          employeeId: originalOperator.employeeId,
          employeeName: originalOperator.employeeName,
          dutyId: originalOperator.dutyId,
          signOnTime: originalOperator.signOnTime
        } : {
          employeeId: '--',
          employeeName: 'UNSCHEDULED',
          dutyId: '--',
          signOnTime: '--'
        },
        reliefOperator: {
          employeeId: reliefOp.employeeId,
          employeeName: reliefOp.employeeName,
          currentDuty: reliefOp.currentDuty,
          currentLocation: reliefOp.currentLocation
        },
        reliefReason: activeIncidentText,
        dutyHours: reliefOp.dutyHours || "0h 0m",
        breakTime: reliefOp.breakTime || "Completed",
        recommendationScore: plan.score,
        recoveryTime: `${plan.recoveryTimeMinutes} mins`,
        timestamp: serverTimestamp()
      });
      
      // D. Clean up from missed trips if applicable
      const mtRecord = missedTrips.find(mt => String(mt.employeeId) === String(reliefOp.employeeId));
      if (mtRecord) {
        await deleteDoc(doc(db, 'missed_trips', mtRecord.id));
      }
      
      alert(`✅ Relief plan executed successfully! Dispatch system updated.`);
      setSelectedTrainId('');
      setEvaluationResults(null);
      setCascadingDelayResults(null);
    } catch (err) {
      console.error(err);
      alert("Error executing relief plan: " + err.message);
    }
  };

  const handleExecuteCascadeRelief = async (cascadeItem) => {
    if (isTrainOperator) return;
    if (!cascadeItem || !cascadeItem.suggestedReliever || cascadeItem.suggestedReliever.employeeId === '--') {
      alert("No relief operator assigned to this train.");
      return;
    }
    try {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      const reliefOp = cascadeItem.suggestedReliever;

      await addDoc(collection(db, 'emergency_relief_reports'), {
        incidentTime: timeStr,
        incidentType: cascadeItem.isPrimary ? selectedIncidentType : `Cascading Delay (Train ${cascadeItem.trainId})`,
        originalOperator: {
          employeeId: cascadeItem.currentOperatorId,
          employeeName: cascadeItem.currentOperatorName,
          dutyId: cascadeItem.dutyId,
          signOnTime: '--'
        },
        reliefOperator: {
          employeeId: reliefOp.employeeId,
          employeeName: reliefOp.employeeName,
          currentDuty: reliefOp.dutyId,
          currentLocation: reliefOp.location
        },
        reliefReason: `Cascading delay relief for Train ${cascadeItem.trainId} (+${cascadeItem.delayMinutes} mins delay)`,
        dutyHours: '0h 0m',
        breakTime: 'Completed',
        recommendationScore: reliefOp.score,
        recoveryTime: `${reliefOp.travelTimeMinutes + 3} mins`,
        timestamp: serverTimestamp()
      });

      alert(`✅ Reliever ${reliefOp.employeeName} (${reliefOp.employeeId}) dispatched for Train ${cascadeItem.trainId}!`);
    } catch (err) {
      console.error(err);
      alert("Failed to execute cascade relief dispatch: " + err.message);
    }
  };

  // 9. Report Export Logic (Excel & CSV)
  const filteredReports = React.useMemo(() => {
    if (!reportStartDate || !reportEndDate) return reports;
    const startD = new Date(`${reportStartDate}T00:00:00`).getTime();
    const endD = new Date(`${reportEndDate}T23:59:59`).getTime();
    
    return reports.filter(item => {
      const ts = item.timestamp;
      if (!ts) return true;
      const itemTime = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
      return itemTime >= startD && itemTime <= endD;
    });
  }, [reports, reportStartDate, reportEndDate]);

  const handleExportCSV = () => {
    if (isTrainOperator) return;
    if (filteredReports.length === 0) {
      alert("No data available to export.");
      return;
    }
    const headers = ["Incident Time", "Incident Type", "Original Operator", "Relief Operator", "Relief Reason", "Duty Hours", "Break Time", "Score", "Recovery Time"];
    let csvRows = [headers.join(",")];
    
    filteredReports.forEach(item => {
      const row = [
        `"${item.incidentTime || ''}"`,
        `"${item.incidentType || ''}"`,
        `"${item.originalOperator?.employeeName} (${item.originalOperator?.employeeId})"`,
        `"${item.reliefOperator?.employeeName} (${item.reliefOperator?.employeeId})"`,
        `"${item.reliefReason || ''}"`,
        `"${item.dutyHours || ''}"`,
        `"${item.breakTime || ''}"`,
        `"${item.recommendationScore || 0}"`,
        `"${item.recoveryTime || ''}"`
      ];
      csvRows.push(row.join(","));
    });
    
    const blob = new Blob([csvRows.join('\n')], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `BMRCL_Emergency_Relief_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (isTrainOperator) return;
    if (filteredReports.length === 0) {
      alert("No data available to export.");
      return;
    }
    const formattedData = filteredReports.map(item => ({
      "Incident Time": item.incidentTime,
      "Incident Type": item.incidentType,
      "Original Operator": `${item.originalOperator?.employeeName} (${item.originalOperator?.employeeId})`,
      "Original Duty ID": item.originalOperator?.dutyId,
      "Relief Operator": `${item.reliefOperator?.employeeName} (${item.reliefOperator?.employeeId})`,
      "Relief Original Location": getStationLabel(item.reliefOperator?.currentLocation),
      "Relief Reason": item.reliefReason,
      "Duty Hours worked": item.dutyHours,
      "Break Rest Time": item.breakTime,
      "Recommendation Score": item.recommendationScore,
      "Recovery Time Estimate": item.recoveryTime
    }));
    
    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Emergency Relief");
    XLSX.writeFile(wb, `BMRCL_Emergency_Relief_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrintReport = () => {
    if (isTrainOperator) return;
    window.print();
  };

  return (
    <div className="space-y-6 font-mono text-slate-200">
      
      {/* Tab Navigation header */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-center justify-center text-rose-400 shadow-inner shadow-rose-500/10">
            <ShieldAlert size={22} className="animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black tracking-wider text-slate-100 uppercase">Emergency Relief & Decision Engine</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">Automated optimization & AI-assisted crew dispatching</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          {['DASHBOARD', 'EXTRA_POOL', 'MISSED_TRIPS', 'REPORTS'].map(tab => (
            <button
              key={tab}
              onClick={() => setReliefTab(tab)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-black transition-all ${
                reliefTab === tab 
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {tab.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      {reliefTab === 'DASHBOARD' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* LEFT: Incident Trigger Input Panel */}
          <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
            <div className="border-b border-slate-800 pb-3">
              <span className="font-bold text-xs uppercase text-rose-400 tracking-wider flex items-center gap-1.5">
                <AlertTriangle size={15} /> Trigger Crew Relief incident
              </span>
            </div>
                  <form onSubmit={handleGenerateRecommendation} className="space-y-4 text-xs font-bold uppercase">
              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l1">Select Incident Event</label>
                <select id="emergencyreliefengin-i1" name="emergencyreliefengin-i1"
                  value={selectedIncidentType}
                  onChange={(e) => setSelectedIncidentType(e.target.value)}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {EMERGENCY_EVENTS.map(ev => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l2">Select Target Train ID</label>
                <select id="emergencyreliefengin-i2" name="emergencyreliefengin-i2"
                  value={selectedTrainId}
                  onChange={(e) => setSelectedTrainId(e.target.value)}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">-- SELECT TRAIN --</option>
                  {TRAIN_IDS.map(tid => {
                    const active = activeTrains.find(t => t.trainId === tid);
                    return (
                      <option key={tid} value={tid}>
                        Train {tid} {active ? `(${active.employeeName} - Duty ${active.dutyId})` : '(No Active TO Scheduled)'}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l3">Incident Station / Location</label>
                <select id="emergencyreliefengin-i3" name="emergencyreliefengin-i3"
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {STATION_DETAILS.map(st => (
                    <option key={st.code} value={st.code}>
                      {st.name} ({st.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-slate-500 tracking-wider">Technical Delay Duration (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={delayMinutesInput}
                  onChange={(e) => setDelayMinutesInput(e.target.value)}
                  disabled={isTrainOperator}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-amber-400 font-bold focus:outline-none disabled:opacity-50"
                  placeholder="e.g. 15"
                />
              </div>

              {originalOperator ? (
                <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-lg space-y-1.5 text-[11px] font-medium lowercase">
                  <div className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Active Operator Info</div>
                  <div>Name: <span className="text-slate-200 font-bold uppercase">{originalOperator.employeeName}</span></div>
                  <div>ID: <span className="text-slate-200 font-bold uppercase">{originalOperator.employeeId}</span></div>
                  <div>Duty ID: <span className="text-rose-400 font-bold uppercase">{originalOperator.dutyId}</span></div>
                  <div>Sign On: <span className="text-slate-200">{originalOperator.signOnTime}</span></div>
                </div>
              ) : selectedTrainId ? (
                <div className="p-3 bg-slate-950/60 border border-rose-500/20 rounded-lg space-y-1.5 text-[11px] font-medium text-amber-400">
                  <div className="text-[9px] uppercase tracking-wider text-amber-500 font-bold">Train Status</div>
                  <div>No operator is currently scheduled for Train {selectedTrainId}. Relief recommendations will find standby operators for dispatch.</div>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!selectedTrainId || isTrainOperator}
                className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:cursor-not-allowed text-slate-950 font-black py-3.5 rounded-lg tracking-widest uppercase transition-all shadow-lg shadow-rose-600/10 flex items-center justify-center gap-2"
              >
                <Sparkles size={16} /> {isTrainOperator ? "VIEW-ONLY CONSOLE" : "Generate Relief Recommendation"}
              </button>
            </form>
          </div>

          {/* RIGHT: Decision recommendation details (2 Columns) */}
          <div className="xl:col-span-2 space-y-6">
            
            {evaluationResults ? (
              <>
                {/* CASCADING DELAY RELIEVER OPTIMIZATION MATRIX CARD */}
                {cascadingDelayResults && cascadingDelayResults.cascadePlans?.length > 0 && (
                  <div className="bg-slate-900 border border-amber-500/50 rounded-xl p-5 shadow-2xl space-y-4 font-mono">
                    <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-5 w-5 text-amber-400" />
                        <div>
                          <h3 className="text-amber-400 font-bold text-sm tracking-wider uppercase">
                            Cascading Delay & Multi-Train Relief Optimization
                          </h3>
                          <p className="text-[10px] text-slate-400">
                            Primary Delay: Train {cascadingDelayResults.primaryTrainId} ({cascadingDelayResults.primaryDelayMinutes} mins delay) → {cascadingDelayResults.totalImpactedTrains} Downstream Trains Impacted
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="bg-emerald-955 text-emerald-300 border border-emerald-800 text-[10px] px-2.5 py-1 rounded font-bold">
                          Estimated Service Normalization: {cascadingDelayResults.normalizationTimeStr} ({cascadingDelayResults.estimatedNormalizationMinutes} mins)
                        </span>
                      </div>
                    </div>

                    {/* AI Advice Callout */}
                    <div className="bg-amber-955/30 border border-amber-800/60 p-3 rounded-lg flex items-start gap-2.5">
                      <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-200">
                        <strong>AI Optimization Advice:</strong> System evaluated standby pools (<strong className="text-cyan-300">STBK Peenya</strong>, <strong className="text-purple-300">PRO</strong>, <strong className="text-amber-300">RD3 STBY</strong>, <strong className="text-emerald-300">TGTP STBY</strong>, <strong className="text-indigo-300">EXTRA</strong>). Relievers have been allocated for Train {cascadingDelayResults.primaryTrainId} and all following delayed trains until service normalizes.
                      </div>
                    </div>

                    {/* Cascade Plans Table */}
                    <div className="overflow-x-auto custom-scrollbar border border-slate-800 rounded-lg">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-955 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                          <tr>
                            <th className="p-3">Seq / Train ID</th>
                            <th className="p-3">Current Operator</th>
                            <th className="p-3 text-rose-400">Delay</th>
                            <th className="p-3">Scheduled ➔ Takeover</th>
                            <th className="p-3 text-cyan-400">Suggested Reliever</th>
                            <th className="p-3">Relief Pool</th>
                            <th className="p-3">Location & Travel</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 bg-slate-900/60">
                          {cascadingDelayResults.cascadePlans.map((plan, idx) => (
                            <tr key={idx} className="hover:bg-slate-850/50 transition">
                              <td className="p-3 font-bold text-white">
                                <span className="text-slate-500 text-[10px] mr-1 font-mono">#{plan.sequence}</span>
                                Train {plan.trainId}
                                {plan.isPrimary && (
                                  <span className="ml-2 bg-rose-955 text-rose-300 border border-rose-800 text-[9px] px-1.5 py-0.5 rounded font-black">
                                    PRIMARY DELAY
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-slate-300">
                                {plan.currentOperatorName} <span className="text-[10px] text-slate-500">({plan.currentOperatorId})</span>
                              </td>
                              <td className="p-3 font-bold text-rose-400">
                                +{plan.delayMinutes} mins
                              </td>
                              <td className="p-3 text-slate-400 font-mono text-[11px]">
                                {plan.scheduledTime} ➔ <strong className="text-amber-300">{plan.projectedTakeoverTime}</strong>
                              </td>
                              <td className="p-3 font-bold text-cyan-300">
                                {plan.suggestedReliever.employeeName}
                                {plan.suggestedReliever.employeeId !== '--' && (
                                  <span className="text-[10px] text-slate-400 block font-normal">#{plan.suggestedReliever.employeeId}</span>
                                )}
                              </td>
                              <td className="p-3">
                                <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase ${
                                  plan.suggestedReliever.pool === 'STBK' ? 'bg-cyan-955 text-cyan-300 border border-cyan-700' :
                                  plan.suggestedReliever.pool === 'PRO' ? 'bg-purple-955 text-purple-300 border border-purple-800' :
                                  plan.suggestedReliever.pool === 'RD3' ? 'bg-amber-955 text-amber-300 border border-amber-800' :
                                  plan.suggestedReliever.pool === 'TGTP' ? 'bg-emerald-955 text-emerald-300 border border-emerald-800' :
                                  plan.suggestedReliever.pool === 'EXTRA' ? 'bg-indigo-955 text-indigo-300 border border-indigo-800' :
                                  'bg-slate-800 text-slate-400 border border-slate-700'
                                }`}>
                                  {plan.suggestedReliever.pool === 'STBK' ? 'STBK / STANDBY PEENYA' :
                                   plan.suggestedReliever.pool === 'PRO' ? 'PRO STANDBY' :
                                   plan.suggestedReliever.pool === 'RD3' ? 'RD3 STANDBY' :
                                   plan.suggestedReliever.pool === 'TGTP' ? 'TGTP STANDBY' :
                                   plan.suggestedReliever.pool === 'EXTRA' ? 'EXTRA POOL' : 'UNASSIGNED'}
                                </span>
                              </td>
                              <td className="p-3 text-slate-400 text-[11px]">
                                {plan.location} ({plan.suggestedReliever.travelTimeMinutes} min travel)
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleExecuteCascadeRelief(plan)}
                                  disabled={isTrainOperator || plan.suggestedReliever.employeeId === '--'}
                                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-slate-955 px-2.5 py-1 rounded text-[10px] font-black uppercase transition shadow inline-flex items-center gap-1"
                                >
                                  <Send size={11} /> Dispatch
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 1. Recommended relief Operator Panel */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-emerald-500/15 border-b border-l border-emerald-500/30 text-[9px] font-bold text-emerald-400 px-4 py-1.5 rounded-bl-lg uppercase tracking-wider flex items-center gap-1">
                    <Award size={12} /> Best Candidate Match
                  </div>
                  
                  <h3 className="font-bold text-xs uppercase text-emerald-400 tracking-wider mb-4 pb-2 border-b border-slate-800">
                    Recommended Relief Operator
                  </h3>

                  {evaluationResults.bestPlan.available ? (
                    <div className="space-y-6">
                      
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-850">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-center text-slate-400 shadow-inner">
                            <User size={24} />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-200">
                              {evaluationResults.bestPlan.operator.employeeName}
                            </h4>
                            <p className="text-[10px] text-slate-550 mt-0.5">
                              ID: <span className="text-emerald-400 font-bold">{evaluationResults.bestPlan.operator.employeeId}</span> | Location: {getStationLabel(evaluationResults.bestPlan.operator.currentLocation)}
                            </p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-500 font-bold uppercase">Recommendation Score</div>
                          <div className="text-xl font-black text-emerald-400 tracking-wider">
                            +{evaluationResults.bestPlan.score}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
                        <div className="bg-slate-950/30 border border-slate-850 rounded-lg p-2.5 space-y-1">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">Current Duty</span>
                          <span className="text-slate-200 font-bold">{evaluationResults.bestPlan.operator.currentDuty}</span>
                        </div>
                        <div className="bg-slate-950/30 border border-slate-850 rounded-lg p-2.5 space-y-1">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">Duty Hours</span>
                          <span className="text-emerald-400 font-bold">{evaluationResults.bestPlan.operator.dutyHours}</span>
                        </div>
                        <div className="bg-slate-950/30 border border-slate-850 rounded-lg p-2.5 space-y-1">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">Break Time</span>
                          <span className="text-slate-300 font-bold">{evaluationResults.bestPlan.operator.breakTime}</span>
                        </div>
                        <div className="bg-slate-950/30 border border-slate-850 rounded-lg p-2.5 space-y-1">
                          <span className="text-[9px] text-slate-500 block uppercase tracking-wider">Missed Trips</span>
                          <span className="text-amber-500 font-bold">{evaluationResults.bestPlan.operator.missedTripCount} Trips</span>
                        </div>
                      </div>

                      {/* Scoring breakdown tags */}
                      <div className="space-y-2">
                        <span className="text-[9px] text-slate-500 block uppercase tracking-wider">AI Decision Breakdown</span>
                        <div className="flex flex-wrap gap-1.5">
                          {evaluationResults.bestPlan.operator.scoreBreakdown.map((b, i) => (
                            <span 
                              key={i} 
                              className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                b.points > 0 
                                  ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-rose-500/5 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              {b.label}: {b.points > 0 ? `+${b.points}` : b.points}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-t border-slate-800 pt-4">
                        <div className="text-[11px] font-medium text-slate-400 lowercase leading-relaxed max-w-md">
                          {evaluationResults.bestPlan.description}
                        </div>
                        {!isTrainOperator && (
                          <button
                            onClick={() => handleExecuteRelief(evaluationResults.bestPlan)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-5 py-2.5 rounded-lg text-xs tracking-wider uppercase transition shadow-md flex items-center gap-1.5 shrink-0"
                          >
                            <Send size={14} /> Execute Relief Plan
                          </button>
                        )}
                      </div>

                    </div>
                  ) : (
                    <div className="text-center py-8 text-slate-500 text-xs italic">
                      No eligible relief operator available.
                    </div>
                  )}
                </div>

                {/* 2. Normalization Engine plans (Best, Alt A, Alt B) */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
                  <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                    <span className="font-bold text-xs uppercase text-indigo-400 tracking-wider flex items-center gap-1.5">
                      <Activity size={15} /> Crew Normalization Plans
                    </span>
                    {evaluationResults.shortLoopPossible && (
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                        Short Loop Optimized
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Plan Best */}
                    <div className="bg-slate-950/40 border border-emerald-500/20 rounded-xl p-4 space-y-2 flex flex-col justify-between hover:border-emerald-500/40 transition-all">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-emerald-400 uppercase tracking-widest border-b border-slate-850 pb-1.5">
                          <span>Best Relief Plan</span>
                          <span className="text-xs">+{evaluationResults.bestPlan.score || 0}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 lowercase leading-relaxed">
                          {evaluationResults.bestPlan.available 
                            ? `${evaluationResults.bestPlan.operator.employeeName} (${evaluationResults.bestPlan.operator.employeeId})`
                            : "No operator found."}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-bold uppercase">
                        <span className="text-slate-500">Recovery Est:</span>
                        <span className="text-emerald-400">{evaluationResults.bestPlan.available ? `${evaluationResults.bestPlan.recoveryTimeMinutes} mins` : '--'}</span>
                      </div>
                    </div>

                    {/* Plan A */}
                    <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-2 flex flex-col justify-between hover:border-slate-800 transition-all">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-850 pb-1.5">
                          <span>Alternative Plan A</span>
                          <span className="text-xs">+{evaluationResults.alternativePlanA.score || 0}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 lowercase leading-relaxed">
                          {evaluationResults.alternativePlanA.available 
                            ? `${evaluationResults.alternativePlanA.operator.employeeName} (${evaluationResults.alternativePlanA.operator.employeeId})`
                            : "No alternative found."}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-bold uppercase">
                        <span className="text-slate-500">Recovery Est:</span>
                        <span className="text-slate-300">{evaluationResults.alternativePlanA.available ? `${evaluationResults.alternativePlanA.recoveryTimeMinutes} mins` : '--'}</span>
                      </div>
                    </div>

                    {/* Plan B */}
                    <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4 space-y-2 flex flex-col justify-between hover:border-slate-800 transition-all">
                      <div>
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-300 uppercase tracking-widest border-b border-slate-850 pb-1.5">
                          <span>Alternative Plan B</span>
                          <span className="text-xs">+{evaluationResults.alternativePlanB.score || 0}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2 lowercase leading-relaxed">
                          {evaluationResults.alternativePlanB.available 
                            ? `${evaluationResults.alternativePlanB.operator.employeeName} (${evaluationResults.alternativePlanB.operator.employeeId})`
                            : "No alternative found."}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] font-bold uppercase">
                        <span className="text-slate-500">Recovery Est:</span>
                        <span className="text-slate-300">{evaluationResults.alternativePlanB.available ? `${evaluationResults.alternativePlanB.recoveryTimeMinutes} mins` : '--'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Candidates comparison table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
                  <span className="font-bold text-xs uppercase text-slate-400 tracking-wider">
                    All Eligible relief pool rankings
                  </span>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[10px] font-mono">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                          <th className="p-2 text-center">Rank</th>
                          <th className="p-2">Name / ID</th>
                          <th className="p-2">Duty ID</th>
                          <th className="p-2">Location</th>
                          <th className="p-2 text-center">Score</th>
                          {!isTrainOperator && <th className="p-2 text-right">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {evaluationResults.allEligible.map((candidate, idx) => (
                          <tr key={candidate.employeeId} className="hover:bg-slate-950/40">
                            <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                            <td className="p-2">
                              <div className="font-bold text-slate-200">{candidate.employeeName}</div>
                              <div className="text-[9px] text-slate-500">{candidate.employeeId}</div>
                            </td>
                            <td className="p-2 text-slate-400 font-bold">{candidate.currentDuty}</td>
                            <td className="p-2 text-slate-400">{getStationLabel(candidate.currentLocation)}</td>
                            <td className="p-2 text-center text-emerald-400 font-black">+{candidate.recommendationScore}</td>
                            {!isTrainOperator && (
                              <td className="p-2 text-right">
                                <button
                                  onClick={() => handleExecuteRelief({ available: true, operator: candidate, score: candidate.recommendationScore, recoveryTimeMinutes: candidate.travelTimeMinutes + 3 })}
                                  className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-200 px-2 py-1 rounded font-bold uppercase"
                                >
                                  Assign
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                        
                        {evaluationResults.allRejected.map(candidate => (
                          <tr key={candidate.employeeId} className="opacity-40 bg-slate-950/20">
                            <td className="p-2 text-center text-slate-650">-</td>
                            <td className="p-2">
                              <div className="font-bold text-slate-400">{candidate.employeeName}</div>
                              <div className="text-[9px] text-slate-600">{candidate.employeeId}</div>
                            </td>
                            <td className="p-2 text-slate-600">{candidate.currentDuty}</td>
                            <td className="p-2 text-slate-600">{getStationLabel(candidate.currentLocation)}</td>
                            <td className="p-2 text-center text-rose-500/80 font-bold">REJ</td>
                            <td className="p-2 text-right text-rose-500 text-[9px] font-bold">
                              {candidate.rejectionReason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-20 shadow-xl text-center space-y-3">
                <ShieldAlert size={48} className="text-slate-700 mx-auto" />
                <h3 className="text-slate-400 font-bold text-xs uppercase tracking-wider">No Incident Selected</h3>
                <p className="text-[10px] text-slate-600 max-w-sm mx-auto uppercase">
                  Select a Train ID and click recommendation button in incident panel to run decision algorithms.
                </p>
              </div>
            )}

          </div>
        </div>
      )}

      {reliefTab === 'EXTRA_POOL' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Add Operator Form (1 Column) */}
          {!isTrainOperator && (
            <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center text-emerald-400">
                <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={16} /> Add Extra Train Operator
                </span>
              </div>

              <form onSubmit={handleAddExtraOp} className="space-y-4 text-xs font-bold uppercase">
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l4">Employee ID</label>
                  <input id="emergencyreliefengin-i4" name="emergencyreliefengin-i4"
                    type="text"
                    placeholder="e.g. 22464"
                    value={newExtraOp.employeeId}
                    onChange={(e) => setNewExtraOp({ ...newExtraOp, employeeId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l5">Employee Name</label>
                  <input id="emergencyreliefengin-i5" name="emergencyreliefengin-i5"
                    type="text"
                    placeholder="e.g. NAVEEN KUMAR"
                    value={newExtraOp.employeeName}
                    onChange={(e) => setNewExtraOp({ ...newExtraOp, employeeName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-550 tracking-wider" htmlFor="emergencyreliefengin-l6">Current Standby Location</label>
                  <select id="emergencyreliefengin-i6" name="emergencyreliefengin-i6"
                    value={newExtraOp.currentLocation}
                    onChange={(e) => setNewExtraOp({ ...newExtraOp, currentLocation: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  >
                    {STATION_DETAILS.map(st => (
                      <option key={st.code} value={st.code}>
                        {st.name} ({st.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l7">Sign On Time</label>
                  <input id="emergencyreliefengin-i7" name="emergencyreliefengin-i7"
                    type="text"
                    placeholder="e.g. 06:00:00"
                    value={newExtraOp.signOnTime}
                    onChange={(e) => setNewExtraOp({ ...newExtraOp, signOnTime: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-3 rounded-lg tracking-widest uppercase transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} /> Add to Extra Pool
                </button>
              </form>
            </div>
          )}

          {/* Extra Pool Table (2 Columns / 3 Columns) */}
          <div className={`${isTrainOperator ? 'xl:col-span-3' : 'xl:col-span-2'} bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4`}>
            <div className="border-b border-slate-800 pb-2">
              <span className="font-bold text-xs uppercase text-slate-200 tracking-wider">
                Extra Train Operators Available Today (Priority 1 Pool)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                    <th className="p-3">Employee ID</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Location</th>
                    <th className="p-3">Sign On Time</th>
                    <th className="p-3">Status</th>
                    {!isTrainOperator && <th className="p-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {extraOps.length === 0 ? (
                    <tr>
                      <td colSpan={isTrainOperator ? "5" : "6"} className="p-6 text-center text-slate-500 italic text-[11px] uppercase">
                        No Extra Operators manually registered for today.
                      </td>
                    </tr>
                  ) : (
                    extraOps.map(op => (
                      <tr key={op.employeeId} className="hover:bg-slate-950/40">
                        <td className="p-3 font-bold text-emerald-400">{op.employeeId}</td>
                        <td className="p-3 font-bold uppercase text-slate-200">{op.employeeName}</td>
                        <td className="p-3">{getStationLabel(op.currentLocation)}</td>
                        <td className="p-3 font-mono">{op.signOnTime}</td>
                        <td className="p-3">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            op.availabilityStatus === 'AVAILABLE' 
                              ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                              : 'text-slate-500 bg-slate-850 border border-slate-800'
                          }`}>
                            {op.availabilityStatus}
                          </span>
                        </td>
                        {!isTrainOperator && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteExtraOp(op.employeeId)}
                              className="text-rose-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {reliefTab === 'MISSED_TRIPS' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* Add Missed Trip Form (1 Column) */}
          {!isTrainOperator && (
            <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3 flex justify-between items-center text-amber-400">
                <span className="font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle size={16} /> Log Missed Trip Variance
                </span>
              </div>

              <form onSubmit={handleAddMissedTrip} className="space-y-4 text-xs font-bold uppercase">
                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l8">Employee ID</label>
                  <input id="emergencyreliefengin-i8" name="emergencyreliefengin-i8"
                    type="text"
                    placeholder="e.g. 21460"
                    value={newMissedTrip.employeeId}
                    onChange={(e) => setNewMissedTrip({ ...newMissedTrip, employeeId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l9">Employee Name</label>
                  <input id="emergencyreliefengin-i9" name="emergencyreliefengin-i9"
                    type="text"
                    placeholder="e.g. KAVITHA M N"
                    value={newMissedTrip.employeeName}
                    onChange={(e) => setNewMissedTrip({ ...newMissedTrip, employeeName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l10">Missed Trip ID / Run File</label>
                  <input id="emergencyreliefengin-i10" name="emergencyreliefengin-i10"
                    type="text"
                    placeholder="e.g. Run 104"
                    value={newMissedTrip.missedTrip}
                    onChange={(e) => setNewMissedTrip({ ...newMissedTrip, missedTrip: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="emergencyreliefengin-l11">Incident Time</label>
                  <input id="emergencyreliefengin-i11" name="emergencyreliefengin-i11"
                    type="text"
                    placeholder="e.g. 12:00:00"
                    value={newMissedTrip.missedTime}
                    onChange={(e) => setNewMissedTrip({ ...newMissedTrip, missedTime: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-black py-3 rounded-lg tracking-widest uppercase transition-all shadow-lg shadow-amber-500/10 flex items-center justify-center gap-1.5"
                >
                  <AlertTriangle size={16} /> Log Missed Trip
                </button>
              </form>
            </div>
          )}

          {/* Missed Trips Table (2 Columns / 3 Columns) */}
          <div className={`${isTrainOperator ? 'xl:col-span-3' : 'xl:col-span-2'} bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4`}>
            <div className="border-b border-slate-800 pb-2">
              <span className="font-bold text-xs uppercase text-slate-200 tracking-wider">
                Missed Trip Recovery Registry (Highest Priority Allocation Boost)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                    <th className="p-3">Employee ID</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Missed Trip ID</th>
                    <th className="p-3">Incident Time</th>
                    {!isTrainOperator && <th className="p-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {missedTrips.length === 0 ? (
                    <tr>
                      <td colSpan={isTrainOperator ? "4" : "5"} className="p-6 text-center text-slate-500 italic text-[11px] uppercase">
                        No missed trip recovery records currently logged.
                      </td>
                    </tr>
                  ) : (
                    missedTrips.map(mt => (
                      <tr key={mt.id} className="hover:bg-slate-950/40">
                        <td className="p-3 font-bold text-amber-400">{mt.employeeId}</td>
                        <td className="p-3 font-bold uppercase text-slate-200">{mt.employeeName}</td>
                        <td className="p-3 font-bold">{mt.missedTrip}</td>
                        <td className="p-3 font-mono">{mt.missedTime}</td>
                        {!isTrainOperator && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleDeleteMissedTrip(mt.id)}
                              className="text-rose-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {reliefTab === 'REPORTS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <span className="font-bold text-xs uppercase text-rose-400 tracking-wider flex items-center gap-1.5">
                <FileText size={16} /> Emergency Crew Relief Reports Center
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase">
              <Calendar size={14} className="text-slate-500" />
              <input id="emergencyreliefengin-i12" name="emergencyreliefengin-i12"
                type="date"
                value={reportStartDate}
                onChange={(e) => setReportStartDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
              />
              <span className="text-slate-650">to</span>
              <input id="emergencyreliefengin-i13" name="emergencyreliefengin-i13"
                type="date"
                value={reportEndDate}
                onChange={(e) => setReportEndDate(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200"
              />
              
              {!isTrainOperator && (
                <div className="flex gap-1.5 ml-2">
                  <button
                    onClick={handleExportExcel}
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-3 py-1.5 rounded font-black text-xs flex items-center gap-1 transition shadow"
                    title="Export to Excel Spreadsheet"
                  >
                    <FileSpreadsheet size={14} /> XLSX
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded font-black text-xs flex items-center gap-1 transition"
                    title="Export to CSV Format"
                  >
                    <Download size={14} /> CSV
                  </button>
                  <button
                    onClick={handlePrintReport}
                    className="bg-slate-950 border border-slate-850 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded font-black text-xs flex items-center gap-1 transition"
                    title="Print Reports Matrix"
                  >
                    <Printer size={14} /> Print
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-left border-collapse text-[11px] font-mono">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                  <th className="p-3">Incident Time</th>
                  <th className="p-3">Incident Type</th>
                  <th className="p-3">Original Operator</th>
                  <th className="p-3">Relief Operator</th>
                  <th className="p-3">Relief Reason</th>
                  <th className="p-3">Duty Hours</th>
                  <th className="p-3">Break Time</th>
                  <th className="p-3 text-center">Score</th>
                  <th className="p-3 text-right">Recovery Est</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-350">
                {filteredReports.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="p-8 text-center text-slate-500 italic uppercase">
                      No relief operations records found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredReports.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-950/40">
                      <td className="p-3 font-mono font-bold text-slate-400">{item.incidentTime}</td>
                      <td className="p-3 font-bold text-rose-400">{item.incidentType}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-300">{item.originalOperator?.employeeName}</div>
                        <div className="text-[9px] text-slate-500">ID: {item.originalOperator?.employeeId} | Duty: {item.originalOperator?.dutyId}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-emerald-400">{item.reliefOperator?.employeeName}</div>
                        <div className="text-[9px] text-slate-550">
                          ID: {item.reliefOperator?.employeeId} | Duty: {item.reliefOperator?.currentDuty} | Loc: {getStationLabel(item.reliefOperator?.currentLocation)}
                        </div>
                      </td>
                      <td className="p-3 text-slate-400 italic lowercase max-w-xs truncate" title={item.reliefReason}>
                        {item.reliefReason}
                      </td>
                      <td className="p-3 font-mono">{item.dutyHours}</td>
                      <td className="p-3 font-mono">{item.breakTime}</td>
                      <td className="p-3 text-center text-emerald-400 font-bold">+{item.recommendationScore}</td>
                      <td className="p-3 text-right font-mono text-slate-300 font-bold">{item.recoveryTime}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

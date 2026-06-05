import React, { useState, useEffect } from 'react';
// This import must point to the exact location of your firebase.js file
import { db } from '../firebase'; 
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, writeBatch, serverTimestamp, query, where } from 'firebase/firestore';
import { Search, RefreshCw, ArrowDownCircle, ArrowUpCircle, Train, Users, Trash2, ShieldCheck, UploadCloud, UserCheck, RotateCcw, AlertTriangle, Clock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { currentUser, userRole } = useAuth();
  
  const hasAdminRights = () => {
    return userRole === 'CREW_CONTROLLER' || userRole === 'ADMIN';
  };

  // Add this helper to determine permissions
  const canEdit = ['ADMIN', 'CREW_CONTROLLER'].includes(userRole);
  const isTrainOperator = userRole === 'TRAIN_OPERATOR';

  const [activeTab, setActiveTab] = useState('SIGNON');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDay, setActiveDay] = useState('WEEKDAY');
  const [unifiedRows, setUnifiedRows] = useState([]);
  const [links, setLinks] = useState([]);
  const [dailyDeployment, setDailyDeployment] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [targetTid, setTargetTid] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [incidentReason, setIncidentReason] = useState('Signal Fluctuation');

  const [swapFromDuty, setSwapFromDuty] = useState('');
  const [swapToDuty, setSwapToDuty] = useState('');

  const [editingCell, setEditingCell] = useState({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false });
  const [editValue, setEditValue] = useState('');

  const [liveTrainTrackingMap, setLiveTrainTrackingMap] = useState({});
  const [trackerSearchTerm, setTrackerSearchTerm] = useState('');

  // --- Staff Management States ---
  const [systemUsers, setSystemUsers] = useState([]);
  const [newEmpId, setNewEmpId] = useState('');
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('TRAIN_OPERATOR');

  const dayTabs = [
    { id: 'WEEKDAY', label: 'WEEKDAY SCHEDULE' },
    { id: 'MONDAY', label: 'MONDAY SCHEDULE' },
    { id: 'SATURDAY', label: 'SAT & GH ROSTER' },
    { id: 'SUNDAY', label: 'SUNDAY SCHEDULE' }
  ];

  const dnStationOrder = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
  const upStationOrder = ["APTS", "PUTH", "RVR", "NLC", "KGWA", "RJNR", "YPM", "PYID", "NGSA", "BIET"];

  const getEarliestTimeSeconds = (row) => {
    const times = [];
    if (row.downTrip?.stations) {
      Object.values(row.downTrip.stations).forEach(t => { if (t && String(t) !== '--' && String(t) !== '-') times.push(timeToSeconds(t)); });
    }
    if (row.upTrip?.stations) {
      Object.values(row.upTrip.stations).forEach(t => { if (t && String(t) !== '--' && String(t) !== '-') times.push(timeToSeconds(t)); });
    }
    return times.length === 0 ? 999999 : Math.min(...times);
  };

  // FIX 2: Added String() casting to prevent fatal runtime errors on split()
  const timeToSeconds = (timeStr) => {
    if (!timeStr || String(timeStr) === '--' || String(timeStr) === '-') return 999999;
    const parts = String(timeStr).split(':');
    let secs = 0;
    if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
    if (parts[1]) secs += parseInt(parts[1], 10) * 60;
    if (parts[2]) secs += parseInt(parts[2], 10);
    return secs;
  };

  const secondsToTime = (secs) => {
    if (secs >= 999999) return '--';
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const addDelayToTime = (timeStr, mins) => {
    if (!timeStr || String(timeStr) === '--' || String(timeStr) === '-') return '--';
    const totalSecs = timeToSeconds(timeStr) + (parseInt(mins, 10) * 60);
    return secondsToTime(totalSecs);
  };

  const fetchLiveData = async () => {
    try {
      setLoading(true);
      const [wttSnapshot, linksSnapshot, deploySnapshot, attSnapshot, incSnapshot, usersSnapshot] = await Promise.all([
        getDocs(collection(db, "wtt_final_matrix")), 
        getDocs(collection(db, "crew_final_links")),
        getDocs(collection(db, "crew_daily_deployment")), 
        getDocs(collection(db, "crew_live_attendance")),
        getDocs(collection(db, "wtt_live_incidents")),
        getDocs(collection(db, "system_users"))
      ]);

      const wttData = wttSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const linksData = linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const deployData = deploySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const attData = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const incData = incSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setSystemUsers(usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLiveIncidents(incData);

      const dayTrips = wttData.filter(t => String(t.scheduleType || '').toUpperCase() === activeDay);
      const downLineTrips = dayTrips.filter(t => String(t.terminalLoopRoute || '').toLowerCase().includes('(dn)'));
      const upLineTrips = dayTrips.filter(t => String(t.terminalLoopRoute || '').toLowerCase().includes('(up)'));

      let synchronizedPairs = [];
      downLineTrips.forEach(dnTrip => {
        const matchingUpIdx = upLineTrips.findIndex(upTrip => 
          upTrip.trainId === dnTrip.trainId && 
          timeToSeconds(upTrip.stations?.['PYID']) >= timeToSeconds(dnTrip.stations?.['PYID'])
        );
        let matchedUpTrip = null;
        if (matchingUpIdx !== -1) matchedUpTrip = upLineTrips.splice(matchingUpIdx, 1)[0];
        synchronizedPairs.push({ id: dnTrip.id, trainId: dnTrip.trainId, downTrip: dnTrip, upTrip: matchedUpTrip });
      });

      upLineTrips.forEach(upTrip => {
        synchronizedPairs.push({ id: upTrip.id, trainId: upTrip.trainId, downTrip: null, upTrip: upTrip });
      });

      synchronizedPairs.sort((a, b) => getEarliestTimeSeconds(a) - getEarliestTimeSeconds(b));
      setUnifiedRows(synchronizedPairs);
      
      const currentDayLinks = linksData.filter(l => String(l.scheduleType || '').toUpperCase() === activeDay).sort((a,b) => String(a.dutyId).localeCompare(String(b.dutyId), undefined, {numeric: true}));
      setLinks(currentDayLinks);

      const activeDeployments = currentDayLinks.map(link => {
        const matchingGcc = deployData.find(d => String(d.dutyId) === String(link.dutyId) && String(d.scheduleType).toUpperCase() === activeDay);
        const matchedAtt = attData.find(a => String(a.dutyId) === String(link.dutyId) && String(a.scheduleType).toUpperCase() === activeDay);
        return {
          id: link.id, dutyId: link.dutyId, signOnTime: link.signOnTime, signOnLocation: link.signOnLocation,
          trainId: link.trainId, empId: matchingGcc ? matchingGcc.empId : '--', empName: matchingGcc ? matchingGcc.empName : '--',
          remarks: matchingGcc ? matchingGcc.remarks : 'Pending GCC Load', isSignedOn: !!matchedAtt, signOnTimestamp: matchedAtt ? matchedAtt.signOnTimeActual : null,
          rawLegs: {
            l1Train: link.trainId || '--', l1Start: link.signOnTime || '--', l1End: link.leg2ArrTime || '--',
            l2Train: link.leg2TrainNo || '--', l2Start: link.leg2DepTime || '--', l2End: link.leg3HandoverTime || '--',
            l3Train: link.leg3TrainNo || '--', l3Start: link.leg3TakeoverTime || '--', l3End: link.leg4FinalArrTime || '--',
            l4Train: link.leg4TrainNo || '--', l4Start: link.leg4FinalArrTime || '--', l4End: link.signOffTime || '--'
          }
        };
      });

      setDailyDeployment(activeDeployments);
      setAttendanceLogs(attData.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));

      const currentSecs = (() => {
        const now = new Date();
        return (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
      })();

      let trainTimelineMap = {};
      activeDeployments.forEach(operator => {
        const processLeg = (tid, startStr, endStr) => {
          if (!tid || tid === '--' || tid === '-') return;
          if (!trainTimelineMap[tid]) trainTimelineMap[tid] = [];
          trainTimelineMap[tid].push({ dutyId: operator.dutyId, empName: operator.empName, empId: operator.empId, startSec: timeToSeconds(startStr), endSec: timeToSeconds(endStr), startStr, endStr });
        };
        processLeg(operator.rawLegs.l1Train, operator.rawLegs.l1Start, operator.rawLegs.l1End);
        processLeg(operator.rawLegs.l2Train, operator.rawLegs.l2Start, operator.rawLegs.l2End);
        processLeg(operator.rawLegs.l3Train, operator.rawLegs.l3Start, operator.rawLegs.l3End);
        processLeg(operator.rawLegs.l4Train, operator.rawLegs.l4Start, operator.rawLegs.l4End);
      });

      let calculatedTracking = {};
      Object.keys(trainTimelineMap).forEach(tid => {
        let timeline = trainTimelineMap[tid].sort((a, b) => a.startSec - b.startSec);
        let currentIdx = timeline.findIndex(c => currentSecs >= c.startSec && currentSecs <= c.endSec);
        if (currentIdx === -1) {
          currentIdx = timeline.findIndex(c => c.startSec > currentSecs);
          if (currentIdx === -1) currentIdx = timeline.length - 1;
        }
        calculatedTracking[tid] = { current: timeline[currentIdx] || null, previous: timeline[currentIdx - 1] || null, nextReliver: timeline[currentIdx + 1] || null };
      });

      setLiveTrainTrackingMap(calculatedTracking);

    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveData();
  }, [activeDay, activeTab]);

  // --- Manual Staff Management ---
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newEmail || !newRole) return;
    
    try {
      const targetEmail = newEmail.trim().toLowerCase();
      await setDoc(doc(db, "system_users", targetEmail), {
        empId: newEmpId.trim(),
        name: newEmpName.trim(),
        email: targetEmail,
        role: newRole,
        lastUpdated: serverTimestamp()
      });
      
      alert(`✔ ${newEmpName} successfully granted ${newRole} access.`);
      setNewEmpId(''); setNewEmpName(''); setNewEmail(''); setNewRole('TRAIN_OPERATOR');
      fetchLiveData(); // Refresh the list
    } catch (err) {
      console.error(err);
      alert("Error adding user.");
    }
  };

  const handleDeleteUser = async (emailId) => {
    if (window.confirm(`CRITICAL WARNING: Revoke system access for ${emailId}?`)) {
      try {
        await deleteDoc(doc(db, "system_users", emailId));
        fetchLiveData(); // Refresh the list
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleGccRosterUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        const lines = text.split(/\r?\n/);
        const batch = writeBatch(db);
        let validEntries = 0;
        const cleanCells = (line) => line.includes('|') ? line.split('|').slice(1, -1).map(c => c.trim()) : line.split(',').map(c => c.trim());

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line || !line.trim() || line.includes('---') || line.toLowerCase().includes('duty') || line.toLowerCase().includes('average')) continue;
          const row = cleanCells(line);
          if (row.length < 6) continue;
          const dutyId = row[0]; const empName = row[4] || '--'; const empId = row[5] || '--';
          if (!dutyId || isNaN(parseInt(dutyId))) continue;
          const docId = `gcc_deploy_${activeDay.toLowerCase()}_duty_${dutyId}`;
          batch.set(doc(db, "crew_daily_deployment", docId), { scheduleType: activeDay, dutyId: String(dutyId), empId: String(empId), empName: String(empName), remarks: "GCC Verified Deployment", lastUpdated: serverTimestamp() }, { merge: true });
          validEntries++;
        }
        if (validEntries > 0) { await batch.commit(); alert(` ✔ GCC Master Deployment Loaded.`); fetchLiveData(); }
      } catch (err) { console.error(err); }
    };
    reader.readAsText(file);
  };

  const handleRosterReset = async () => {
    if (window.confirm(`Reset GCC rosters for ${activeDay}?`)) {
      const q = query(collection(db, "crew_daily_deployment"), where("scheduleType", "==", activeDay));
      const snapshot = await getDocs(q); const batch = writeBatch(db);
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit(); fetchLiveData();
    }
  };

  const handleIncidentLogSubmit = async (e) => {
    e.preventDefault();
    if (!targetTid || !delayMinutes) return;
    try {
      const incId = `incident_t${targetTid}_${Date.now()}`;
      await setDoc(doc(db, "wtt_live_incidents", incId), { trainId: String(targetTid), delayMins: parseInt(delayMinutes, 10), reason: incidentReason, scheduleType: activeDay, timestamp: serverTimestamp() });
      alert(` ✔ Delay variance logged.`); setTargetTid(''); setDelayMinutes(''); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleClearAllIncidents = async () => {
    if (window.confirm("Restore all line movements back to strict master WTT schedules?")) {
      const snapshot = await getDocs(collection(db, "wtt_live_incidents"));
      const batch = writeBatch(db); snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit(); alert("Line status restored."); fetchLiveData();
    }
  };

  const handleOneClickAuthorize = async (row) => {
    try {
      const actualTimeStr = new Date().toTimeString().split(' ')[0];
      await setDoc(doc(db, "crew_live_attendance", `signon_${activeDay.toLowerCase()}_duty_${row.dutyId}_${Date.now()}`), { scheduleType: activeDay, dutyId: String(row.dutyId), empId: row.empId, empName: row.empName, signOnTimeScheduled: row.signOnTime, signOnTimeActual: actualTimeStr, status: "AUTHORIZED_OK", timestamp: serverTimestamp() });
      alert("Operator Authorized!"); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleDutyExchangeSwap = async (e) => {
    e.preventDefault();
    const firstRow = dailyDeployment.find(d => String(d.dutyId) === String(swapFromDuty));
    const secondRow = dailyDeployment.find(d => String(d.dutyId) === String(swapToDuty));
    if (!firstRow || !secondRow) return;
    try {
      await setDoc(doc(db, "crew_daily_deployment", `gcc_deploy_${activeDay.toLowerCase()}_duty_${swapFromDuty}`), { scheduleType: activeDay, dutyId: String(swapFromDuty), empId: secondRow.empId, empName: secondRow.empName, remarks: `Exchanged` }, { merge: true });
      await setDoc(doc(db, "crew_daily_deployment", `gcc_deploy_${activeDay.toLowerCase()}_duty_${swapToDuty}`), { scheduleType: activeDay, dutyId: String(swapToDuty), empId: firstRow.empId, empName: firstRow.empName, remarks: `Exchanged` }, { merge: true });
      setSwapFromDuty(''); setSwapToDuty(''); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleDeploymentCellSave = async (rowId, fieldName, dutyId) => {
    try {
      await setDoc(doc(db, "crew_daily_deployment", `gcc_deploy_${activeDay.toLowerCase()}_duty_${dutyId}`), { [fieldName]: editValue }, { merge: true });
      fetchLiveData(); setEditingCell({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false });
    } catch (err) { console.error(err); }
  };

  const handleWttCellSave = async (row, direction, stationName, isTidField) => {
    try {
      const targetTrip = direction === 'DN' ? row.downTrip : row.upTrip; if (!targetTrip) return;
      if (isTidField) await updateDoc(doc(db, "wtt_final_matrix", targetTrip.id), { trainId: editValue });
      else await updateDoc(doc(db, "wtt_final_matrix", targetTrip.id), { [`stations.${stationName}`]: editValue });
      setEditingCell({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false }); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleCellSave = async (rowId, fieldName) => {
    try {
      await updateDoc(doc(db, "crew_final_links", rowId), { [fieldName]: editValue });
      setEditingCell({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false }); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleDeleteRow = async (rowId) => {
    if(window.confirm("Confirm deletion of this crew link run file?")) {
      await deleteDoc(doc(db, "crew_final_links", rowId));
      setLinks(prev => prev.filter(item => item.id !== rowId));
    }
  };

  const handleDeleteTripRow = async (row) => {
    if (window.confirm(`Delete Train ID ${row.trainId} trip pair block?`)) {
      if (row.downTrip) await deleteDoc(doc(db, "wtt_final_matrix", row.downTrip.id));
      if (row.upTrip) await deleteDoc(doc(db, "wtt_final_matrix", row.upTrip.id));
      fetchLiveData();
    }
  };

  const filteredUnifiedRows = unifiedRows.filter(row => String(row.trainId || '').toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredLinks = links.filter(l => String(l.dutyId || '').toLowerCase().includes(searchTerm.toLowerCase()));

  const filteredTrackingKeys = Object.keys(liveTrainTrackingMap).filter(tid => {
    const tracking = liveTrainTrackingMap[tid];
    const matchStr = trackerSearchTerm.toLowerCase();
    return (
      String(tid).toLowerCase().includes(matchStr) ||
      String(tracking.current?.empName || '').toLowerCase().includes(matchStr) ||
      String(tracking.current?.dutyId || '').toLowerCase().includes(matchStr) ||
      String(tracking.previous?.empName || '').toLowerCase().includes(matchStr) ||
      String(tracking.nextReliver?.empName || '').toLowerCase().includes(matchStr)
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased max-w-[100vw] overflow-x-hidden">
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h1 className="text-sm font-black text-rose-500">!!! SYSTEM UPDATED !!!</h1>
            </div>
            <p className="text-slate-500 text-[11px] font-mono mt-0.5">Line 2 Operational Desk — Peenya Industry Depot (PYID)</p>
          </div>
          <nav className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 w-full lg:w-auto">
            <button onClick={() => setActiveTab('SIGNON')} className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md font-mono text-xs tracking-wider transition-all ${activeTab === 'SIGNON' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-400'}`}>
              <ShieldCheck className="h-3.5 w-3.5" /> AUTOMATED SIGN-ON GATE
            </button>
            <button onClick={() => setActiveTab('WTT')} className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md font-mono text-xs tracking-wider transition-all ${activeTab === 'WTT' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-400'}`}>
              TWIN TIMETABLE MATRIX (WTT)
            </button>
            <button onClick={() => setActiveTab('ROSTER')} className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md font-mono text-xs tracking-wider transition-all ${activeTab === 'ROSTER' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold' : 'text-slate-400'}`}>
              CREW LINK ROSTER ({links.length})
            </button>
          </nav>
        </div>
      </header>

      {/* Usage example in your UI: */}
      <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-4 font-mono text-xs">
        {canEdit && <button className="flex items-center gap-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded hover:bg-emerald-600/30 transition">Edit Roster</button>}
        {isTrainOperator && <p className="text-amber-400 font-semibold">Read-Only Mode Active</p>}
      </div>

      <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-900 bg-slate-950">
        <div className="flex flex-wrap gap-2">
          {dayTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveDay(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${activeDay === tab.id ? 'bg-slate-800 text-emerald-400 border-slate-700 font-bold' : 'bg-slate-900/40 text-slate-500 border-slate-800/60'}`}>{tab.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {activeTab === 'WTT' && (
            <button onClick={handleClearAllIncidents} className="flex items-center bg-amber-950/20 border border-amber-500/30 text-amber-400 font-mono text-xs px-3 py-1.5 rounded font-bold uppercase tracking-wider shadow-sm">
              <Clock className="h-3.5 w-3.5 mr-1.5" /> CLEAR LIVE DELAYS
            </button>
          )}
          {activeTab === 'SIGNON' && (
            <div className="flex items-center gap-2">
              <button onClick={handleRosterReset} className="flex items-center bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/30 transition px-3 py-1.5 rounded text-xs font-mono text-rose-400 font-bold uppercase tracking-wide shadow-sm">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-rose-500" /> RESET DAILY ROSTER
              </button>
              <div className="flex items-center bg-slate-900 border border-slate-800 px-3 py-1.5 rounded cursor-pointer relative hover:bg-slate-850 shadow-sm">
                <UploadCloud className="h-3.5 w-3.5 mr-2 text-emerald-400" />
                <span className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wide">UPLOAD GCC ROSTER</span>
                <input type="file" accept=".xlsx, .xls, .csv, .txt" onChange={handleGccRosterUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>
          )}
          <input type="text" placeholder="Filter Matrix..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none w-full md:w-40" />
          <button onClick={fetchLiveData} className="bg-slate-900 border border-slate-800 p-2 rounded text-slate-400"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <main className="p-4 max-w-[100vw]">
        {loading ? (
          <div className="text-center font-mono text-xs py-40 text-slate-600 tracking-widest animate-pulse">CONNECTING TO OPERATIONAL NETWORKS...</div>
        ) : activeTab === 'SIGNON' ? (
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Running Fleet Mapped</span>
                <span className="text-2xl font-bold font-mono text-cyan-400">{Object.keys(liveTrainTrackingMap).length} Trains</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Authorized Operators Manned</span>
                <span className="text-2xl font-bold font-mono text-emerald-400">{dailyDeployment.filter(d => d.isSignedOn).length} Active</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                <span className="text-[10px] text-slate-400 block uppercase font-bold">Pending Gate Sign-Ons</span>
                <span className="text-2xl font-bold font-mono text-amber-400">{dailyDeployment.filter(d => !d.isSignedOn).length} Standby</span>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start w-full">
              <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                {/* FIX: Used RefreshCw directly since SwapIcon alias is removed */}
                <div className="flex items-center gap-2 text-amber-400 font-mono text-xs font-bold border-b border-slate-800 pb-2 mb-3"><RefreshCw className="h-4 w-4" /> TO MUTUAL DUTY EXCHANGE CONTROL</div>
                <form onSubmit={handleDutyExchangeSwap} className="space-y-3 font-mono text-xs">
                  <div><label className="block text-slate-400 mb-1 font-semibold">Source Duty ID (From)</label><input type="text" placeholder="e.g., 44" value={swapFromDuty} onChange={(e) => setSwapFromDuty(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500" /></div>
                  <div><label className="block text-slate-400 mb-1 font-semibold">Target Exchange Duty ID (To)</label><input type="text" placeholder="e.g., 52" value={swapToDuty} onChange={(e) => setSwapToDuty(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500" /></div>
                  <button type="submit" className="w-full bg-amber-600/20 border border-amber-500/30 hover:bg-amber-600/30 transition text-amber-400 font-bold py-2 rounded tracking-wide uppercase text-[11px]">SWAP OPERATORS ATOMICALLY</button>
                </form>
              </div>
              
              <div className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                <div className="px-4 py-2 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-slate-200 font-mono text-xs font-bold">
                  <span className="text-emerald-400 flex items-center gap-1.5"><UserCheck className="h-4 w-4" /> ALIGNED DAILY DEPLOYMENT CHECKPOINT SHEET</span>
                </div>
                <div className="overflow-x-auto w-full max-h-[580px] overflow-y-auto">
                  <table className="w-full text-center border-collapse font-mono text-[11px]">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase sticky top-0 z-20">
                        <th className="py-2.5 w-[100px]">Sign On Action</th><th className="w-[70px]">Duty ID</th><th className="w-[90px]">Sched On</th><th className="w-[90px]">Sign On Loc</th><th className="w-[90px]">Train ID</th><th className="text-left pl-4 text-emerald-400">Train Operator Name</th><th className="w-[120px] text-cyan-400">Employee ID</th><th className="text-left pl-4 w-[200px]">GCC Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300">
                      {dailyDeployment.map((row, idx) => {
                        const rowBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950/40";
                        const renderEditDeployCell = (fieldName, alignLeft = false, textStyle = "text-slate-300") => {
                          const isEditing = editingCell.rowId === row.id && editingCell.station === fieldName && editingCell.isDeployment;
                          if (isEditing) {
                            return <td key={fieldName} className="p-0.5 bg-slate-950"><input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleDeploymentCellSave(row.id, fieldName, row.dutyId)} onKeyDown={(e) => e.key === 'Enter' && handleDeploymentCellSave(row.id, fieldName, row.dutyId)} className="w-full bg-slate-950 text-emerald-400 font-bold border border-emerald-500 rounded text-center focus:outline-none py-0.5" autoFocus /></td>;
                          }
                          return <td key={fieldName} onClick={() => { setEditingCell({ rowId: row.id, direction: 'DEPLOY', station: fieldName, isTid: false, isDeployment: true }); setEditValue(row[fieldName]); }} className={`py-2.5 px-2 cursor-pointer hover:bg-slate-800/40 ${alignLeft ? 'text-left pl-4' : 'text-center'} ${textStyle}`}>{row[fieldName]}</td>;
                        };
                        return (
                          <tr key={row.dutyId || idx} className={`${rowBgClass} transition-colors border-b border-slate-800/30`}>
                            <td className="py-1.5 px-2">{row.isSignedOn ? <span className="block w-full text-center bg-emerald-950/40 text-emerald-400 border border-emerald-800/30 py-1 rounded text-[10px] font-bold">DISPATCHED</span> : <button onClick={() => handleOneClickAuthorize(row)} className="w-full bg-emerald-600 hover:bg-emerald-500 transition text-white font-bold py-1 rounded text-[10px] uppercase shadow">AUTHORIZE</button>}</td>
                            <td className="font-bold text-slate-100 bg-slate-950/30">{row.dutyId}</td><td className="text-amber-400 font-semibold">{row.signOnTime}</td><td className="text-slate-400">{row.signOnLocation}</td><td className="text-slate-100 font-bold">{row.trainId}</td>
                            {renderEditDeployCell('empName', true, 'text-slate-100 font-black tracking-wide text-xs')}{renderEditDeployCell('empId', false, 'text-cyan-400 font-bold text-xs')}{renderEditDeployCell('remarks', true, 'text-slate-500 italic max-w-[200px] truncate')}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'WTT' ? (
          
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-2 mb-3">
                <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold">
                  <Users className="h-4 w-4" /> LIVE TRAIN OPERATOR RELIEF & LINE 2 HANDOVER TRACKING MATRIX
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
                  <input type="text" placeholder="Search Tracker (TID, Name, Duty)..." value={trackerSearchTerm} onChange={(e) => setTrackerSearchTerm(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-3 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 max-h-[220px] overflow-y-auto p-1">
                {filteredTrackingKeys.map(tid => {
                  const tracking = liveTrainTrackingMap[tid];
                  return (
                    <div key={`tracking-${tid}`} className="bg-slate-950 border border-slate-800 p-3 rounded-lg flex flex-col justify-between font-mono text-[11px]">
                      <div className="flex justify-between items-center border-b border-slate-900 pb-1.5 mb-2">
                        <span className="text-slate-100 font-bold text-xs bg-slate-900 px-2 py-0.5 rounded border border-slate-800">TRAIN ID: {tid}</span>
                        <span className="text-[10px] text-emerald-400 animate-pulse font-bold">● Tracking Active</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-slate-400">
                          <span>Previous Crew:</span>
                          <span className="text-slate-300 font-medium truncate max-w-[140px]" title={tracking.previous ? `${tracking.previous.empName} (Emp ID: ${tracking.previous.empId})` : "No Incoming Record"}>
                            {tracking.previous ? tracking.previous.empName : '--'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center bg-emerald-950/20 p-1.5 rounded border border-emerald-900/30">
                          <span className="text-emerald-500 font-bold">Current Operator:</span>
                          <span className="text-emerald-400 font-black truncate max-w-[130px]" title={tracking.current ? `${tracking.current.empName} (Duty: ${tracking.current.dutyId})` : "Manning Pending"}>
                            {tracking.current ? `${tracking.current.empName} (D: ${tracking.current.dutyId})` : '--'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-amber-500 font-semibold">
                          <span>Next Reliever:</span>
                          <span className="text-amber-400 font-bold truncate max-w-[140px]" title={tracking.nextReliver ? `${tracking.nextReliver.empName} (Duty: ${tracking.nextReliver.dutyId})` : "Continuous Run / No Handover"}>
                            {tracking.nextReliver ? `${tracking.nextReliver.empName} (D: ${tracking.nextReliver.dutyId})` : '--'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredTrackingKeys.length === 0 && (
                  <div className="col-span-full py-4 text-center text-slate-500 italic">No tracking rows found matching search filter keys.</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start w-full">
              <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <div className="flex items-center gap-2 text-amber-500 font-mono text-xs font-bold border-b border-slate-800 pb-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" /> LIVE INCIDENT & TIMING VARIANCE LOG
                </div>
                <form onSubmit={handleIncidentLogSubmit} className="space-y-3 font-mono text-xs">
                  <div><label className="block text-slate-400 mb-1 font-semibold">Target Train ID (TID)</label><input type="text" placeholder="e.g., 207" value={targetTid} onChange={(e) => setTargetTid(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:border-amber-500 focus:outline-none" /></div>
                  <div><label className="block text-slate-400 mb-1 font-semibold">Delay Quantity (Minutes)</label><input type="number" placeholder="e.g., 5" value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:border-amber-500 focus:outline-none" /></div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Operational Incident Cause</label>
                    <select value={incidentReason} onChange={(e) => setIncidentReason(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-300 focus:outline-none">
                      <option value="Signal Fluctuation">Signal Fluctuation</option>
                      <option value="Rolling Stock Defect">Rolling Stock Defect</option>
                      <option value="Passenger Door Interlock">Passenger Door Interlock</option>
                      <option value="Track Clearing Delay">Track Clearing Delay</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-amber-600 text-slate-950 font-black py-2 rounded tracking-wide uppercase text-[11px] shadow hover:bg-amber-500 transition">PROPAGATE DOWNSTREAM DELAY</button>
                </form>
              </div>

              <div className="xl:col-span-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
                <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-slate-200 font-mono text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-emerald-400"><Train className="h-4 w-4" /> RE-ALIGNED CHRONOLOGICAL MATRIX SHEET</span>
                </div>
                <div className="overflow-x-auto w-full max-h-[580px] overflow-y-auto">
                  <table className="w-full text-left border-collapse font-mono text-[11px] min-w-[2000px]">
                    <thead>
                      <tr className="bg-slate-950 border-b-2 border-slate-800 text-center font-bold tracking-wider sticky top-0 z-30">
                        <th className="w-[50px] bg-slate-950 py-3">Kill</th><th className="w-[80px] bg-slate-950 border-r-2 border-slate-800 text-slate-100">TRAIN ID</th><th colSpan="10" className="text-amber-400 bg-amber-950/10 border-r-2 border-slate-800"><ArrowDownCircle className="h-3.5 w-3.5 inline mr-1" /> DOWN LINE LEG DIAGRAM (BIET → APTS)</th><th colSpan="10" className="text-cyan-400 bg-cyan-950/10"><ArrowUpCircle className="h-3.5 w-3.5 inline mr-1" /> UP LINE LEG DIAGRAM (APTS → BIET)</th>
                      </tr>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-center font-bold sticky top-[38px] z-20">
                        <th className="py-2 bg-slate-950">Del</th><th className="border-r-2 border-slate-800 bg-slate-950">TID</th>
                        {dnStationOrder.map((st, sIdx) => <th key={`dn-head-${st}`} className={`py-2 border-r border-slate-800/60 bg-slate-950 ${st === 'PYID' ? 'text-emerald-400 bg-emerald-950/20' : ''} ${sIdx === 9 ? 'border-r-2 border-slate-800' : ''}`}>{st}</th>)}
                        {upStationOrder.map(st => <th key={`up-head-${st}`} className={`py-2 border-r border-slate-800/60 bg-slate-950 ${st === 'PYID' ? 'text-emerald-400 bg-emerald-950/20' : ''}`}>{st}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-slate-300 text-center">
                      {filteredUnifiedRows.map((row, idx) => {
                        const rowBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950/40";
                        const stickyTidBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-900/90";
                        const matchingIncident = liveIncidents.find(inc => String(inc.trainId) === String(row.trainId));
                        const delayVal = matchingIncident ? parseInt(matchingIncident.delayMins, 10) : 0;

                        // FIX 3: Added `key` props directly onto the returned `<td>` blocks
                        const renderWttCell = (direction, stationName, isTidField = false) => {
                          const isEditing = editingCell.rowId === row.id && editingCell.direction === direction && editingCell.station === stationName && editingCell.isTid === isTidField;
                          const targetTrip = direction === 'DN' ? row.downTrip : row.upTrip;
                          let baseValue = isTidField ? row.trainId : (targetTrip?.stations?.[stationName] || '--');
                          let cellValue = baseValue;
                          if (!isTidField && delayVal > 0 && String(baseValue) !== '--' && String(baseValue) !== '-') { cellValue = addDelayToTime(baseValue, delayVal); }

                          if (isEditing) {
                            return <td key={`edit-${direction}-${stationName}`} className="p-0.5 border-r border-slate-800/30 bg-slate-950 z-50"><input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleWttCellSave(row, direction, stationName, isTidField)} onKeyDown={(e) => e.key === 'Enter' && handleWttCellSave(row, direction, stationName, isTidField)} className="w-full bg-slate-950 text-emerald-400 font-bold border border-emerald-500 rounded text-center focus:outline-none" autoFocus /></td>;
                          }
                          let textColor = direction === 'DN' ? 'text-amber-200' : 'text-cyan-200';
                          if (String(cellValue) === '--' || String(cellValue) === '-') textColor = 'text-slate-700 font-light';
                          if (isTidField) textColor = 'text-slate-100 font-black text-xs tracking-wider';
                          if (delayVal > 0 && !isTidField && String(baseValue) !== '--' && String(baseValue) !== '-') { textColor = 'text-orange-400 font-black'; }

                          return <td key={`cell-${direction}-${stationName}`} onDoubleClick={() => { if (!targetTrip && !isTidField) return; setEditingCell({ rowId: row.id, direction, station: stationName, isTid: isTidField }); setEditValue(baseValue); }} className={`py-2 px-1 border-r border-slate-800/30 font-medium cursor-pointer hover:bg-slate-800/40 select-none ${textColor} ${stationName === 'PYID' ? 'bg-emerald-950/10 border-b border-emerald-800/20 font-bold' : ''} ${stationName === 'APTS' && direction === 'DN' ? 'border-r-2 border-slate-800' : ''} ${isTidField ? `${stickyTidBgClass} sticky left-0 border-r-2 border-slate-800 shadow-md font-bold ${delayVal > 0 ? 'border-l-4 border-l-orange-500 text-orange-400 bg-amber-950/10' : ''}` : ''}`}>{cellValue}</td>;
                        };
                        return (
                          <tr key={row.id || `wtt-${idx}`} className={`${rowBgClass} transition-colors border-b border-slate-800/30 ${delayVal > 0 ? 'bg-amber-950/5 animate-pulse' : ''}`}>
                            <td className="py-2 border-r border-slate-800 text-center"><button onClick={() => handleDeleteTripRow(row)} className="text-rose-500 hover:text-rose-400 transition"><Trash2 className="h-3.5 w-3.5 mx-auto" /></button></td>
                            {renderWttCell('DN', 'TID', true)}
                            {dnStationOrder.map(st => renderWttCell('DN', st))}
                            {upStationOrder.map(st => renderWttCell('UP', st))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center text-blue-400 font-mono text-xs font-bold">
              <span>DYNAMIC CONTROL ROSTER OPERATIONAL MONITOR TERMINAL</span>
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse font-mono text-[11px] min-w-[2900px] table-fixed">
                <thead>
                  <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 text-center font-bold uppercase tracking-wider">
                    <th className="w-[60px] bg-slate-950">Kill</th>
                    <th colSpan="4" className="py-2 border-r border-slate-800 text-blue-400 bg-blue-950/5">LEG 1: Primary Sign-On Duty Frame</th>
                    <th colSpan="6" className="py-2 border-r border-slate-800 text-amber-400 bg-amber-950/5">LEG 2: Mid-Shift Operational Workings</th>
                    <th colSpan="6" className="py-2 border-r border-slate-800 text-cyan-400 bg-cyan-950/5">LEG 3: Secondary Handover Working Loop</th>
                    <th colSpan="6" className="py-2 border-r border-slate-800 text-purple-400 bg-purple-950/5">LEG 4: Final Closing Target Leg</th>
                    <th colSpan="4" className="py-2 text-slate-300 bg-slate-900">Total Shift Summary</th>
                  </tr>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 text-center font-semibold">
                    <th className="py-2 px-1 border-r border-slate-800 text-center w-[60px]">Action</th><th className="py-2 px-2 border-r border-slate-800/50 w-[80px]">Duty ID</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Sign On Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[110px]">Sign On Loc</th><th className="py-2 px-2 border-r border-slate-800 w-[90px]">Train No</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Arr Loc</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Arr Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Dep Loc</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Dep Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[90px]">Train No</th><th className="py-2 px-2 border-r border-slate-800 w-[100px]">Time To</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Handover Loc</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">H-Over Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Takeover Loc</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">T-Over Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[90px]">Train No</th><th className="py-2 px-2 border-r border-slate-800 w-[100px]">Time Frm</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Arr Loc</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Arr Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Dep Loc</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Dep Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[90px]">Train No</th><th className="py-2 px-2 border-r border-slate-800 w-[100px]">Time To</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Sign Off Time</th><th className="py-2 px-2 border-r border-slate-800/50 w-[110px]">Sign Off Loc</th><th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Total Hours</th><th className="py-2 px-4 text-left w-[240px]">Operational Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300 text-center">
                  {filteredLinks.map((duty, idx) => {
                    const rowBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950/40";
                    const stickyDutyBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950";
                    // FIX 4: Added React keys to dynamic TD generations
                    const renderCell = (fieldName, customStyle = "text-slate-300") => {
                      const isEditing = editingCell.rowId === duty.id && editingCell.station === fieldName && !editingCell.isDeployment;
                      const displayVal = duty[fieldName] || '--';
                      if (isEditing) {
                        return <td key={`edit-${fieldName}`} className="p-1 border-r border-slate-800/40 bg-slate-950"><input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(duty.id, fieldName)} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(duty.id, fieldName)} className="w-full bg-slate-950 text-emerald-400 font-bold border border-emerald-500 rounded px-1 py-0.5 text-center focus:outline-none" autoFocus /></td>;
                      }
                      return <td key={`cell-${fieldName}`} onDoubleClick={() => { setEditingCell({ rowId: duty.id, direction: 'ROSTER', station: fieldName, isTid: false, isDeployment: false }); setEditValue(displayVal); }} className={`py-2 px-2 border-r border-slate-800/40 truncate cursor-pointer hover:bg-slate-850/40 ${customStyle}`}>{displayVal}</td>;
                    };
                    return (
                      <tr key={duty.id || `duty-${idx}`} className={`${rowBgClass} hover:bg-slate-850/20 border-b border-slate-800/40 transition-colors`}>
                        <td className="py-2 border-r border-slate-800 text-center font-bold"><button onClick={() => handleDeleteRow(duty.id)} className="text-rose-500 hover:text-rose-400 p-1"><Trash2 className="h-3.5 w-3.5 mx-auto" /></button></td>
                        <td className={`py-2 px-2 text-center border-r border-slate-800 font-bold text-blue-400 sticky left-0 z-10 shadow-sm ${stickyDutyBgClass}`}>{duty.dutyId}</td>
                        {renderCell('signOnTime', 'text-emerald-400 font-bold')} {renderCell('signOnLocation', 'text-slate-400')} {renderCell('trainId', 'text-slate-100 font-bold')} {renderCell('leg1TimeFrom', 'text-slate-500')}
                        {renderCell('leg2ArrLoc')} {renderCell('leg2ArrTime')} {renderCell('leg2DepLoc')} {renderCell('leg2DepTime')} {renderCell('leg2TrainNo', 'text-amber-400 font-bold')} {renderCell('leg2TimeTo')}
                        {renderCell('leg3HandoverLoc')} {renderCell('leg3HandoverTime')} {renderCell('leg3TakeoverLoc')} {renderCell('leg3TakeoverTime')} {renderCell('leg3TrainNo', 'text-cyan-400 font-bold')} {renderCell('leg3TimeFrom')}
                        {renderCell('leg4FinalArrLoc')} {renderCell('leg4FinalArrTime')} {renderCell('leg4FinalDepLoc')} {renderCell('leg4FinalDepTime')} {renderCell('leg4TrainNo', 'text-purple-400 font-bold')} {renderCell('leg4TimeTo')}
                        {renderCell('signOffTime', 'text-rose-400 font-semibold')} {renderCell('signOffLocation', 'text-slate-400')} {renderCell('totalHours', 'text-emerald-400 font-bold')}
                        {renderCell('remarks', 'text-left text-slate-400 italic px-4 max-w-[240px] truncate')}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
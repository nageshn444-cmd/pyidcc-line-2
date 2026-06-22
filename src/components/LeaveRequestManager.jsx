import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, updateDoc, 
  addDoc, deleteDoc, serverTimestamp 
} from 'firebase/firestore';
import { 
  Check, X, FileText, User, AlertCircle, Calendar, ShieldAlert, 
  Download, Plus, Trash2, Users, Flame, Info, CheckCircle
} from 'lucide-react';

export default function LeaveRequestManager({ userRole }) {
  const [requests, setRequests] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [extraOps, setExtraOps] = useState([]);
  const [blackoutDates, setBlackoutDates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Blackout Date Input State
  const [newBlackout, setNewBlackout] = useState({
    startDate: '',
    endDate: '',
    eventType: 'Festival Rush Days',
    eventName: ''
  });

  // Sync all required collections in real-time
  useEffect(() => {
    const qRequests = query(collection(db, 'leave_requests'), orderBy('requestDate', 'desc'));
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    const unsubDeployments = onSnapshot(collection(db, 'crew_daily_deployment'), (snapshot) => {
      setDeployments(snapshot.docs.map(doc => doc.data()));
    });

    const unsubExtra = onSnapshot(collection(db, 'crew_extra_operators'), (snapshot) => {
      setExtraOps(snapshot.docs.map(doc => doc.data()));
    });

    const unsubBlackouts = onSnapshot(collection(db, 'blackout_dates'), (snapshot) => {
      setBlackoutDates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubRequests();
      unsubDeployments();
      unsubExtra();
      unsubBlackouts();
    };
  }, []);

  // 1. Crew Availability Checking Calculations
  const activeOpsCount = deployments.filter(d => d.empId && d.empId !== '--').length;
  const extraOpsCount = extraOps.filter(o => o.availabilityStatus === 'AVAILABLE' || o.status === 'AVAILABLE').length;
  const proCount = deployments.filter(d => String(d.dutyId).toUpperCase().includes('PRO')).length;
  const rd3Count = deployments.filter(d => String(d.dutyId).toUpperCase().includes('RD3')).length;
  const totalOnLeave = deployments.filter(d => d.status === 'ON_LEAVE').length;
  const totalAvailableCrew = 100 - totalOnLeave; // 100 is total registry strength

  // 2. Add Blackout Date to OCC Configurations
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

  // Delete Blackout Date
  const handleDeleteBlackout = async (id) => {
    if (window.confirm("Remove this blackout date constraint?")) {
      try {
        await deleteDoc(doc(db, 'blackout_dates', id));
      } catch (err) {
        console.error(err);
      }
    }
  };

  // 3. Leave Priority Calculation Engine
  const getPriorityDetails = (req) => {
    let score = 50;
    let label = 'Priority 6 (Personal)';
    let color = 'text-slate-400 bg-slate-950 border-slate-800';

    if (req.leaveType === 'EMERGENCY') {
      score = 100;
      label = 'Priority 1 (Emergency)';
      color = 'text-rose-400 bg-rose-950/50 border-rose-800';
    } else if (req.leaveType === 'MEDICAL') {
      score = 90;
      label = 'Priority 2 (Medical)';
      color = 'text-amber-400 bg-amber-950/50 border-amber-800';
      if (req.certificateUploaded) score += 5;
      if (req.previousMlUsage > 2) score -= 5;
    } else if (req.leaveType === 'FAMILY') {
      score = 80;
      label = 'Priority 3 (Family)';
      color = 'text-yellow-500 bg-yellow-950/30 border-yellow-800/40';
    } else if (req.leaveType === 'EL') {
      score = 70;
      label = 'Priority 4 (Earned)';
      color = 'text-cyan-400 bg-cyan-950/50 border-cyan-800';
      // Applied in advance checks (e.g. 14 days advance)
      if (req.startDate && req.requestDate) {
        const start = new Date(req.startDate).getTime();
        const reqTime = req.requestDate?.toMillis ? req.requestDate.toMillis() : new Date().getTime();
        const diffDays = (start - reqTime) / (1000 * 60 * 60 * 24);
        if (diffDays >= 14) score += 5;
      }
      if (req.leaveBalance > 10) score += 5;
    } else if (req.leaveType === 'CL') {
      score = 60;
      label = 'Priority 5 (Casual)';
      color = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      if (req.leaveBalance > 5) score += 5;
    }

    // Time-based FIFO age boost (older pending requests get a boost up to +10 points)
    if (req.requestDate) {
      const now = new Date().getTime();
      const reqTime = req.requestDate?.toMillis ? req.requestDate.toMillis() : now;
      const ageInDays = (now - reqTime) / (1000 * 60 * 60 * 24);
      score += Math.min(ageInDays || 0, 10);
    }

    return { score: Math.round(score), label, color };
  };

  // 4. Recommendation Panel Rules
  const getRecommendation = (req) => {
    // A. Check for Blackout Date overlap
    const start = new Date(req.startDate);
    const end = new Date(req.endDate);
    
    const activeBlackout = blackoutDates.find(bo => {
      const boStart = new Date(bo.startDate);
      const boEnd = new Date(bo.endDate || bo.startDate);
      return (start <= boEnd && end >= boStart);
    });

    if (activeBlackout && req.leaveType !== 'EMERGENCY' && req.leaveType !== 'MEDICAL') {
      return { 
        action: 'REJECT', 
        reason: `OCC Blackout date active: ${activeBlackout.eventName} (${activeBlackout.eventType})` 
      };
    }

    // B. Check Leave Balance
    if (req.leaveBalance <= 0) {
      return { 
        action: 'REJECT', 
        reason: 'Requested leave balance is empty (0 remaining)' 
      };
    }

    // C. Check Minimum Crew Availability threshold (< 20 available)
    if (totalAvailableCrew < 20) {
      return { 
        action: 'WAITLIST', 
        reason: `Crew shortage: ${totalAvailableCrew} drivers available (min threshold is 20)` 
      };
    }

    // D. Check Emergency Leave
    if (req.leaveType === 'EMERGENCY') {
      return { 
        action: 'NEEDS GCC APPROVAL', 
        reason: 'Emergency request. GCC/SS must verify standby/extra TO cover.' 
      };
    }

    // E. Default Auto-approval eligibility
    return { 
      action: 'APPROVE', 
      reason: 'Sufficient standby resources & positive balance available.' 
    };
  };

  // 5. Leave Conflict Resolution Sorter
  const resolvedRequests = React.useMemo(() => {
    const pending = requests.filter(r => !r.status || r.status === 'PENDING');
    const resolved = requests.filter(r => r.status && r.status !== 'PENDING');

    const sortedPending = [...pending].sort((a, b) => {
      const priorityA = getPriorityDetails(a);
      const priorityB = getPriorityDetails(b);
      
      // I. Base Category Score
      if (priorityB.score !== priorityA.score) {
        return priorityB.score - priorityA.score;
      }
      
      // II. Earlier Application Date (lower timestamp first)
      const dateA = a.requestDate?.toMillis ? a.requestDate.toMillis() : 0;
      const dateB = b.requestDate?.toMillis ? b.requestDate.toMillis() : 0;
      if (dateA !== dateB) return dateA - dateB;
      
      // III. Higher Leave Balance Utilization Need
      const balA = a.leaveBalance || 0;
      const balB = b.leaveBalance || 0;
      if (balB !== balA) return balB - balA;
      
      // IV. Lower Leave Availed This Year (prioritizes those who haven't taken much leave)
      const availedA = a.leaveAvailedThisYear || 0;
      const availedB = b.leaveAvailedThisYear || 0;
      if (availedA !== availedB) return availedA - availedB;

      // V. FIFO
      return a.id.localeCompare(b.id);
    });

    return [...sortedPending, ...resolved];
  }, [requests, blackoutDates, totalAvailableCrew]);

  // 6. Approve Leave & Roster Integration (Real-time updates)
  const handleApproveLeave = async (req) => {
    const rec = getRecommendation(req);
    if (rec.action === 'REJECT') {
      if (!window.confirm(`⚠️ Warning: System recommendations suggest REJECT due to: ${rec.reason}. Force Approve anyway?`)) {
        return;
      }
    }

    try {
      const now = new Date();
      // Update Leave Request
      await updateDoc(doc(db, 'leave_requests', req.id), {
        status: 'APPROVED',
        approvedBy: userRole || 'Crew Controller',
        approvedTime: serverTimestamp()
      });

      // Update daily deployments for this employee to ON_LEAVE
      const matchingDeps = deployments.filter(d => d.empId === req.empId);
      for (const dep of deployments) {
        if (String(dep.empId) === String(req.empId)) {
          // Find deployment doc ref
          const depId = `gcc_deploy_${String(dep.scheduleType || 'weekday').toLowerCase()}_duty_${dep.dutyId}`;
          await updateDoc(doc(db, 'crew_daily_deployment', depId), {
            status: 'ON_LEAVE',
            remarks: `ON LEAVE: ${req.leaveType} (${req.subCategory}) approved by Crew Controller`
          });
        }
      }

      // If EMERGENCY, trigger the Emergency Relief Engine instantly
      if (req.leaveType === 'EMERGENCY') {
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

      alert("✅ Leave Approved. Roster, dispatch gate, and emergency logs updated dynamically.");
    } catch (err) {
      console.error(err);
      alert("Error approving leave request.");
    }
  };

  // Reject Leave
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

  // 7. Leave Priority Report Exporter
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

  if (loading) {
    return (
      <div className="text-slate-500 animate-pulse p-6 bg-slate-900 rounded-xl border border-slate-800 text-center font-mono">
        Loading Leave Priority Engine...
      </div>
    );
  }

  return (
    <div className="font-mono text-slate-200 space-y-6">
      
      {/* Top Section: Availability Stats & Blackout Dates Builder */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Availability Check Panel */}
        <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
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
              <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">Available Drivers</span>
              <span className="text-lg font-black text-white">{totalAvailableCrew}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-850">
              <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">Extra Standbys</span>
              <span className="text-lg font-black text-emerald-400">{extraOpsCount}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-850">
              <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">PRO Standbys</span>
              <span className="text-lg font-black text-cyan-400">{proCount}</span>
            </div>
            <div className="bg-slate-950 p-3 rounded border border-slate-850">
              <span className="text-[9px] text-slate-500 block uppercase font-bold tracking-wider">RD3 Standbys</span>
              <span className="text-lg font-black text-purple-400">{rd3Count}</span>
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded border border-slate-850 flex justify-between items-center text-[10px]">
            <span className="text-slate-500 font-bold uppercase">Total Operators on Leave Today:</span>
            <span className="text-rose-500 font-bold">{totalOnLeave}</span>
          </div>
        </div>

        {/* Blackout Dates Panel */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
            <span className="font-bold text-xs uppercase text-amber-500 tracking-wider flex items-center gap-1.5">
              <Flame size={16} className="animate-pulse" /> OCC Blackout Date Coordinator
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Form */}
            <form onSubmit={handleAddBlackout} className="space-y-3 text-[11px] font-bold uppercase">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-slate-500">Start Date</label>
                  <input 
                    type="date" 
                    required 
                    value={newBlackout.startDate}
                    onChange={(e) => setNewBlackout({...newBlackout, startDate: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-slate-500">End Date</label>
                  <input 
                    type="date" 
                    value={newBlackout.endDate}
                    onChange={(e) => setNewBlackout({...newBlackout, endDate: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-slate-500">Event Type</label>
                  <select 
                    value={newBlackout.eventType}
                    onChange={(e) => setNewBlackout({...newBlackout, eventType: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200"
                  >
                    <option value="Festival Rush Days">Festival Rush Days</option>
                    <option value="Special Events">Special Events</option>
                    <option value="VIP Movements">VIP Movements</option>
                    <option value="Metro Extension Opening">Metro Extension Opening</option>
                    <option value="Emergency Operations">Emergency Operations</option>
                  </select>
                </div>
                <div>
                  <label className="text-[9px] text-slate-500">Event Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. DIWALI RUSH"
                    required
                    value={newBlackout.eventName}
                    onChange={(e) => setNewBlackout({...newBlackout, eventName: e.target.value.toUpperCase()})}
                    className="w-full bg-slate-950 border border-slate-800 rounded p-1.5 text-xs text-slate-200 placeholder-slate-650"
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-500 text-slate-950 font-black p-2 rounded text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-1"
              >
                <Plus size={14} /> Add Blackout Constraint
              </button>
            </form>

            {/* List */}
            <div className="bg-slate-950 rounded-xl p-3 border border-slate-850 h-[150px] overflow-y-auto space-y-2">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest block border-b border-slate-850 pb-1 mb-2">Active Blackouts</span>
              {blackoutDates.length === 0 ? (
                <div className="text-center text-[10px] text-slate-600 italic py-8 uppercase">No blackout periods active.</div>
              ) : (
                blackoutDates.map(bo => (
                  <div key={bo.id} className="flex justify-between items-center text-[10px] bg-slate-900 border border-slate-800 p-2 rounded">
                    <div>
                      <span className="font-bold text-rose-400 block uppercase">{bo.eventName}</span>
                      <span className="text-[8px] text-slate-500 block uppercase">{bo.eventType} | {bo.startDate} {bo.endDate !== bo.startDate && `to ${bo.endDate}`}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteBlackout(bo.id)}
                      className="text-rose-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Leave Requests Manager Console */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
        
        {/* Title, Actions, Exporter */}
        <div className="border-b border-slate-800 pb-3 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-cyan-400" />
            <div>
              <span className="font-bold text-xs uppercase text-slate-200 tracking-wider">Leave Requests Priority Queue</span>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">Calculated by FCFS age, leave balance & category priority rules</p>
            </div>
          </div>
          <button 
            onClick={handleExportCSV}
            className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wider"
          >
            <Download size={14} /> Export Priority Report
          </button>
        </div>

        {/* Main List */}
        <div className="space-y-4">
          {resolvedRequests.length === 0 ? (
            <div className="text-center p-12 border border-slate-850 border-dashed rounded-xl text-slate-500 text-xs italic uppercase">
              No leave requests currently logged in the registry.
            </div>
          ) : (
            resolvedRequests.map(req => {
              const priority = getPriorityDetails(req);
              const rec = getRecommendation(req);
              const isPending = !req.status || req.status === 'PENDING';

              return (
                <div 
                  key={req.id} 
                  className={`bg-slate-950 p-4 rounded-xl border transition-all ${
                    isPending 
                      ? 'border-slate-800 hover:border-slate-700' 
                      : 'border-slate-900 opacity-60'
                  }`}
                >
                  
                  {/* Top line info */}
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-900 pb-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 bg-slate-900 border border-slate-850 rounded flex items-center justify-center text-slate-400">
                        <User size={18} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-200 uppercase">{req.empName}</h4>
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">
                          ID: {req.empId} | Type: <span className="text-cyan-400">{req.leaveType} ({req.subCategory})</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <span className={`text-[9px] font-black border px-2 py-0.5 rounded uppercase tracking-wider ${priority.color}`}>
                        Priority Score: {priority.score}
                      </span>
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded tracking-widest uppercase ${
                        req.status === 'APPROVED' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : req.status === 'REJECTED'
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                      }`}>
                        {req.status || 'PENDING'}
                      </span>
                    </div>
                  </div>

                  {/* Body grid details */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-[11px]">
                    
                    {/* Columns 1 & 2: Duration, reason, uploaded docs */}
                    <div className="lg:col-span-2 space-y-2.5">
                      <div className="flex justify-between bg-slate-900/60 p-2.5 rounded border border-slate-850">
                        <span className="text-slate-500 font-bold uppercase tracking-wider">Requested Duration</span>
                        <span className="text-cyan-300 font-bold">{req.startDate} to {req.endDate}</span>
                      </div>
                      <div className="bg-slate-900/40 p-2.5 rounded border border-slate-850 space-y-1">
                        <span className="text-slate-550 block font-bold uppercase tracking-wider text-[9px]">Operator Urgency Explanation</span>
                        <p className="text-slate-300 italic">"{req.reason}"</p>
                      </div>
                      
                      {/* Simulation Indicators: ML, balance */}
                      <div className="flex flex-wrap gap-2 text-[10px]">
                        <span className="bg-slate-900 px-2 py-1 rounded border border-slate-850 text-slate-400">
                          Leave Balance: <strong className="text-slate-200">{req.leaveBalance} days</strong>
                        </span>
                        <span className="bg-slate-900 px-2 py-1 rounded border border-slate-850 text-slate-400">
                          Availed this Year: <strong className="text-slate-200">{req.leaveAvailedThisYear} days</strong>
                        </span>
                        {req.leaveType === 'MEDICAL' && (
                          <span className={`px-2 py-1 rounded border text-[9px] font-bold ${
                            req.certificateUploaded 
                              ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20' 
                              : 'bg-rose-500/5 text-rose-400 border-rose-500/20'
                          }`}>
                            {req.certificateUploaded ? `Certificate: ${req.certificateFileName}` : 'No Certificate Uploaded'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Column 3: Recommendations Panel */}
                    <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-3 space-y-3 relative overflow-hidden">
                      <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 border-b border-slate-850 pb-2">
                        <Info size={12} className="text-cyan-400" /> Crew Controller Decision Assistance
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-550 text-[10px]">System Check:</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded border uppercase ${
                            rec.action === 'APPROVE' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : rec.action === 'REJECT'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}>
                            {rec.action}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 lowercase leading-relaxed">
                          {rec.reason}
                        </p>
                      </div>

                      {isPending && (userRole === 'CREW_CONTROLLER' || userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'ADMIN_SS') && (
                        <div className="flex gap-2 pt-2">
                          <button 
                            onClick={() => handleApproveLeave(req)}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-2 rounded text-[10px] tracking-wider uppercase transition shadow-md flex items-center justify-center gap-1"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button 
                            onClick={() => handleRejectLeave(req.id)}
                            className="flex-1 bg-slate-950 hover:bg-rose-900 border border-slate-800 hover:border-rose-700 text-rose-500 hover:text-white font-black py-2 rounded text-[10px] tracking-wider uppercase transition flex items-center justify-center gap-1"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}
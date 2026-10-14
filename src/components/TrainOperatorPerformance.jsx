import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, Calendar, Clock, Train, Download, Eye, RefreshCw, 
  FileText, CheckCircle2, ChevronRight, Layers, Search, Briefcase
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, onSnapshot, query, where 
} from 'firebase/firestore';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { useAuth } from '../context/AuthContext';
import * as XLSX from 'xlsx';
import { generateMonthlyCalendarAndMetrics } from '../utils/kpiEngine';

export default function TrainOperatorPerformance() {
  const { userProfile } = useAuth();
  const isTrainOperator = !['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_SS', 'ADMIN_Station_Superintendent', 'JMD'].includes(userProfile?.role) && 
                          !String(userProfile?.role || '').toLowerCase().includes('admin') && (
                            userProfile?.role === 'TRAIN_OPERATOR' || 
                            userProfile?.role === 'STATION_CONTROLLER' || 
                            userProfile?.role === 'VIEWER' ||
                            String(userProfile?.role || '').toLowerCase().includes('operator')
                          );

  // Filter States
  const [selectedEmpId, setSelectedEmpId] = useState('21430'); // Default to KRISHNA MURTHY V
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState('');

  // Firestore Live States
  const [firestoreUsers, setFirestoreUsers] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [dailyDeployments, setDailyDeployments] = useState([]);
  const [safetyIncidents, setSafetyIncidents] = useState([]);
  const [faultLogs, setFaultLogs] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [shiftExchanges, setShiftExchanges] = useState([]);
  const [stepbackDuties, setStepbackDuties] = useState([]);
  const [wttMatrix, setWttMatrix] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync real-time Firestore collections
  useEffect(() => {
    setLoading(true);

    // Sync live registered users for fresh Train Operators
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setFirestoreUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    
    const unsubAtt = onSnapshot(collection(db, 'crew_live_attendance'), (snap) => {
      setAttendanceLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubDeploy = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDailyDeployments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubFaults = onSnapshot(collection(db, 'rolling_stock_faults'), (snap) => {
      setFaultLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubSafety = onSnapshot(collection(db, 'safety_incidents'), (snap) => {
      setSafetyIncidents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubLeaves = onSnapshot(collection(db, 'leave_requests'), (snap) => {
      setLeaveRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubExchange = onSnapshot(collection(db, 'shift_exchanges'), (snap) => {
      setShiftExchanges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubStepbacks = onSnapshot(collection(db, 'stepback_duties'), (snap) => {
      setStepbackDuties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, () => {});

    const unsubWtt = onSnapshot(collection(db, 'wtt_final_matrix'), (snap) => {
      setWttMatrix(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, () => {
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubAtt();
      unsubDeploy();
      unsubFaults();
      unsubSafety();
      unsubLeaves();
      unsubExchange();
      unsubStepbacks();
      unsubWtt();
    };
  }, []);

  // Strict list of ACTIVE TRAIN OPERATORS ONLY
  const activeTrainOperators = useMemo(() => {
    const map = new Map();

    // 1. Ingest from master BMRCL Crew Registry
    BMRCL_CREW_REGISTRY.forEach(c => {
      const id = String(c.id || c.employeeId || '').trim();
      if (!id || id === '20726') return; // Exclude Nagesha N (Super Admin)

      const role = String(c.role || '').toUpperCase();
      const desig = String(c.designation || '').toUpperCase();
      const status = String(c.currentStatus || c.status || 'ACTIVE').toUpperCase();

      // Check if Train Operator and active
      const isTrainOp = role.includes('TRAIN_OPERATOR') || 
                        role.includes('TRAIN OPERATOR') || 
                        desig.includes('TRAIN OPERATOR') || 
                        desig.includes('SCTO');
      const isSuper = role.includes('SUPERINTENDENT') || desig.includes('SUPERINTENDENT') || desig.includes('CREW CONTROLLER');
      const isActive = c.activeCrew !== false && status !== 'INACTIVE' && status !== 'SUSPENDED';

      if (isTrainOp && !isSuper && isActive) {
        map.set(id, {
          id,
          name: c.name || `Operator ${id}`,
          designation: c.designation || 'Station Controller / Train Operator',
          depot: c.depot || 'Peenya Depot (PYID)',
          activeCrew: true
        });
      }
    });

    // 2. Ingest from Firestore users collection
    firestoreUsers.forEach(u => {
      const id = String(u.employeeId || u.id || '').trim();
      if (!id || id === '20726') return;

      const role = String(u.role || '').toUpperCase();
      const desig = String(u.designation || '').toUpperCase();
      const status = String(u.status || 'ACTIVE').toUpperCase();

      const isTrainOp = role.includes('TRAIN_OPERATOR') || 
                        role.includes('TRAIN OPERATOR') || 
                        desig.includes('TRAIN OPERATOR') || 
                        desig.includes('SCTO');
      const isSuper = role.includes('SUPERINTENDENT') || desig.includes('SUPERINTENDENT') || desig.includes('CREW CONTROLLER');
      const isActive = u.active !== false && status !== 'INACTIVE' && status !== 'SUSPENDED';

      if (isTrainOp && !isSuper && isActive) {
        map.set(id, {
          id,
          name: u.employeeName || u.name || map.get(id)?.name || `Operator ${id}`,
          designation: u.designation || map.get(id)?.designation || 'Station Controller / Train Operator',
          depot: u.depot || map.get(id)?.depot || 'Peenya Depot (PYID)',
          activeCrew: true
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [firestoreUsers]);

  // Selected Active Employee Details
  const employee = useMemo(() => {
    const found = activeTrainOperators.find(c => c.id === selectedEmpId);
    if (found) return found;
    return activeTrainOperators[0] || { id: '21430', name: 'KRISHNA MURTHY V', designation: 'Train Operator', depot: 'Peenya Depot (PYID)' };
  }, [selectedEmpId, activeTrainOperators]);

  // Ensure selectedEmpId matches employee
  useEffect(() => {
    if (activeTrainOperators.length > 0 && !activeTrainOperators.some(c => c.id === selectedEmpId)) {
      setSelectedEmpId(activeTrainOperators[0].id);
    }
  }, [activeTrainOperators, selectedEmpId]);

  // Deterministic monthly calendar generator
  const monthlyData = useMemo(() => {
    return generateMonthlyCalendarAndMetrics(
      employee,
      selectedMonth,
      selectedYear,
      attendanceLogs,
      dailyDeployments,
      safetyIncidents,
      faultLogs,
      leaveRequests,
      stepbackDuties,
      shiftExchanges,
      wttMatrix
    );
  }, [employee, selectedMonth, selectedYear, attendanceLogs, dailyDeployments, safetyIncidents, faultLogs, leaveRequests, stepbackDuties, shiftExchanges, wttMatrix]);

  // Month Names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Export CSV
  const handleExportCSV = () => {
    if (isTrainOperator) return;
    const headers = ["Date", "Day", "Duty Number", "Duty Type", "Sign On Time", "Sign Off Time", "Train ID", "Trips Operated", "Driving Hours", "Distance Covered (km)", "Remarks"];
    const rows = monthlyData.days.map(d => [
      d.date, d.dayName, d.dutyNo, d.dutyType, d.signOnTime, d.signOffTime, d.trainId, d.tripsOperated, d.drivingHours, d.distanceCovered, d.remarks
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `TO_Duty_Calendar_${employee.name.replace(/\s+/g, '_')}_${selectedYear}_${selectedMonth + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Excel
  const handleExportExcel = () => {
    if (isTrainOperator) return;
    const data = monthlyData.days.map(d => ({
      "Date": d.date,
      "Day": d.dayName,
      "Duty Number": d.dutyNo,
      "Duty Type": d.dutyType,
      "Sign On Time": d.signOnTime,
      "Sign Off Time": d.signOffTime,
      "Train ID": d.trainId,
      "Trips Operated": d.tripsOperated,
      "Driving Hours": d.drivingHours,
      "Distance (km)": d.distanceCovered,
      "Remarks": d.remarks
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Duty Calendar");
    XLSX.writeFile(wb, `TO_Duty_Calendar_${employee.name.replace(/\s+/g, '_')}_${selectedYear}_${selectedMonth + 1}.xlsx`);
  };

  // Print PDF
  const handlePrintPDF = () => {
    window.print();
  };

  // Filtered operator list for search
  const filteredOperators = useMemo(() => {
    if (!searchQuery.trim()) return activeTrainOperators;
    const q = searchQuery.toLowerCase().trim();
    return activeTrainOperators.filter(op => 
      op.name.toLowerCase().includes(q) || 
      String(op.id).includes(q)
    );
  }, [activeTrainOperators, searchQuery]);

  return (
    <div className="space-y-6 font-mono text-slate-200 print:bg-white print:text-black">
      
      {/* EXPORT BAR AND ACTIVE TRAIN OPERATOR SELECTOR */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row justify-between gap-4 shadow-lg print:hidden">
        
        {/* Dynamic Filter Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 flex-1">
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1" htmlFor="to-active-operator-select">
              Active Train Operator ({activeTrainOperators.length})
            </label>
            <select 
              id="to-active-operator-select" 
              name="to-active-operator-select" 
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-emerald-400 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              {filteredOperators.map(c => (
                <option key={c.id} value={c.id}>
                  [{c.id}] {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1" htmlFor="to-perf-month">
              Operational Month
            </label>
            <select 
              id="to-perf-month" 
              name="to-perf-month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              {monthNames.map((m, idx) => (
                <option key={idx} value={idx}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1" htmlFor="to-perf-year">
              Operational Year
            </label>
            <select 
              id="to-perf-year" 
              name="to-perf-year" 
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none cursor-pointer"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        {!isTrainOperator && (
          <div className="flex items-end gap-2 shrink-0">
            <button 
              type="button"
              onClick={handleExportCSV} 
              className="bg-slate-950 border border-slate-700 hover:border-emerald-500 hover:text-emerald-400 px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Export CSV Duty History"
            >
              <Download size={14} /> CSV
            </button>
            <button 
              type="button"
              onClick={handleExportExcel} 
              className="bg-slate-950 border border-slate-700 hover:border-emerald-500 hover:text-emerald-400 px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Export Excel Duty History"
            >
              <Layers size={14} /> EXCEL
            </button>
            <button 
              type="button"
              onClick={handlePrintPDF} 
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-4 py-1.5 rounded text-xs font-black transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
              title="Generate / Print Official Duty Record"
            >
              <FileText size={14} /> PRINT RECORD
            </button>
          </div>
        )}
      </div>

      {/* ACTIVE TRAIN OPERATOR PROFILE SUMMARY */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0">
            <User size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-white leading-tight uppercase">{employee?.name}</h3>
              <span className="bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase">
                Active Train Operator
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1">
              <span>EMP ID: <strong className="text-slate-200">#{employee?.id}</strong></span>
              <span>•</span>
              <span>Designation: <strong className="text-slate-200">{employee?.designation}</strong></span>
              <span>•</span>
              <span>Depot: <strong className="text-emerald-400">Peenya Depot (PYID)</strong></span>
            </div>
          </div>
        </div>

        {/* Essential Monthly Aggregates Bar */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-950 border border-slate-850 p-2.5 rounded-xl text-xs font-bold shrink-0">
          <div className="text-center px-3 border-r border-slate-850">
            <span className="block text-[8px] text-slate-500 uppercase font-black">Duties Worked</span>
            <span className="text-emerald-400 text-sm font-black">{monthlyData.metrics.dutiesWorked}</span>
          </div>
          <div className="text-center px-3 border-r border-slate-850">
            <span className="block text-[8px] text-slate-500 uppercase font-black">Driving Hours</span>
            <span className="text-cyan-400 text-sm font-black">{monthlyData.metrics.totalDrivingHours}h {monthlyData.metrics.totalDrivingMinutes}m</span>
          </div>
          <div className="text-center px-3 border-r border-slate-850">
            <span className="block text-[8px] text-slate-500 uppercase font-black">Trips</span>
            <span className="text-white text-sm font-black">{monthlyData.metrics.totalTripsOperated}</span>
          </div>
          <div className="text-center px-3">
            <span className="block text-[8px] text-slate-500 uppercase font-black">Weekly Offs</span>
            <span className="text-slate-400 text-sm font-black">{monthlyData.metrics.weeklyOffDays}</span>
          </div>
        </div>
      </div>

      {/* ESSENTIAL CORE MODULE: DAILY DUTY HISTORY CALENDAR */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar size={18} className="text-emerald-500" /> Daily Duty History Calendar
            </h4>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
              Month of {monthNames[selectedMonth]} {selectedYear} • {employee?.name} (#{employee?.id})
            </p>
          </div>
          
          {/* Calendar Status Legend */}
          <div className="flex flex-wrap gap-2 text-[9px] font-semibold text-slate-400 uppercase">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500/20 border border-emerald-500/40"></span> WORKED</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-rose-500/20 border border-rose-500/40"></span> MISSED</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-slate-950 border border-slate-850"></span> OFF / WO</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-500/20 border border-blue-500/40"></span> LEAVE</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-500/20 border border-amber-500/40"></span> RELIEF / SPECIAL</span>
          </div>
        </div>

        {/* Calendar Grid Container */}
        <div className="grid grid-cols-7 gap-2">
          {/* Days of Week Headers */}
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
            <div key={d} className="text-center text-[9px] font-black text-slate-500 tracking-wider py-1 border-b border-slate-850">{d}</div>
          ))}

          {/* Empty cells before start of month */}
          {Array.from({ length: new Date(selectedYear, selectedMonth, 1).getDay() }).map((_, idx) => (
            <div key={`empty-${idx}`} className="bg-slate-950/20 border border-slate-900/10 rounded-lg min-h-[75px]"></div>
          ))}

          {/* Calendar Days */}
          {monthlyData.days.map((day, idx) => {
            const statusClass = 
              day.status === 'WORKED' ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500 text-emerald-400' :
              day.status === 'MISSED' ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500 text-rose-400' :
              day.status === 'LEAVE' ? 'bg-blue-950/20 border-blue-500/30 hover:border-blue-500 text-blue-400' :
              day.status === 'WO' ? 'bg-slate-950/60 border-slate-850 hover:border-slate-700 text-slate-500' :
              day.status === 'TRAINING' ? 'bg-slate-900 border-amber-500/30 hover:border-amber-500 text-amber-400 font-semibold' :
              day.status === 'SPECIAL' || day.status === 'EMERGENCY' ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-500 text-amber-400' :
              'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300';

            return (
              <div 
                key={idx} 
                title={`${day.date} - ${day.remarks}`}
                className={`p-2 rounded-lg border transition-all min-h-[85px] flex flex-col justify-between group cursor-pointer ${statusClass}`}
              >
                <div className="flex justify-between items-start">
                  <span className="text-[10px] font-black">{idx + 1}</span>
                  <span className="text-[8px] opacity-60 group-hover:opacity-100 transition-opacity font-bold uppercase">{day.dayName}</span>
                </div>

                <div className="space-y-0.5 text-left">
                  {day.dutyNo !== '--' && (
                    <div className="text-[9px] font-black truncate">Duty: {day.dutyNo}</div>
                  )}
                  {day.trainId !== '--' && (
                    <div className="text-[8px] opacity-75 truncate">Train: {day.trainId}</div>
                  )}
                  {day.signOnTime !== '--' && (
                    <div className="text-[7px] opacity-70 truncate font-sans">
                      {day.signOnTime} - {day.signOffTime}
                    </div>
                  )}
                  <div className="text-[7px] truncate opacity-50 font-sans group-hover:opacity-90 transition-opacity">
                    {day.remarks}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

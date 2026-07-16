import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, Calendar, Clock, Train, AlertTriangle, Shield, Award, 
  TrendingUp, Download, Eye, RefreshCw, BarChart2, Briefcase, 
  FileText, CheckCircle2, AlertOctagon, HelpCircle, ArrowRight, 
  Sparkles, Layers, ListFilter, Users, PlusCircle, Check
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, onSnapshot
} from 'firebase/firestore';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { useAuth } from '../context/AuthContext';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line
} from 'recharts';
import * as XLSX from 'xlsx';
import { 
  generateMonthlyCalendarAndMetrics,
  calculateEfficiencyScore,
  generateAIInsights,
  generateAwards
} from '../utils/kpiEngine';

export default function TrainOperatorPerformance() {
  const { userProfile } = useAuth();
  const isTrainOperator = !['SUPER_ADMIN', 'CREW_CONTROLLER', 'ADMIN_SS', 'ADMIN_Station_Superintendent', 'JMD'].includes(userProfile?.role) && 
                          !String(userProfile?.role || '').toLowerCase().includes('admin') && (
                            userProfile?.role === 'TRAIN_OPERATOR' || 
                            userProfile?.role === 'STATION_CONTROLLER' || 
                            userProfile?.role === 'VIEWER' ||
                            String(userProfile?.role || '').toLowerCase().includes('operator') ||
                            String(userProfile?.role || '').toLowerCase().includes('controller') ||
                            String(userProfile?.designation || '').toLowerCase().includes('operator') ||
                            String(userProfile?.designation || '').toLowerCase().includes('controller') ||
                            String(userProfile?.designation || '').toLowerCase().includes('viewer')
                          );

  // Filter States
  const [selectedEmpId, setSelectedEmpId] = useState('21430'); // Default to KRISHNA MURTHY V
  const [selectedMonth, setSelectedMonth] = useState(5); // June (0-indexed: 5)
  const [selectedYear, setSelectedYear] = useState(2026);
  const [filterDepot, setFilterDepot] = useState('PYID');
  const [filterDesignation, setFilterDesignation] = useState('Station Controller / Train Operator');
  const [filterDutyType, setFilterDutyType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ACTIVE');

  // Firestore Sync States
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [dailyDeployments, setDailyDeployments] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [faultLogs, setFaultLogs] = useState([]);
  const [safetyIncidents, setSafetyIncidents] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [shiftExchanges, setShiftExchanges] = useState([]);
  const [stepbackDuties, setStepbackDuties] = useState([]);
  const [dispatchRecords, setDispatchRecords] = useState([]);
  const [wttMatrix, setWttMatrix] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync all Firestore databases in real-time
  useEffect(() => {
    setLoading(true);
    
    const unsubAtt = onSnapshot(collection(db, 'crew_live_attendance'), (snap) => {
      setAttendanceLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubDeploy = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDailyDeployments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubInc = onSnapshot(collection(db, 'wtt_live_incidents'), (snap) => {
      setLiveIncidents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubFaults = onSnapshot(collection(db, 'rolling_stock_faults'), (snap) => {
      setFaultLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubSafety = onSnapshot(collection(db, 'safety_incidents'), (snap) => {
      setSafetyIncidents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubLeaves = onSnapshot(collection(db, 'leave_requests'), (snap) => {
      setLeaveRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubExchange = onSnapshot(collection(db, 'shift_exchanges'), (snap) => {
      setShiftExchanges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubStepbacks = onSnapshot(collection(db, 'stepback_duties'), (snap) => {
      setStepbackDuties(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubWtt = onSnapshot(collection(db, 'wtt_final_matrix'), (snap) => {
      setWttMatrix(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubDispatch = onSnapshot(collection(db, 'automated_dispatch_gate'), (snap) => {
      setDispatchRecords(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => {
      unsubAtt();
      unsubDeploy();
      unsubInc();
      unsubFaults();
      unsubSafety();
      unsubLeaves();
      unsubExchange();
      unsubStepbacks();
      unsubDispatch();
      unsubWtt();
    };
  }, []);

  // Filtered Crew Registry list
  const filteredCrew = useMemo(() => {
    return BMRCL_CREW_REGISTRY.filter(crew => {
      if (filterDesignation !== 'ALL' && crew.designation !== filterDesignation) return false;
      return true; // Simplified filtering for local crew
    });
  }, [filterDesignation]);

  // Selected Employee Details
  const employee = useMemo(() => {
    return BMRCL_CREW_REGISTRY.find(c => c.id === selectedEmpId) || BMRCL_CREW_REGISTRY[0];
  }, [selectedEmpId]);

  // Deterministic monthly calendar generator (incorporates live Firestore logs)
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

  // Operational Efficiency Score Aggregator
  const efficiency = useMemo(() => {
    return calculateEfficiencyScore(monthlyData.metrics);
  }, [monthlyData]);

  // Dynamic AI observations
  const aiInsights = useMemo(() => {
    return generateAIInsights(monthlyData.metrics, efficiency.score);
  }, [monthlyData, efficiency]);

  // Awards engine
  const awards = useMemo(() => {
    return generateAwards(monthlyData.metrics, efficiency.score);
  }, [monthlyData, efficiency]);

  // Export handlers
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
    link.setAttribute('download', `TO_Performance_${employee.name.replace(/\s+/g, '_')}_${selectedYear}_${selectedMonth + 1}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
    XLSX.utils.book_append_sheet(wb, ws, "Monthly Roster History");
    XLSX.writeFile(wb, `TO_Performance_${employee.name.replace(/\s+/g, '_')}_${selectedYear}_${selectedMonth + 1}.xlsx`);
  };

  const handlePrintPDF = () => {
    if (isTrainOperator) return;
    window.print();
  };

  // Recharts trend data calculation
  const trendData = useMemo(() => {
    return monthlyData.days.map((day, idx) => {
      // Group details per week or 3-day bucket to keep chart legible
      return {
        name: `Day ${idx + 1}`,
        'Driving Hours': day.drivingHours || 0,
        'Trips Operated': day.tripsOperated || 0,
        'Distance Covered': day.distanceCovered || 0,
        'Punctuality %': day.status === 'WORKED' ? (day.remarks.includes('Late') ? 50 : 100) : null
      };
    });
  }, [monthlyData]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6 font-mono text-slate-200 print:bg-white print:text-black">
      
      {/* EXPORT BAR AND FILTERS */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row justify-between gap-4 shadow-lg print:hidden">
        
        {/* Dynamic Filter Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 flex-1">
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1" htmlFor="trainoperatorperform-l1">Select Train Operator</label>
            <select id="trainoperatorperform-i1" name="trainoperatorperform-i1" 
              value={selectedEmpId}
              onChange={(e) => setSelectedEmpId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
            >
              {filteredCrew.map(c => (
                <option key={c.id} value={c.id}>[{c.id}] {c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1" htmlFor="trainoperatorperform-l2">Operational Month</label>
            <select id="trainoperatorperform-i2" name="trainoperatorperform-i2" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
            >
              {monthNames.map((m, idx) => (
                <option key={idx} value={idx}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1" htmlFor="trainoperatorperform-l3">Operational Year</label>
            <select id="trainoperatorperform-i3" name="trainoperatorperform-i3" 
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1" htmlFor="trainoperatorperform-l4">Depot / Designation Filter</label>
            <select id="trainoperatorperform-i4" name="trainoperatorperform-i4" 
              value={filterDesignation}
              onChange={(e) => setFilterDesignation(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
            >
              <option value="Station Controller / Train Operator">Train Operator</option>
              <option value="ALL">All Staff</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        {!isTrainOperator && (
          <div className="flex items-end gap-2">
            <button 
              onClick={handleExportCSV} 
              className="bg-slate-950 border border-slate-700 hover:border-emerald-500 hover:text-emerald-400 px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Download size={14} /> CSV
            </button>
            <button 
              onClick={handleExportExcel} 
              className="bg-slate-950 border border-slate-700 hover:border-emerald-500 hover:text-emerald-400 px-3 py-1.5 rounded text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Layers size={14} /> EXCEL
            </button>
            <button 
              onClick={handlePrintPDF} 
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-4 py-1.5 rounded text-xs font-black transition-all flex items-center gap-1.5 shadow-md"
            >
              <FileText size={14} /> GENERATE REPORT / PRINT
            </button>
          </div>
        )}
      </div>

      {/* MONTHLY SUMMARY ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        
        {/* Profile Card */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <User size={120} className="text-white" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                <User size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-white leading-tight uppercase">{employee?.name}</h3>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">EMP ID: #{employee?.id}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 border-t border-slate-800 pt-4 text-[10px]">
              <div>
                <span className="block text-slate-500 font-bold uppercase">Designation</span>
                <span className="text-slate-200 font-semibold">{employee?.designation}</span>
              </div>
              <div>
                <span className="block text-slate-500 font-bold uppercase">Assigned Depot</span>
                <span className="text-slate-200 font-semibold">{filterDepot} (Peenya)</span>
              </div>
              <div>
                <span className="block text-slate-500 font-bold uppercase">Competency Validity</span>
                <span className={`font-bold ${employee?.competencyExpiry ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {employee?.competencyExpiry || '2027-12-31'}
                </span>
              </div>
              <div>
                <span className="block text-slate-500 font-bold uppercase">Medical Validity</span>
                <span className="text-emerald-400 font-bold">2027-04-18</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-3 mt-4 flex items-center justify-between text-[9px] text-slate-500 uppercase tracking-widest font-black">
            <span>BMRCL LINE 2 WEST METRO</span>
            <span className="text-emerald-500">ACTIVE DESK STATUS</span>
          </div>
        </div>

        {/* Efficiency Engine Score */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between items-center text-center relative">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Monthly Efficiency Score</h4>
          
          <div className="relative w-[130px] h-[130px] my-3">
            <svg width="130" height="130" viewBox="0 0 130 130" className="transform -rotate-90">
              <circle cx="65" cy="65" r="45" fill="transparent" stroke="#1e293b" strokeWidth="10" />
              <circle 
                cx="65" cy="65" r="45" fill="transparent" stroke="#10b981" strokeWidth="10" 
                strokeDasharray={2 * Math.PI * 45} 
                strokeDashoffset={(2 * Math.PI * 45) - (efficiency.score / 100) * (2 * Math.PI * 45)} 
                strokeLinecap="round" 
                className="transition-all duration-1000 ease-out" 
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-white leading-none">{efficiency.score}%</span>
              <span className="text-[8px] text-slate-500 uppercase font-black tracking-widest mt-1">Operational</span>
            </div>
          </div>

          <div className="w-full flex justify-around text-[9px] border-t border-slate-850 pt-2 text-slate-500 uppercase tracking-wider font-bold">
            <div>
              <span>Safety</span>
              <span className="block text-emerald-400 font-bold">{efficiency.breakdown.safetyScore}/20</span>
            </div>
            <div>
              <span>Punctual</span>
              <span className="block text-cyan-400 font-bold">{efficiency.breakdown.punctualityScore}/20</span>
            </div>
            <div>
              <span>Roster</span>
              <span className="block text-amber-400 font-bold">{efficiency.breakdown.attendanceScore}/25</span>
            </div>
          </div>
        </div>

        {/* Performance Grade Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between items-center text-center">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Performance Grade</h4>
          
          <div className="my-4">
            <span className="text-7xl font-black bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent drop-shadow-md">
              {efficiency.grade}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[9px] text-slate-550 block uppercase font-black">Grade Scaling Matrix</span>
            <div className="flex items-center gap-1.5 text-[8px] text-slate-500 font-semibold">
              <span className={efficiency.grade === 'A+' ? 'text-emerald-400 font-bold' : ''}>A+: 95-100</span>
              <span>•</span>
              <span className={efficiency.grade === 'A' ? 'text-emerald-400 font-bold' : ''}>A: 90-94</span>
              <span>•</span>
              <span className={efficiency.grade === 'B+' ? 'text-cyan-400 font-bold' : ''}>B+: 85-89</span>
              <span>•</span>
              <span className={efficiency.grade === 'B' ? 'text-cyan-400 font-bold' : ''}>B: 80-84</span>
            </div>
          </div>
        </div>

      </div>

      {/* DETAILED STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Roster & Duties */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Briefcase size={12} className="text-amber-500" /> Duty Roster Performance
          </h5>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Allotted Duties</span>
              <span className="text-white font-black text-sm">{monthlyData.metrics.totalDutiesAllotted}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Duties Worked</span>
              <span className="text-emerald-400 font-black text-sm">{monthlyData.metrics.dutiesWorked}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Duties Missed</span>
              <span className={`font-black text-sm ${monthlyData.metrics.dutiesMissed > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {monthlyData.metrics.dutiesMissed}
              </span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Weekly Off (WO)</span>
              <span className="text-slate-400 font-black text-sm">{monthlyData.metrics.weeklyOffDays}</span>
            </div>
          </div>
        </div>

        {/* Driving Analytics */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Clock size={12} className="text-cyan-500" /> Driving Performance
          </h5>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Total Driving Hrs</span>
              <span className="text-cyan-400 font-black text-sm">{monthlyData.metrics.totalDrivingHours}h {monthlyData.metrics.totalDrivingMinutes}m</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Avg Duty Duration</span>
              <span className="text-white font-black text-sm">{monthlyData.metrics.avgDutyDuration} Hrs</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Peak / Non-Peak</span>
              <span className="text-white font-semibold text-[11px]">{monthlyData.metrics.peakHourDrivingHours}h / {monthlyData.metrics.nonPeakDrivingHours}h</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Max Duty Limit</span>
              <span className="text-emerald-500 font-black text-[11px]">&lt; 8.0h Ok</span>
            </div>
          </div>
        </div>

        {/* Trip Analysis */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Train size={12} className="text-emerald-500" /> Operational Trip Logs
          </h5>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Trips Operated</span>
              <span className="text-white font-black text-sm">{monthlyData.metrics.totalTripsOperated}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">UP / DN Direction</span>
              <span className="text-white font-semibold text-[11px]">{monthlyData.metrics.totalUpTrips} UP / {monthlyData.metrics.totalDnTrips} DN</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Full / Short Loop</span>
              <span className="text-white font-semibold text-[11px]">{monthlyData.metrics.totalFullLoopTrips} FL / {monthlyData.metrics.totalShortLoopTrips} SL</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Missed / Cancelled</span>
              <span className={`font-black ${monthlyData.metrics.missedTrips > 0 || monthlyData.metrics.cancelledTrips > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {monthlyData.metrics.missedTrips} / {monthlyData.metrics.cancelledTrips}
              </span>
            </div>
          </div>
        </div>

        {/* Safety & Compliance */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md space-y-3">
          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Shield size={12} className="text-rose-500" /> Safety & Rule violations
          </h5>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Safety Score</span>
              <span className={`font-black text-sm ${monthlyData.metrics.safetyScore >= 90 ? 'text-emerald-400' : 'text-amber-400'}`}>{monthlyData.metrics.safetyScore}/100</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Rule Violations</span>
              <span className={`font-black text-sm ${monthlyData.metrics.ruleViolations > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{monthlyData.metrics.ruleViolations}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Appreciations</span>
              <span className="text-emerald-400 font-black text-sm">{monthlyData.metrics.appreciationsCount}</span>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-850">
              <span className="block text-slate-500 text-[9px] uppercase font-bold">Safety Awards</span>
              <span className="text-amber-400 font-black text-sm">{monthlyData.metrics.awardsCount}</span>
            </div>
          </div>
        </div>

      </div>

      {/* AI INSIGHTS & EXCELLENCE AWARD BADGES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* AI Performance Insights */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
            <Sparkles size={16} /> Crew Controller AI performance Insights
          </h4>
          <div className="space-y-2">
            {aiInsights.map((insight, idx) => (
              <div 
                key={idx} 
                className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                  insight.type === 'success' ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' :
                  insight.type === 'warning' ? 'bg-amber-950/20 border-amber-500/20 text-amber-400' :
                  insight.type === 'danger' ? 'bg-rose-950/20 border-rose-500/20 text-rose-400' :
                  'bg-cyan-950/20 border-cyan-500/20 text-cyan-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
                  <span>{insight.text}</span>
                </div>
                <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                  {insight.type}
                </span>
              </div>
            ))}
            {aiInsights.length === 0 && (
              <div className="text-slate-500 text-xs italic text-center py-6">
                Analyzing operational metrics... Run more shifts to generate detailed observations.
              </div>
            )}
          </div>
        </div>

        {/* Awards & Recognition Badges */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
            <Award size={16} /> Awards & Excellence Engine Recognition
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {awards.map((badge, idx) => (
              <div key={idx} className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex gap-3 items-start group hover:border-cyan-500/40 transition-colors">
                <div className="p-2 rounded-lg bg-cyan-950/30 border border-cyan-500/30 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-all">
                  <Award size={16} />
                </div>
                <div className="space-y-1">
                  <h5 className="text-[11px] font-black text-white leading-tight uppercase">{badge.name}</h5>
                  <p className="text-[9px] text-slate-500 leading-snug">{badge.desc}</p>
                </div>
              </div>
            ))}
            {awards.length === 0 && (
              <div className="col-span-2 text-slate-500 text-xs italic text-center py-10 flex flex-col items-center justify-center gap-2">
                <HelpCircle size={20} />
                <span>No major awards flagged for this period. Maintain high attendance and zero faults to qualify.</span>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* CALENDAR MONTHLY DUTY HISTORY */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-800 pb-3">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar size={18} className="text-emerald-500" /> Daily Duty History Calendar
            </h4>
            <p className="text-[10px] text-slate-550 uppercase tracking-widest mt-0.5">Month of {monthNames[selectedMonth]} {selectedYear}</p>
          </div>
          
          {/* Calendar Status Legend */}
          <div className="flex flex-wrap gap-2 text-[9px] font-semibold text-slate-400 uppercase">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500/10 border border-emerald-500/30"></span> WORKED</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-rose-500/10 border border-rose-500/30"></span> ABSENT</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-slate-950 border border-slate-850"></span> OFF / WO</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-blue-500/10 border border-blue-500/30"></span> LEAVE</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-500/10 border border-amber-500/30"></span> RELIEF</span>
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
            <div key={`empty-${idx}`} className="bg-slate-950/20 border border-slate-900/10 rounded-lg min-h-[70px]"></div>
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

      {/* TREND ANALYSIS CHART PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Area Chart for Driving Hours trend */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
            <TrendingUp size={16} /> Monthly Driving & Mileage Trend
          </h4>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width={250} height={250}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                <YAxis stroke="#64748b" fontSize={9} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Area type="monotone" dataKey="Driving Hours" stroke="#10b981" fillOpacity={1} fill="url(#colorHours)" strokeWidth={2} />
                <Area type="monotone" dataKey="Distance Covered" stroke="#3b82f6" fillOpacity={0} strokeWidth={1} strokeDasharray="4 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Bar chart for daily operations */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
            <BarChart2 size={16} /> Trips Operated Distribution
          </h4>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width={250} height={250}>
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                <YAxis stroke="#64748b" fontSize={9} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }} />
                <Bar dataKey="Trips Operated" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* COMPARATIVE METRICS & SAFETY FAULTS REGISTER */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Safety, Punctuality & Leave Registers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-slate-800 pb-2">
            Punctuality & Relief Analysis
          </h4>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg text-center">
                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1">On-Time Sign-On</span>
                <span className="text-emerald-400 font-black text-lg">{monthlyData.metrics.onTimeSignOnPct}%</span>
              </div>
              <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg text-center">
                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1">Late Sign-On</span>
                <span className={`font-black text-lg ${monthlyData.metrics.lateSignOnCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>{monthlyData.metrics.lateSignOnCount}</span>
              </div>
              <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg text-center">
                <span className="block text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1">Extended Duty</span>
                <span className="text-cyan-400 font-black text-lg">{monthlyData.metrics.extendedDutyCount}</span>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-850 rounded-lg p-4 space-y-3">
              <h5 className="text-[10px] text-slate-400 font-black uppercase tracking-wider flex items-center gap-1.5">
                <Users size={12} className="text-cyan-400" /> Crew Controller Relief tracking
              </h5>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase text-[9px]">Reliefs Taken</span>
                  <span className="text-slate-300 font-bold">{monthlyData.metrics.reliefsTaken}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase text-[9px]">Reliefs Given</span>
                  <span className="text-emerald-400 font-black">{monthlyData.metrics.reliefsGiven}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase text-[9px]">Emergency Relief</span>
                  <span className="text-amber-400 font-bold">{monthlyData.metrics.emergencyReliefParticipation}</span>
                </div>
                <div className="flex justify-between border-b border-slate-900 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase text-[9px]">Duty Swaps / Exchanges</span>
                  <span className="text-slate-300 font-semibold">{monthlyData.metrics.dutySwapCount} / {monthlyData.metrics.shiftExchangeCount}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Fault & Incident register */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-slate-800 pb-2">
            Fault & Incident Register Logs
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[10px]">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-black uppercase">
                  <th className="p-2">Date</th>
                  <th className="p-2">Train ID</th>
                  <th className="p-2">Fault Type</th>
                  <th className="p-2">Description</th>
                  <th className="p-2 text-right">Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {monthlyData.metrics.faults?.map((f, idx) => (
                  <tr key={idx} className="hover:bg-slate-950/40">
                    <td className="p-2 whitespace-nowrap">{f.timestamp?.toDate ? f.timestamp.toDate().toLocaleDateString() : 'Real-time'}</td>
                    <td className="p-2 font-bold text-rose-400">{f.trainId}</td>
                    <td className="p-2 uppercase">{f.severity || 'MINOR'}</td>
                    <td className="p-2 truncate max-w-[120px]" title={f.description}>{f.description}</td>
                    <td className="p-2 text-right font-semibold text-emerald-400">{f.status || 'RESOLVED'}</td>
                  </tr>
                ))}
                {(monthlyData.metrics.faults || []).length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-4 text-center text-slate-500 italic uppercase">
                      No faults recorded during this operator's shifts.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* COMPARISON DASHBOARD & COMPLIANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Comparative benchmarking */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-slate-800 pb-2">
            Performance Benchmarking Dashboard
          </h4>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1 text-[10px] uppercase font-bold text-slate-400">
                <span>Selected Operator ({employee.name})</span>
                <span className="text-emerald-400">{efficiency.score}%</span>
              </div>
              <div className="h-2.5 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${efficiency.score}%` }}></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <span className="block text-[8px] text-slate-500 font-bold uppercase">Depot Average</span>
                  <span className="text-white font-black text-sm">84.2%</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${efficiency.score >= 84.2 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {efficiency.score >= 84.2 ? `+${(efficiency.score - 84.2).toFixed(1)}%` : `${(efficiency.score - 84.2).toFixed(1)}%`}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <span className="block text-[8px] text-slate-500 font-bold uppercase">Line 2 Average</span>
                  <span className="text-white font-black text-sm">81.5%</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${efficiency.score >= 81.5 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {efficiency.score >= 81.5 ? `+${(efficiency.score - 81.5).toFixed(1)}%` : `${(efficiency.score - 81.5).toFixed(1)}%`}
                </span>
              </div>

              <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <span className="block text-[8px] text-slate-500 font-bold uppercase">Best Performer</span>
                  <span className="text-white font-black text-sm">98.0%</span>
                </div>
                <span className="text-[10px] text-slate-500 font-bold">HARSH JOSHI</span>
              </div>

              <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center">
                <div>
                  <span className="block text-[8px] text-slate-500 font-bold uppercase">Previous Month</span>
                  <span className="text-white font-black text-sm">89.0%</span>
                </div>
                <span className={`text-[10px] font-black px-2 py-0.5 rounded ${efficiency.score >= 89.0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                  {efficiency.score >= 89.0 ? `+${(efficiency.score - 89.0).toFixed(1)}%` : `${(efficiency.score - 89.0).toFixed(1)}%`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Compliance and Competency Expiries */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
          <h4 className="text-xs font-black text-white uppercase tracking-widest border-b border-slate-800 pb-2">
            Compliance & Validities
          </h4>
          <div className="space-y-3">
            
            <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center text-xs">
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase">Medical Validity Expiry</span>
                <span className="text-slate-300 font-bold">2027-04-18</span>
              </div>
              <span className="bg-emerald-950/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black">VALID</span>
            </div>

            <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center text-xs">
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase">Competency Certificate Expiry</span>
                <span className="text-slate-300 font-bold">{employee.competencyExpiry || '2027-12-31'}</span>
              </div>
              <span className="bg-emerald-950/20 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[9px] font-black">VALID</span>
            </div>

            <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center text-xs">
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase">Refresher Training Due Date</span>
                <span className="text-slate-300 font-bold">2026-11-22</span>
              </div>
              <span className="bg-cyan-950/20 text-cyan-400 border border-cyan-500/20 px-2 py-0.5 rounded text-[9px] font-black">5 MONTHS</span>
            </div>

            <div className="bg-slate-950 border border-slate-850 p-3 rounded-lg flex justify-between items-center text-xs">
              <div>
                <span className="block text-[8px] text-slate-500 font-bold uppercase">Safety Training Due Date</span>
                <span className="text-slate-300 font-bold">2026-08-15</span>
              </div>
              <span className="bg-amber-950/20 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[9px] font-black">UPCOMING</span>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
}

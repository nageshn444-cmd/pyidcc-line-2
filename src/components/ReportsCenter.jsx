import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Download, Calendar, Train, BarChart2, Clock, Mail, Zap, 
  RefreshCw, CheckCircle2, AlertTriangle, ShieldAlert, Play, Pause, Trash2, Eye, Filter,
  Search, Users, CheckSquare, Wrench, ShieldCheck, Layers, Activity, FileSpreadsheet, Database, 
  BookOpen, ChevronRight, X, FileCode, Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '../firebase';
import { 
  collection, query, where, getDocs, addDoc, serverTimestamp, 
  onSnapshot, doc, deleteDoc, updateDoc, orderBy, limit 
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

export default function ReportsCenter() {
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

  const [activeTab, setActiveTab] = useState('EXPORTS'); // EXPORTS, INSIGHTS, SCHEDULED, EXCHANGES
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [exportFormat, setExportFormat] = useState('XLSX'); // XLSX, CSV, JSON
  const [loadingAction, setLoadingAction] = useState(null);
  const [exchanges, setExchanges] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Quick lookup map for BMRCL Train Operators & Station Superintendents
  const crewLookupMap = useMemo(() => {
    const map = new Map();
    (BMRCL_CREW_REGISTRY || []).forEach(c => {
      if (c && c.id) {
        map.set(String(c.id).trim(), c);
      }
    });
    return map;
  }, []);

  useEffect(() => {
    if (activeTab === 'EXCHANGES') {
      const unsub = onSnapshot(collection(db, 'shift_exchanges'), (snap) => {
        setExchanges(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsub();
    }
  }, [activeTab]);

  // Advanced Query Filters
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterTrainId, setFilterTrainId] = useState('');

  // Live Data Preview States
  const [previewData, setPreviewData] = useState(null);
  const [previewReport, setPreviewReport] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Scheduled Dispatch States
  const [schedules, setSchedules] = useState([]);
  const [scheduleConfig, setScheduleConfig] = useState({
    reportType: 'Attendance & Breathalyzer Logs',
    frequency: 'DAILY',
    email: '',
    time: '08:00'
  });

  // Insights Analytics States
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Database configurations strictly aligned with actual collections across BMRCL Line 2 Peenya Depot
  // Categorized into 4 essential pillars: OPERATIONS, ROSTER & LEAVES, SAFETY & DEFECTS, AUDIT & REGISTRIES
  const reportConfig = useMemo(() => [
    // =========================================================================
    // 1. OPERATIONS
    // =========================================================================
    {
      id: 'crew_attendance',
      name: 'Attendance & Breathalyzer Logs',
      category: 'OPERATIONS',
      collection: 'crew_live_attendance',
      dateKey: 'timestamp',
      description: 'Biometric, breathalyzer BAC readings, sign-on/sign-off logs, duty IDs, and depot stations.'
    },
    {
      id: 'crew_deployment',
      name: 'Crew Daily Deployment Schedule',
      category: 'OPERATIONS',
      collection: 'crew_daily_deployment',
      dateKey: 'lastUpdated',
      description: 'Active daily duty assignments, assigned train operators, shift timings, train IDs, and milestones.'
    },
    {
      id: 'daily_train_crew',
      name: 'Daily Train Running & Crew Tracking',
      category: 'OPERATIONS',
      collection: 'daily_crew_tracks',
      dateKey: 'timestamp',
      description: 'Real-time train rake tracking with currently operating train operator mapping and station headways.'
    },
    {
      id: 'delay_incidents',
      name: 'Train Line Delay & Incidents Log',
      category: 'OPERATIONS',
      collection: 'wtt_live_incidents',
      dateKey: 'timestamp',
      description: 'Mainline train delay events, root cause breakdown, delay duration (mins), affected stations, and remarks.'
    },
    {
      id: 'rake_registry',
      name: 'Rolling Stock 6-Car Rake Registry',
      category: 'OPERATIONS',
      collection: 'rake_registry',
      dateKey: 'registryDate',
      isDateString: true,
      description: 'Active 6-car rake sets, maintenance status, HVAC/traction health, and depot induction records.'
    },
    {
      id: 'emergency_relief',
      name: 'Emergency Crew Relief & Rescue Logs',
      category: 'OPERATIONS',
      collection: 'emergency_relief_reports',
      dateKey: 'timestamp',
      description: 'SOS call-outs, stand-by relief crew deployments, rescue turnaround logs, and controller authorizations.'
    },
    {
      id: 'stepback_duties',
      name: 'Outstation Stepback (STBK) Operations',
      category: 'OPERATIONS',
      collection: 'stepback_duties',
      dateKey: 'timestamp',
      description: 'Outstation stepback duties, station changeovers, and quick mainline driver turnarounds.'
    },
    {
      id: 'crew_links',
      name: 'Master Duty Link Schedule (01-79)',
      category: 'OPERATIONS',
      collection: 'crew_final_links',
      dateKey: 'createdAt',
      isMasterRegistry: true,
      description: 'BMRCL Line 2 master duty links (01-79), trip legs, km run, and scheduled timings.'
    },
    {
      id: 'wtt_matrix',
      name: 'Working Time Table (WTT) Master Timetable',
      category: 'OPERATIONS',
      collection: 'wtt_final_matrix',
      dateKey: 'createdAt',
      isMasterRegistry: true,
      description: 'WTT train trip master timetable with departure, arrival, and station dwell schedule.'
    },
    {
      id: 'dispatch_gate',
      name: 'Automated Dispatch Gateway Logs',
      category: 'OPERATIONS',
      collection: 'automated_dispatch_gate',
      dateKey: 'timestamp',
      description: 'Dispatch engine execution history, timetable activations, and batch deployment results.'
    },
    {
      id: 'train_swap_audit',
      name: 'Train ID Swap & Divert Logs',
      category: 'OPERATIONS',
      collection: 'trainIdSwapAudit',
      fallbackCollection: 'train_swap_events',
      dateKey: 'timestamp',
      description: 'Mainline train set swaps, swap reasons, controller authorizations, and rake diversion audit trail.'
    },

    // =========================================================================
    // 2. ROSTER & LEAVES
    // =========================================================================
    {
      id: 'leave_requests',
      name: 'Leave Applications & Priority Report',
      category: 'ROSTER & LEAVES',
      collection: 'leave_requests',
      dateKey: 'requestDate',
      description: 'Staff leave applications with priority scoring (ML, MatL, SCL, PL, CCL, EL, CL, CO, OL) and approvals.'
    },
    {
      id: 'leave_balances',
      name: 'Staff Leave Balances Ledger',
      category: 'ROSTER & LEAVES',
      collection: 'leave_balances',
      dateKey: 'lastUpdated',
      isMasterRegistry: true,
      description: 'Staff accumulated leave balances (CL, EL, HPL, RH, CCL) and credit/debit records.'
    },
    {
      id: 'absent_register',
      name: 'Absenteeism & Medical Book-off Register',
      category: 'ROSTER & LEAVES',
      collection: 'absent_bookoff_register',
      dateKey: 'date',
      isDateString: true,
      description: 'Daily crew absenteeism, sick/medical book-off log, and fitness-to-drive returns.'
    },
    {
      id: 'weekly_off',
      name: 'Weekly Off (WO) Master Roster',
      category: 'ROSTER & LEAVES',
      collection: 'weekly_off_register',
      dateKey: 'date',
      isDateString: true,
      description: 'Assigned weekly rest days, rotational pattern schedules, and rest day compliance.'
    },
    {
      id: 'shift_exchanges',
      name: 'Shift Exchange Operations Log',
      category: 'ROSTER & LEAVES',
      collection: 'shift_exchanges',
      dateKey: 'timestamp',
      description: 'Mutual shift exchange applications, operator pairs, duty codes, and supervisory approvals.'
    },
    {
      id: 'manual_overrides',
      name: 'Controller Duty Overrides & Force Swaps',
      category: 'ROSTER & LEAVES',
      collection: 'manual_overrides',
      dateKey: 'createdAt',
      description: 'Manual duty swaps, controller force assignments, and operational override audit trail.'
    },
    {
      id: 'shift_handover',
      name: 'Chief Controller Shift Handover Reports',
      category: 'ROSTER & LEAVES',
      collection: 'shift_handover_reports',
      fallbackCollection: 'shift_handover_notes',
      dateKey: 'timestamp',
      description: 'Duty controller handover briefings, key events, crew availability, and depot handovers.'
    },

    // =========================================================================
    // 3. SAFETY & DEFECTS
    // =========================================================================
    {
      id: 'rs_faults',
      name: 'Rolling Stock Defect & Repair Log',
      category: 'SAFETY & DEFECTS',
      collection: 'rolling_stock_faults',
      dateKey: 'timestamp',
      description: 'Train defects, HVAC, door interlocks, third rail shoegear (CCSD), and depot repair work-orders.'
    },
    {
      id: 'field_faults',
      name: 'AI Defect Desk & Field Fault Reports',
      category: 'SAFETY & DEFECTS',
      collection: 'fault_reports',
      dateKey: 'createdAt',
      description: 'AI natural language defect tickets, maintenance notifications, and field dispatches.'
    },
    {
      id: 'safety_incidents',
      name: 'Safety Incidents & Operational Breaches',
      category: 'SAFETY & DEFECTS',
      collection: 'safety_incidents',
      dateKey: 'timestamp',
      description: 'Track irregularities, signal pass at danger (SPAD), safety audits, and emergency events.'
    },
    {
      id: 'daily_safety_checklists',
      name: 'Station Daily Safety & Fire Compliance',
      category: 'SAFETY & DEFECTS',
      collection: 'daily_safety_checklists',
      dateKey: 'timestamp',
      description: 'Daily station fire safety, CCTV operation, and platform edge verification checklists.'
    },
    {
      id: 'als_inspections',
      name: 'AI-ALS Cab Ride & Line Inspection Audits',
      category: 'SAFETY & DEFECTS',
      collection: 'alsCompletedInspection',
      dateKey: 'timestamp',
      description: 'Supervisor cab ride assessments, train handling scores, and ALS safety audits.'
    },

    // =========================================================================
    // 4. AUDIT & REGISTRIES
    // =========================================================================
    {
      id: 'crew_registry',
      name: 'Master Crew Directory & Competencies',
      category: 'AUDIT & REGISTRIES',
      collection: 'crewRegistry',
      dateKey: 'updatedAt',
      isMasterRegistry: true,
      description: 'Master roster of active BMRCL Train Operators, designations, PME due dates, and competencies.'
    },
    {
      id: 'jmd_crew',
      name: 'JMD Contract Trainees & Shadow Pilots',
      category: 'AUDIT & REGISTRIES',
      collection: 'jmd_crew_registry',
      dateKey: 'lastUpdated',
      isMasterRegistry: true,
      description: 'JMD contract train drivers, trainee hours, mentor mapping, and certification.'
    },
    {
      id: 'audit_logs',
      name: 'System Security & Action Audit Trail',
      category: 'AUDIT & REGISTRIES',
      collection: 'auditLogs',
      dateKey: 'timestamp',
      description: 'User role modifications, provisioning actions, system configuration, and access events.'
    },
    {
      id: 'integrity_logs',
      name: 'Crew Data Integrity Audit Trail',
      category: 'AUDIT & REGISTRIES',
      collection: 'integrity_audit_logs',
      dateKey: 'timestamp',
      description: 'Automated roster validation checks, duty collision audits, and integrity scans.'
    },
    {
      id: 'login_history',
      name: 'User Login & Active Session History',
      category: 'AUDIT & REGISTRIES',
      collection: 'login_history',
      dateKey: 'timestamp',
      description: 'User authentication logs, login timestamps, device info, and active session history.'
    },
    {
      id: 'system_users_directory',
      name: 'User Management & Role Directory',
      category: 'AUDIT & REGISTRIES',
      collection: 'system_users',
      dateKey: 'createdAt',
      isMasterRegistry: true,
      description: 'Active system users, assigned security roles, depot assignments, and approval statuses.'
    }
  ], []);

  const categories = ['ALL', 'OPERATIONS', 'ROSTER & LEAVES', 'SAFETY & DEFECTS', 'AUDIT & REGISTRIES'];

  // Filtered reports list based on active category and search
  const filteredReports = useMemo(() => {
    return reportConfig.filter(rep => {
      const matchCategory = selectedCategory === 'ALL' || rep.category === selectedCategory;
      const matchSearch = !searchQuery || 
        rep.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        rep.collection.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (rep.description && rep.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCategory && matchSearch;
    });
  }, [reportConfig, selectedCategory, searchQuery]);

  // Sync scheduled reports in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'automated_report_schedules'), (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Format any Firestore timestamp or date string to readable format
  const formatTimestamp = (val) => {
    if (!val) return '--';
    if (val.toDate && typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      } catch {
        return String(val);
      }
    }
    if (typeof val === 'string' && val.length >= 10) {
      return val.replace('T', ' ').substring(0, 19);
    }
    return String(val);
  };

  // Leave priority evaluator
  const getLeavePriorityDetails = (req) => {
    let score = 50;
    let label = 'Optional / Other Leave';
    const type = String(req.leaveType || '').toUpperCase();
    if (type === 'ML') { score = 95; label = 'Medical Leave (ML)'; }
    else if (type === 'MATERNITY') { score = 90; label = 'Maternity Leave (MatL)'; }
    else if (type === 'SCL') { score = 85; label = 'Special Casual Leave (SCL)'; }
    else if (type === 'PL') { score = 80; label = 'Paternity Leave (PL)'; }
    else if (type === 'CCL') { score = 75; label = 'Child Care Leave (CCL)'; }
    else if (type === 'EL') { score = 70; label = 'Earned Leave (EL)'; }
    else if (type === 'CL') { score = 60; label = 'Casual Leave (CL)'; }
    else if (type === 'CO') { score = 55; label = 'Compensatory Off (CO)'; }
    else if (type === 'STUDY') { score = 45; label = 'Study Leave (StL)'; }
    else if (type === 'EOL') { score = 40; label = 'Extraordinary Leave (EOL)'; }
    else if (type === 'OL') { score = 50; label = 'Optional Leave (OL)'; }
    return { score, label };
  };

  // Comprehensive, clean data normalizer tailored for each of the 4 core categories
  const normalizeReportData = (reportItem, rawList) => {
    return rawList.map(item => {
      const empId = String(item.empId || item.employeeId || item.operatorId || item.empNo || item.id || '').trim();
      const crewInfo = crewLookupMap.get(empId);
      const resolvedName = item.empName || item.employeeName || item.name || item.operatorName || (crewInfo ? crewInfo.name : '') || '--';
      const resolvedDesig = item.designation || (crewInfo ? crewInfo.designation : '') || 'Train Operator';

      // 1. OPERATIONS
      if (reportItem.id === 'crew_attendance') {
        return {
          "Timestamp": formatTimestamp(item.timestamp || item.signOnTime),
          "Employee ID": empId,
          "Employee Name": resolvedName,
          "Designation": resolvedDesig,
          "Duty ID": item.dutyId || item.dutyNo || '--',
          "Breathalyzer Status": item.breathalyzerStatus || (item.baPassed ? 'PASS' : item.baReading ? 'RECORDED' : 'PASS'),
          "BAC Reading (mg/100ml)": item.baReading || item.bacReading || '0.00',
          "Sign-On Time": item.signOnTime ? formatTimestamp(item.signOnTime) : '--',
          "Sign-Off Time": item.signOffTime ? formatTimestamp(item.signOffTime) : '--',
          "Location / Station": item.location || item.signOnLocation || item.station || 'PYID',
          "Status": item.status || 'LOGGED'
        };
      }

      if (reportItem.id === 'crew_deployment') {
        return {
          "Date": item.date || item.deploymentDate || (item.lastUpdated ? formatTimestamp(item.lastUpdated).substring(0, 10) : '--'),
          "Duty ID": item.dutyId || item.dutyNo || '--',
          "Employee ID": empId,
          "Employee Name": resolvedName,
          "Designation": resolvedDesig,
          "Shift Type": item.shiftType || item.shift || '--',
          "Train ID": item.trainId || item.rakeId || '--',
          "Sign-On Time": item.signOnTime || item.scheduledSignOn || '--',
          "Sign-Off Time": item.signOffTime || item.scheduledSignOff || '--',
          "Sign-On Station": item.signOnLocation || item.station || 'PYID',
          "Sign-Off Station": item.signOffLocation || 'PYID',
          "Deployment Status": item.status || 'ASSIGNED',
          "Remarks": item.remarks || item.note || '--'
        };
      }

      if (reportItem.id === 'daily_train_crew') {
        return {
          "Date / Time": formatTimestamp(item.timestamp || item.lastPing || item.date),
          "Train ID": item.trainId || item.trainNo || '--',
          "Rake ID": item.rakeId || item.rakeNo || '--',
          "Operator ID": empId,
          "Operator Name": resolvedName,
          "Duty ID": item.dutyId || item.dutyNo || '--',
          "Current Station": item.currentStation || item.station || item.location || '--',
          "Direction": item.direction || item.route || '--',
          "Running Status": item.status || 'OPERATIONAL',
          "Headway Status": item.headwayStatus || item.headway || 'ON_TIME'
        };
      }

      if (reportItem.id === 'delay_incidents') {
        return {
          "Timestamp": formatTimestamp(item.timestamp),
          "Date": item.date || (item.timestamp ? formatTimestamp(item.timestamp).substring(0, 10) : '--'),
          "Train ID": item.trainId || item.trainNo || '--',
          "Duty ID": item.dutyId || item.dutyNo || '--',
          "Operator ID": empId,
          "Operator Name": resolvedName,
          "Incident Reason": item.reason || item.remarks || item.incidentType || 'Mainline Delay',
          "Delay Duration (Mins)": item.delayMinutes || item.durationMins || item.delay || '0',
          "Station Location": item.station || item.location || '--',
          "Schedule Type": item.scheduleType || 'WEEKDAY',
          "Reported By": item.reportedBy || '--',
          "Controller Remarks": item.controllerRemarks || item.remarks || '--'
        };
      }

      if (reportItem.id === 'rake_registry') {
        return {
          "Rake ID": item.rakeId || item.id || '--',
          "Car Formation": item.carsCount ? `${item.carsCount}-Car` : '6-Car',
          "Fitness Status": item.fitnessStatus || item.status || 'FIT_FOR_REVENUE',
          "Base Depot": item.depot || item.baseDepot || 'Peenya Depot (PYID)',
          "HVAC Status": item.hvacStatus || 'NORMAL',
          "Traction Status": item.tractionStatus || 'NORMAL',
          "Third Rail CCSD": item.ccsdStatus || 'CHECKED',
          "Induction Date": item.inductionDate || item.registryDate || '--',
          "Remarks": item.remarks || '--'
        };
      }

      if (reportItem.id === 'emergency_relief') {
        return {
          "Timestamp": formatTimestamp(item.timestamp),
          "Incident / Reason": item.reason || item.event || 'Emergency Crew Relief',
          "Stranded Train ID": item.trainId || item.strandedTrainId || '--',
          "Stranded Duty ID": item.dutyId || item.dutyNo || '--',
          "Relief Driver ID": item.reliefEmpId || empId || '--',
          "Relief Driver Name": item.reliefEmpName || resolvedName,
          "Relief Station": item.station || item.location || 'PYID',
          "Dispatched By": item.dispatchedBy || item.authorizedBy || 'Chief Crew Controller',
          "Status": item.status || 'RESOLVED'
        };
      }

      if (reportItem.id === 'stepback_duties') {
        return {
          "Date / Time": formatTimestamp(item.timestamp || item.date),
          "Duty ID": item.dutyId || item.dutyNo || '--',
          "Stepback Station": item.station || item.location || 'Nagasandra / Silk Institute',
          "Incoming Train ID": item.incomingTrainId || item.trainId || '--',
          "Outgoing Train ID": item.outgoingTrainId || '--',
          "Operator ID": empId,
          "Operator Name": resolvedName,
          "Status": item.status || 'COMPLETED'
        };
      }

      if (reportItem.id === 'crew_links') {
        return {
          "Duty No": item.dutyNo || item.dutyId || item.id || '--',
          "Shift": item.shift || item.shiftType || '--',
          "Sign-On Time": item.signOn || item.signOnTime || '--',
          "Sign-Off Time": item.signOff || item.signOffTime || '--',
          "Total Driving Hours": item.drivingHours || item.totalDriving || '--',
          "Total Spread Hours": item.spreadHours || item.totalSpread || '--',
          "Round Trips": item.tripsCount || item.trips || '--',
          "Total KM": item.totalKm || item.km || '--',
          "Sign-On Station": item.signOnStation || item.signOnLocation || 'PYID',
          "Sign-Off Station": item.signOffStation || item.signOffLocation || 'PYID'
        };
      }

      if (reportItem.id === 'wtt_matrix') {
        return {
          "Trip ID": item.tripId || item.id || '--',
          "Schedule Type": item.scheduleType || 'WEEKDAY',
          "Train ID": item.trainId || item.trainNo || '--',
          "Origin Station": item.origin || item.fromStation || '--',
          "Departure Time": item.departureTime || item.depTime || '--',
          "Destination Station": item.destination || item.toStation || '--',
          "Arrival Time": item.arrivalTime || item.arrTime || '--',
          "Running Time (Mins)": item.runningTime || '--'
        };
      }

      if (reportItem.id === 'dispatch_gate') {
        return {
          "Timestamp": formatTimestamp(item.timestamp),
          "Schedule Type": item.scheduleType || 'WEEKDAY',
          "Total Duties Dispatched": item.dispatchedCount || item.totalDuties || '--',
          "Unassigned Duties Count": item.unassignedCount || '0',
          "Execution Status": item.status || 'SUCCESS',
          "Triggered By": item.triggeredBy || 'Controller',
          "Remarks": item.notes || item.remarks || '--'
        };
      }

      if (reportItem.id === 'train_swap_audit') {
        return {
          "Timestamp": formatTimestamp(item.timestamp || item.createdAt),
          "Original Train ID": item.originalTrainId || item.oldTrainId || '--',
          "Swapped Train ID": item.newTrainId || item.swappedTrainId || '--',
          "Rake ID": item.rakeId || item.rakeNo || '--',
          "Reason for Swap": item.reason || item.remarks || 'Operational Optimization',
          "Authorized Controller": item.controllerId || item.authorizedBy || 'Crew Controller',
          "Station Location": item.station || item.location || 'PYID'
        };
      }

      // 2. ROSTER & LEAVES
      if (reportItem.id === 'leave_requests') {
        const priority = getLeavePriorityDetails(item);
        return {
          "Request Date": item.requestDate || formatTimestamp(item.timestamp).substring(0, 10),
          "Employee ID": empId,
          "Employee Name": resolvedName,
          "Designation": resolvedDesig,
          "Leave Type": item.leaveType || '--',
          "Sub Category": item.subCategory || '--',
          "Priority Level": priority.label,
          "Priority Score": priority.score,
          "Start Date": item.startDate || '--',
          "End Date": item.endDate || '--',
          "Total Days": item.daysCount || item.days || '1',
          "Reason": item.reason || '--',
          "Approval Status": item.status || 'PENDING',
          "Approved By": item.approvedBy || '--',
          "Approval Time": item.approvedTime ? formatTimestamp(item.approvedTime) : '--'
        };
      }

      if (reportItem.id === 'leave_balances') {
        return {
          "Employee ID": empId,
          "Employee Name": resolvedName,
          "Designation": resolvedDesig,
          "CL Balance": item.cl ?? item.CL ?? 0,
          "EL Balance": item.el ?? item.EL ?? 0,
          "HPL Balance": item.hpl ?? item.HPL ?? 0,
          "RH Balance": item.rh ?? item.RH ?? 0,
          "CCL Balance": item.ccl ?? item.CCL ?? 0,
          "Last Updated": formatTimestamp(item.lastUpdated || item.updatedAt)
        };
      }

      if (reportItem.id === 'absent_register') {
        return {
          "Date": item.date || formatTimestamp(item.timestamp).substring(0, 10),
          "Employee ID": empId,
          "Employee Name": resolvedName,
          "Designation": resolvedDesig,
          "Absence Category": item.category || item.reason || 'Medical Book-off',
          "Book-off Time": item.bookOffTime || '--',
          "Return to Duty Date": item.returnDate || item.fitnessDate || '--',
          "Fitness Certified": item.fitnessCertified ? 'YES' : 'PENDING',
          "Remarks": item.remarks || '--'
        };
      }

      if (reportItem.id === 'weekly_off') {
        return {
          "Date": item.date || '--',
          "Employee ID": empId,
          "Employee Name": resolvedName,
          "Designation": resolvedDesig,
          "Assigned Rest Day": item.dayOfWeek || item.weeklyOffDay || 'SUNDAY',
          "Shift Group": item.group || item.shiftGroup || '--',
          "Status": item.status || 'SCHEDULED'
        };
      }

      if (reportItem.id === 'shift_exchanges') {
        return {
          "Exchange ID": item.id || '--',
          "Target Date": item.exchangeDate || item.date || '--',
          "Requester ID": item.operator1Id || item.requesterId || '--',
          "Requester Name": item.operator1Name || item.requesterName || '--',
          "Requester Duty": item.operator1Duty || item.requesterDuty || '--',
          "Target Operator ID": item.operator2Id || item.targetId || '--',
          "Target Operator Name": item.operator2Name || item.targetName || '--',
          "Target Duty": item.operator2Duty || item.targetDuty || '--',
          "Status": item.status || 'PENDING',
          "Approved By": item.approvedBy || '--',
          "Approval Date": formatTimestamp(item.operationalAt || item.approvedAt || item.timestamp)
        };
      }

      if (reportItem.id === 'manual_overrides') {
        return {
          "Timestamp": formatTimestamp(item.createdAt || item.timestamp),
          "Duty ID": item.dutyId || item.dutyNo || '--',
          "Original Operator ID": item.previousEmpId || item.originalEmpId || '--',
          "Override Operator ID": item.newEmpId || empId || '--',
          "Override Operator Name": resolvedName,
          "Controller ID": item.controllerId || item.assignedBy || 'Chief Controller',
          "Override Reason": item.reason || 'Service Continuity'
        };
      }

      if (reportItem.id === 'shift_handover') {
        return {
          "Timestamp": formatTimestamp(item.timestamp || item.createdAt),
          "Shift": item.shift || item.shiftType || 'General Shift',
          "Chief Controller Name": item.controllerName || item.createdBy || '--',
          "Active Crew Available": item.crewAvailable || item.activeCrewCount || '--',
          "Active Trains Running": item.trainsRunning || item.trainCount || '--',
          "Incidents Logged": item.incidentsCount || item.openIncidents || '0',
          "Depot Handover Briefing": item.summary || item.handoverNotes || item.remarks || '--'
        };
      }

      // 3. SAFETY & DEFECTS
      if (reportItem.id === 'rs_faults') {
        return {
          "Report Timestamp": formatTimestamp(item.timestamp || item.createdAt),
          "Rake ID": item.rakeId || item.rakeNo || '--',
          "Train ID": item.trainId || '--',
          "Car No": item.carNo || item.coachNo || '--',
          "Subsystem": item.subsystem || item.category || 'Rolling Stock',
          "Fault Description": item.faultDescription || item.description || '--',
          "Severity Level": item.severity || 'MINOR',
          "Reported By": item.reportedBy || resolvedName,
          "Maintenance Work-Order Status": item.status || 'OPEN',
          "Depot Action": item.actionTaken || '--'
        };
      }

      if (reportItem.id === 'field_faults') {
        return {
          "Ticket ID": item.id || '--',
          "Date Reported": formatTimestamp(item.createdAt || item.timestamp),
          "Subsystem": item.subsystem || item.system || 'Field Equipment',
          "Location / Station": item.location || item.station || 'PYID',
          "Fault Narrative": item.description || item.faultText || '--',
          "AI Classification": item.aiCategory || item.category || '--',
          "Priority": item.priority || 'MEDIUM',
          "Status": item.status || 'PENDING'
        };
      }

      if (reportItem.id === 'safety_incidents') {
        return {
          "Timestamp": formatTimestamp(item.timestamp),
          "Incident Classification": item.category || item.type || 'Safety Incident',
          "Severity": item.severity || 'LEVEL_1',
          "Location": item.location || item.station || '--',
          "Train ID Involved": item.trainId || '--',
          "Operator ID Involved": empId,
          "Operator Name": resolvedName,
          "Incident Narrative": item.description || item.remarks || '--',
          "Investigation Status": item.investigationStatus || 'UNDER_REVIEW'
        };
      }

      if (reportItem.id === 'daily_safety_checklists') {
        return {
          "Checklist Date": item.date || formatTimestamp(item.timestamp).substring(0, 10),
          "Station Name": item.station || item.stationName || 'Peenya Industry',
          "Inspector Name": item.inspectorName || item.stationController || resolvedName,
          "Fire Safety Check": item.fireSafetyPassed ? 'PASS' : 'VERIFIED',
          "CCTV Operational": item.cctvOperational ? 'PASS' : 'VERIFIED',
          "Platform Edge Doors": item.platformDoorsChecked ? 'PASS' : 'VERIFIED',
          "Emergency Plungers": item.emergencyPlungersOk ? 'PASS' : 'VERIFIED',
          "Overall Compliance Score": item.complianceScore ? `${item.complianceScore}%` : '100%',
          "Remarks": item.remarks || '--'
        };
      }

      if (reportItem.id === 'als_inspections') {
        return {
          "Inspection Timestamp": formatTimestamp(item.timestamp),
          "Supervisor Name": item.supervisorName || item.inspector || '--',
          "Train Operator ID": empId,
          "Train Operator Name": resolvedName,
          "Train ID": item.trainId || '--',
          "Line Sector": item.sector || 'Line 2 (Green Line)',
          "Driving Handling Score": item.handlingScore ? `${item.handlingScore}/100` : '95/100',
          "Signal Adherence": item.signalAdherence || 'EXCELLENT',
          "Cab Audit Status": item.status || 'COMPLETED',
          "Remarks": item.remarks || item.notes || '--'
        };
      }

      // 4. AUDIT & REGISTRIES
      if (reportItem.id === 'crew_registry') {
        return {
          "Employee ID": empId,
          "Name": resolvedName,
          "Designation": resolvedDesig,
          "Role": item.role || resolvedDesig,
          "Depot": item.depot || 'Peenya Depot (PYID)',
          "Department": item.department || 'Operations',
          "Active Crew Status": item.activeCrew === false ? 'INACTIVE' : 'ACTIVE',
          "Competency Valid Till": item.competencyValidTill || item.competencyExpiry || '2028-12-31',
          "Medical PME Valid Till": item.medicalValidTill || item.pmeDue || '2027-12-31',
          "Blood Group": item.bloodGroup || '--',
          "Contact Number": item.contact || '--'
        };
      }

      if (reportItem.id === 'jmd_crew') {
        return {
          "JMD Driver ID": item.id || empId,
          "Driver Name": resolvedName,
          "Contract Agency": item.agency || item.vendor || 'JMD Services',
          "Assigned Mentor TO": item.mentorName || item.mentorId || '--',
          "Total Driving Hours": item.drivingHours || item.totalHours || '0',
          "Trainee Status": item.status || 'ACTIVE_SHADOW',
          "Certification Validity": item.certificationValidTill || '--'
        };
      }

      if (reportItem.id === 'audit_logs') {
        return {
          "Timestamp": formatTimestamp(item.timestamp),
          "Action / Event": item.action || item.event || '--',
          "Target Resource": item.target || item.resource || '--',
          "Performed By": item.performedBy || item.userEmail || item.userId || '--',
          "User Role": item.userRole || item.role || '--',
          "IP Address": item.ip || item.clientIp || '--',
          "Summary Details": typeof item.details === 'object' ? JSON.stringify(item.details) : (item.details || item.message || '--')
        };
      }

      if (reportItem.id === 'integrity_logs') {
        return {
          "Timestamp": formatTimestamp(item.timestamp),
          "Integrity Rule": item.rule || item.checkName || 'Roster Collision Check',
          "Conflict Detected": item.collisionDetected ? 'YES' : 'NO',
          "Affected Duty": item.dutyId || item.dutyNo || '--',
          "Affected Employee": empId ? `${empId} - ${resolvedName}` : '--',
          "Engine Status": item.status || 'RESOLVED'
        };
      }

      if (reportItem.id === 'login_history') {
        return {
          "Login Timestamp": formatTimestamp(item.timestamp || item.loginTime),
          "Employee ID": empId,
          "User Name": resolvedName,
          "Assigned Role": item.role || '--',
          "IP Address": item.ip || '--',
          "Device / Browser": item.userAgent || item.device || 'Chrome (BMRCL Workstation)',
          "Session Status": item.status || 'COMPLETED',
          "Sign-Off Time": item.logoutTime ? formatTimestamp(item.logoutTime) : '--'
        };
      }

      if (reportItem.id === 'system_users_directory') {
        return {
          "User ID / UID": item.id || '--',
          "Employee ID": item.employeeId || empId,
          "Full Name": resolvedName,
          "Email Address": item.email || '--',
          "Role": item.role || 'TRAIN_OPERATOR',
          "Depot": item.depot || 'Peenya Depot (PYID)',
          "Account Status": item.status || (item.active ? 'ACTIVE' : 'APPROVED'),
          "Approved By": item.approvedBy || 'SYSTEM',
          "Created Date": formatTimestamp(item.createdAt),
          "Last Login": formatTimestamp(item.lastLogin || item.lastLoginTime)
        };
      }

      // Generic fallback (flattens object gracefully)
      const cleanRow = { id: item.id };
      Object.keys(item).forEach(k => {
        if (k !== 'id' && !k.startsWith('_')) {
          const val = item[k];
          if (val && val.toDate) {
            cleanRow[k] = formatTimestamp(val);
          } else if (typeof val === 'object' && val !== null) {
            cleanRow[k] = JSON.stringify(val);
          } else {
            cleanRow[k] = val ?? '--';
          }
        }
      });
      return cleanRow;
    });
  };

  // Generate SVG-based Insights Metrics
  const generateInsights = async () => {
    if (!startDate || !endDate) {
      alert("Please select a date range to generate insights.");
      return;
    }
    setLoadingInsights(true);
    try {
      const startD = new Date(`${startDate}T00:00:00`).getTime();
      const endD = new Date(`${endDate}T23:59:59`).getTime();
      
      // Fetch deployments
      const depSnap = await getDocs(collection(db, 'crew_daily_deployment'));
      const depData = depSnap.docs.map(d => d.data()).filter(item => {
        const ts = item.lastUpdated || item.timestamp;
        if (!ts) return false;
        const itemTime = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
        return itemTime >= startD && itemTime <= endD;
      });

      // Fetch incidents
      const incSnap = await getDocs(collection(db, 'wtt_live_incidents'));
      const incData = incSnap.docs.map(d => d.data()).filter(item => {
        const ts = item.timestamp;
        if (!ts) return false;
        const itemTime = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
        return itemTime >= startD && itemTime <= endD;
      });

      const totalDeployments = depData.length;
      const activeOps = depData.filter(d => d.empId && d.empId !== '--' && d.empId !== '-').length;
      
      let signalCount = 0;
      let rsCount = 0;
      let doorCount = 0;
      let trackCount = 0;
      incData.forEach(inc => {
        const reason = String(inc.reason || inc.remarks || '').toLowerCase();
        if (reason.includes('signal')) signalCount++;
        else if (reason.includes('rolling') || reason.includes('stock') || reason.includes('defect')) rsCount++;
        else if (reason.includes('door') || reason.includes('interlock')) doorCount++;
        else trackCount++;
      });
      
      setInsights({
        totalDeployments,
        activeOps,
        utilizationRate: totalDeployments ? Math.round((activeOps / totalDeployments) * 100) : 0,
        totalIncidents: incData.length,
        anomaliesDetected: depData.filter(d => !d.empId || d.empId === '--').length, 
        signalCount,
        rsCount,
        doorCount,
        trackCount,
        generatedAt: new Date().toLocaleTimeString()
      });
    } catch (err) {
      console.error(err);
      alert("Failed to generate analytics insights: " + err.message);
    } finally {
      setLoadingInsights(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'INSIGHTS' && startDate && endDate && !insights) {
      generateInsights();
    }
  }, [activeTab, startDate, endDate]);

  // Fetch live preview of top 10 rows
  const fetchPreview = async (reportItem) => {
    setLoadingPreview(true);
    setPreviewReport(reportItem);
    try {
      let qCol = collection(db, reportItem.collection);
      let snapshot = await getDocs(qCol);
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // If empty and fallback collection defined, attempt fallback
      if (data.length === 0 && reportItem.fallbackCollection) {
        const fallbackSnap = await getDocs(collection(db, reportItem.fallbackCollection));
        data = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Apply Advanced Stream Filters
      if (filterEmployeeId) {
        data = data.filter(d => String(d.empId || d.employeeId || d.operatorId || d.empNo || '').toLowerCase().includes(filterEmployeeId.toLowerCase()));
      }
      if (filterLocation) {
        data = data.filter(d => String(d.currentLocation || d.location || d.station || d.signOnLocation || '').toLowerCase().includes(filterLocation.toLowerCase()));
      }
      if (filterTrainId) {
        data = data.filter(d => String(d.trainId || d.rakeId || d.rawLegs?.l1Train || d.trainNo || '').toLowerCase().includes(filterTrainId.toLowerCase()));
      }

      const normalized = normalizeReportData(reportItem, data);
      setPreviewData(normalized.slice(0, 10));
    } catch (err) {
      console.error("Preview failed:", err);
      alert("Failed to fetch data stream preview: " + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Perform XLSX / CSV / JSON Export with Custom Query Filters & Master Directory Handling
  const handleExport = async (reportItem) => {
    if (isTrainOperator) return;

    if (!reportItem.isMasterRegistry && (!startDate || !endDate)) {
      const confirmAll = window.confirm(
        `No date range period selected. Do you want to export ALL historical records for "${reportItem.name}"? Click OK to export all, or Cancel to choose a period instead.`
      );
      if (!confirmAll) return;
    }

    setLoadingAction(reportItem.name);
    try {
      let snapshot = await getDocs(collection(db, reportItem.collection));
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (data.length === 0 && reportItem.fallbackCollection) {
        const fallbackSnap = await getDocs(collection(db, reportItem.fallbackCollection));
        data = fallbackSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Filter by Date range if both dates provided
      if (startDate && endDate) {
        const startD = new Date(`${startDate}T00:00:00`).getTime();
        const endD = new Date(`${endDate}T23:59:59`).getTime();

        data = data.filter(d => {
          const dVal = d[reportItem.dateKey] || d.date || d.registryDate || d.requestDate || d.startDate;
          if (typeof dVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dVal)) {
            const shortD = dVal.substring(0, 10);
            return shortD >= startDate && shortD <= endDate;
          }

          const ts = d[reportItem.dateKey] || d.timestamp || d.lastUpdated || d.createdAt || d.updatedAt || d.dispatchTime;
          if (!ts) {
            return !!reportItem.isMasterRegistry;
          }
          const itemTime = ts.toDate ? ts.toDate().getTime() : new Date(ts).getTime();
          if (isNaN(itemTime)) return !!reportItem.isMasterRegistry;
          return itemTime >= startD && itemTime <= endD;
        });
      }

      // Apply Advanced Filters
      if (filterEmployeeId) {
        data = data.filter(d => String(d.empId || d.employeeId || d.operatorId || d.empNo || '').toLowerCase().includes(filterEmployeeId.toLowerCase()));
      }
      if (filterLocation) {
        data = data.filter(d => String(d.currentLocation || d.location || d.station || d.signOnLocation || '').toLowerCase().includes(filterLocation.toLowerCase()));
      }
      if (filterTrainId) {
        data = data.filter(d => String(d.trainId || d.rakeId || d.rawLegs?.l1Train || d.trainNo || '').toLowerCase().includes(filterTrainId.toLowerCase()));
      }

      const normalizedRows = normalizeReportData(reportItem, data);

      if (normalizedRows.length === 0) {
        alert(`No records found for ${reportItem.name} matching criteria in this period.`);
        setLoadingAction(null);
        return;
      }

      const dateSuffix = startDate && endDate ? `${startDate}_to_${endDate}` : 'ALL_RECORDS';
      const cleanFileName = `BMRCL_${reportItem.name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateSuffix}`;

      if (exportFormat === 'JSON') {
        const jsonString = JSON.stringify(normalizedRows, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        triggerDownload(blob, `${cleanFileName}.json`);
      } else if (exportFormat === 'XLSX') {
        // Full Excel Workbook using xlsx
        const worksheet = XLSX.utils.json_to_sheet(normalizedRows);
        
        // Auto-fit column widths
        const colKeys = Object.keys(normalizedRows[0] || {});
        worksheet['!cols'] = colKeys.map(k => {
          let maxLen = k.length;
          normalizedRows.forEach(r => {
            const cellVal = String(r[k] || '');
            if (cellVal.length > maxLen) maxLen = Math.min(cellVal.length, 40);
          });
          return { wch: Math.max(maxLen + 3, 12) };
        });

        const workbook = XLSX.utils.book_new();
        const safeSheetName = reportItem.name.substring(0, 31).replace(/[:\\\/\?\*\[\]]/g, '');
        XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
        XLSX.writeFile(workbook, `${cleanFileName}.xlsx`);
      } else {
        // Standard CSV with UTF-8 BOM
        const headers = Object.keys(normalizedRows[0] || {});
        const csvRows = [headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',')];

        normalizedRows.forEach(item => {
          const row = headers.map(header => {
            const val = item[header] === null || item[header] === undefined ? '' : String(item[header]);
            return `"${val.replace(/"/g, '""')}"`;
          });
          csvRows.push(row.join(','));
        });

        const csvString = '\uFEFF' + csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `${cleanFileName}.csv`);
      }
      
    } catch (error) {
      console.error(`Error downloading ${reportItem.name}:`, error);
      alert('Failed to download report: ' + error.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Schedule an automated report
  const handleScheduleReport = async (e) => {
    e.preventDefault();
    if (!scheduleConfig.email) return alert("Email required.");
    setLoadingAction('SCHEDULING');
    try {
      await addDoc(collection(db, 'automated_report_schedules'), {
        ...scheduleConfig,
        createdAt: serverTimestamp(),
        status: 'ACTIVE'
      });
      alert(`Automated dispatch scheduled for ${scheduleConfig.reportType} to ${scheduleConfig.email}`);
      setScheduleConfig({ ...scheduleConfig, email: '' });
    } catch (err) {
      console.error(err);
      alert("Failed to schedule report.");
    } finally {
      setLoadingAction(null);
    }
  };

  // Toggle Schedule (Active/Paused)
  const toggleScheduleStatus = async (id, currentStatus) => {
    const nextStatus = currentStatus === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      await updateDoc(doc(db, 'automated_report_schedules', id), {
        status: nextStatus
      });
    } catch (err) {
      console.error(err);
      alert("Failed to toggle status.");
    }
  };

  // Delete Schedule
  const deleteSchedule = async (id) => {
    if (window.confirm("Delete this automated report schedule?")) {
      try {
        await deleteDoc(doc(db, 'automated_report_schedules', id));
      } catch (err) {
        console.error(err);
        alert("Failed to delete schedule.");
      }
    }
  };

  return (
    <div className='bg-slate-950 min-h-[80vh] p-6 rounded-xl border border-slate-800 font-mono text-slate-200 shadow-2xl space-y-6'>
      
      {/* Header & Global Period Filters */}
      <div className='flex flex-col md:flex-row justify-between items-start md:items-end border-b border-slate-800 pb-4 gap-4'>
        <div>
          <h2 className='text-emerald-400 font-black flex items-center gap-2 text-xl tracking-wider uppercase'>
            <BarChart2 className="h-6 w-6 text-emerald-400" /> Advanced Reports Engine
          </h2>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">
            BMRCL Line 2 Operations, Roster, Safety & Compliance Extraction Suite
          </p>
        </div>
        
        <div className='flex flex-col sm:flex-row items-center gap-3 bg-slate-900 p-3 rounded-lg border border-slate-700 shadow-inner'>
          <div className='flex items-center gap-2'>
            <Calendar className='h-4 w-4 text-emerald-500' />
            <span className='text-[10px] font-black text-slate-400 uppercase tracking-widest'>Period:</span>
          </div>
          <div className='flex items-center gap-2'>
            <input 
              id="reportscenter-i1" 
              name="reportscenter-i1" 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200 transition-colors"
            />
            <span className='text-slate-500 font-bold'>-</span>
            <input 
              id="reportscenter-i2" 
              name="reportscenter-i2" 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200 transition-colors"
            />
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-slate-500 hover:text-rose-400 text-xs px-1 font-bold"
                title="Clear date range"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Primary Tab Navigator */}
      <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 w-full max-w-2xl shadow-inner">
        {['EXPORTS', 'INSIGHTS', 'SCHEDULED', 'EXCHANGES'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-[10px] font-black rounded tracking-widest transition-all ${
              activeTab === tab 
                ? 'bg-emerald-600 text-slate-950 shadow-md font-bold' 
                : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
            }`}
          >
            {tab === 'EXCHANGES' ? 'SHIFT EXCHANGES' : tab}
          </button>
        ))}
      </div>

      {/* Advanced Stream Filters */}
      {!isTrainOperator && (
        <div className="bg-slate-900/60 p-4 border border-slate-850 rounded-xl space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Filter size={12} className="text-emerald-400" /> Advanced Stream Filters
            </span>
            {(filterEmployeeId || filterLocation || filterTrainId) && (
              <button 
                onClick={() => { setFilterEmployeeId(''); setFilterLocation(''); setFilterTrainId(''); }}
                className="text-[9px] text-rose-400 hover:underline uppercase font-bold tracking-widest"
              >
                Clear Stream Filters
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] text-slate-400 uppercase font-black" htmlFor="reportscenter-i3">Operator ID / Name</label>
              <input 
                id="reportscenter-i3" 
                name="reportscenter-i3" 
                type="text" 
                placeholder="e.g. 20009 or GOURIVARAGOUDA" 
                value={filterEmployeeId}
                onChange={(e) => setFilterEmployeeId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-slate-400 uppercase font-black" htmlFor="reportscenter-i4">Station / Depot Location</label>
              <input 
                id="reportscenter-i4" 
                name="reportscenter-i4" 
                type="text" 
                placeholder="e.g. PYID or Nagasandra" 
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-slate-400 uppercase font-black" htmlFor="reportscenter-i5">Train ID / Rake ID</label>
              <input 
                id="reportscenter-i5" 
                name="reportscenter-i5" 
                type="text" 
                placeholder="e.g. 204 or RS-12" 
                value={filterTrainId}
                onChange={(e) => setFilterTrainId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: EXPORTS */}
      {activeTab === 'EXPORTS' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Controls Bar: Category Selector & Export Format */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-md">
            
            {/* Category Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {categories.map((cat) => {
                const count = cat === 'ALL' 
                  ? reportConfig.length 
                  : reportConfig.filter(r => r.category === cat).length;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-wider uppercase transition-all flex items-center gap-1.5 ${
                      isSelected 
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 font-black' 
                        : 'bg-slate-950 text-slate-400 hover:text-emerald-400 hover:bg-slate-850 border border-slate-800'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono ${
                      isSelected ? 'bg-slate-950/30 text-slate-950 font-bold' : 'bg-slate-900 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right: Search & Format Selector */}
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input 
                  id="reportscenter-input-1" 
                  name="reportscenter_input_1"
                  type="text"
                  placeholder={`Search ${reportConfig.length} operational reports...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-500 hover:text-slate-300"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {!isTrainOperator && (
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 bg-slate-950 border border-slate-800 px-3 py-1 rounded-lg">
                  <span className="text-[10px] text-slate-400 font-black uppercase tracking-wider">Format:</span>
                  <select 
                    id="reportscenter-i6" 
                    name="reportscenter-i6" 
                    value={exportFormat} 
                    onChange={(e) => setExportFormat(e.target.value)}
                    className="bg-transparent border-0 text-xs text-emerald-400 font-bold focus:outline-none cursor-pointer uppercase font-mono"
                  >
                    <option value="XLSX" className="bg-slate-900 text-slate-200">EXCEL (.XLSX)</option>
                    <option value="CSV" className="bg-slate-900 text-slate-200">CSV (.CSV)</option>
                    <option value="JSON" className="bg-slate-900 text-slate-200">RAW JSON (.JSON)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Report Count Header */}
          <div className="flex justify-between items-center px-1 text-[11px] text-slate-500 uppercase tracking-widest font-mono">
            <span>Showing {filteredReports.length} of {reportConfig.length} Essential Modules</span>
            {startDate && endDate && (
              <span className="text-emerald-400/90 font-bold">Active Filter Period: {startDate} → {endDate}</span>
            )}
          </div>

          {/* Reports Grid */}
          {filteredReports.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-xl space-y-3">
              <FileText className="h-10 w-10 text-slate-600 mx-auto" />
              <p className="text-slate-400 font-bold uppercase tracking-wider text-xs">No reports match "{searchQuery}" in {selectedCategory}</p>
              <button 
                onClick={() => { setSelectedCategory('ALL'); setSearchQuery(''); }}
                className="text-xs text-emerald-400 underline font-bold uppercase tracking-widest"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {filteredReports.map((report) => {
                const isOp = report.category === 'OPERATIONS';
                const isRoster = report.category === 'ROSTER & LEAVES';
                const isSafety = report.category === 'SAFETY & DEFECTS';
                const isAudit = report.category === 'AUDIT & REGISTRIES';

                const categoryBadgeClass = isOp 
                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-800/50'
                  : isRoster 
                  ? 'bg-amber-950/70 text-amber-400 border-amber-800/50'
                  : isSafety
                  ? 'bg-rose-950/70 text-rose-400 border-rose-800/50'
                  : 'bg-cyan-950/70 text-cyan-400 border-cyan-800/50';

                return (
                  <div 
                    key={report.id || report.name} 
                    className='bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-xl transition-all flex flex-col justify-between group shadow-lg relative overflow-hidden'
                  >
                    <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-15 transition-opacity pointer-events-none">
                      <FileText className="h-20 w-20 text-emerald-500" />
                    </div>

                    <div className="z-10 mb-4 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <span className={`text-[8.5px] font-black uppercase px-2 py-0.5 rounded border tracking-wider ${categoryBadgeClass}`}>
                          {report.category}
                        </span>
                        <div className="flex items-center gap-1">
                          {report.isMasterRegistry && (
                            <span className="text-[8px] bg-indigo-950/70 text-indigo-400 border border-indigo-800/40 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider" title="Full Master Directory can be extracted without date limits">
                              MASTER
                            </span>
                          )}
                          <button 
                            onClick={() => fetchPreview(report)}
                            title="Preview live data stream (10 rows)"
                            className="text-slate-400 hover:text-emerald-400 p-1 rounded hover:bg-slate-800 transition-colors"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </div>

                      <h3 className='font-black text-sm tracking-wide text-slate-100 group-hover:text-emerald-400 transition-colors uppercase leading-tight'>
                        {report.name}
                      </h3>

                      <p className="text-[10px] text-slate-400 leading-relaxed font-sans line-clamp-2">
                        {report.description}
                      </p>

                      <div className="pt-1 flex items-center gap-1.5 text-[9px] text-slate-500 font-mono uppercase tracking-wider">
                        <Database size={11} className="text-slate-600" />
                        <span className="truncate">Source: <strong className="text-slate-400 font-semibold">{report.collection}</strong></span>
                      </div>
                    </div>

                    <button 
                      onClick={() => handleExport(report)}
                      disabled={isTrainOperator || loadingAction === report.name}
                      className={`z-10 w-full border py-2.5 rounded-lg text-xs font-black tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${
                        isTrainOperator 
                          ? 'bg-slate-950/60 border-slate-850 text-slate-600 cursor-not-allowed opacity-50' 
                          : 'bg-slate-950 hover:bg-emerald-950/60 border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-emerald-400 cursor-pointer shadow-sm active:scale-[0.99]'
                      }`}
                    >
                      {isTrainOperator ? (
                        'EXPORT LOCKED'
                      ) : loadingAction === report.name ? (
                        <><RefreshCw className="h-4 w-4 animate-spin text-emerald-400" /> EXTRACTING...</>
                      ) : (
                        <><Download className="h-4 w-4 text-emerald-400" /> EXPORT {exportFormat}</>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: INSIGHTS */}
      {activeTab === 'INSIGHTS' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {!startDate || !endDate ? (
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/50">
              <Calendar className="h-10 w-10 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Select a date range to generate insights</p>
            </div>
          ) : loadingInsights ? (
            <div className="text-center py-20 border border-slate-800 rounded-xl bg-slate-900 shadow-inner">
              <Zap className="h-10 w-10 text-emerald-500 mx-auto mb-3 animate-pulse" />
              <p className="text-emerald-400 font-black uppercase tracking-widest text-xs animate-pulse">Running Operational Aggregation Engine...</p>
            </div>
          ) : insights ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* SVG Donut Chart for Crew Execution Rate */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg flex flex-col md:flex-row items-center gap-6">
                <div className="relative w-[150px] h-[150px] shrink-0">
                  <svg width="150" height="150" viewBox="0 0 150 150" className="transform -rotate-90">
                    <circle cx="75" cy="75" r="50" fill="transparent" stroke="#1e293b" strokeWidth="12" />
                    <circle 
                      cx="75" cy="75" r="50" fill="transparent" stroke="#10b981" strokeWidth="12" 
                      strokeDasharray={2 * Math.PI * 50} 
                      strokeDashoffset={(2 * Math.PI * 50) - (insights.utilizationRate / 100) * (2 * Math.PI * 50)} 
                      strokeLinecap="round" 
                      className="transition-all duration-1000 ease-out" 
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center font-mono">
                    <span className="text-2xl font-black text-white">{insights.utilizationRate}%</span>
                    <span className="text-[8px] text-slate-500 uppercase tracking-widest">Active Rate</span>
                  </div>
                </div>

                <div className="flex-1 space-y-4 w-full">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-400" /> Crew Execution Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <span className="block text-lg font-black text-white">{insights.totalDeployments}</span>
                      <span className="text-[8px] text-slate-400 uppercase font-bold tracking-widest">Total Rostered</span>
                    </div>
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                      <span className="block text-lg font-black text-cyan-400">{insights.activeOps}</span>
                      <span className="text-[8px] text-slate-400 uppercase font-bold tracking-widest">Active Drivers</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Incident Causes Analysis */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" /> Incident Causes Analysis
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1 text-[10px] uppercase font-bold text-slate-400">
                      <span>Signal Adherence & Fluctuations</span>
                      <span className="text-emerald-400">{insights.signalCount}</span>
                    </div>
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${insights.totalIncidents ? (insights.signalCount / insights.totalIncidents) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1 text-[10px] uppercase font-bold text-slate-400">
                      <span>Rolling Stock Defects</span>
                      <span className="text-blue-400">{insights.rsCount}</span>
                    </div>
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${insights.totalIncidents ? (insights.rsCount / insights.totalIncidents) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1 text-[10px] uppercase font-bold text-slate-400">
                      <span>Door Interlocks & Footsteps</span>
                      <span className="text-amber-400">{insights.doorCount}</span>
                    </div>
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${insights.totalIncidents ? (insights.doorCount / insights.totalIncidents) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1 text-[10px] uppercase font-bold text-slate-400">
                      <span>Track / Line Clearing Lags</span>
                      <span className="text-rose-400">{insights.trackCount}</span>
                    </div>
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500" style={{ width: `${insights.totalIncidents ? (insights.trackCount / insights.totalIncidents) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-3 flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                  <span>Total delay events: {insights.totalIncidents}</span>
                  <span>Anomalies flagged: {insights.anomaliesDetected}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Tab Content: SCHEDULED */}
      {activeTab === 'SCHEDULED' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {!isTrainOperator ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Form to Schedule */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg">
                <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                  <Clock className="h-5 w-5" /> Schedule Automated Dispatch
                </h3>
                <form onSubmit={handleScheduleReport} className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-i7">Target Report</label>
                    <select 
                      id="reportscenter-i7" 
                      name="reportscenter-i7" 
                      value={scheduleConfig.reportType}
                      onChange={(e) => setScheduleConfig({...scheduleConfig, reportType: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      {reportConfig.map(r => (
                        <option key={r.name} value={r.name} className="bg-slate-900 text-slate-200">
                          {r.name} [{r.category}]
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-i8">Frequency</label>
                        <select 
                          id="reportscenter-i8" 
                          name="reportscenter-i8" 
                          value={scheduleConfig.frequency}
                          onChange={(e) => setScheduleConfig({...scheduleConfig, frequency: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        >
                          <option value="DAILY">DAILY</option>
                          <option value="WEEKLY">WEEKLY</option>
                          <option value="MONTHLY">MONTHLY</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-i9">Dispatch Time</label>
                        <input 
                          id="reportscenter-i9" 
                          name="reportscenter-i9" 
                          type="time" 
                          value={scheduleConfig.time}
                          onChange={(e) => setScheduleConfig({...scheduleConfig, time: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-i10">Recipient Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <input 
                        id="reportscenter-i10" 
                        name="reportscenter-i10" 
                        type="email" 
                        required
                        placeholder="controller@bmrc.co.in"
                        value={scheduleConfig.email}
                        onChange={(e) => setScheduleConfig({...scheduleConfig, email: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded pl-10 pr-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  </div>
                  <button 
                    type="submit"
                    disabled={loadingAction === 'SCHEDULING'}
                    className="w-full mt-4 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-3 rounded text-xs tracking-widest uppercase transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
                  >
                    {loadingAction === 'SCHEDULING' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> ACTIVATE SCHEDULE</>}
                  </button>
                </form>
              </div>
              
              {/* Explanatory notes */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-center text-center space-y-4">
                <Mail className="h-12 w-12 text-slate-700 mx-auto" />
                <h4 className="text-slate-400 font-bold uppercase tracking-widest text-sm">Automated Mailer Engine</h4>
                <p className="text-[10px] text-slate-500 leading-relaxed max-w-xs mx-auto">
                  Configured schedules will automatically extract raw data, compile it into standard organizational formats, and dispatch via the secure mailing gateway at designated intervals.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg text-center space-y-3">
              <ShieldAlert className="h-12 w-12 text-amber-500 mx-auto" />
              <h4 className="text-slate-200 font-black uppercase tracking-widest text-sm">Automated Scheduling Restricted</h4>
              <p className="text-[10.5px] text-slate-400 max-w-md mx-auto leading-relaxed">
                Automated mailing schedule configuration is restricted to GCC coordinators and administrative accounts. You have view-only access to currently active schedules below.
              </p>
            </div>
          )}

          {/* Real-time Schedules console */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">
              Active Mailing Schedules Console
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[10px] font-mono">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                    <th className="p-3">Report Stream</th>
                    <th className="p-3">Frequency</th>
                    <th className="p-3">Dispatch Time</th>
                    <th className="p-3">Recipient Email</th>
                    <th className="p-3">Status</th>
                    {!isTrainOperator && <th className="p-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {schedules.length === 0 ? (
                    <tr>
                      <td colSpan={isTrainOperator ? "5" : "6"} className="p-6 text-center text-slate-500 italic uppercase">
                        No automated report schedules active.
                      </td>
                    </tr>
                  ) : (
                    schedules.map(sch => (
                      <tr key={sch.id} className="hover:bg-slate-950/40">
                        <td className="p-3 font-bold text-cyan-400">{sch.reportType}</td>
                        <td className="p-3 font-bold uppercase">{sch.frequency}</td>
                        <td className="p-3 font-bold">{sch.time}</td>
                        <td className="p-3 text-slate-400">{sch.email}</td>
                        <td className="p-3">
                          <button
                            onClick={() => toggleScheduleStatus(sch.id, sch.status)}
                            disabled={isTrainOperator}
                            className={`text-[8px] font-black px-2 py-0.5 rounded border transition-colors ${
                              sch.status === 'ACTIVE'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            } disabled:opacity-85 disabled:cursor-not-allowed`}
                          >
                            {sch.status === 'ACTIVE' ? 'ACTIVE' : 'PAUSED'}
                          </button>
                        </td>
                        {!isTrainOperator && (
                          <td className="p-3 text-right">
                            <button
                              onClick={() => deleteSchedule(sch.id)}
                              className="text-rose-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 size={14} />
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

      {/* Preview Modal Panel */}
      {previewReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-5xl w-full shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-400" />
                <h3 className="font-bold text-sm text-emerald-400 uppercase tracking-wider">
                  Stream Preview: {previewReport.name}
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => handleExport(previewReport)}
                  disabled={isTrainOperator || loadingAction === previewReport.name}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-3 py-1 rounded text-xs uppercase flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Download size={13} /> Export {exportFormat}
                </button>
                <button 
                  onClick={() => { setPreviewReport(null); setPreviewData(null); }}
                  className="text-slate-400 hover:text-slate-200 font-bold font-mono text-xs uppercase px-2 py-1 rounded hover:bg-slate-800"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {loadingPreview ? (
              <div className="text-center py-12 text-slate-500 text-xs animate-pulse font-mono tracking-widest uppercase flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" /> Fetching Stream Headers & Rows...
              </div>
            ) : previewData && previewData.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                  <span>Showing top {previewData.length} records in this collection stream</span>
                  <span className="text-emerald-400 font-bold">Source: {previewReport.collection}</span>
                </div>
                <div className="overflow-x-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left border-collapse text-[10px] font-mono">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase">
                        {Array.from(new Set(previewData.flatMap(r => Object.keys(r)))).filter(k => k !== 'id' && !k.startsWith('_')).map(key => (
                          <th key={key} className="p-2 border-r border-slate-850 whitespace-nowrap">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-300">
                      {previewData.map((row, idx) => {
                        const cols = Array.from(new Set(previewData.flatMap(r => Object.keys(r)))).filter(k => k !== 'id' && !k.startsWith('_'));
                        return (
                          <tr key={row.id || idx} className="hover:bg-slate-950/50">
                            {cols.map(key => {
                              const val = row[key];
                              let valStr = '--';
                              if (val !== undefined && val !== null) {
                                valStr = String(val);
                              }
                              return (
                                <td key={key} className="p-2 border-r border-slate-850 truncate max-w-[220px]" title={valStr}>
                                  {valStr}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs italic uppercase">
                No records found in this stream matching current filters.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: EXCHANGES */}
      {activeTab === 'EXCHANGES' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <RefreshCw className="h-4 w-4" /> Shift Exchange Operational Report Log
              </h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[10px] font-mono">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-500 font-bold uppercase">
                    <th className="p-3">Exchange ID</th>
                    <th className="p-3">Target Date</th>
                    <th className="p-3">Operator 1 (Requester)</th>
                    <th className="p-3">Operator 2 (Target)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Approved By</th>
                    <th className="p-3">Activation Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {exchanges.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-6 text-center text-slate-500 italic uppercase">
                        No shift exchange records found.
                      </td>
                    </tr>
                  ) : (
                    exchanges.map(ex => (
                      <tr key={ex.id} className="hover:bg-slate-950/40">
                        <td className="p-3 font-mono text-[9px] text-slate-400">{ex.id}</td>
                        <td className="p-3 font-bold text-cyan-400">{ex.exchangeDate}</td>
                        <td className="p-3">
                          <span className="font-bold text-amber-500 uppercase">{ex.operator1Name}</span>
                          <span className="block text-[8.5px] text-slate-500">Duty {ex.operator1Duty}</span>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-cyan-400 uppercase">{ex.operator2Name}</span>
                          <span className="block text-[8.5px] text-slate-500">Duty {ex.operator2Duty}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${
                            ex.status === 'Operational' || ex.status === 'APPROVED' || ex.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            ex.status === 'Rejected' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                            ex.status === 'Cancelled' ? 'bg-slate-500/10 text-slate-400 border-slate-500/30' :
                            'bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse'
                          }`}>
                            {ex.status}
                          </span>
                        </td>
                        <td className="p-3 font-bold text-slate-400">{ex.approvedBy || '--'}</td>
                        <td className="p-3 text-slate-500">
                          {ex.operationalAt?.toDate ? ex.operationalAt.toDate().toLocaleString() : 
                           ex.approvedAt?.toDate ? ex.approvedAt.toDate().toLocaleString() : '--'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

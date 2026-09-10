import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Download, Calendar, Train, BarChart2, Clock, Mail, Zap, 
  RefreshCw, CheckCircle2, AlertTriangle, ShieldAlert, Play, Pause, Trash2, Eye, Filter,
  Search, Users, CheckSquare, Wrench, ShieldCheck, Layers, Activity, FileSpreadsheet, Database, BookOpen, ChevronRight, X
} from 'lucide-react';
import { db } from '../firebase';
import { 
  collection, query, where, getDocs, addDoc, serverTimestamp, 
  onSnapshot, doc, deleteDoc, updateDoc 
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

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
  const [exportFormat, setExportFormat] = useState('CSV');
  const [loadingAction, setLoadingAction] = useState(null);
  const [exchanges, setExchanges] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

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
    reportType: 'Attendance Logs',
    frequency: 'DAILY',
    email: '',
    time: '08:00'
  });

  // Insights Analytics States
  const [insights, setInsights] = useState(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Database configurations aligned with actual collections across BMRCL Line 2 Peenya Depot
  const reportConfig = [
    // === CATEGORY: OPERATIONS & TRAIN CONTROL ===
    {
      id: 'crew_attendance',
      name: 'Attendance Logs',
      category: 'OPERATIONS',
      collection: 'crew_live_attendance',
      dateKey: 'timestamp',
      description: 'Biometric, breathalyzer, and real-time sign-on/sign-off logs of Train Operators.'
    },
    {
      id: 'crew_deployment',
      name: 'Crew Daily Deployment',
      category: 'OPERATIONS',
      collection: 'crew_daily_deployment',
      dateKey: 'lastUpdated',
      description: 'Active daily duty assignments, assigned train operators, and sign-on/off milestones.'
    },
    {
      id: 'daily_train_crew',
      name: 'Daily Train Crew Tracking',
      category: 'OPERATIONS',
      collection: 'daily_crew_tracks',
      dateKey: 'timestamp',
      description: 'Real-time train rake tracking with currently operating train operator mapping.'
    },
    {
      id: 'delay_incidents',
      name: 'Delay & Incidents Log',
      category: 'OPERATIONS',
      collection: 'wtt_live_incidents',
      dateKey: 'timestamp',
      description: 'Mainline train delay events, signaling lags, traction trips, and incident reports.'
    },
    {
      id: 'rake_registry',
      name: 'Train Rake Registry',
      category: 'OPERATIONS',
      collection: 'rake_registry',
      dateKey: 'registryDate',
      isDateString: true,
      description: 'Rolling stock 6-car rake registry, depot induction records, and operational status.'
    },
    {
      id: 'emergency_relief',
      name: 'Emergency Relief Logs',
      category: 'OPERATIONS',
      collection: 'emergency_relief_reports',
      dateKey: 'timestamp',
      description: 'Emergency relief crew deployments, SOS call-outs, and driver rescue dispatches.'
    },
    {
      id: 'stepback_duties',
      name: 'Outstation Stepback Operations',
      category: 'OPERATIONS',
      collection: 'stepback_duties',
      dateKey: 'timestamp',
      description: 'Outstation stepback (STBK) duties, station changeovers, and quick turnarounds.'
    },
    {
      id: 'crew_links',
      name: 'Master Duty Link Schedule',
      category: 'OPERATIONS',
      collection: 'crew_final_links',
      dateKey: 'createdAt',
      isMasterRegistry: true,
      description: 'BMRCL Line 2 master duty links (01-79), trip legs, km run, and scheduled timings.'
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
      id: 'wtt_matrix',
      name: 'Working Time Table (WTT) Matrix',
      category: 'OPERATIONS',
      collection: 'wtt_final_matrix',
      dateKey: 'createdAt',
      isMasterRegistry: true,
      description: 'WTT train trip master timetable with departure, arrival, and station dwell schedule.'
    },

    // === CATEGORY: ROSTER & LEAVE MANAGEMENT ===
    {
      id: 'leave_requests',
      name: 'Leave Priority Report',
      category: 'ROSTER & LEAVES',
      collection: 'leave_requests',
      dateKey: 'requestDate',
      description: 'Staff leave applications, entitlement priority scoring, medical reasons, and approvals.'
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
      name: 'Absent & Medical Book-off Register',
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
      id: 'shift_handover_notes',
      name: 'Shift Handover Notes',
      category: 'ROSTER & LEAVES',
      collection: 'shift_handover_notes',
      dateKey: 'timestamp',
      description: 'Duty controller handover briefings, key events, and outstanding action items.'
    },
    {
      id: 'shift_handover_reports',
      name: 'Shift Handover Reports (Official)',
      category: 'ROSTER & LEAVES',
      collection: 'shift_handover_reports',
      dateKey: 'timestamp',
      description: 'Chief Crew Controller shift summary logs, crew availability, and depot handovers.'
    },
    {
      id: 'shift_exchanges',
      name: 'Shift Exchange Records',
      category: 'ROSTER & LEAVES',
      collection: 'shift_exchanges',
      dateKey: 'timestamp',
      description: 'Mutual shift exchange applications, operator pairs, and supervisory approval statuses.'
    },
    {
      id: 'manual_overrides',
      name: 'Controller Duty Overrides Log',
      category: 'ROSTER & LEAVES',
      collection: 'manual_overrides',
      dateKey: 'createdAt',
      description: 'Manual duty swaps, controller force assignments, and operational override audit trail.'
    },

    // === CATEGORY: SAFETY, DEFECTS & COMPLIANCE ===
    {
      id: 'rs_faults',
      name: 'Rolling Stock Defect & Fault Reports',
      category: 'SAFETY & DEFECTS',
      collection: 'rolling_stock_faults',
      dateKey: 'timestamp',
      description: 'Train defects, HVAC, door interlocks, pantograph, and depot repair work-orders.'
    },
    {
      id: 'field_faults',
      name: 'AI Defect Desk & Field Fault Reports',
      category: 'SAFETY & DEFECTS',
      collection: 'fault_reports',
      dateKey: 'createdAt',
      description: 'AI natural language defect tickets, maintenance notifications, and SMS/Email dispatches.'
    },
    {
      id: 'safety_incidents',
      name: 'Safety Incidents & Breaches',
      category: 'SAFETY & DEFECTS',
      collection: 'safety_incidents',
      dateKey: 'timestamp',
      description: 'Track irregularities, signal pass at danger (SPAD), safety audits, and emergency events.'
    },
    {
      id: 'daily_safety_checklists',
      name: 'Station Daily Safety Compliance',
      category: 'SAFETY & DEFECTS',
      collection: 'daily_safety_checklists',
      dateKey: 'timestamp',
      description: 'Daily station fire safety, CCTV operation, and platform edge verification checklists.'
    },
    {
      id: 'als_inspections',
      name: 'AI-ALS Cab & Line Inspection Audits',
      category: 'SAFETY & DEFECTS',
      collection: 'alsCompletedInspection',
      dateKey: 'timestamp',
      description: 'Supervisor cab ride assessments, train handling scores, and ALS safety audits.'
    },

    // === CATEGORY: MASTER DIRECTORY, SECURITY & AUDIT ===
    {
      id: 'crew_registry',
      name: 'Master Crew Directory & Competencies',
      category: 'AUDIT & REGISTRIES',
      collection: 'crewRegistry',
      dateKey: 'updatedAt',
      isMasterRegistry: true,
      description: 'Master roster of 88 BMRCL Train Operators, designations, PME due dates, and competencies.'
    },
    {
      id: 'jmd_crew',
      name: 'JMD Contract Trainees & Shadow Pilots',
      category: 'AUDIT & REGISTRIES',
      collection: 'jmd_crew_registry',
      dateKey: 'lastUpdated',
      isMasterRegistry: true,
      description: '49 JMD contract train drivers, trainee hours, mentor mapping, and certification.'
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
      name: 'User Login & Session History',
      category: 'AUDIT & REGISTRIES',
      collection: 'login_history',
      dateKey: 'timestamp',
      description: 'User authentication logs, login timestamps, device info, and active session history.'
    }
  ];

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

  // Generate Advanced SVG-based Insights Metrics
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
      
      // Calculate delay reasons count
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

  // Fetch preview of first 10 items
  const fetchPreview = async (reportItem) => {
    setLoadingPreview(true);
    setPreviewReport(reportItem);
    try {
      const q = query(collection(db, reportItem.collection));
      const snapshot = await getDocs(q);
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Apply Filter before showing preview
      if (filterEmployeeId) {
        data = data.filter(d => String(d.empId || d.employeeId || d.operatorId || d.empNo || '').toLowerCase().includes(filterEmployeeId.toLowerCase()));
      }
      if (filterLocation) {
        data = data.filter(d => String(d.currentLocation || d.location || d.station || d.signOnLocation || '').toLowerCase().includes(filterLocation.toLowerCase()));
      }
      if (filterTrainId) {
        data = data.filter(d => String(d.trainId || d.rakeId || d.rawLegs?.l1Train || d.trainNo || '').toLowerCase().includes(filterTrainId.toLowerCase()));
      }

      if (reportItem.name.includes('Leave Priority')) {
        const getPriorityDetails = (req) => {
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

        data = data.map(item => {
          const priority = getPriorityDetails(item);
          return {
            id: item.id,
            "Employee ID": item.empId || item.employeeId || item.empNo || '',
            "Employee Name": item.empName || item.employeeName || item.name || '',
            "Leave Type": item.leaveType || '',
            "Sub Category": item.subCategory || '--',
            "Priority Level": priority.label,
            "Priority Score": priority.score,
            "Approval Status": item.status || 'PENDING',
            "Approved By": item.approvedBy || '--',
            "Approval Time": item.approvedTime?.toDate ? item.approvedTime.toDate().toLocaleString() : item.approvedTime || '--'
          };
        });
      }

      setPreviewData(data.slice(0, 10));
    } catch (err) {
      console.error("Preview failed:", err);
      alert("Failed to fetch data stream preview: " + err.message);
    } finally {
      setLoadingPreview(false);
    }
  };

  // Perform CSV/JSON Export with Custom Query Filters & Master Directory Handling
  const handleExport = async (reportItem) => {
    if (isTrainOperator) return;

    // For non-master registries, check if date range is selected
    if (!reportItem.isMasterRegistry && (!startDate || !endDate)) {
      const confirmAll = window.confirm(
        `No date range period selected. Do you want to export ALL historical records for "${reportItem.name}"? Click OK to export all, or Cancel to choose a period instead.`
      );
      if (!confirmAll) return;
    }

    setLoadingAction(reportItem.name);
    try {
      const q = query(collection(db, reportItem.collection));
      const snapshot = await getDocs(q);
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Filter by Date range if both dates provided
      if (startDate && endDate) {
        const startD = new Date(`${startDate}T00:00:00`).getTime();
        const endD = new Date(`${endDate}T23:59:59`).getTime();

        data = data.filter(d => {
          // If record has date string (YYYY-MM-DD)
          const dVal = d[reportItem.dateKey] || d.date || d.registryDate || d.requestDate || d.startDate;
          if (typeof dVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dVal)) {
            const shortD = dVal.substring(0, 10);
            return shortD >= startDate && shortD <= endDate;
          }

          const ts = d[reportItem.dateKey] || d.timestamp || d.lastUpdated || d.createdAt || d.updatedAt || d.dispatchTime;
          if (!ts) {
            // Keep master registry entries without timestamp
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

      if (reportItem.name.includes('Leave Priority')) {
        const getPriorityDetails = (req) => {
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

        data = data.map(item => {
          const priority = getPriorityDetails(item);
          return {
            "Employee ID": item["Employee ID"] || item.empId || item.employeeId || item.empNo || '',
            "Employee Name": item["Employee Name"] || item.empName || item.employeeName || item.name || '',
            "Leave Type": item["Leave Type"] || item.leaveType || '',
            "Sub Category": item["Sub Category"] || item.subCategory || '--',
            "Priority Level": priority.label,
            "Priority Score": priority.score,
            "Approval Status": item["Approval Status"] || item.status || 'PENDING',
            "Approved By": item["Approved By"] || item.approvedBy || '--',
            "Approval Time": item["Approval Time"] || (item.approvedTime?.toDate ? item.approvedTime.toDate().toLocaleString() : item.approvedTime || '--'),
            "Request Date": item.requestDate || (item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString() : '--')
          };
        });
      }

      if (data.length === 0) {
        alert(`No records found for ${reportItem.name} matching criteria in this period.`);
        setLoadingAction(null);
        return;
      }

      const dateSuffix = startDate && endDate ? `${startDate}_to_${endDate}` : 'ALL_RECORDS';
      const cleanFileName = `${reportItem.name.replace(/[^a-zA-Z0-9]/g, '_')}_${dateSuffix}`;

      if (exportFormat === 'JSON') {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        triggerDownload(blob, `${cleanFileName}.json`);
      } else {
        // Robust CSV Serializer (handles Timestamps, Arrays, Objects gracefully)
        const serializeVal = (val) => {
          if (val === null || val === undefined) return '';
          if (val.toDate && typeof val.toDate === 'function') {
            try {
              const d = val.toDate();
              const pad = (n) => String(n).padStart(2, '0');
              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            } catch {
              return String(val);
            }
          }
          if (Array.isArray(val)) {
            return val.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('; ');
          }
          if (typeof val === 'object') {
            return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('; ');
          }
          return String(val);
        };

        const allHeaders = new Set();
        data.forEach(item => {
          Object.keys(item).forEach(k => {
            if (k !== 'id' && !k.startsWith('_')) allHeaders.add(k);
          });
        });
        const headers = Array.from(allHeaders);
        const csvRows = [headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',')];

        data.forEach(item => {
          const row = headers.map(header => {
            const val = serializeVal(item[header]);
            return `"${val.replace(/"/g, '""')}"`;
          });
          csvRows.push(row.join(','));
        });

        const csvString = csvRows.join('\n');
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
            <BarChart2 className="h-6 w-6" /> Advanced Reports Engine
          </h2>
          <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Automated extraction, insights & dispatch</p>
        </div>
        
        <div className='flex flex-col sm:flex-row items-center gap-3 bg-slate-900 p-3 rounded-lg border border-slate-700 shadow-inner'>
          <div className='flex items-center gap-2'>
            <Calendar className='h-4 w-4 text-emerald-500' />
            <span className='text-[10px] font-black text-slate-400 uppercase tracking-widest'>Period:</span>
          </div>
          <div className='flex items-center gap-2'>
            <input id="reportscenter-i1" name="reportscenter-i1" 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200 transition-colors"
            />
            <span className='text-slate-500 font-bold'>-</span>
            <input id="reportscenter-i2" name="reportscenter-i2" 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 w-full max-w-2xl">
        {['EXPORTS', 'INSIGHTS', 'SCHEDULED', 'EXCHANGES'].map(tab => (
          <button 
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-[10px] font-black rounded tracking-widest transition-colors ${activeTab === tab ? 'bg-emerald-600 text-slate-950 shadow-md' : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'}`}
          >
            {tab === 'EXCHANGES' ? 'SHIFT EXCHANGES' : tab}
          </button>
        ))}
      </div>

      {/* Advanced Query Filtering Section */}
      {!isTrainOperator && (
        <div className="bg-slate-900/60 p-4 border border-slate-850 rounded-xl space-y-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Filter size={12} /> Advanced Stream Filters
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] text-slate-550 uppercase font-black" htmlFor="reportscenter-l1">Employee ID Filter</label>
              <input id="reportscenter-i3" name="reportscenter-i3" 
                type="text" 
                placeholder="e.g. 22464" 
                value={filterEmployeeId}
                onChange={(e) => setFilterEmployeeId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-350 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-slate-550 uppercase font-black" htmlFor="reportscenter-l2">Location Filter</label>
              <input id="reportscenter-i4" name="reportscenter-i4" 
                type="text" 
                placeholder="e.g. PYID" 
                value={filterLocation}
                onChange={(e) => setFilterLocation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-350 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] text-slate-550 uppercase font-black" htmlFor="reportscenter-l3">Train ID Filter</label>
              <input id="reportscenter-i5" name="reportscenter-i5" 
                type="text" 
                placeholder="e.g. 204" 
                value={filterTrainId}
                onChange={(e) => setFilterTrainId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs text-slate-350 focus:outline-none focus:border-emerald-500"
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
            <div className="flex flex-wrap items-center gap-1.5">
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
                        ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' 
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
                  type="text"
                  placeholder="Search 28 reports..."
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
                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg">
                  <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider">Format:</span>
                  <select id="reportscenter-i6" name="reportscenter-i6" 
                    value={exportFormat} 
                    onChange={(e) => setExportFormat(e.target.value)}
                    className="bg-transparent border-0 text-xs text-emerald-400 font-bold focus:outline-none cursor-pointer"
                  >
                    <option value="CSV" className="bg-slate-900 text-slate-200">CSV / EXCEL</option>
                    <option value="JSON" className="bg-slate-900 text-slate-200">RAW JSON</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Report Count Header */}
          <div className="flex justify-between items-center px-1 text-[11px] text-slate-500 uppercase tracking-widest font-mono">
            <span>Showing {filteredReports.length} of {reportConfig.length} Operational Reports</span>
            {startDate && endDate && (
              <span className="text-emerald-400/80 font-bold">Filtered Period: {startDate} → {endDate}</span>
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
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/40'
                  : isRoster 
                  ? 'bg-amber-950/60 text-amber-400 border-amber-800/40'
                  : isSafety
                  ? 'bg-rose-950/60 text-rose-400 border-rose-800/40'
                  : 'bg-cyan-950/60 text-cyan-400 border-cyan-800/40';

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
                        <><Download className="h-4 w-4 text-emerald-400" /> GENERATE {exportFormat}</>
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
              <p className="text-emerald-400 font-black uppercase tracking-widest text-xs animate-pulse">Running ML Aggregation Engine...</p>
            </div>
          ) : insights ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* SVG Donut Chart for Utilization */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg flex flex-col md:flex-row items-center gap-6">
                <div className="relative w-[150px] h-[150px]">
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

                <div className="flex-1 space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-400" /> Crew Execution Metrics
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-950 p-4 rounded border border-slate-800">
                      <span className="block text-[20px] font-black text-white">{insights.totalDeployments}</span>
                      <span className="text-[8px] text-slate-550 uppercase font-bold tracking-widest">Total Rostered</span>
                    </div>
                    <div className="bg-slate-950 p-4 rounded border border-slate-800">
                      <span className="block text-[20px] font-black text-cyan-400">{insights.activeOps}</span>
                      <span className="text-[8px] text-slate-550 uppercase font-bold tracking-widest">Active Drivers</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Anomaly and Delay distribution */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-lg space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-500" /> Incident Causes Analysis
                </h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex justify-between mb-1 text-[10px] uppercase font-bold text-slate-400">
                      <span>Signal Fluctuations</span>
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
                      <span>Door Interlocks</span>
                      <span className="text-amber-400">{insights.doorCount}</span>
                    </div>
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-550" style={{ width: `${insights.totalIncidents ? (insights.doorCount / insights.totalIncidents) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1 text-[10px] uppercase font-bold text-slate-400">
                      <span>Track/Line Clearing Delay</span>
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
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-l4">Target Report</label>
                    <select id="reportscenter-i7" name="reportscenter-i7" 
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
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-l5">Frequency</label>
                        <select id="reportscenter-i8" name="reportscenter-i8" 
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
                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-l6">Dispatch Time</label>
                        <input id="reportscenter-i9" name="reportscenter-i9" 
                          type="time" 
                          value={scheduleConfig.time}
                          onChange={(e) => setScheduleConfig({...scheduleConfig, time: e.target.value})}
                          className="w-full bg-slate-950 border border-slate-700 rounded p-2.5 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1" htmlFor="reportscenter-l7">Recipient Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <input id="reportscenter-i10" name="reportscenter-i10" 
                        type="email" 
                        required
                        placeholder="manager@occ-rail.com"
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
                  Configured schedules will automatically extract raw data, compile it into standard organizational formats, and dispatch via the secure mailing gateway at the designated intervals.
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
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-550 font-bold uppercase">
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-4xl w-full shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <FileText size={18} className="text-emerald-400" /> Data Stream Preview: {previewReport.name}
              </h3>
              <button 
                onClick={() => { setPreviewReport(null); setPreviewData(null); }}
                className="text-slate-400 hover:text-slate-200 font-bold font-mono text-xs uppercase"
              >
                ✕ Close
              </button>
            </div>

            {loadingPreview ? (
              <div className="text-center py-12 text-slate-500 text-xs animate-pulse font-mono tracking-widest uppercase">
                Fetching Stream Headers & Rows...
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
                                if (val.toDate && typeof val.toDate === 'function') {
                                  valStr = val.toDate().toLocaleString();
                                } else if (Array.isArray(val)) {
                                  valStr = val.map(v => typeof v === 'object' ? JSON.stringify(v) : String(v)).join('; ');
                                } else if (typeof val === 'object') {
                                  valStr = Object.entries(val).map(([k, v]) => `${k}: ${v}`).join('; ');
                                } else {
                                  valStr = String(val);
                                }
                              }
                              return (
                                <td key={key} className="p-2 border-r border-slate-850 truncate max-w-[200px]" title={valStr}>
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
                No records found in this stream.
              </div>
            )}
          </div>
        </div>
      )}
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
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-555 font-bold uppercase">
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
                          <span className="block text-[8.5px] text-slate-550">Duty {ex.operator1Duty}</span>
                        </td>
                        <td className="p-3">
                          <span className="font-bold text-cyan-400 uppercase">{ex.operator2Name}</span>
                          <span className="block text-[8.5px] text-slate-550">Duty {ex.operator2Duty}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${
                            ex.status === 'Operational' || ex.status === 'APPROVED' || ex.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                            ex.status === 'Rejected' ? 'bg-rose-550/10 text-rose-400 border-rose-500/30' :
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

/* eslint-disable react/prop-types */
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, updateDoc, deleteDoc, setDoc, writeBatch, serverTimestamp, query, where, doc } from 'firebase/firestore';
import { 
  Search, RefreshCw, ArrowDownCircle, ArrowUpCircle, Train, 
  Trash2, RotateCcw, AlertTriangle, Clock, UploadCloud, Calendar, Download, Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';



// Core Components
import WTTPage from '../pages/WTTPage';
import AdminPanel from './AdminPanel';
import ReportsCenter from './ReportsCenter';
import TrainOperatorPerformance from './TrainOperatorPerformance';
import AutomatedDispatchGate from './AutomatedDispatchGate';
import CrewDirectory from './CrewDirectory';
import RosterIntegrity from './RosterIntegrity';
import ShiftHandoverNotes from './ShiftHandoverNotes';
import TrainRakeRegistry from './TrainRakeRegistry';
import AssetReconciliation from './AssetReconciliation';
import EmergencyAlerts from './EmergencyAlerts';
import CompetencyExpiryDate from './CompetencyExpiryDate';
import ShiftExchange from './ShiftExchange';
import Training from './Training';
import TrainingCertificationTracker from './TrainingCertificationTracker';
import GCCControl from './GCCControl';
import TORequestForm from './TORequestForm';
import LeaveRequestManager from './LeaveRequestManager';
import DelayTracker from './DelayTracker';
import LiveOperationalStream from './LiveOperationalStream';
import PerformanceMetrics from './PerformanceMetrics';
import RollingStockFaultLog from './RollingStockFaultLog';
import Safety from './Safety';
import StationSafetyChecklist from './StationSafetyChecklist';
import ManualOverrideForm from './ManualOverrideForm';
import GccRosterUploader from './GccRosterUploader';
import EmergencyReliefEngine from './EmergencyReliefEngine';
import KilometerCalculationEngine from './KilometerCalculationEngine';

// Data
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

// Convert file to Base64 part for Gemini
const fileToGenerativePart = async (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        inlineData: {
          data: reader.result.split(',')[1],
          mimeType: file.type || "image/jpeg" // Fallback type
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};


export default function Dashboard({ initialTab = 'DISPATCH' }) {
  const { hasPermission, userProfile } = useAuth();
  
  const hasAdminRights = () => {
    return hasPermission("User Management", "Full") || userProfile?.role === 'CREW_CONTROLLER';
  };

  const allTabs = [
    { id: 'DISPATCH', label: 'DISPATCH GATE', module: 'Dashboard', permission: 'View' },
    { id: 'WTT', label: 'WTT', module: 'Dashboard', permission: 'View' },
    { id: 'ROSTER', label: 'ROSTER', module: 'Duty Roster', permission: 'Own' },
    { id: 'INTEGRITY', label: 'ROSTER INTEGRITY', module: 'Manual Override', permission: 'Full' },
    { id: 'CREW', label: 'CREW', module: 'Crew Registry', permission: 'View' },
    { id: 'REPORTS', label: 'REPORTS', module: 'Reports', permission: 'View' },
    { id: 'ADMIN', label: 'ADMIN', module: 'Settings', permission: 'Full' },
    { id: 'COMPETENCY', label: 'COMPETENCY EXPIRY', module: 'Crew Registry', permission: 'View' },
    { id: 'HANDOVER', label: 'HANDOVER', module: 'Dashboard', permission: 'View' },
    { id: 'ALERTS', label: 'ALERTS', module: 'Dashboard', permission: 'View' },
    { id: 'EXCHANGE', label: 'SHIFT EXCHANGE', module: 'Shift Exchange', permission: 'Request' },
    { id: 'TRAINING', label: 'TRAINING', module: 'Crew Registry', permission: 'View' },
    { id: 'ASSETS', label: 'ASSETS', module: 'Dashboard', permission: 'View' },
    { id: 'RAKE', label: 'RAKE', module: 'Dashboard', permission: 'View' },
    { id: 'LEAVE', label: 'LEAVE REQUEST', module: 'Dashboard', permission: 'View' },
    { id: 'MODULES', label: 'MODULES', module: 'Dashboard', permission: 'View' },
    { id: 'EMERGENCY_RELIEF', label: 'EMERGENCY RELIEF', module: 'Emergency Relief Module', permission: 'View' }
  ];

  const allowedTabs = allTabs.filter(tab => {
    if (tab.roleRequired && userProfile?.role !== tab.roleRequired) return false;
    return hasPermission(tab.module, tab.permission);
  });

  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (allowedTabs.length > 0 && !allowedTabs.some(t => t.id === activeTab)) {
      setActiveTab(allowedTabs[0].id);
    }
  }, [allowedTabs, activeTab]);
  const [wttActiveView, setWttActiveView] = useState('MATRIX');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDay, setActiveDay] = useState('WEEKDAY');
  const [unifiedRows, setUnifiedRows] = useState([]);
  const [links, setLinks] = useState([]);
  const [dailyDeployment, setDailyDeployment] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staticWtt, setStaticWtt] = useState([]);
  const [staticLinks, setStaticLinks] = useState([]);
  const [deploymentsData, setDeploymentsData] = useState([]);
  const [attendanceData, setAttendanceData] = useState([]);
  const [incidentsData, setIncidentsData] = useState([]);
  const [exchangesData, setExchangesData] = useState([]);
  const [reportsSubTab, setReportsSubTab] = useState('PERFORMANCE'); // 'EXPORTS' or 'PERFORMANCE'
  
  // Incident Control States
  const [targetTid, setTargetTid] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [incidentReason, setIncidentReason] = useState('Signal Fluctuation');

  // automated_dispatch_gate
  const [dispatchGateConfig, setDispatchGateConfig] = useState({
    "incidentId": "string",
    "trainId": "string",
    "incidentType": "string",
    "recommendations": [
      { "empId": "string", "empName": "string", "score": "number", "dutyId": "string", "remainingHours": "number" }
    ],
    "status": "RECOMMENDED",
    "timestamp": "serverTimestamp"
  });



  // Train ID Swap Panel States
  const [swapFromTid, setSwapFromTid] = useState('');
  const [swapToTid, setSwapToTid] = useState('');



  // Grid Inline Editing States
  const [editingCell, setEditingCell] = useState({ rowId: null, direction: null, station: null, isTid: false, isDeployment: false });
  const [editValue, setEditValue] = useState('');

  // Reports Center States
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');

  const handleDownloadAllReports = async () => {
    if (!reportStartDate || !reportEndDate) {
      alert("Please select a time duration period (Start and End date) to download all reports.");
      return;
    }
    
    const reports = ["Attendance Logs", "Delay Logs", "Incident Reports", "Crew Utilization", "Shift Handover Reports", "Shift Exchange Reports", "Competency Reports", "Training Reports", "Asset Reports", "Rake Registry Reports", "Leave Request Reports", "Dispatch Reports"];
    let downloadedCount = 0;
    
    for (const report of reports) {
      const success = await handleDownloadReport(report, true);
      if (success) {
        downloadedCount++;
        await new Promise(res => setTimeout(res, 500)); // Delay to prevent browser blocking multiple downloads
      }
    }
    if (downloadedCount === 0) {
      alert("No data found for any reports in this selected period.");
    }
  };

  const handleDownloadReport = async (reportName, silent = false) => {
    if (!reportStartDate || !reportEndDate) {
      if (!silent) alert(`Please select a time duration period (Start and End date) to download the ${reportName}.`);
      return false;
    }

    try {
      let collectionName = '';
      let dateField = 'timestamp';
      let isDateString = false;

      switch (reportName) {
        case "Attendance Logs": collectionName = 'crew_live_attendance'; break;
        case "Delay Logs": case "Incident Reports": collectionName = 'wtt_live_incidents'; break;
        case "Crew Utilization": case "Dispatch Reports": collectionName = 'crew_daily_deployment'; dateField = 'lastUpdated'; break;
        case "Shift Handover Reports": collectionName = 'shift_handover_notes'; break;
        case "Shift Exchange Reports": collectionName = 'shift_exchanges'; break;
        case "Competency Reports": collectionName = 'competency_records'; dateField = 'expiryDate'; isDateString = true; break;
        case "Training Reports": collectionName = 'staff_training'; break;
        case "Asset Reports": collectionName = 'asset_transactions'; break;
        case "Rake Registry Reports": collectionName = 'rake_registry'; dateField = 'registryDate'; isDateString = true; break;
        case "Leave Request Reports": collectionName = 'leave_requests'; break;
        default: return;
      }

      const q = query(collection(db, collectionName));
      const snapshot = await getDocs(q);
      let data = snapshot.docs.map(doc => doc.data());

      if (!isDateString) {
        const startD = new Date(`${reportStartDate}T00:00:00`).getTime();
        const endD = new Date(`${reportEndDate}T23:59:59`).getTime();
        
        data = data.filter(item => {
          const ts = item[dateField] || item.timestamp || item.lastUpdated || item.dispatchTime || item.createdAt;
          if (!ts) return true;
          let itemTime = 0;
          if (ts.toDate) itemTime = ts.toDate().getTime();
          else itemTime = new Date(ts).getTime();
          return itemTime >= startD && itemTime <= endD;
        });
      } else {
        data = data.filter(item => {
          const dateStr = item[dateField];
          if (!dateStr) return true;
          return dateStr >= reportStartDate && dateStr <= reportEndDate;
        });
      }

      if (data.length === 0) {
        if (!silent) alert(`No data found for ${reportName} in this period.`);
        return false;
      }

      // Sort data chronologically before generating CSV
      data.sort((a, b) => {
        const tsA = a[dateField] || a.timestamp || a.lastUpdated || a.dispatchTime || a.createdAt;
        const tsB = b[dateField] || b.timestamp || b.lastUpdated || b.dispatchTime || b.createdAt;
        
        let timeA = 0;
        let timeB = 0;
        
        if (tsA) timeA = tsA.toDate ? tsA.toDate().getTime() : new Date(tsA).getTime();
        if (tsB) timeB = tsB.toDate ? tsB.toDate().getTime() : new Date(tsB).getTime();
        
        return timeA - timeB;
      });

      const allKeys = new Set();
      data.forEach(item => Object.keys(item).forEach(k => allKeys.add(k)));
      const headers = Array.from(allKeys);
      if (!headers.includes('Report Generated At')) headers.push('Report Generated At');

      let csvRows = [headers.join(",")];
      data.forEach(item => {
        const row = headers.map(header => {
          if (header === 'Report Generated At') return new Date().toLocaleString();
          let val = item[header];
          if (val && val.toDate) val = val.toDate().toLocaleString();
          else if (typeof val === 'object') val = JSON.stringify(val).replace(/,/g, ';');
          else if (val === undefined || val === null) val = '--';
          return `"${String(val).replace(/"/g, '""')}"`;
        });
        csvRows.push(row.join(","));
      });

      const blob = new Blob([csvRows.join('\n')], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.setAttribute("href", URL.createObjectURL(blob));
      link.setAttribute("download", `${reportName.replace(/\s+/g, '_')}_${reportStartDate}_to_${reportEndDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch (err) {
      console.error(`Error downloading ${reportName}:`, err);
      if (!silent) alert("Failed to download report. Please try again.");
      return false;
    }
  };

  // INJECTED STATE FOR CHRONOLOGICAL TRAIN AND OPERATOR RELIEF TRACKING
  const [liveTrainTrackingMap, setLiveTrainTrackingMap] = useState({});

  // NEW SEARCH STATE DEDICATED FOR IMMEDIATE TRACKING MATRIX FILTERING
  const [trackerSearchTerm, setTrackerSearchTerm] = useState('');

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
      Object.values(row.downTrip.stations).forEach(t => { if (t && t !== '--' && t !== '-') times.push(timeToSeconds(t)); });
    }
    if (row.upTrip?.stations) {
      Object.values(row.upTrip.stations).forEach(t => { if (t && t !== '--' && t !== '-') times.push(timeToSeconds(t)); });
    }
    return times.length === 0 ? 999999 : Math.min(...times);
  };

  const timeToSeconds = (timeStr) => {
    if (!timeStr || timeStr === '--' || timeStr === '-') return 999999;
    const parts = timeStr.split(':');
    let secs = 0;
    if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
    if (parts[1]) secs += parseInt(parts[1], 10) * 60;
    if (parts[2]) secs += parseInt(parts[2], 10);
    // Shift late-night train trips (00:00 to 02:59) to the next day for sorting purposes
    if (secs < 3 * 3600) {
      secs += 24 * 3600;
    }
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
    if (!timeStr || timeStr === '--' || timeStr === '-') return '--';
    const totalSecs = timeToSeconds(timeStr) + (parseInt(mins, 10) * 60);
    return secondsToTime(totalSecs);
  };

  const fetchLiveData = async () => {
    try {
      setLoading(true);
      const wttSnapshot = await getDocs(collection(db, "wtt_final_matrix"));
      const wttData = wttSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const linksSnapshot = await getDocs(collection(db, "crew_final_links"));
      const linksData = linksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const deploySnapshot = await getDocs(collection(db, "crew_daily_deployment"));
      const deployData = deploySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const attSnapshot = await getDocs(collection(db, "crew_live_attendance"));
      const attData = attSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const incSnapshot = await getDocs(collection(db, "wtt_live_incidents"));
      const incData = incSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLiveIncidents(incData);

      const dayTrips = wttData.filter(t => String(t.scheduleType || '').toUpperCase() === activeDay);

      const getTripDirection = (trip) => {
        if (trip.stations) {
          const stOrder = ["BIET", "NGSA", "PYID", "YPM", "RJNR", "KGWA", "NLC", "RVR", "PUTH", "APTS"];
          let firstIdx = -1;
          let firstTime = 999999;
          let lastIdx = -1;
          let lastTime = -1;
          for (let i = 0; i < stOrder.length; i++) {
            const t = timeToSeconds(trip.stations[stOrder[i]]);
            if (t !== 999999) {
              if (firstIdx === -1) { firstIdx = i; firstTime = t; }
              lastIdx = i; lastTime = t;
            }
          }
          if (firstIdx !== -1 && lastIdx !== -1 && firstIdx !== lastIdx) {
            return firstTime < lastTime ? 'DN' : 'UP';
          }
        }
        const route = String(trip.terminalLoopRoute || '').toLowerCase();
        if (route.includes('(up)') || route.includes('apts-biet')) return 'UP';
        return 'DN';
      };

      // Group all trips by Train ID to assemble strictly sequential routes
      const tripsByTrain = {};
      dayTrips.forEach(trip => {
        const tid = String(trip.trainId).trim();
        if (!tripsByTrain[tid]) tripsByTrain[tid] = [];
        const dir = getTripDirection(trip);
        tripsByTrain[tid].push({ 
          trip, 
          direction: dir, 
          time: getEarliestTimeSeconds(dir === 'DN' ? { downTrip: trip } : { upTrip: trip }) 
        });
      });

      let synchronizedPairs = [];
      Object.keys(tripsByTrain).forEach(tid => {
        // Sort the train's trips strictly by chronological time
        const trips = tripsByTrain[tid].sort((a, b) => a.time - b.time);
        let currentRow = { id: null, trainId: tid, downTrip: null, upTrip: null };

        trips.forEach(t => {
          if (t.direction === 'DN') {
            if (currentRow.downTrip) {
              // Already have a DN trip pending an UP, flush it
              synchronizedPairs.push({ ...currentRow });
              currentRow = { id: t.trip.id, trainId: tid, downTrip: t.trip, upTrip: null };
            } else {
              currentRow.id = currentRow.id || t.trip.id;
              currentRow.downTrip = t.trip;
            }
          } else {
            // It's an UP trip
            if (currentRow.upTrip) {
              // Already have an UP trip, flush it
              synchronizedPairs.push({ ...currentRow });
              currentRow = { id: t.trip.id, trainId: tid, downTrip: null, upTrip: t.trip };
            } else if (currentRow.downTrip) {
              // We have a DN trip waiting! Is this UP trip reasonably close? (e.g. < 4 hours gap)
              const dnTime = getEarliestTimeSeconds({ downTrip: currentRow.downTrip });
              if (t.time - dnTime > 4 * 3600) {
                // Gap is too big (e.g. Morning induction vs Evening induction). Do NOT pair.
                synchronizedPairs.push({ ...currentRow });
                currentRow = { id: t.trip.id, trainId: tid, downTrip: null, upTrip: t.trip };
              } else {
                currentRow.upTrip = t.trip;
                synchronizedPairs.push({ ...currentRow });
                currentRow = { id: null, trainId: tid, downTrip: null, upTrip: null };
              }
            } else {
              // No pending DN trip
              currentRow.id = currentRow.id || t.trip.id;
              currentRow.upTrip = t.trip;
              synchronizedPairs.push({ ...currentRow });
              currentRow = { id: null, trainId: tid, downTrip: null, upTrip: null };
            }
          }
        });

        // Flush any remaining active row
        if (currentRow.downTrip || currentRow.upTrip) {
          synchronizedPairs.push(currentRow);
        }
      });

      synchronizedPairs.sort((a, b) => getEarliestTimeSeconds(a) - getEarliestTimeSeconds(b));
      setUnifiedRows(synchronizedPairs);
      
      const currentDayLinks = linksData.filter(l => String(l.scheduleType || '').toUpperCase() === activeDay).sort((a,b) => String(a.dutyId).localeCompare(String(b.dutyId), undefined, {numeric: true}));
      setLinks(currentDayLinks);

      // Build the primary deployment list from crew_final_links (master run file)
      const activeDeployments = currentDayLinks.map(link => {
        const matchingGcc = deployData.find(d => String(d.dutyId) === String(link.dutyId) && String(d.scheduleType).toUpperCase() === activeDay);
        const matchedAtt = attData.find(a => String(a.dutyId) === String(link.dutyId) && String(a.scheduleType).toUpperCase() === activeDay);
        return {
          id: link.id,
          dutyId: link.dutyId,
          signOnTime: matchingGcc?.signOnTime || link.signOnTime,
          signOnLocation: link.signOnLocation,
          trainId: matchingGcc?.trainId || link.trainId,
          empId: matchingGcc ? matchingGcc.empId : '--',
          empName: matchingGcc ? matchingGcc.empName : '--',
          remarks: matchingGcc ? matchingGcc.remarks : 'Pending GCC Load',
          status: matchingGcc?.status || null,
          isSignedOn: !!matchedAtt,
          signOnTimestamp: matchedAtt ? matchedAtt.signOnTimeActual : null,
          rawLegs: {
            l1Train: matchingGcc?.rawLegs?.l1Train || link.trainId || '--',
            l1Start: matchingGcc?.rawLegs?.l1Start || link.signOnTime || '--',
            l1End: matchingGcc?.rawLegs?.l1End || link.leg2ArrTime || '--',
            l2Train: matchingGcc?.rawLegs?.l2Train || link.leg2TrainNo || '--',
            l2Start: matchingGcc?.rawLegs?.l2Start || link.leg2DepTime || '--',
            l2End: matchingGcc?.rawLegs?.l2End || link.leg3HandoverTime || '--',
            l3Train: matchingGcc?.rawLegs?.l3Train || link.leg3TrainNo || '--',
            l3Start: matchingGcc?.rawLegs?.l3Start || link.leg3TakeoverTime || '--',
            l3End: matchingGcc?.rawLegs?.l3End || link.leg4FinalArrTime || '--',
            l4Train: matchingGcc?.rawLegs?.l4Train || link.leg4TrainNo || '--',
            l4Start: matchingGcc?.rawLegs?.l4Start || link.leg4FinalArrTime || '--',
            l4End: matchingGcc?.rawLegs?.l4End || link.signOffTime || '--'
          }
        };
      });

      // ── Append AI-imported duties that have NO matching crew_final_links entry ──
      // These come from AiDataExtractorEngine approval and would otherwise be invisible
      const linkedDutyIds = new Set(currentDayLinks.map(l => String(l.dutyId)));
      const aiOnlyDeployments = deployData
        .filter(d => {
          const dDay = String(d.scheduleType || '').toUpperCase();
          const dDuty = String(d.dutyId || '').trim();
          return dDay === activeDay && dDuty && dDuty !== 'UNASSIGNED' && !linkedDutyIds.has(dDuty);
        })
        .map(d => {
          const matchedAtt = attData.find(a => String(a.dutyId) === String(d.dutyId) && String(a.scheduleType).toUpperCase() === activeDay);
          return {
            id: d.id,
            dutyId: d.dutyId,
            signOnTime: d.signOnTime || '--',
            signOnLocation: d.rawLegs?.l1Start ? '--' : '--',
            trainId: d.trainId || '--',
            empId: d.empId || '--',
            empName: d.empName || '--',
            remarks: d.remarks || 'AI Ingest',
            status: d.status || null,
            isSignedOn: !!matchedAtt,
            signOnTimestamp: matchedAtt ? matchedAtt.signOnTimeActual : null,
            _aiImported: true, // flag so UI can distinguish if needed
            rawLegs: d.rawLegs || {
              l1Train: d.trainId || '--',
              l1Start: d.signOnTime || '--',
              l1End: '--',
              l2Train: '--', l2Start: '--', l2End: '--',
              l3Train: '--', l3Start: '--', l3End: '--',
              l4Train: '--', l4Start: '--', l4End: '--'
            }
          };
        });

      const allDeployments = [...activeDeployments, ...aiOnlyDeployments];

      setDailyDeployment(allDeployments);
      setAttendanceLogs(attData.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));

      // UNALTERED BACKGROUND COMPUTATION ENGINE FOR TRAIN & RELIEVER TRACKING
      const currentSecs = (() => {
        const now = new Date();
        return (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
      })();

      let trainTimelineMap = {};

      activeDeployments.forEach(operator => {
        const processLeg = (tid, startStr, endStr) => {
          if (!tid || tid === '--' || tid === '-') return;
          if (!trainTimelineMap[tid]) trainTimelineMap[tid] = [];
          
          trainTimelineMap[tid].push({
            dutyId: operator.dutyId,
            empName: operator.empName,
            empId: operator.empId,
            startSec: timeToSeconds(startStr),
            endSec: timeToSeconds(endStr),
            startStr,
            endStr
          });
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

        calculatedTracking[tid] = {
          current: timeline[currentIdx] || null,
          previous: timeline[currentIdx - 1] || null,
          nextReliver: timeline[currentIdx + 1] || null
        };
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

  const handleGccRosterUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const fileExt = file.name.split('.').pop().toLowerCase();
      const isSpreadsheet = file.type.includes('spreadsheet') || file.type.includes('csv') || file.type.includes('excel') || ['xlsx', 'xls', 'csv'].includes(fileExt);

      let parsedDuties = [];

      if (isSpreadsheet) {
        // Read file as binary string to parse Excel or CSV locally
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => resolve(evt.target.result);
          reader.onerror = reject;
          reader.readAsBinaryString(file);
        });

        const wb = XLSX.read(data, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        let headerRowIdx = -1;
        let dutyColIdx = 0;
        let nameColIdx = 3; // 4th column by default
        let empColIdx = 4;  // 5th column by default

        // 1. Scan the first 10 rows to find the header row
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          
          const hasDuty = row.some(cell => cell && String(cell).toLowerCase().includes('duty'));
          const hasSignOn = row.some(cell => cell && String(cell).toLowerCase().includes('sign') || String(cell).toLowerCase().includes('s on'));
          
          if (hasDuty || hasSignOn) {
            headerRowIdx = i;
            row.forEach((cell, colIdx) => {
              if (!cell) return;
              const cellStr = String(cell).toLowerCase();
              if (cellStr.includes('duty')) dutyColIdx = colIdx;
              else if (cellStr.includes('name') || cellStr.includes('operator') || cellStr === 'to') nameColIdx = colIdx;
              else if (cellStr.includes('emp') || cellStr.includes('employ') || cellStr.includes('id')) empColIdx = colIdx;
            });
            break;
          }
        }

        const startRowIdx = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;

        for (let i = startRowIdx; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const dutyId = row[dutyColIdx];
          if (dutyId === undefined || dutyId === null || String(dutyId).trim() === '') continue;

          parsedDuties.push({
            dutyNo: String(dutyId).trim(),
            employeeId: row[empColIdx] !== undefined && row[empColIdx] !== null ? String(row[empColIdx]).trim() : '',
            name: row[nameColIdx] !== undefined && row[nameColIdx] !== null ? String(row[nameColIdx]).trim() : ''
          });
        }
      }

      // If local spreadsheet/CSV parsing did not yield results, or if it is a text/PDF/image file, use Gemini AI
      if (parsedDuties.length === 0) {
        const apiKeyToUse = localStorage.getItem('custom_gemini_api_key') ||
          import.meta.env.VITE_GEMINI_API_KEY ||
          "";

        const genAI = new GoogleGenerativeAI(apiKeyToUse);
        const model = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" }
        });

        const promptText = `Analyze this roster document (which could be plain text, a table screenshot, or a PDF). Extract all rows of crew roster assignments.
For each row, extract the following columns:
1. "Duty No" (the duty number/id, e.g. 1, 2, 3, CC1, CC2, etc.)
2. "NAME" (the operator's name, e.g. Sooraj, Sunil PN, Mohammed Rafiq)
3. "Emp No" (the operator's employee number, e.g. 22296, 22240, 22297)

Return the output as a JSON object with key:
- "duties": array of objects, where each object has keys: "dutyNo", "name", "employeeId"

Format the response strictly as a single JSON object.`;

        let contentParts = [];
        
        const isTextFile = file.type.startsWith('text/') || ['txt', 'csv', 'json'].includes(fileExt);

        if (isTextFile) {
          const textContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
          });
          contentParts.push(`Here is the roster text contents:\n\`\`\`\n${textContent}\n\`\`\`\n\n${promptText}`);
        } else {
          // PDF or Image binary
          const filePart = await fileToGenerativePart(file);
          contentParts.push(promptText);
          contentParts.push(filePart);
        }

        const result = await model.generateContent(contentParts);
        const responseText = result.response.text();

        const cleanJsonString = (str) => {
          let cleaned = str.trim();
          try {
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
              return cleaned.substring(firstBrace, lastBrace + 1);
            }
          } catch (e) {
            console.error("JSON extraction helper failed:", e);
          }
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, '');
            cleaned = cleaned.replace(/\n```$/, '');
          }
          return cleaned.trim();
        };

        const cleanedText = cleanJsonString(responseText);
        const responseJson = JSON.parse(cleanedText);
        const duties = responseJson.duties || [];

        parsedDuties = duties.map(d => ({
          dutyNo: String(d.dutyNo || d.dutyId || d["Duty No"] || d["DutyNo"] || ""),
          name: String(d.name || d.empName || d["NAME"] || d["Name"] || ""),
          employeeId: String(d.employeeId || d.empId || d["Emp No"] || d["EmpNo"] || d["Employee ID"] || "")
        })).filter(d => d.dutyNo);
      }

      if (parsedDuties.length > 0) {
        const batch = writeBatch(db);
        parsedDuties.forEach(row => {
          const docId = `gcc_deploy_${activeDay.toLowerCase()}_duty_${row.dutyNo}`;
          batch.set(doc(db, "crew_daily_deployment", docId), {
            scheduleType: activeDay,
            dutyId: String(row.dutyNo),
            empId: String(row.employeeId),
            empName: String(row.name),
            remarks: "GCC Verified Ingest (AI Multimodal)",
            lastUpdated: serverTimestamp()
          }, { merge: true });
        });

        await batch.commit();
        alert(`✅ GCC Master Deployment Loaded. Ingested ${parsedDuties.length} duties successfully.`);
        fetchLiveData();
      } else {
        alert("❌ Ingestion failed: No valid roster entries could be extracted from the file.");
      }
    } catch (err) {
      console.error("Ingestion failed:", err);
      alert(`❌ Roster Ingestion failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
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
      alert("⚠️ Delay variance logged."); setTargetTid(''); setDelayMinutes(''); fetchLiveData();
    } catch (err) { console.error(err); }
  };

  const handleClearAllIncidents = async () => {
    if (window.confirm("Restore all line movements back to strict master WTT schedules?")) {
      const snapshot = await getDocs(collection(db, "wtt_live_incidents"));
      const batch = writeBatch(db); snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit(); alert("Line status restored."); fetchLiveData();
    }
  };

  const handleOneClickAuthorize = async (rowOrRows) => {
    try {
      const actualTimeStr = new Date().toTimeString().split(' ')[0];
      const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
      const batch = writeBatch(db);
      
      rows.forEach(row => {
        const docRef = doc(db, "crew_live_attendance", `signon_${activeDay.toLowerCase()}_duty_${row.dutyId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
        batch.set(docRef, {
          scheduleType: activeDay,
          dutyId: String(row.dutyId),
          empId: row.empId,
          empName: row.empName,
          signOnTimeScheduled: row.signOnTime,
          signOnTimeActual: actualTimeStr,
          status: "AUTHORIZED_OK",
          timestamp: serverTimestamp()
        });
      });
      
      await batch.commit();
      alert(rows.length === 1 ? "Operator Authorized!" : `${rows.length} Operators Authorized successfully!`);
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to authorize: " + err.message);
    }
  };



  const handleTrainIdSwap = async (e) => {
    e.preventDefault();
    if (!swapFromTid || !swapToTid) return;
    try {
      const q1 = query(collection(db, "wtt_final_matrix"), where("trainId", "==", swapFromTid));
      const q2 = query(collection(db, "wtt_final_matrix"), where("trainId", "==", swapToTid));

      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      const batch = writeBatch(db);

      snap1.docs.forEach(docSnap => batch.update(docSnap.ref, { trainId: swapToTid }));
      snap2.docs.forEach(docSnap => batch.update(docSnap.ref, { trainId: swapFromTid }));

      await batch.commit();
      alert(`✅ Advanced Train ID Swap executed: TID ${swapFromTid} ⇄ TID ${swapToTid}`);
      setSwapFromTid(''); setSwapToTid(''); 
      fetchLiveData();
    } catch (err) { console.error("Train ID Swap failed:", err); }
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

  const handleWttBulkSave = async (editedRows) => {
    try {
      const batch = writeBatch(db);
      for (const row of editedRows) {
        if (row.downTrip) {
          if (row.downTrip.id && !row.downTrip.isNew) {
            batch.update(doc(db, "wtt_final_matrix", row.downTrip.id), {
              trainId: row.trainId,
              stations: row.downTrip.stations || {}
            });
          } else if (row.downTrip.isNew || !row.downTrip.id) {
            const hasData = Object.values(row.downTrip.stations || {}).some(v => v && v.trim() !== '' && v !== '--');
            if (hasData || (row.trainId && Object.keys(row.downTrip.stations || {}).length > 0)) {
              const newDocRef = doc(collection(db, "wtt_final_matrix"));
              batch.set(newDocRef, {
                trainId: row.trainId || '',
                scheduleType: activeDay,
                terminalLoopRoute: "DN",
                stations: row.downTrip.stations || {}
              });
            }
          }
        }
        if (row.upTrip) {
          if (row.upTrip.id && !row.upTrip.isNew) {
            batch.update(doc(db, "wtt_final_matrix", row.upTrip.id), {
              trainId: row.trainId,
              stations: row.upTrip.stations || {}
            });
          } else if (row.upTrip.isNew || !row.upTrip.id) {
            const hasData = Object.values(row.upTrip.stations || {}).some(v => v && v.trim() !== '' && v !== '--');
            if (hasData || (row.trainId && Object.keys(row.upTrip.stations || {}).length > 0)) {
              const newDocRef = doc(collection(db, "wtt_final_matrix"));
              batch.set(newDocRef, {
                trainId: row.trainId || '',
                scheduleType: activeDay,
                terminalLoopRoute: "UP",
                stations: row.upTrip.stations || {}
              });
            }
          }
        }
      }
      await batch.commit();
      alert("WTT Matrix changes saved successfully.");
      fetchLiveData();
    } catch (err) {
      console.error(err);
      alert("Failed to save WTT Matrix changes.");
    }
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

  // FILTERED TRACKING ENGINE COMPLETED IN REAL-TIME
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
      
      {/* Workstation Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 sticky top-0 z-50 shadow-lg">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h1 className="text-sm font-bold tracking-wider font-mono text-slate-200">BMRCL AUTOMATED GCC DISPATCH DESK</h1>
            </div>
            <p className="text-slate-500 text-[11px] font-mono mt-0.5">Line 2 Operational Desk | Peenya Industry Depot (PYID)</p>
          </div>
          <nav className="flex flex-wrap bg-slate-950 p-1 rounded-lg border border-slate-800 w-full lg:w-auto gap-1">
            {allowedTabs.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)} 
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-md font-mono text-xs tracking-wider transition-all ${activeTab === tab.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold' : 'text-slate-400 hover:text-slate-300 hover:bg-slate-900'}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Control Ribbon Controls */}
      <div className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-900 bg-slate-950">
        <div className="flex flex-wrap gap-2">
          {dayTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveDay(tab.id)} className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all ${activeDay === tab.id ? 'bg-slate-800 text-emerald-400 border-slate-700 font-bold' : 'bg-slate-900/40 text-slate-500 border-slate-800/60'}`}>{tab.label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {(activeTab === 'DISPATCH') && (
            <div className="flex items-center gap-2">
              <button onClick={handleRosterReset} className="flex items-center bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/30 transition px-3 py-1.5 rounded text-xs font-mono text-rose-400 font-bold uppercase tracking-wide shadow-sm">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-rose-500" /> RESET DAILY ROSTER
              </button>
              <div className="flex items-center bg-slate-900 border border-slate-800 px-3 py-1.5 rounded cursor-pointer relative hover:bg-slate-850 shadow-sm">
                <UploadCloud className="h-3.5 w-3.5 mr-2 text-emerald-400" />
                <span className="text-xs font-mono text-slate-300 font-bold uppercase tracking-wide">UPLOAD GCC ROSTER</span>
                <input type="file" accept=".csv, .txt, .xlsx, .xls, .pdf, image/*" onChange={handleGccRosterUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
              </div>
            </div>
          )}
          <input type="text" placeholder="Filter Matrix..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-slate-900 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none w-full md:w-40" />
          <button onClick={fetchLiveData} className="bg-slate-900 border border-slate-800 p-2 rounded text-slate-400"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Main Framework Displays Container */}
      <main className="p-4 max-w-[100vw]">
        {activeTab === 'DISPATCH' ? (
          <AutomatedDispatchGate
            deployments={dailyDeployment}
            loading={loading}
            activeDay={activeDay}
            runningFleetCount={Object.keys(liveTrainTrackingMap).length}
            onAuthorize={handleOneClickAuthorize}
            onImportComplete={fetchLiveData}
          />
        ) : loading ? (
          <div className="text-center font-mono text-xs py-40 text-slate-600 tracking-widest animate-pulse">CONNECTING TO OPERATIONAL NETWORKS...</div>
        ) : activeTab === 'WTT' ? (
          <WTTPage 
            trackerSearchTerm={trackerSearchTerm}
            setTrackerSearchTerm={setTrackerSearchTerm}
            filteredTrackingKeys={filteredTrackingKeys}
            liveTrainTrackingMap={liveTrainTrackingMap}
            targetTid={targetTid}
            setTargetTid={setTargetTid}
            delayMinutes={delayMinutes}
            setDelayMinutes={setDelayMinutes}
            incidentReason={incidentReason}
            setIncidentReason={setIncidentReason}
            handleIncidentLogSubmit={handleIncidentLogSubmit}
            liveIncidents={liveIncidents}
            filteredUnifiedRows={filteredUnifiedRows}
            dnStationOrder={dnStationOrder}
            upStationOrder={upStationOrder}
            editingCell={editingCell}
            setEditingCell={setEditingCell}
            editValue={editValue}
            setEditValue={setEditValue}
            handleWttCellSave={handleWttCellSave}
            handleWttBulkSave={handleWttBulkSave}
            handleDeleteTripRow={handleDeleteTripRow}
            addDelayToTime={addDelayToTime}
            activeDay={activeDay}
          />
) : activeTab === 'ROSTER' ? (
          
          /* VIEW 3: DYNAMIC RE-INTEGRATED MASTER CREW LINK ROSTER SHEET */
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
                    <th className="py-2 px-1 border-r border-slate-800 text-center w-[60px]">Action</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[80px]">Duty ID</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Sign On Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[110px]">Sign On Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800 w-[90px]">Train No</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Arr Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Arr Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Dep Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Dep Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[90px]">Train No</th>
                    <th className="py-2 px-2 border-r border-slate-800 w-[100px]">Time To</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Handover Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">H-Over Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Takeover Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">T-Over Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[90px]">Train No</th>
                    <th className="py-2 px-2 border-r border-slate-800 w-[100px]">Time Frm</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Arr Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Arr Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Dep Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Final Dep Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[90px]">Train No</th>
                    <th className="py-2 px-2 border-r border-slate-800 w-[100px]">Time To</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Sign Off Time</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[110px]">Sign Off Loc</th>
                    <th className="py-2 px-2 border-r border-slate-800/50 w-[100px]">Total Hours</th>
                    <th className="py-2 px-4 text-left w-[240px]">Operational Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300 text-center">
                  {filteredLinks.map((duty, idx) => {
                    const rowBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950/40";
                    const stickyDutyBgClass = idx % 2 === 0 ? "bg-slate-900" : "bg-slate-950";
                    const renderCell = (fieldName, customStyle = "text-slate-300") => {
                      const isEditing = editingCell.rowId === duty.id && editingCell.station === fieldName && !editingCell.isDeployment;
                      const displayVal = duty[fieldName] || '--';
                      if (isEditing) {
                        return (
                          <td className="p-1 border-r border-slate-800/40 bg-slate-950">
                            <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={() => handleCellSave(duty.id, fieldName)} onKeyDown={(e) => e.key === 'Enter' && handleCellSave(duty.id, fieldName)} className="w-full bg-slate-950 text-emerald-400 font-bold border border-emerald-500 rounded px-1 py-0.5 text-center focus:outline-none" autoFocus />
                          </td>
                        );
                      }
                      return (
                        <td onDoubleClick={() => { setEditingCell({ rowId: duty.id, direction: 'ROSTER', station: fieldName, isTid: false, isDeployment: false }); setEditValue(displayVal); }} className={`py-2 px-2 border-r border-slate-800/40 truncate cursor-pointer hover:bg-slate-850/40 ${customStyle}`}>{displayVal}</td>
                      );
                    };
                    return (
                      <tr key={duty.id} className={`${rowBgClass} hover:bg-slate-850/20 border-b border-slate-800/40 transition-colors`}>
                        <td className="py-2 border-r border-slate-800 text-center font-bold">
                          <button onClick={() => handleDeleteRow(duty.id)} className="text-rose-500 hover:text-rose-400 p-1"><Trash2 className="h-3.5 w-3.5 mx-auto" /></button>
                        </td>
                        <td className={`py-2 px-2 text-center border-r border-slate-800 font-bold text-blue-400 sticky left-0 z-10 shadow-sm ${stickyDutyBgClass}`}>{duty.dutyId}</td>
                        {renderCell('signOnTime', 'text-emerald-400 font-bold')}{renderCell('signOnLocation', 'text-slate-400')}{renderCell('trainId', 'text-slate-100 font-bold')}{renderCell('leg1TimeFrom', 'text-slate-500')}
                        {renderCell('leg2ArrLoc')}{renderCell('leg2ArrTime')}{renderCell('leg2DepLoc')}{renderCell('leg2DepTime')}{renderCell('leg2TrainNo', 'text-amber-400 font-bold')}{renderCell('leg2TimeTo')}
                        {renderCell('leg3HandoverLoc')}{renderCell('leg3HandoverTime')}{renderCell('leg3TakeoverLoc')}{renderCell('leg3TakeoverTime')}{renderCell('leg3TrainNo', 'text-cyan-400 font-bold')}{renderCell('leg3TimeFrom')}
                        {renderCell('leg4FinalArrLoc')}{renderCell('leg4FinalArrTime')}{renderCell('leg4FinalDepLoc')}{renderCell('leg4FinalDepTime')}{renderCell('leg4TrainNo', 'text-purple-400 font-bold')}{renderCell('leg4TimeTo')}
                        {renderCell('signOffTime', 'text-rose-400 font-semibold')}{renderCell('signOffLocation', 'text-slate-400')}{renderCell('totalHours', 'text-emerald-400 font-bold')}
                        {renderCell('remarks', 'text-left text-slate-400 italic px-4 max-w-[240px] truncate')}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'INTEGRITY' ? (
          /* VIEW 4: ROSTER INTEGRITY */
          <RosterIntegrity />
        ) : activeTab === 'CREW' ? (
          /* VIEW 5: CREW DIRECTORY */
          <CrewDirectory crewData={BMRCL_CREW_REGISTRY} isAdmin={hasAdminRights()} />
        ) : activeTab === 'REPORTS' ? (
          /* VIEW 6: REPORTS & PERFORMANCE DESK */
          <div className="space-y-6">
            {/* Reports Sub navigation */}
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 w-full max-w-2xl print:hidden">
              <button 
                onClick={() => setReportsSubTab('PERFORMANCE')}
                className={`flex-1 px-4 py-2 text-[10px] font-black rounded tracking-widest transition-all uppercase ${reportsSubTab === 'PERFORMANCE' ? 'bg-emerald-600 text-slate-950 shadow-md font-bold' : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'}`}
              >
                Train Operator Performance Analytics
              </button>
              <button 
                onClick={() => setReportsSubTab('KILOMETER')}
                className={`flex-1 px-4 py-2 text-[10px] font-black rounded tracking-widest transition-all uppercase ${reportsSubTab === 'KILOMETER' ? 'bg-emerald-600 text-slate-950 shadow-md font-bold' : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'}`}
              >
                Kilometer Calculation
              </button>
              <button 
                onClick={() => setReportsSubTab('EXPORTS')}
                className={`flex-1 px-4 py-2 text-[10px] font-black rounded tracking-widest transition-all uppercase ${reportsSubTab === 'EXPORTS' ? 'bg-emerald-600 text-slate-950 shadow-md font-bold' : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'}`}
              >
                Mailing & Downloads Center
              </button>
            </div>

            {reportsSubTab === 'PERFORMANCE' ? (
              <TrainOperatorPerformance />
            ) : reportsSubTab === 'KILOMETER' ? (
              <KilometerCalculationEngine />
            ) : (
              /* VIEW 6: REPORTS CENTER (Enhanced with Time/Date Stamps) */
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-800 font-mono text-slate-200">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-4 mb-6 gap-4">
                  <h2 className="text-emerald-400 font-bold flex items-center gap-2 text-lg tracking-wider">
                    <Activity className="h-5 w-5" /> OPERATIONAL REPORTS CENTER
                  </h2>
                  <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-slate-500" />
                      <span className="text-xs font-bold text-slate-400 uppercase">Period:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={reportStartDate}
                        onChange={(e) => setReportStartDate(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200"
                      />
                      <span className="text-slate-550">to</span>
                      <input
                        type="date"
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-emerald-500 text-slate-200"
                      />
                      <button 
                        onClick={handleDownloadAllReports}
                        className="ml-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-3 py-1.5 rounded font-black text-xs flex items-center gap-1 transition-colors shadow-sm"
                      >
                        <Download size={14} /> DOWNLOAD ALL
                      </button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {["Attendance Logs", "Delay Logs", "Incident Reports", "Crew Utilization", "Shift Handover Reports", "Shift Exchange Reports", "Competency Reports", "Training Reports", "Asset Reports", "Rake Registry Reports", "Leave Request Reports", "Dispatch Reports"].map((reportName) => (
                    <button
                      key={reportName}
                      onClick={() => handleDownloadReport(reportName)}
                      className="bg-slate-950 border border-slate-800 p-4 rounded-lg hover:bg-slate-800/80 hover:border-emerald-500/50 transition-all flex justify-between items-center group shadow-sm"
                    >
                      <span className="font-semibold text-sm tracking-wide group-hover:text-emerald-400 transition-colors">
                        {reportName}
                      </span>
                      <span className="bg-slate-900 p-2 rounded-md group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition-colors text-slate-400">
                        <Download size={16} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'ADMIN' ? (
          /* VIEW 7: ADMIN PANEL */
          <AdminPanel />
        ) : activeTab === 'COMPETENCY' ? (
          /* VIEW 8: COMPETENCY EXPIRY DATE */
          <CompetencyExpiryDate />
        ) : activeTab === 'HANDOVER' ? (
          /* VIEW 9: SHIFT HANDOVER NOTES */
          <ShiftHandoverNotes />
        ) : activeTab === 'ALERTS' ? (
          /* VIEW 11: EMERGENCY ALERTS */
          <EmergencyAlerts />
        ) : activeTab === 'EXCHANGE' ? (
          /* VIEW 12: SHIFT EXCHANGE DESK */
          <ShiftExchange />
        ) : activeTab === 'TRAINING' ? (
          /* VIEW 13: TRAINING DESK */
          <div className="space-y-4">
            <Training />
            <TrainingCertificationTracker />
          </div>
        ) : activeTab === 'ASSETS' ? (
          /* VIEW 14: ASSET RECONCILIATION */
          <AssetReconciliation />
        ) : activeTab === 'RAKE' ? (
          /* VIEW 15: TRAIN RAKE REGISTRY */
          <TrainRakeRegistry />
        ) : activeTab === 'LEAVE' ? (
          /* VIEW 16: LEAVE MANAGEMENT */
          <div className="space-y-6">
            {/* 1. GCC Control Panel (Only visible to Authorized staff) */}
            {(userProfile?.role === 'CREW_CONTROLLER' || userProfile?.role === 'ADMIN' || userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN_SS') && (
              <GCCControl onOpenWindow={(d) => console.log("Window Opened:", d)} />
            )}

            {/* 2. Leave Request Logic */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-amber-400 font-bold mb-2">Train Operator View</h4>
                <TORequestForm />
              </div>
              <div>
                <h4 className="text-cyan-400 font-bold mb-2">Management View</h4>
                <LeaveRequestManager userRole={userProfile?.role} />
              </div>
            </div>
          </div>
        ) : activeTab === 'MODULES' ? (
          /* VIEW 17: ALL LATEST MODULES DUMP FOR VERIFICATION */
          <div className="space-y-8 p-4 bg-slate-900 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-4">
              <h2 className="text-2xl font-black text-emerald-400 tracking-wider flex items-center gap-3">
                <Activity size={28} /> OCC SYSTEM MODULES SUITE
              </h2>
              <span className="bg-slate-800 text-slate-400 text-xs px-4 py-1.5 rounded-full font-bold shadow-inner">V 2.0 INTEGRATED</span>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* MODULE 1: DelayTracker */}
              <div className="border border-emerald-500/30 p-5 rounded-xl bg-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.1)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 bg-emerald-600/20 border-b border-l border-emerald-500/30 text-[9px] font-black tracking-widest px-3 py-1 rounded-bl-lg text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <span className="inline-block w-1.5 h-1.5 bg-emerald-400 rounded-full mr-1 animate-pulse"></span>
                  LIVE TRACKING
                </div>
                <h3 className="text-emerald-400 font-bold mb-4 flex items-center gap-2 border-b border-slate-800 pb-2 uppercase tracking-wider text-sm">
                  <Activity className="h-4 w-4" /> 1. Delay Tracker Module
                </h3>
                <DelayTracker />
              </div>

              {/* MODULE 2: ManualOverrideForm */}
              <div className="border border-amber-500/30 p-5 rounded-xl bg-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.1)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 bg-amber-600/20 border-b border-l border-amber-500/30 text-[9px] font-black tracking-widest px-3 py-1 rounded-bl-lg text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full mr-1 animate-pulse"></span>
                  OVERRIDE ACTIVE
                </div>
                <h3 className="text-amber-400 font-bold mb-4 flex items-center gap-2 border-b border-slate-800 pb-2 uppercase tracking-wider text-sm">
                  <AlertTriangle className="h-4 w-4" /> 2. Manual Override System
                </h3>
                <ManualOverrideForm />
              </div>

              {/* MODULE 3: TRAIN ID RE-ASSIGNMENT */}
              <div className="border border-purple-500/30 p-5 rounded-xl bg-slate-950 shadow-[0_0_15px_rgba(168,85,247,0.1)] relative overflow-hidden group">
                <div className="absolute top-0 right-0 bg-purple-600/20 border-b border-l border-purple-500/30 text-[9px] font-black tracking-widest px-3 py-1 rounded-bl-lg text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <span className="inline-block w-1.5 h-1.5 bg-purple-400 rounded-full mr-1 animate-pulse"></span>
                  SYNCING
                </div>
                <h3 className="text-purple-400 font-bold mb-4 flex items-center gap-2 border-b border-slate-800 pb-2 uppercase tracking-wider text-sm">
                  <Train className="h-4 w-4" /> 3. Train ID Re-Assignment
                </h3>
                <form onSubmit={handleTrainIdSwap} className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Original TID</label>
                      <input type="text" placeholder="e.g. T10" value={swapFromTid} onChange={(e) => setSwapFromTid(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-purple-500 focus:outline-none transition-colors" />
                    </div>
                    <div className="bg-slate-800 p-2.5 rounded-full mt-5 shadow-inner border border-slate-700">
                      <RefreshCw className="h-4 w-4 text-purple-400" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">New Target TID</label>
                      <input type="text" placeholder="e.g. T12" value={swapToTid} onChange={(e) => setSwapToTid(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-purple-500 focus:outline-none transition-colors" />
                    </div>
                  </div>
                  <button type="submit" disabled={!swapFromTid || !swapToTid} className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black py-3 rounded-lg text-xs tracking-widest uppercase transition-all shadow-lg shadow-purple-900/20 mt-2">
                    Re-Assign Train ID Configuration
                  </button>
                </form>
              </div>

              {/* MODULE 4: LIVE INCIDENT & TIMING VARIANCE LOG */}
              <div className="border border-rose-500/30 p-5 rounded-xl bg-slate-950 shadow-[0_0_15px_rgba(244,63,94,0.1)] relative overflow-hidden group xl:col-span-2">
                <div className="absolute top-0 right-0 bg-rose-600/20 border-b border-l border-rose-500/30 text-[9px] font-black tracking-widest px-3 py-1 rounded-bl-lg text-rose-400 group-hover:bg-rose-600 group-hover:text-white transition-colors">
                  <span className="inline-block w-1.5 h-1.5 bg-rose-400 rounded-full mr-1 animate-pulse"></span>
                  LIVE LOG
                </div>
                <h3 className="text-rose-400 font-bold mb-4 flex items-center gap-2 border-b border-slate-800 pb-2 uppercase tracking-wider text-sm">
                  <AlertTriangle className="h-4 w-4" /> 4. Live Incident & Variance Log
                </h3>
                <form onSubmit={handleIncidentLogSubmit} className="space-y-4">
                  <div className="flex flex-col xl:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Target Train ID</label>
                      <input type="text" placeholder="e.g. 207" value={targetTid} onChange={(e) => setTargetTid(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-rose-500 focus:outline-none transition-colors" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Delay (Minutes)</label>
                      <input type="number" placeholder="e.g. 5" value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-rose-500 focus:outline-none transition-colors" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Operational Cause</label>
                    <select value={incidentReason} onChange={(e) => setIncidentReason(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:border-rose-500 focus:outline-none transition-colors">
                      <option value="Signal Fluctuation">Signal Fluctuation</option>
                      <option value="Rolling Stock Defect">Rolling Stock Defect</option>
                      <option value="Passenger Door Interlock">Passenger Door Interlock</option>
                      <option value="Track Clearing Delay">Track Clearing Delay</option>
                    </select>
                  </div>
                  <button type="submit" disabled={!targetTid || !delayMinutes} className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-black py-3 rounded-lg text-xs tracking-widest uppercase transition-all shadow-lg shadow-rose-900/20 mt-2">
                    Propagate Downstream Delay
                  </button>
                </form>
              </div>

              {/* MODULE 5: MULTIMODAL GCC ROSTER INGEST */}
              <div className="xl:col-span-2">
                <GccRosterUploader />
              </div>

            </div>
          </div>
        ) : activeTab === 'EMERGENCY_RELIEF' ? (
          <EmergencyReliefEngine />
        ) : null}
      </main>
    </div>
  );
}
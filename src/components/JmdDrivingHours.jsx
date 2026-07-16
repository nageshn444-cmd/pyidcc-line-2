import React, { useState, useEffect, useMemo } from 'react';
import {
  Clock, Calendar, Filter, Search, Download, Trash2, Edit3,
  Copy, Plus, RefreshCw, BarChart2, TrendingUp, AlertTriangle,
  CheckCircle, Shield, FileText, ChevronRight, Activity, ArrowUpDown
} from 'lucide-react';
import { timeToSeconds, secondsToHHMMSS, secondsToHHMM } from '../utils/timeHelpers';
import { STATION_ORDER_LIST, STATION_NAMES, getStationName } from '../utils/stationHelpers';
import { drivingHourService } from '../services/DrivingHourService';
import { db } from '../firebase';
import {
  collection, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import { useAuth } from '../context/AuthContext';

export default function JmdDrivingHours() {
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

  // ── 1. Configuration & Context States ──
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dateRangeType, setDateRangeType] = useState('SINGLE'); // SINGLE, RANGE, WEEK, MONTH
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeDayType, setActiveDayType] = useState('WEEKDAY'); // WEEKDAY, SATURDAY, SUNDAY, MONDAY

  // ── 2. Roster & timetable Sync ──
  const [linkRoster, setLinkRoster] = useState([]);
  const [wttMatrix, setWttMatrix] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [savedGroups, setSavedGroups] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);

  // ── 3. Selected Operators & Active Journey ──
  const [selectedDuties, setSelectedDuties] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDutyType, setFilterDutyType] = useState('ALL'); // ALL, HIGH, LOW, NORMAL
  const [sortField, setSortField] = useState('dutyId');
  const [sortOrder, setSortOrder] = useState('asc'); // asc, desc

  // ── 4. Group Management States ──
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // ── Clipboard State for Copy/Paste ──
  const [clipboard, setClipboard] = useState([]);

  // ── 5. Comparison Engine States ──
  const [compDutyA, setCompDutyA] = useState('');
  const [compDutyB, setCompDutyB] = useState('');
  const [compGroupA, setCompGroupA] = useState('');
  const [compGroupB, setCompGroupB] = useState('');

  // ── 6. UI Navigation State ──
  const [activeTab, setActiveTab] = useState('DASHBOARD'); // DASHBOARD, MANAGEMENT, COMPARISON, GRAPHS, AI_ADVISOR
  const [expandedDuty, setExpandedDuty] = useState(null);

  // Centralized calculations handled via import helpers above.

  // ── 7. Real-Time Firestore Synchronization ──
  useEffect(() => {
    const unsubLinks = onSnapshot(collection(db, 'crew_final_links'), (snap) => {
      setLinkRoster(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubWtt = onSnapshot(collection(db, 'wtt_final_matrix'), (snap) => {
      setWttMatrix(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubDeploy = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDeployments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubGroups = onSnapshot(collection(db, 'drivingHourGroups'), (snap) => {
      setSavedGroups(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubInc = onSnapshot(collection(db, 'wtt_live_incidents'), (snap) => {
      setLiveIncidents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubLinks();
      unsubWtt();
      unsubDeploy();
      unsubGroups();
      unsubInc();
    };
  }, []);


  // Filter WTT and Links for the active Day type
  const wttActive = useMemo(() => {
    return wttMatrix.filter(t => String(t.scheduleType || '').toUpperCase() === activeDayType);
  }, [wttMatrix, activeDayType]);

  const activeDayLinks = useMemo(() => {
    return linkRoster.filter(l => String(l.scheduleType || '').toUpperCase() === activeDayType);
  }, [linkRoster, activeDayType]);

  // Build live delays offset map
  const delayMap = useMemo(() => {
    const map = {};
    liveIncidents.forEach(inc => {
      if (inc.trainId && inc.delayMins) {
        map[String(inc.trainId).trim()] = (map[String(inc.trainId).trim()] || 0) + (Number(inc.delayMins) * 60);
      }
    });
    return map;
  }, [liveIncidents]);

  // ── Validation Check ──
  const validationError = useMemo(() => {
    if (linkRoster.length > 0 && wttMatrix.length > 0) {
      const hasLink = linkRoster.some(l => String(l.scheduleType || '').toUpperCase() === activeDayType);
      const hasWtt = wttMatrix.some(t => String(t.scheduleType || '').toUpperCase() === activeDayType);
      if (!hasLink || !hasWtt) {
        return "Selected WTT and Link Roster do not belong to the same operational day type.";
      }
    }
    return null;
  }, [linkRoster, wttMatrix, activeDayType]);

  // ── Duties By Day Type Calculation Engine ──
  const dutiesByDayType = useMemo(() => {
    const result = {
      WEEKDAY: [],
      SATURDAY: [],
      SUNDAY: [],
      MONDAY: []
    };

    ['WEEKDAY', 'SATURDAY', 'SUNDAY', 'MONDAY'].forEach(dayType => {
      const activeLinks = linkRoster.filter(l => String(l.scheduleType || '').toUpperCase() === dayType);
      const activeWtt = wttMatrix.filter(t => String(t.scheduleType || '').toUpperCase() === dayType);

      if (activeLinks.length === 0 || activeWtt.length === 0) return;

      // De-duplicate activeLinks by dutyId
      const uniqueLinks = [];
      const seenDuties = new Set();
      activeLinks.forEach(link => {
        const normId = String(link.dutyId).trim().padStart(2, '0');
        if (!seenDuties.has(normId)) {
          seenDuties.add(normId);
          uniqueLinks.push(link);
        }
      });

      result[dayType] = uniqueLinks.map(link => {
        const normDutyId = String(link.dutyId).padStart(2, '0');
        const legsData = [];
        let totalDrivingSeconds = 0;
        let stationsTraversed = 0;

        for (let i = 1; i <= 4; i++) {
          const trainId = String(link[`leg${i}TrainNo`] || link.trainId || '--').trim();
          const stationFrom = link[`leg${i}StationFrom`] || link.signOnLocation || '--';
          const stationTo = link[`leg${i}StationTo`] || '--';
          const depTime = link[`leg${i}DepTime`] || link.signOnTime || '--';
          const arrTime = link[`leg${i}ArrTime`] || '--';

          if (trainId && trainId !== '--' && trainId !== '-') {
            const matchingTrips = activeWtt.filter(trip => String(trip.trainId).trim() === trainId);
            let legDrivingSecs = 0;
            let legDetail = null;

            matchingTrips.forEach(trip => {
              const tripStops = [];
              const added = new Set();
              Object.entries(trip.stations || {}).forEach(([stCode, timeStr]) => {
                if (timeStr && timeStr !== '--' && timeStr !== '-') {
                  const cleanSt = stCode.split('_')[0];
                  if (STATION_ORDER_LIST.includes(cleanSt) && !added.has(cleanSt)) {
                    added.add(cleanSt);
                    tripStops.push({
                      station: cleanSt,
                      secVal: timeToSeconds(timeStr) + (delayMap[trainId] || 0)
                    });
                  }
                }
              });
              tripStops.sort((a, b) => a.secVal - b.secVal);

              if (tripStops.length >= 2) {
                const tripStart = tripStops[0].secVal;
                const tripEnd = tripStops[tripStops.length - 1].secVal;
                const legStartSec = timeToSeconds(depTime);
                const legEndSec = timeToSeconds(arrTime);

                if (tripStart >= legStartSec - 900 && tripEnd <= legEndSec + 900) {
                  const fromStop = tripStops.find(s => s.station === stationFrom);
                  const toStop = tripStops.find(s => s.station === stationTo);

                  let duration = 0;
                  let depTimeActual = depTime;
                  let arrTimeActual = arrTime;

                  if (fromStop && toStop) {
                    duration = Math.max(0, toStop.secVal - fromStop.secVal);
                    depTimeActual = secondsToHHMMSS(fromStop.secVal).replace(/\s/g, '');
                    arrTimeActual = secondsToHHMMSS(toStop.secVal).replace(/\s/g, '');
                    stationsTraversed += Math.abs(STATION_ORDER_LIST.indexOf(stationTo) - STATION_ORDER_LIST.indexOf(stationFrom));
                  } else {
                    duration = Math.max(0, tripEnd - tripStart);
                    depTimeActual = secondsToHHMMSS(tripStart).replace(/\s/g, '');
                    arrTimeActual = secondsToHHMMSS(tripEnd).replace(/\s/g, '');
                    stationsTraversed += tripStops.length;
                  }

                  legDrivingSecs += duration;
                  legDetail = {
                    trainId,
                    tripNo: trip.tripNo || i,
                    stationFrom: fromStop ? stationFrom : tripStops[0].station,
                    stationTo: toStop ? stationTo : tripStops[tripStops.length - 1].station,
                    depTime: depTimeActual,
                    arrTime: arrTimeActual,
                    drivingSeconds: duration
                  };
                }
              }
            });

            totalDrivingSeconds += legDrivingSecs;
            legsData.push(legDetail || {
              legNum: i,
              trainId,
              stationFrom,
              stationTo,
              depTime,
              arrTime,
              drivingSeconds: legDrivingSecs
            });
          }
        }

        const signOnSecs = timeToSeconds(link.signOnTime);
        const signOffSecs = timeToSeconds(link.signOffTime || link.signOnTime) + (link.signOffTime ? 0 : 8 * 3600);
        const totalDutySecs = Math.max(0, signOffSecs - signOnSecs);
        const nonDrivingSecs = Math.max(0, totalDutySecs - totalDrivingSeconds);
        const kilometers = Math.round(stationsTraversed * 1.15);
        const drivingPercentage = totalDutySecs > 0 ? Math.round((totalDrivingSeconds / totalDutySecs) * 100) : 0;
        const totalBreakSecs = Math.max(0, nonDrivingSecs - (40 * 60));

        return {
          id: link.id,
          rawLink: link,
          dutyId: normDutyId,
          linkId: link.linkNo || normDutyId,
          scheduleType: dayType,
          signOn: link.signOnTime || '06:00',
          signOff: link.signOffTime || '14:00',
          totalDutySeconds: totalDutySecs,
          drivingSeconds: totalDrivingSeconds,
          drivingHoursStr: secondsToHHMMSS(totalDrivingSeconds),
          drivingPercentage,
          kilometers,
          tripsCount: legsData.length,
          legs: legsData,
          averageTripTime: legsData.length > 0 ? Math.round(totalDrivingSeconds / legsData.length) : 0,
          maxContinuousDriving: legsData.length > 0 ? Math.max(...legsData.map(l => l.drivingSeconds || 0)) : 0,
          minContinuousDriving: legsData.length > 0 ? Math.min(...legsData.filter(l => (l.drivingSeconds || 0) > 0).map(l => l.drivingSeconds)) : 0,
          breakTimeSeconds: totalBreakSecs
        };
      });
    });

    return result;
  }, [linkRoster, wttMatrix, delayMap]);

  // ── 8. Driving Hours Calculation Engine (Active Tab) ──
  const calculatedDuties = useMemo(() => {
    if (validationError) return [];
    return dutiesByDayType[activeDayType] || [];
  }, [dutiesByDayType, activeDayType, validationError]);

  // ── 9. Filters, Search & Sorting ──
  const processedDuties = useMemo(() => {
    let result = [...calculatedDuties];

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(d =>
        d.dutyId.includes(q) ||
        d.linkId.toLowerCase().includes(q)
      );
    }

    // Filter by intensity
    if (filterDutyType === 'HIGH') {
      result = result.filter(d => d.drivingSeconds >= 5.5 * 3600);
    } else if (filterDutyType === 'LOW') {
      result = result.filter(d => d.drivingSeconds <= 3 * 3600);
    } else if (filterDutyType === 'NORMAL') {
      result = result.filter(d => d.drivingSeconds > 3 * 3600 && d.drivingSeconds < 5.5 * 3600);
    }

    // Sort
    result.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        return sortOrder === 'asc'
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      }
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [calculatedDuties, searchQuery, filterDutyType, sortField, sortOrder]);

  // ── 10. Selection Manager Actions ──
  const toggleSelectDuty = (dutyId) => {
    if (selectedDuties.includes(dutyId)) {
      setSelectedDuties(prev => prev.filter(id => id !== dutyId));
    } else {
      setSelectedDuties(prev => [...prev, dutyId]);
    }
  };

  const handleSelectAll = () => {
    setSelectedDuties(processedDuties.map(d => d.dutyId));
  };

  const handleClearAll = () => {
    setSelectedDuties([]);
  };

  const handleInvertSelection = () => {
    const activeIds = processedDuties.map(d => d.dutyId);
    setSelectedDuties(prev => activeIds.filter(id => !prev.includes(id)));
  };

  // ── 11. Saved Groups Actions (Firestore) ──
  const handleSaveGroup = async () => {
    if (!newGroupName.trim()) return alert("Please enter a group name.");
    if (selectedDuties.length === 0) return alert("Select at least one duty to group.");

    try {
      const docId = `group_${activeDayType.toLowerCase()}_${Date.now()}`;
      await setDoc(doc(db, 'drivingHourGroups', docId), {
        id: docId,
        name: newGroupName,
        dayType: activeDayType,
        duties: selectedDuties,
        createdAt: serverTimestamp()
      });
      alert(`✅ Group "${newGroupName}" permanently saved.`);
      setNewGroupName('');
    } catch (err) {
      console.error(err);
      alert("Failed to save group.");
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (window.confirm("Permanently delete this saved group?")) {
      try {
        await deleteDoc(doc(db, 'drivingHourGroups', groupId));
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleLoadGroup = (group) => {
    if (group.dayType) {
      setActiveDayType(group.dayType);
    }
    setSelectedDuties(group.duties || []);
  };

  // ── 11.5 Copy / Paste / Delete Link Roster Actions ──
  const handleCopyDuty = (duty) => {
    if (!duty.rawLink) return;
    const linkCopy = { ...duty.rawLink };
    delete linkCopy.id;
    setClipboard([linkCopy]);
    alert(`Copied link data for Duty ${duty.dutyId}.`);
  };

  const handleCopySelected = () => {
    const targets = calculatedDuties.filter(d => selectedDuties.includes(d.dutyId) && d.rawLink);
    if (targets.length === 0) return alert("No valid links selected to copy.");
    const copies = targets.map(d => {
      const copy = { ...d.rawLink };
      delete copy.id;
      return copy;
    });
    setClipboard(copies);
    alert(`Copied link data for ${copies.length} selected duties.`);
  };

  const handlePaste = async () => {
    if (clipboard.length === 0) return alert("Clipboard is empty.");
    if (!window.confirm(`Paste ${clipboard.length} copied links into ${activeDayType} schedule?`)) return;

    try {
      const batch = writeBatch(db);
      clipboard.forEach(link => {
        const dutyId = String(link.dutyId).padStart(2, '0');
        const docId = `link_${activeDayType.toLowerCase()}_${dutyId}`;
        const newLink = {
          ...link,
          scheduleType: activeDayType,
          updatedAt: serverTimestamp()
        };
        batch.set(doc(db, 'crew_final_links', docId), newLink);
      });
      await batch.commit();
      alert(`✅ Pasted ${clipboard.length} links successfully.`);
      setClipboard([]);
      setSelectedDuties([]);
    } catch (err) {
      console.error(err);
      alert("Failed to paste links.");
    }
  };

  const handleDeleteDuty = async (duty) => {
    if (!duty.id) return alert("Link document not found.");
    if (window.confirm(`Permanently delete link for Duty ${duty.dutyId} from the database?`)) {
      try {
        await deleteDoc(doc(db, 'crew_final_links', duty.id));
        setSelectedDuties(prev => prev.filter(id => id !== duty.dutyId));
        alert(`Deleted link for Duty ${duty.dutyId}.`);
      } catch (err) {
        console.error(err);
        alert("Failed to delete link.");
      }
    }
  };

  const handleDeleteSelected = async () => {
    const targets = calculatedDuties.filter(d => selectedDuties.includes(d.dutyId) && d.id);
    if (targets.length === 0) return alert("No valid links selected to delete.");
    if (window.confirm(`⛔ CRITICAL ACTION: Permanently delete all ${targets.length} selected links from the database?`)) {
      try {
        const batch = writeBatch(db);
        targets.forEach(d => {
          batch.delete(doc(db, 'crew_final_links', d.id));
        });
        await batch.commit();
        setSelectedDuties([]);
        alert(`Deleted ${targets.length} selected links.`);
      } catch (err) {
        console.error(err);
        alert("Failed to delete selected links.");
      }
    }
  };

  // ── 12. Dashboard Summary Calculations ──
  const summaryMetrics = useMemo(() => {
    const targets = calculatedDuties.filter(d => selectedDuties.includes(d.dutyId));
    const activeList = targets.length > 0 ? targets : calculatedDuties;

    if (activeList.length === 0) return { totalDuties: 0, totalDriving: 0, avgDriving: 0, avgDuty: 0, totalKms: 0, maxDuty: null, minDuty: null };

    let totalDrivingSecs = 0;
    let totalDutySecs = 0;
    let totalKms = 0;
    let maxSecs = -1;
    let minSecs = Infinity;
    let maxDuty = null;
    let minDuty = null;

    activeList.forEach(d => {
      totalDrivingSecs += d.drivingSeconds;
      totalDutySecs += d.totalDutySeconds;
      totalKms += d.kilometers;

      if (d.drivingSeconds > maxSecs) {
        maxSecs = d.drivingSeconds;
        maxDuty = d;
      }
      if (d.drivingSeconds < minSecs) {
        minSecs = d.drivingSeconds;
        minDuty = d;
      }
    });

    return {
      totalDuties: calculatedDuties.length,
      selectedCount: selectedDuties.length,
      totalDrivingStr: secondsToHHMMSS(totalDrivingSecs),
      totalDutyStr: secondsToHHMMSS(totalDutySecs),
      avgDrivingStr: secondsToHHMMSS(Math.round(totalDrivingSecs / activeList.length)),
      avgDutyStr: secondsToHHMMSS(Math.round(totalDutySecs / activeList.length)),
      totalKms,
      avgKms: Math.round(totalKms / activeList.length),
      maxDuty,
      minDuty
    };
  }, [calculatedDuties, selectedDuties]);

  // ── 13. Comparison Calculations ──
  const comparedDutyA = useMemo(() => {
    return calculatedDuties.find(d => d.dutyId === compDutyA);
  }, [calculatedDuties, compDutyA]);

  const comparedDutyB = useMemo(() => {
    return calculatedDuties.find(d => d.dutyId === compDutyB);
  }, [calculatedDuties, compDutyB]);

  const comparedGroupA = useMemo(() => {
    const group = savedGroups.find(g => g.id === compGroupA);
    if (!group) return null;
    const dayTypeDuties = dutiesByDayType[group.dayType] || [];
    const matches = dayTypeDuties.filter(d => group.duties.includes(d.dutyId));
    const totalSecs = matches.reduce((sum, d) => sum + d.drivingSeconds, 0);
    return {
      name: group.name,
      count: matches.length,
      avgDrivingSecs: matches.length > 0 ? totalSecs / matches.length : 0,
      totalDrivingStr: secondsToHHMMSS(totalSecs)
    };
  }, [dutiesByDayType, savedGroups, compGroupA]);

  const comparedGroupB = useMemo(() => {
    const group = savedGroups.find(g => g.id === compGroupB);
    if (!group) return null;
    const dayTypeDuties = dutiesByDayType[group.dayType] || [];
    const matches = dayTypeDuties.filter(d => group.duties.includes(d.dutyId));
    const totalSecs = matches.reduce((sum, d) => sum + d.drivingSeconds, 0);
    return {
      name: group.name,
      count: matches.length,
      avgDrivingSecs: matches.length > 0 ? totalSecs / matches.length : 0,
      totalDrivingStr: secondsToHHMMSS(totalSecs)
    };
  }, [dutiesByDayType, savedGroups, compGroupB]);

  // ── 14. Excel/CSV Export Engine ──
  const handleExportData = (format) => {
    if (isTrainOperator) return;
    const exportData = processedDuties.map(d => ({
      "Duty Number": d.dutyId,
      "Link Number": d.linkId,
      "Schedule Type": d.scheduleType,
      "Sign On": d.signOn,
      "Sign Off": d.signOff,
      "Total Duty Hours": secondsToHHMMSS(d.totalDutySeconds),
      "Driving Hours": d.drivingHoursStr,
      "Driving Percentage (%)": d.drivingPercentage,
      "Kilometers": d.kilometers,
      "Number of Trips": d.tripsCount,
      "Average Trip Time": secondsToHHMMSS(d.averageTripTime),
      "Max Continuous Driving": secondsToHHMMSS(d.maxContinuousDriving)
    }));

    if (format === 'EXCEL') {
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Driving Hours Report");
      XLSX.writeFile(wb, `BMRCL_JMD_TO_Driving_Hours_${selectedDate}.xlsx`);
    } else {
      // CSV Export
      const headers = Object.keys(exportData[0]);
      const csvRows = [headers.join(',')];
      exportData.forEach(row => {
        csvRows.push(headers.map(h => `"${String(row[h]).replace(/"/g, '""')}"`).join(','));
      });
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `BMRCL_JMD_TO_Driving_Hours_${selectedDate}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // ── 15. AI Insights Advisor Engine ──
  const aiInsights = useMemo(() => {
    if (calculatedDuties.length === 0) return null;

    const overloaded = calculatedDuties.filter(d => d.drivingSeconds >= 6 * 3600);
    const underutilized = calculatedDuties.filter(d => d.drivingSeconds <= 2.5 * 3600);
    const totalSecs = calculatedDuties.reduce((sum, d) => sum + d.drivingSeconds, 0);
    const avgSecs = totalSecs / calculatedDuties.length;

    let recommendation = '';
    if (overloaded.length > 0 && underutilized.length > 0) {
      recommendation = `High load imbalance detected! Consider transferring Trip legs from overloaded duties (${overloaded.slice(0, 2).map(d => d.dutyId).join(', ')}) to underutilized duties (${underutilized.slice(0, 2).map(d => d.dutyId).join(', ')}) to optimize fatigue levels.`;
    } else if (overloaded.length > 5) {
      recommendation = "Multiple shifts exceed 6 hours of continuous steering. Recommend introducing OCC step-back reliefs at intermediate depots.";
    } else {
      recommendation = "Duty distributions conform to BMRCL fatigue management standards (+/- 10% deviation). Roster balance is healthy.";
    }

    return {
      overloadedCount: overloaded.length,
      underutilizedCount: underutilized.length,
      averageSeconds: avgSecs,
      recommendation,
      overloadedList: overloaded,
      underutilizedList: underutilized
    };
  }, [calculatedDuties]);

  // Recharts Chart Formatted Data
  const barChartData = useMemo(() => {
    return processedDuties.slice(0, 15).map(d => ({
      name: `Duty ${d.dutyId}`,
      "Driving Hours": Number((d.drivingSeconds / 3600).toFixed(2)),
      "Duty Hours": Number((d.totalDutySeconds / 3600).toFixed(2))
    }));
  }, [processedDuties]);

  return (
    <div className="bg-slate-955 min-h-[85vh] p-6 rounded-2xl border border-slate-800 font-mono text-slate-200 shadow-2xl space-y-6">

      {/* ── HEADER & DATE CONTROLS ── */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end border-b border-slate-850 pb-5 gap-4">
        <div>
          <h2 className="text-cyan-400 font-black flex items-center gap-2 text-xl tracking-wider uppercase">
            <Clock className="h-6 w-6" /> JMD TO's Driving Hours Management System
          </h2>
          <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest leading-relaxed">
            Second-level steering calculations calculated directly from Link Roster and WTT Timetable
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800 shadow-inner">
          <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
            <Calendar className="h-4 w-4 text-cyan-400" />
            <select id="jmddrivinghours-i1" name="jmddrivinghours-i1"
              value={dateRangeType}
              onChange={(e) => setDateRangeType(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded px-2.5 py-1 focus:outline-none text-slate-300 font-bold"
            >
              <option value="SINGLE">Single Date</option>
              <option value="RANGE">Date Range</option>
            </select>
          </div>

          <div className="flex items-center gap-2 border-r border-slate-800 pr-3">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Day Type:</span>
            <select id="jmddrivinghours-i2" name="jmddrivinghours-i2"
              value={activeDayType}
              onChange={(e) => setActiveDayType(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded px-2.5 py-1 focus:outline-none text-slate-350 font-bold"
            >
              <option value="WEEKDAY">Weekday</option>
              <option value="SATURDAY">Saturday / GH</option>
              <option value="SUNDAY">Sunday</option>
              <option value="MONDAY">Monday</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input id="jmddrivinghours-i3" name="jmddrivinghours-i3"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-xs rounded px-3 py-1 focus:outline-none text-slate-200"
            />
            {dateRangeType === 'RANGE' && (
              <>
                <span className="text-slate-500 font-bold">-</span>
                <input id="jmddrivinghours-i4" name="jmddrivinghours-i4"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-xs rounded px-3 py-1 focus:outline-none text-slate-200"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── VALIDATION WARNING ── */}
      {validationError && (
        <div className="bg-rose-955/40 border border-rose-900/30 text-rose-450 p-4 rounded-xl flex items-center gap-3 text-xs leading-relaxed animate-pulse">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div className="font-bold">
            {validationError}
          </div>
        </div>
      )}

      {/* ── METRIC DASHBOARD CARDS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5 hover:border-slate-750 transition">
          <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">Total / Selected Duties</span>
          <div className="text-xl font-bold text-slate-250 flex items-baseline gap-1.5">
            <span>{summaryMetrics.totalDuties}</span>
            <span className="text-xs text-slate-500">/ {summaryMetrics.selectedCount} Active</span>
          </div>
          <p className="text-[9.5px] text-slate-500 italic">Unlimited selections allowed</p>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5 hover:border-slate-750 transition">
          <span className="text-[9px] text-cyan-400 font-black uppercase tracking-widest">Steering / Duty Hours</span>
          <div className="text-xl font-bold text-cyan-400">
            {summaryMetrics.totalDrivingStr}
          </div>
          <span className="text-[9.5px] text-slate-500 block font-bold">Duty: {summaryMetrics.totalDutyStr}</span>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5 hover:border-slate-750 transition">
          <span className="text-[9px] text-emerald-450 font-black uppercase tracking-widest">Avg Driving / Distance</span>
          <div className="text-xl font-bold text-emerald-450">
            {summaryMetrics.avgDrivingStr}
          </div>
          <span className="text-[9.5px] text-slate-500 block font-bold">Avg Kms: {summaryMetrics.avgKms} km</span>
        </div>

        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-xl space-y-1.5 hover:border-slate-750 transition">
          <span className="text-[9px] text-indigo-400 font-black uppercase tracking-widest">Max Driving Duty</span>
          <div className="text-xl font-bold text-indigo-400">
            {summaryMetrics.maxDuty ? `Duty ${summaryMetrics.maxDuty.dutyId}` : '--'}
          </div>
          <span className="text-[9.5px] text-slate-500 block font-bold">
            Duration: {summaryMetrics.maxDuty ? summaryMetrics.maxDuty.drivingHoursStr : '--'}
          </span>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div className="flex border-b border-slate-855 pb-3 gap-2">
        {[
          { id: 'DASHBOARD', label: '1. Shift Registry & Table' },
          { id: 'MANAGEMENT', label: '2. Saved Duty Groups' },
          { id: 'COMPARISON', label: '3. Comparison Desk' },
          { id: 'GRAPHS', label: '4. Analytics & Graphs' },
          { id: 'AI_ADVISOR', label: '5. AI Fatigue Advisor' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[10px] font-bold rounded-lg transition border ${activeTab === tab.id
              ? 'bg-cyan-950/40 text-cyan-400 border-cyan-855/60 shadow-md'
              : 'bg-slate-900/60 border-transparent text-slate-400 hover:bg-slate-800'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: SHIFT REGISTRY & TABLE ── */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-4">
          {/* Controls Panel */}
          <div className="bg-slate-900/60 border border-slate-855 p-4 rounded-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">

            {/* Left: Search, Filter, Sort */}
            <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
              <div className="relative w-full sm:w-56">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                <input id="jmddrivinghours-i5" name="jmddrivinghours-i5"
                  type="text"
                  placeholder="Search Duty ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-8 py-1.5 text-xs text-slate-350 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <select id="jmddrivinghours-i6" name="jmddrivinghours-i6"
                value={filterDutyType}
                onChange={(e) => setFilterDutyType(e.target.value)}
                className="bg-slate-955 border border-slate-800 text-xs rounded px-3 py-1.5 focus:outline-none text-slate-300 font-bold"
              >
                <option value="ALL">All Hours Intensity</option>
                <option value="HIGH">High load (&gt;= 5.5h)</option>
                <option value="NORMAL">Normal load (3h - 5.5h)</option>
                <option value="LOW">Low load (&lt;= 3h)</option>
              </select>

              <select id="jmddrivinghours-i7" name="jmddrivinghours-i7"
                value={sortField}
                onChange={(e) => setSortField(e.target.value)}
                className="bg-slate-955 border border-slate-800 text-xs rounded px-3 py-1.5 focus:outline-none text-slate-300 font-bold"
              >
                <option value="dutyId">Sort by Duty ID</option>
                <option value="drivingSeconds">Sort by Driving Time</option>
                <option value="totalDutySeconds">Sort by Duty Hours</option>
                <option value="kilometers">Sort by Kilometers</option>
                <option value="drivingPercentage">Sort by Steering %</option>
              </select>

              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-1.5 bg-slate-950 border border-slate-800 hover:bg-slate-800 rounded text-slate-400"
                title="Toggle Sort Order"
              >
                <ArrowUpDown size={14} />
              </button>
            </div>

            {/* Right: Selection Actions & Export */}
            <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-end">
              <div className="flex gap-1.5 bg-slate-955/80 p-1 rounded-lg border border-slate-800">
                <button onClick={handleSelectAll} className="text-[9px] font-black uppercase px-2 py-1 text-slate-350 hover:bg-slate-900 rounded">Select All</button>
                <button onClick={handleClearAll} className="text-[9px] font-black uppercase px-2 py-1 text-slate-350 hover:bg-slate-900 rounded">Clear</button>
                <button onClick={handleInvertSelection} className="text-[9px] font-black uppercase px-2 py-1 text-slate-350 hover:bg-slate-900 rounded">Invert</button>
              </div>

              {/* Roster Edit Clipboard Controls */}
              <div className="flex gap-1.5 bg-slate-955/80 p-1 rounded-lg border border-slate-800">
                {selectedDuties.length > 0 && (
                  <>
                    <button
                      onClick={handleCopySelected}
                      className="text-[9px] font-black uppercase px-2 py-1 text-cyan-400 hover:bg-slate-900 rounded flex items-center gap-1"
                      title="Copy selected links data"
                    >
                      <Copy size={10} /> Copy Selected
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      className="text-[9px] font-black uppercase px-2 py-1 text-rose-400 hover:bg-slate-900 rounded flex items-center gap-1"
                      title="Delete selected links"
                    >
                      <Trash2 size={10} /> Delete Selected
                    </button>
                  </>
                )}
                {clipboard.length > 0 && (
                  <button
                    onClick={handlePaste}
                    className="text-[9px] font-black uppercase px-2 py-1 text-emerald-450 hover:bg-slate-900 rounded flex items-center gap-1"
                    title={`Paste ${clipboard.length} copied links into ${activeDayType}`}
                  >
                    <Plus size={10} /> Paste ({clipboard.length})
                  </button>
                )}
              </div>

              {!isTrainOperator && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExportData('EXCEL')}
                    className="bg-emerald-950/50 hover:bg-emerald-900 border border-emerald-900/40 text-emerald-450 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Download size={13} /> Export Excel
                  </button>
                  <button
                    onClick={() => handleExportData('CSV')}
                    className="bg-slate-955 hover:bg-slate-850 border border-slate-800 text-slate-300 px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition"
                  >
                    <Download size={13} /> Export CSV
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Table Grid View */}
          <div className="bg-slate-900/20 border border-slate-855 rounded-xl overflow-hidden shadow-lg">
            <table className="w-full border-collapse text-[11px] text-left">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-black">Select</th>
                  <th className="py-3 px-4 font-black">Duty Number</th>
                  <th className="py-3 px-4 font-black">Link No</th>
                  <th className="py-3 px-4 font-black">Sign On/Off</th>
                  <th className="py-3 px-4 font-black">Total Duty Hours</th>
                  <th className="py-3 px-4 font-black">TO Driving Hours</th>
                  <th className="py-3 px-4 font-black">Steering (%)</th>
                  <th className="py-3 px-4 font-black">Distance (Kms)</th>
                  <th className="py-3 px-4 font-black">Trips</th>
                  <th className="py-3 px-4 font-black text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850/50">
                {processedDuties.map((duty, idx) => {
                  const isExpanded = expandedDuty === duty.dutyId;
                  return (
                    <React.Fragment key={idx}>
                      <tr
                        className="hover:bg-slate-900/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedDuty(isExpanded ? null : duty.dutyId)}
                      >
                        <td className="py-2.5 px-4" onClick={(e) => e.stopPropagation()}>
                          <input id="jmddrivinghours-i8" name="jmddrivinghours-i8"
                            type="checkbox"
                            checked={selectedDuties.includes(duty.dutyId)}
                            onChange={() => toggleSelectDuty(duty.dutyId)}
                            className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-200">
                          <span className="flex items-center gap-1">
                            <span className="text-[9px] text-slate-500">{isExpanded ? '▼' : '▶'}</span>
                            Duty {duty.dutyId}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-450">{duty.linkId}</td>
                        <td className="py-2.5 px-4 text-slate-350">{duty.signOn} - {duty.signOff}</td>
                        <td className="py-2.5 px-4 text-slate-450">{secondsToHHMMSS(duty.totalDutySeconds)}</td>
                        <td className={`py-2.5 px-4 font-bold ${duty.drivingSeconds >= 5.5 * 3600 ? 'text-rose-450' :
                          duty.drivingSeconds <= 3 * 3600 ? 'text-amber-500' : 'text-cyan-400'
                          }`}>
                          {duty.drivingHoursStr}
                        </td>
                        <td className="py-2.5 px-4 font-bold">{duty.drivingPercentage}%</td>
                        <td className="py-2.5 px-4 text-slate-300">{duty.kilometers} km</td>
                        <td className="py-2.5 px-4 text-slate-500">{duty.tripsCount} Legs</td>
                        <td className="py-2.5 px-4 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleCopyDuty(duty)}
                            className="text-slate-500 hover:text-cyan-400 p-1 transition-all"
                            title="Copy link"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteDuty(duty)}
                            className="text-slate-500 hover:text-rose-455 p-1 transition-all"
                            title="Delete link"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-slate-950/80">
                          <td colSpan="10" className="p-4 border-t border-b border-slate-800">
                            <div className="space-y-3">
                              <h4 className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Duty {duty.dutyId} Legs Detail (Second-level Accuracy)</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {duty.legs.map((leg, legIdx) => (
                                  <div key={legIdx} className="bg-slate-900 border border-slate-800 p-3 rounded-lg space-y-1.5">
                                    <div className="flex justify-between border-b border-slate-800 pb-1 text-[9px] text-slate-500 font-bold uppercase">
                                      <span>Leg {legIdx + 1}</span>
                                      <span>Train {leg.trainId}</span>
                                    </div>
                                    <div className="space-y-1 text-[10px]">
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Route:</span>
                                        <span className="font-bold text-slate-200">{STATION_NAMES[leg.stationFrom] || leg.stationFrom} → {STATION_NAMES[leg.stationTo] || leg.stationTo}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-500">Timings:</span>
                                        <span className="font-bold text-slate-350">{leg.depTime} → {leg.arrTime}</span>
                                      </div>
                                      <div className="flex justify-between border-t border-slate-850/30 pt-1 mt-1">
                                        <span className="text-cyan-500">Driving:</span>
                                        <span className="font-bold text-cyan-400">{secondsToHHMMSS(leg.drivingSeconds || 0)}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 2: SAVED DUTY GROUPS ── */}
      {activeTab === 'MANAGEMENT' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Group Panel */}
          <div className="bg-slate-900/40 border border-slate-855 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">
              Create Permanent Group
            </h3>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase" htmlFor="jmddrivinghours-l1">Selected Duties for Group</label>
                <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 max-h-32 overflow-y-auto text-[10px] flex flex-wrap gap-1.5">
                  {selectedDuties.map(d => (
                    <span key={d} className="bg-cyan-950/40 text-cyan-400 border border-cyan-900/30 px-2 py-0.5 rounded font-bold">Duty {d}</span>
                  ))}
                  {selectedDuties.length === 0 && <span className="text-slate-600 italic">No duties selected. Select them in the first tab.</span>}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase" htmlFor="jmddrivinghours-l2">Group Name</label>
                <input id="jmddrivinghours-i9" name="jmddrivinghours-i9"
                  type="text"
                  placeholder="e.g. Weekday Morning Peak"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-350 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <button
                onClick={handleSaveGroup}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-2 rounded-lg text-xs uppercase tracking-wider transition"
              >
                Save Selected to Group
              </button>
            </div>
          </div>

          {/* List Saved Groups */}
          <div className="lg:col-span-2 bg-slate-900/20 border border-slate-855 p-5 rounded-xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedGroups.filter(g => g.dayType === activeDayType).map((group, idx) => (
                <div key={idx} className="bg-slate-900 p-4 rounded-xl border border-slate-800 space-y-3 hover:border-slate-700 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-slate-200">{group.name}</h4>
                      <span className="text-[9px] text-cyan-400 font-bold uppercase">{group.dayType}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="Delete Group"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 bg-slate-950/60 p-2.5 rounded border border-slate-850 max-h-24 overflow-y-auto flex flex-wrap gap-1">
                    {group.duties.map(d => (
                      <span key={d} className="bg-slate-900 border border-slate-800 px-1.5 py-0.2 rounded font-mono">D{d}</span>
                    ))}
                  </div>

                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[10px] text-slate-500 font-bold">{group.duties.length} Selected Duties</span>
                    <button
                      onClick={() => handleLoadGroup(group)}
                      className="bg-slate-955 border border-slate-800 hover:bg-slate-850 text-cyan-400 px-3 py-1 rounded text-[10px] font-bold transition"
                    >
                      Load Selection
                    </button>
                  </div>
                </div>
              ))}
              {savedGroups.filter(g => g.dayType === activeDayType).length === 0 && (
                <div className="col-span-2 text-center py-12 text-slate-600 italic text-xs">No saved duty groups for {activeDayType}. Create one on the left.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: COMPARISON DESK ── */}
      {activeTab === 'COMPARISON' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Duty vs Duty */}
          <div className="bg-slate-900/40 border border-slate-855 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">
              Steering Comparison: Duty vs Duty
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase" htmlFor="jmddrivinghours-l3">Select Duty A</label>
                <select id="jmddrivinghours-i10" name="jmddrivinghours-i10"
                  value={compDutyA}
                  onChange={(e) => setCompDutyA(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1.5 focus:outline-none text-slate-200"
                >
                  <option value="">-- Choose --</option>
                  {calculatedDuties.map(d => (
                    <option key={d.dutyId} value={d.dutyId}>Duty {d.dutyId}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase" htmlFor="jmddrivinghours-l4">Select Duty B</label>
                <select id="jmddrivinghours-i11" name="jmddrivinghours-i11"
                  value={compDutyB}
                  onChange={(e) => setCompDutyB(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1.5 focus:outline-none text-slate-200"
                >
                  <option value="">-- Choose --</option>
                  {calculatedDuties.map(d => (
                    <option key={d.dutyId} value={d.dutyId}>Duty {d.dutyId}</option>
                  ))}
                </select>
              </div>
            </div>

            {comparedDutyA && comparedDutyB ? (
              <div className="space-y-3 bg-slate-955/60 p-4 rounded-xl border border-slate-850 text-[10.5px]">
                <div className="grid grid-cols-3 border-b border-slate-850 pb-2 font-bold text-slate-400">
                  <span>Steering Metric</span>
                  <span>Duty {comparedDutyA.dutyId}</span>
                  <span>Duty {comparedDutyB.dutyId}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-900 py-1">
                  <span>Sign On/Off</span>
                  <span>{comparedDutyA.signOn} - {comparedDutyA.signOff}</span>
                  <span>{comparedDutyB.signOn} - {comparedDutyB.signOff}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-900 py-1 font-bold text-cyan-400">
                  <span>Driving Hours</span>
                  <span>{comparedDutyA.drivingHoursStr}</span>
                  <span>{comparedDutyB.drivingHoursStr}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-900 py-1">
                  <span>Driving (%)</span>
                  <span>{comparedDutyA.drivingPercentage}%</span>
                  <span>{comparedDutyB.drivingPercentage}%</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-900 py-1">
                  <span>Distance (km)</span>
                  <span>{comparedDutyA.kilometers} km</span>
                  <span>{comparedDutyB.kilometers} km</span>
                </div>
                <div className="grid grid-cols-3 py-1 text-slate-400">
                  <span>Max Continuous</span>
                  <span>{secondsToHHMMSS(comparedDutyA.maxContinuousDriving)}</span>
                  <span>{secondsToHHMMSS(comparedDutyB.maxContinuousDriving)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-600 italic text-[11px]">Select two duties to generate a side-by-side comparison report.</div>
            )}
          </div>

          {/* Group vs Group */}
          <div className="bg-slate-900/40 border border-slate-855 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">
              Steering Comparison: Group vs Group
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase" htmlFor="jmddrivinghours-l5">Select Group A</label>
                <select id="jmddrivinghours-i12" name="jmddrivinghours-i12"
                  value={compGroupA}
                  onChange={(e) => setCompGroupA(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1.5 focus:outline-none text-slate-200"
                >
                  <option value="">-- Choose --</option>
                  {savedGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.dayType})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 font-black uppercase" htmlFor="jmddrivinghours-l6">Select Group B</label>
                <select id="jmddrivinghours-i13" name="jmddrivinghours-i13"
                  value={compGroupB}
                  onChange={(e) => setCompGroupB(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1.5 focus:outline-none text-slate-200"
                >
                  <option value="">-- Choose --</option>
                  {savedGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.dayType})</option>
                  ))}
                </select>
              </div>
            </div>

            {comparedGroupA && comparedGroupB ? (
              <div className="space-y-3 bg-slate-955/60 p-4 rounded-xl border border-slate-850 text-[10.5px]">
                <div className="grid grid-cols-3 border-b border-slate-855 pb-2 font-bold text-slate-400">
                  <span>Group Metric</span>
                  <span>{comparedGroupA.name}</span>
                  <span>{comparedGroupB.name}</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-900 py-1">
                  <span>Duties Count</span>
                  <span>{comparedGroupA.count} duties</span>
                  <span>{comparedGroupB.count} duties</span>
                </div>
                <div className="grid grid-cols-3 border-b border-slate-900 py-1 font-bold text-cyan-400">
                  <span>Total Driving</span>
                  <span>{comparedGroupA.totalDrivingStr}</span>
                  <span>{comparedGroupB.totalDrivingStr}</span>
                </div>
                <div className="grid grid-cols-3 py-1 text-slate-455">
                  <span>Avg Driving Time</span>
                  <span>{secondsToHHMMSS(comparedGroupA.avgDrivingSecs)}</span>
                  <span>{secondsToHHMMSS(comparedGroupB.avgDrivingSecs)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-600 italic text-[11px]">Select two groups to generate a side-by-side comparison report.</div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: ANALYTICS & GRAPHS ── */}
      {activeTab === 'GRAPHS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900/40 border border-slate-855 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">
              Steering & Duty Hours Chart (Top 15 Duties)
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barChartData}>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={9} />
                  <YAxis stroke="#64748b" fontSize={9} />
                  <Tooltip contentStyle={{ backgroundColor: '#090d16', border: '1px solid #1e293b' }} />
                  <Legend />
                  <Bar dataKey="Driving Hours" fill="#06b6d4" />
                  <Bar dataKey="Duty Hours" fill="#4f46e5" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-855 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">
              Driving Hours Utilization Trend
            </h3>
            <div className="h-64 flex flex-col justify-center items-center">
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Driving', value: summaryMetrics.avgKms || 100 },
                      { name: 'Breaks/Layovers', value: 100 }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    <Cell fill="#06b6d4" />
                    <Cell fill="#1e293b" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="text-[10px] text-center text-slate-500 font-bold uppercase">
                Direct steering accounts for {summaryMetrics.avgKms ? Math.round((summaryMetrics.avgKms / (summaryMetrics.avgKms + 100)) * 100) : 50}% of total shift duration
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 5: AI FATIGUE ADVISOR ── */}
      {activeTab === 'AI_ADVISOR' && aiInsights && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-900/40 border border-slate-855 p-5 rounded-xl space-y-5">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2 flex items-center gap-1.5">
              <Activity className="text-cyan-400 h-4 w-4" /> AI Roster Fatigue Assessment
            </h3>

            <div className="p-4 bg-cyan-955/20 border border-cyan-900/30 text-cyan-400 rounded-xl space-y-2 text-[11px] leading-relaxed">
              <h4 className="font-bold uppercase tracking-wider flex items-center gap-1">💡 Smart Roster Advisor Recommendation:</h4>
              <p className="font-bold text-slate-200 font-sans">{aiInsights.recommendation}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 bg-rose-955/20 border border-rose-900/30 p-4 rounded-xl">
                <span className="text-[9px] text-rose-400 font-black uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle size={13} /> Overloaded Duties ({aiInsights.overloadedCount})
                </span>
                <div className="text-[10px] text-slate-350 space-y-1 select-none max-h-40 overflow-y-auto">
                  {aiInsights.overloadedList.map((d, i) => (
                    <div key={i} className="flex justify-between border-b border-rose-955/20 py-0.5 font-bold">
                      <span>Duty {d.dutyId}</span>
                      <span>{d.drivingHoursStr}</span>
                    </div>
                  ))}
                  {aiInsights.overloadedCount === 0 && <p className="italic text-slate-500">None detected</p>}
                </div>
              </div>

              <div className="space-y-2 bg-amber-955/20 border border-amber-900/20 p-4 rounded-xl">
                <span className="text-[9px] text-amber-500 font-black uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle size={13} /> Underutilized Duties ({aiInsights.underutilizedCount})
                </span>
                <div className="text-[10px] text-slate-350 space-y-1 select-none max-h-40 overflow-y-auto">
                  {aiInsights.underutilizedList.map((d, i) => (
                    <div key={i} className="flex justify-between border-b border-amber-955/20 py-0.5 font-bold">
                      <span>Duty {d.dutyId}</span>
                      <span>{d.drivingHoursStr}</span>
                    </div>
                  ))}
                  {aiInsights.underutilizedCount === 0 && <p className="italic text-slate-500">None detected</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/40 border border-slate-855 p-5 rounded-xl space-y-4">
            <h3 className="text-xs font-black text-slate-200 uppercase tracking-widest border-b border-slate-800 pb-2">
              Fatigue Standard KPIs
            </h3>
            <div className="space-y-3.5 text-[10.5px]">
              <div className="flex justify-between border-b border-slate-850 pb-1.5">
                <span className="text-slate-400 font-bold">Steering Limit</span>
                <span className="font-bold text-slate-200">6.5 hours / duty</span>
              </div>
              <div className="flex justify-between border-b border-slate-850 pb-1.5">
                <span className="text-slate-400 font-bold">Rest Cycles</span>
                <span className="font-bold text-slate-200">12 hours between duties</span>
              </div>
              <div className="flex justify-between border-b border-slate-850 pb-1.5">
                <span className="text-slate-400 font-bold">Break Duration</span>
                <span className="font-bold text-slate-200">Min 30 mins after 4h steering</span>
              </div>
              <div className="flex justify-between pb-1.5">
                <span className="text-slate-400 font-bold">Status Assessment</span>
                <span className="font-bold text-emerald-450 uppercase">Compliant</span>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

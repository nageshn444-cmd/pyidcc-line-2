/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BMRCL LINE-2 (PEENYA DEPOT CREW CONTROL)
 * Live Train Operator Relief Matrix & Master Reliever ID Chart
 * Comprehensive Multi-Day Support:
 * - WEEKDAY (WEF 22/Nov/2024 for TT 20/Nov/2024 APTS-BIET - 79 Duties, Trains 201-223 + Couns)
 * - MONDAY (WEF 06/Jan/2025 APTS-BIET - 80 Slots, Trains 201-223 + Couns)
 * - SATURDAY (WEF 15/Mar/2025 APTS-BIET - 74 Duties, Trains 201-221 + Couns)
 * - GENERAL HOLIDAY / GH (WEF 15/Mar/2025 APTS-BIET - 74 Duties, Trains 201-221 + Couns)
 * - SUNDAY (WEF 08/Dec/2024 BIET-APTS - 65 Duties, Trains 201-219)
 * 
 * Synced to Alstom ATS Relief Engine • Verified Reliever-Only Handover System
 * Complete Continuity & Stabling Break Audit Engine
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, Search, Train, ArrowRight, User, Clock, Filter, 
  Table, LayoutGrid, Calendar, ShieldCheck, Sparkles, Layers,
  CheckCircle2, Radio, AlertCircle, AlertTriangle, Shield, RefreshCw, 
  ChevronRight, Activity, CalendarDays, Edit3, X, Save,
  Download, FileSpreadsheet
} from 'lucide-react';
import { 
  WEEKDAY_RELIEF_ID_CHART, 
  WEEKDAY_RELIEF_ID_CHART_META,
  WEEKDAY_DUTY_LEGS_FROM_ID_CHART,
  getReliefIdChartForDay,
  normalizeScheduleDay,
  timeStringToSeconds,
  normalizeTrackTrainId,
  normalizeDutyId,
  buildDutyRosterFromLinkRoster,
  buildMasterIdChartFromDutyRoster,
  buildHandoverCardsFromMasterIdChart,
  getCleanLinksForDay,
  linkMatchesScheduleDay
} from '../data/weekdayReliefIdChartRegistry';
import { enrichMasterIdChartWithWttLocations } from '../services/wttLocationResolverEngine.js';
import { exportMasterIdChartToExcel } from '../services/masterIdChartExportService.js';
import { getMasterLinksForDay } from '../data/canonicalDayLinksRegistry';
import { getOperatorForDuty } from '../data/weekdayMasterDutyRoster';
import { db } from '../firebase';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';

const ALL_LINE2_FLEET = [
  '201', '202', '203', '204', '205', '206', '207', '208', '209', '210',
  '211', '212', '213', '214', '215', '216', '217', '218', '219', '220',
  '221', '222', '223'
];

export default function ReliefTracking({ 
  trackerSearchTerm, 
  setTrackerSearchTerm, 
  filteredTrackingKeys, 
  liveTrainTrackingMap = {},
  activeDay = 'WEEKDAY',
  simulatedTime = null,
  linkRoster = null,
  allLinks = null
}) {
  // View mode: 'CARDS' | 'ID_CHART' | 'DUTY_SUMMARY'
  const [viewMode, setViewMode] = useState('CARDS');

  // Schedule Day State with prop synchronization
  const [selectedDay, setSelectedDay] = useState(() => normalizeScheduleDay(activeDay || 'WEEKDAY'));
  useEffect(() => {
    if (activeDay) {
      setSelectedDay(normalizeScheduleDay(activeDay));
    }
  }, [activeDay]);

  useEffect(() => {
    const handleDayChanged = (e) => {
      const d = e?.detail?.day || e?.detail?.dayType;
      if (d) {
        setSelectedDay(normalizeScheduleDay(d));
      }
    };
    window.addEventListener('pyidcc-active-day-changed', handleDayChanged);
    window.addEventListener('pyidcc:active_day_changed', handleDayChanged);
    return () => {
      window.removeEventListener('pyidcc-active-day-changed', handleDayChanged);
      window.removeEventListener('pyidcc:active_day_changed', handleDayChanged);
    };
  }, []);

  const handleSelectScheduleDay = (dayId) => {
    const norm = normalizeScheduleDay(dayId);
    setSelectedDay(norm);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('pyidcc_active_day_override', norm);
        window.dispatchEvent(new CustomEvent('pyidcc-active-day-changed', { detail: { day: norm, dayType: norm } }));
        window.dispatchEvent(new CustomEvent('pyidcc:active_day_changed', { detail: { day: norm, dayType: norm } }));
      }
    } catch (_e) {}
  };

  // Fleet View Mode: 'SCHEDULED' (only active timetable trains) vs 'ALL_FLEET' (all 201 to 223)
  const [fleetScope, setFleetScope] = useState('SCHEDULED');

  // Continuity & Stabling Audit Drawer toggle
  const [showContinuityAudit, setShowContinuityAudit] = useState(false);

  // Master ID Chart Excel Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState(null);

  const handleDownloadMasterIdChart = (scope = 'ALL_DAYS') => {
    try {
      setIsExporting(true);
      const filename = exportMasterIdChartToExcel({
        scope,
        activeDay: selectedDay,
        customWttRows: null,
        dispatchDutyOperatorMap
      });
      setExportSuccessMsg(`Successfully generated and downloaded ${filename}`);
      setTimeout(() => setExportSuccessMsg(null), 5000);
    } catch (err) {
      console.error('Failed to export Master ID Chart:', err);
      alert('Error generating Excel file: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Dynamically resolve ID chart, metadata, and duty legs for the selected day type
  const activeDayData = useMemo(() => {
    return getReliefIdChartForDay(selectedDay || 'WEEKDAY');
  }, [selectedDay]);

  const activeChart = activeDayData.chart;
  const activeMeta = activeDayData.meta;
  const activeDutyLegs = activeDayData.dutyLegs;

  // Local search states
  const [localSearch, setLocalSearch] = useState('');
  const [dutySearch, setDutySearch] = useState('');
  const [selectedTrainCol, setSelectedTrainCol] = useState('ALL');

  // Reset selected column filter when schedule day changes
  useEffect(() => {
    setSelectedTrainCol('ALL');
  }, [selectedDay]);

  // Fallbacks if props are not passed
  const searchTerm = trackerSearchTerm !== undefined ? trackerSearchTerm : localSearch;
  const setSearchTerm = setTrackerSearchTerm || setLocalSearch;

  // Real-time evaluation seconds for active leg highlighting
  const [currentTimeSecs, setCurrentTimeSecs] = useState(() => {
    if (simulatedTime) return timeStringToSeconds(simulatedTime);
    const now = new Date();
    return now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  });

  useEffect(() => {
    if (simulatedTime) {
      setCurrentTimeSecs(timeStringToSeconds(simulatedTime));
      return;
    }
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeSecs(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    }, 1000);
    return () => clearInterval(timer);
  }, [simulatedTime]);

  // Listener for instant live dispatch updates from DISPATCH GATEWAY CORE
  const [dispatchUpdateTrigger, setDispatchUpdateTrigger] = useState(0);
  useEffect(() => {
    const handleUpdate = () => setDispatchUpdateTrigger(prev => prev + 1);
    if (typeof window !== 'undefined') {
      window.addEventListener('pyidcc_dispatch_deployments_updated', handleUpdate);
      window.addEventListener('storage', handleUpdate);
      return () => {
        window.removeEventListener('pyidcc_dispatch_deployments_updated', handleUpdate);
        window.removeEventListener('storage', handleUpdate);
      };
    }
  }, []);

  // (scheduledTrains and trainColumns are now dynamically derived below dynamicMasterIdChart)

  // ── Authoritative DISPATCH GATEWAY CORE Deployments Map ──
  const dispatchDutyOperatorMap = useMemo(() => {
    const map = {};
    if (typeof window === 'undefined' || !window.localStorage) return map;
    try {
      const activeRaw = window.localStorage.getItem('pyidcc_active_dispatch_deployments');
      const list = activeRaw ? JSON.parse(activeRaw) : [];
      if (Array.isArray(list)) {
        list.forEach(d => {
          const rawDuty = d.dutyNo || d.dutyId || d.rawDutyId;
          if (!rawDuty) return;
          const normDuty = normalizeDutyId(rawDuty);
          const candName = (d.operatorName && d.operatorName !== '--' && !d.operatorName.startsWith('Duty ') && !d.operatorName.startsWith('Train Operator'))
            ? d.operatorName
            : (d.empName && d.empName !== '--' && !d.empName.startsWith('Duty ') && !d.empName.startsWith('Train Operator'))
            ? d.empName
            : d.name || d.operatorName || d.empName;
          
          const candId = d.operatorId || d.empId || d.empNo || d.id;
          if (candName && candName !== '--' && candName !== '-' && !candName.startsWith('Duty ') && !candName.startsWith('Train Operator')) {
            map[normDuty] = {
              dutyId: normDuty,
              empName: candName,
              empId: candId || '--',
              trainId: d.trainId || null,
              isExchanged: Boolean(d.isExchanged || d.status === 'EXCHANGED' || d.type === 'EXCHANGED'),
              isSwapped: Boolean(d.isSwapped || d.status === 'SWAPPED_BY_CC' || d.status === 'SWAPPED'),
              status: d.status || 'ACTIVE',
              rawRecord: d
            };
          }
        });
      }

      const consoleRaw = window.localStorage.getItem('pyidcc_roster_desk_console_cache');
      if (consoleRaw) {
        const parsed = JSON.parse(consoleRaw);
        (parsed?.duties || []).forEach(d => {
          const rawDuty = d.dutyNo || d.dutyId || d.rawDutyId;
          if (!rawDuty) return;
          const normDuty = normalizeDutyId(rawDuty);
          if (!map[normDuty]) {
            const candName = (d.operatorName && d.operatorName !== '--' && !d.operatorName.startsWith('Duty ') && !d.operatorName.startsWith('Train Operator'))
              ? d.operatorName
              : (d.empName && d.empName !== '--' && !d.empName.startsWith('Duty ') && !d.empName.startsWith('Train Operator'))
              ? d.empName
              : d.name || d.operatorName || d.empName;
            const candId = d.operatorId || d.empId || d.empNo || d.id;
            if (candName && candName !== '--' && candName !== '-' && !candName.startsWith('Duty ') && !candName.startsWith('Train Operator')) {
              map[normDuty] = {
                dutyId: normDuty,
                empName: candName,
                empId: candId || '--',
                trainId: d.trainId || null,
                isExchanged: Boolean(d.isExchanged || d.status === 'EXCHANGED' || d.type === 'EXCHANGED'),
                isSwapped: Boolean(d.isSwapped || d.status === 'SWAPPED_BY_CC' || d.status === 'SWAPPED'),
                status: d.status || 'ACTIVE',
                rawRecord: d
              };
            }
          }
        });
      }
    } catch (_e) {}
    return map;
  }, [dispatchUpdateTrigger]);

  // ── 0. Authoritative Real-Time Link Roster Listener from Firestore & Events ──
  const [liveFirestoreLinks, setLiveFirestoreLinks] = useState([]);
  const [linkUpdateTrigger, setLinkUpdateTrigger] = useState(0);

  useEffect(() => {
    // A. Real-time Firestore listener on 'crew_final_links'
    const unsub = onSnapshot(collection(db, 'crew_final_links'), (snap) => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setLiveFirestoreLinks(docs);
        setLinkUpdateTrigger(prev => prev + 1);
      }
    }, (err) => {
      console.warn('ReliefTracking crew_final_links subscription:', err);
    });

    // B. Window event listener for link roster updates (uploads, cell edits, resets)
    const handleLinkUpdate = (e) => {
      setLinkUpdateTrigger(prev => prev + 1);
      if (e?.detail?.duties && Array.isArray(e.detail.duties)) {
        setLiveFirestoreLinks(prev => {
          const sType = normalizeScheduleDay(e.detail.scheduleType || selectedDay || 'WEEKDAY');
          const remaining = prev.filter(p => normalizeScheduleDay(p.scheduleType) !== sType);
          return [...remaining, ...e.detail.duties];
        });
      } else if (e?.detail?.rowId && e?.detail?.fieldName) {
        setLiveFirestoreLinks(prev => {
          const sType = normalizeScheduleDay(e.detail.scheduleType || selectedDay || 'WEEKDAY');
          const baseList = prev.length > 0 ? prev : getMasterLinksForDay(sType);
          const found = baseList.some(l => l.id === e.detail.rowId || l.dutyId === e.detail.rowId || normalizeDutyId(l.dutyId) === normalizeDutyId(e.detail.rowId));
          if (!found) {
            return [...baseList, { id: e.detail.rowId, dutyId: e.detail.rowId, [e.detail.fieldName]: e.detail.value, scheduleType: sType }];
          }
          return baseList.map(l => {
            if (l.id === e.detail.rowId || l.dutyId === e.detail.rowId || normalizeDutyId(l.dutyId) === normalizeDutyId(e.detail.rowId)) {
              return { ...l, [e.detail.fieldName]: e.detail.value, scheduleType: sType };
            }
            return l;
          });
        });
      }
    };
    const handleWttUpdate = () => {
      setLinkUpdateTrigger(prev => prev + 1);
    };
    window.addEventListener('pyidcc:link_roster_updated', handleLinkUpdate);
    window.addEventListener('pyidcc_link_roster_updated', handleLinkUpdate);
    window.addEventListener('pyidcc:wtt_updated', handleWttUpdate);
    window.addEventListener('pyidcc_wtt_updated', handleWttUpdate);

    return () => {
      unsub();
      window.removeEventListener('pyidcc:link_roster_updated', handleLinkUpdate);
      window.removeEventListener('pyidcc_link_roster_updated', handleLinkUpdate);
      window.removeEventListener('pyidcc:wtt_updated', handleWttUpdate);
      window.removeEventListener('pyidcc_wtt_updated', handleWttUpdate);
    };
  }, [selectedDay]);

  // ── 1. AUTHORITATIVE LINK ROSTER (RESPECTIVE DAY) ──
  // Priority: liveFirestoreLinks from crew_final_links / live edits ➔ linkRoster prop ➔ allLinks prop ➔ canonical master
  const activeLinkRoster = useMemo(() => {
    // 1. Check liveFirestoreLinks from real-time crew_final_links (highest priority: latest uploaded or edited)
    const fromFirestore = getCleanLinksForDay(liveFirestoreLinks, selectedDay);
    if (fromFirestore.length > 0) return fromFirestore;

    // 2. Check linkRoster prop (if matching selectedDay)
    const fromProp = getCleanLinksForDay(linkRoster, selectedDay);
    if (fromProp.length > 0) return fromProp;

    // 3. Check allLinks prop (filtered for selectedDay)
    const fromAll = getCleanLinksForDay(allLinks, selectedDay);
    if (fromAll.length > 0) return fromAll;

    // 4. Fallback to canonical master registry
    return getMasterLinksForDay(selectedDay);
  }, [linkRoster, allLinks, liveFirestoreLinks, selectedDay, linkUpdateTrigger]);

  // ── 2. DUTY ROSTER (FOLLOWS TRAIN ID OF EACH DUTY OF LINK ROSTER) ──
  // Derives all duties, trip sequences, and operator assignments from activeLinkRoster
  const dynamicDutyRoster = useMemo(() => {
    return buildDutyRosterFromLinkRoster(activeLinkRoster, dispatchDutyOperatorMap, selectedDay);
  }, [activeLinkRoster, dispatchDutyOperatorMap, selectedDay]);

  // Dynamic duty-to-legs map for Duty Summary view
  const dynamicDutyLegs = useMemo(() => {
    const res = {};
    Object.values(dynamicDutyRoster).forEach(dr => {
      const key = String(parseInt(dr.dutyId, 10) || dr.dutyId);
      const legs = (dr.legs || []).map(l => ({
        trainId: l.trainId,
        from: l.from,
        to: l.to,
        startSec: l.startSec,
        endSec: l.endSec,
        empName: dr.assignedOperator?.empName || `Duty ${dr.dutyId}`,
        empId: dr.assignedOperator?.empId || '--',
        dutyId: dr.dutyId
      }));
      legs.meta = dr.meta;
      res[key] = legs;
    });
    return Object.keys(res).length > 0 ? res : activeDutyLegs;
  }, [dynamicDutyRoster, activeDutyLegs]);

  // ── 3. MASTER ID CHART (FOLLOWS DUTY ROSTER & CORRELATED WTT) ──
  // Inverts duty legs into train-centric shift sequences with exact Station Code + Line + Platform from WTT
  const dynamicMasterIdChart = useMemo(() => {
    const baseChart = buildMasterIdChartFromDutyRoster(dynamicDutyRoster, activeChart);
    return enrichMasterIdChartWithWttLocations(baseChart, selectedDay);
  }, [dynamicDutyRoster, activeChart, selectedDay, linkUpdateTrigger]);

  // Dynamic train columns: Strictly derived from trains that have shift legs in dynamicMasterIdChart
  const scheduledTrains = useMemo(() => {
    const activeTrains = Object.keys(dynamicMasterIdChart).filter(tid => (dynamicMasterIdChart[tid] || []).length > 0);
    if (activeTrains.length > 0) {
      return activeTrains.sort((a, b) => {
        if (a === 'Couns') return 1;
        if (b === 'Couns') return -1;
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }
    return activeMeta.trains || Object.keys(activeChart);
  }, [dynamicMasterIdChart, activeMeta, activeChart]);

  const trainColumns = useMemo(() => {
    if (fleetScope === 'ALL_FLEET') {
      const set = new Set([...ALL_LINE2_FLEET]);
      if (activeChart['Couns'] || dynamicMasterIdChart['Couns']) set.add('Couns');
      return Array.from(set);
    }
    return scheduledTrains;
  }, [fleetScope, scheduledTrains, activeChart, dynamicMasterIdChart]);

  // ── 4. HANDOVER CARDS (FOLLOWS MASTER ID CHART) ──
  // ── 5. LIVE RELIEF TRACKING (FOLLOWS HANDOVER CARDS) ──
  // Evaluates previous, current (at controls), and next reliever at currentTimeSecs
  const effectiveLiveTrackingMap = useMemo(() => {
    return buildHandoverCardsFromMasterIdChart(
      dynamicMasterIdChart,
      currentTimeSecs,
      trainColumns,
      dispatchDutyOperatorMap,
      liveTrainTrackingMap
    );
  }, [dynamicMasterIdChart, currentTimeSecs, trainColumns, dispatchDutyOperatorMap, liveTrainTrackingMap]);

  // ── Quick Duty Edit State & Handlers ──
  const [editingDutyModal, setEditingDutyModal] = useState(null);
  const [isSavingDuty, setIsSavingDuty] = useState(false);
  const [dutyFormData, setDutyFormData] = useState({
    dutyId: '',
    empName: '',
    empId: '',
    signOnTime: '06:00',
    signOffTime: '14:00',
    signOnLocation: 'PYID',
    signOffLocation: 'PYID',
    leg1TrainNo: '',
    leg1TimeFrom: '',
    leg1TimeTo: '',
    leg2TrainNo: '',
    leg2DepTime: '',
    leg2ArrTime: '',
    leg3TrainNo: '',
    leg3DepTime: '',
    leg3ArrTime: '',
    leg4TrainNo: '',
    leg4FinalDepTime: '',
    leg4FinalArrTime: ''
  });

  const handleOpenDutyEdit = (dutyId) => {
    const norm = normalizeDutyId(dutyId);
    const existing = dynamicDutyRoster[norm] || {};
    const linkItem = activeLinkRoster.find(l => normalizeDutyId(l.dutyId) === norm || normalizeDutyId(l.dutyNo) === norm) || {};
    const legs = existing.legs || [];

    setDutyFormData({
      dutyId: norm,
      empName: existing.assignedOperator?.empName && !existing.assignedOperator.empName.startsWith('Duty ') ? existing.assignedOperator.empName : (linkItem.empName || linkItem.operatorName || ''),
      empId: existing.assignedOperator?.empId !== '--' ? existing.assignedOperator.empId : (linkItem.empId || linkItem.operatorId || ''),
      signOnTime: existing.meta?.signOnTime || linkItem.signOnTime || '06:00',
      signOffTime: existing.meta?.signOffTime || linkItem.signOffTime || '14:00',
      signOnLocation: existing.meta?.signOnLocation || linkItem.signOnLocation || 'PYID',
      signOffLocation: existing.meta?.signOffLocation || linkItem.signOffLocation || 'PYID',
      leg1TrainNo: legs[0]?.trainId || linkItem.leg1TrainNo || linkItem.trainId || '',
      leg1TimeFrom: legs[0]?.from || linkItem.leg1TimeFrom || '',
      leg1TimeTo: legs[0]?.to || linkItem.leg1TimeTo || '',
      leg2TrainNo: legs[1]?.trainId || linkItem.leg2TrainNo || linkItem.followTrain || '',
      leg2DepTime: legs[1]?.from || linkItem.leg2DepTime || linkItem.followTimeFrom || '',
      leg2ArrTime: legs[1]?.to || linkItem.leg2ArrTime || linkItem.followTimeTo || '',
      leg3TrainNo: legs[2]?.trainId || linkItem.leg3TrainNo || '',
      leg3DepTime: legs[2]?.from || linkItem.leg3DepTime || '',
      leg3ArrTime: legs[2]?.to || linkItem.leg3ArrTime || '',
      leg4TrainNo: legs[3]?.trainId || linkItem.leg4TrainNo || linkItem.leg4FinalTrainNo || '',
      leg4FinalDepTime: legs[3]?.from || linkItem.leg4FinalDepTime || '',
      leg4FinalArrTime: legs[3]?.to || linkItem.leg4FinalArrTime || ''
    });
    setEditingDutyModal(norm);
  };

  const handleSaveDutyEdit = async (e) => {
    e.preventDefault();
    if (!dutyFormData.dutyId) return;
    setIsSavingDuty(true);
    try {
      const norm = normalizeDutyId(dutyFormData.dutyId);
      const sType = normalizeScheduleDay(selectedDay || 'WEEKDAY');
      const docId = `link_${sType.toLowerCase()}_duty_${norm}`;

      const updatePayload = {
        id: docId,
        dutyId: norm,
        dutyNo: norm,
        scheduleType: sType,
        empName: dutyFormData.empName.trim() || `Duty ${norm}`,
        operatorName: dutyFormData.empName.trim() || `Duty ${norm}`,
        empId: dutyFormData.empId.trim() || '--',
        operatorId: dutyFormData.empId.trim() || '--',
        signOnTime: dutyFormData.signOnTime.slice(0, 5),
        signOffTime: dutyFormData.signOffTime.slice(0, 5),
        signOnLocation: dutyFormData.signOnLocation,
        signOffLocation: dutyFormData.signOffLocation,
        trainId: dutyFormData.leg1TrainNo.trim() || '--',
        leg1TrainNo: dutyFormData.leg1TrainNo.trim() || '--',
        leg1TimeFrom: dutyFormData.leg1TimeFrom.slice(0, 5) || '--',
        leg1TimeTo: dutyFormData.leg1TimeTo.slice(0, 5) || '--',
        leg2TrainNo: dutyFormData.leg2TrainNo.trim() || '--',
        leg2DepTime: dutyFormData.leg2DepTime.slice(0, 5) || '--',
        leg2ArrTime: dutyFormData.leg2ArrTime.slice(0, 5) || '--',
        leg3TrainNo: dutyFormData.leg3TrainNo.trim() || '--',
        leg3DepTime: dutyFormData.leg3DepTime.slice(0, 5) || '--',
        leg3ArrTime: dutyFormData.leg3ArrTime.slice(0, 5) || '--',
        leg4TrainNo: dutyFormData.leg4TrainNo.trim() || '--',
        leg4FinalDepTime: dutyFormData.leg4FinalDepTime.slice(0, 5) || '--',
        leg4FinalArrTime: dutyFormData.leg4FinalArrTime.slice(0, 5) || '--',
        lastModified: new Date().toISOString()
      };

      // 1. Save to Firestore
      await setDoc(doc(db, 'crew_final_links', docId), updatePayload, { merge: true });

      // 2. Immediately update in-memory live Firestore links state for zero latency
      setLiveFirestoreLinks(prev => {
        const remaining = prev.filter(l => !(normalizeScheduleDay(l.scheduleType) === sType && normalizeDutyId(l.dutyId || l.dutyNo) === norm));
        return [...remaining, updatePayload];
      });
      setLinkUpdateTrigger(p => p + 1);

      // 3. Dispatch broadcast events to all open consoles and layout views
      const eventDetail = {
        scheduleType: sType,
        dutyId: norm,
        duties: [updatePayload],
        timestamp: Date.now()
      };
      window.dispatchEvent(new CustomEvent('pyidcc:link_roster_updated', { detail: eventDetail }));
      window.dispatchEvent(new CustomEvent('pyidcc_link_roster_updated', { detail: eventDetail }));

      setEditingDutyModal(null);
    } catch (err) {
      console.error("Save duty error:", err);
      alert("Failed to save duty changes: " + err.message);
    } finally {
      setIsSavingDuty(false);
    }
  };

  // ── Continuity & Stabling Audit Engine ──
  // Audits dynamic master ID chart to verify 100% continuous run, mid-day breaks, and stabling before termination
  const continuityAudit = useMemo(() => {
    const list = [];
    const trains = trainColumns;

    trains.forEach(tid => {
      const legs = dynamicMasterIdChart[tid] || dynamicMasterIdChart[normalizeTrackTrainId(tid)] || [];
      if (legs.length === 0) {
        list.push({
          trainId: tid,
          totalLegs: 0,
          startTime: '--',
          startDuty: '--',
          stablingTime: '--',
          stablingDuty: '--',
          stablingLocation: 'Peenya Depot SBL (Off-Roster)',
          breaks: [],
          status: 'STABLED_FULL_DAY',
          statusLabel: `Stabled in Depot (Off-Roster on ${activeMeta.dayType})`
        });
        return;
      }

      const firstLeg = legs[0];
      const lastLeg = legs[legs.length - 1];
      const breaks = [];

      for (let i = 0; i < legs.length - 1; i++) {
        const currToSec = timeStringToSeconds(legs[i].to);
        const nextFromSec = timeStringToSeconds(legs[i + 1].from);
        const gapSec = nextFromSec - currToSec;
        if (gapSec > 300) {
          breaks.push({
            breakFrom: legs[i].to,
            breakTo: legs[i + 1].from,
            durationMins: Math.round(gapSec / 60),
            prevDuty: legs[i].duty || legs[i].dutyId,
            nextDuty: legs[i + 1].duty || legs[i + 1].dutyId
          });
        }
      }

      list.push({
        trainId: tid,
        totalLegs: legs.length,
        startTime: firstLeg.from,
        startDuty: firstLeg.duty || firstLeg.dutyId,
        firstLegLoc: firstLeg.toc || firstLeg.fromLoc || 'Depot Induction',
        stablingTime: lastLeg.to,
        stablingDuty: lastLeg.duty || lastLeg.dutyId,
        stablingLocation: lastLeg.hoc || lastLeg.toLoc || 'Peenya Depot SBL',
        breaks,
        status: breaks.length === 0 ? 'CONTINUOUS' : 'SPLIT_SHIFT',
        statusLabel: breaks.length === 0 ? '100% Continuous Mainline Run' : `Split-Shift (${breaks.length} Stabling Break${breaks.length > 1 ? 's' : ''})`
      });
    });

    return list;
  }, [trainColumns, dynamicMasterIdChart, activeMeta]);

  // Filter keys for CARDS view
  const finalTrackingKeys = useMemo(() => {
    return trainColumns.filter(tid => {
      const tracking = effectiveLiveTrackingMap[tid] || effectiveLiveTrackingMap[normalizeTrackTrainId(tid)];
      const prev = tracking?.previous;
      const curr = tracking?.current;
      const next = tracking?.nextReliver;

      const genQuery = searchTerm.toLowerCase().trim();
      const dutyQuery = dutySearch.toLowerCase().trim();

      const matchesGeneral = !genQuery || (
        String(tid).toLowerCase().includes(genQuery) ||
        String(prev?.empName || '').toLowerCase().includes(genQuery) ||
        String(curr?.empName || '').toLowerCase().includes(genQuery) ||
        String(next?.empName || '').toLowerCase().includes(genQuery)
      );

      const cleanDutyQuery = dutyQuery.replace(/^d/i, '');
      const matchesDuty = !dutyQuery || (
        String(prev?.dutyId || prev?.duty || '').toLowerCase().includes(cleanDutyQuery) ||
        String(curr?.dutyId || curr?.duty || '').toLowerCase().includes(cleanDutyQuery) ||
        String(next?.dutyId || next?.duty || '').toLowerCase().includes(cleanDutyQuery)
      );

      return matchesGeneral && matchesDuty;
    });
  }, [effectiveLiveTrackingMap, trainColumns, searchTerm, dutySearch]);

  // Filtered train columns for ID CHART view
  const filteredIdChartColumns = useMemo(() => {
    return trainColumns.filter(trainId => {
      if (selectedTrainCol !== 'ALL' && selectedTrainCol !== trainId) return false;

      const genQuery = searchTerm.toLowerCase().trim();
      const dutyQuery = dutySearch.toLowerCase().trim().replace(/^d/i, '');
      const legs = dynamicMasterIdChart[trainId] || dynamicMasterIdChart[normalizeTrackTrainId(trainId)] || [];

      const matchesGen = !genQuery || (
        trainId.toLowerCase().includes(genQuery) ||
        legs.some(l => {
          const normDuty = String(l.duty || l.dutyId).padStart(2, '0');
          const trackingOp = effectiveLiveTrackingMap[trainId]?.current || effectiveLiveTrackingMap[trainId]?.nextReliver;
          return normDuty.includes(genQuery) || String(l.duty || l.dutyId).includes(genQuery) ||
                 (trackingOp?.dutyId === normDuty && trackingOp.empName?.toLowerCase().includes(genQuery));
        })
      );

      const matchesDuty = !dutyQuery || legs.some(l => {
        const normDuty = String(l.duty || l.dutyId).padStart(2, '0');
        return normDuty.includes(dutyQuery) || String(l.duty || l.dutyId).includes(dutyQuery);
      });

      return matchesGen && matchesDuty;
    });
  }, [trainColumns, selectedTrainCol, searchTerm, dutySearch, effectiveLiveTrackingMap, dynamicMasterIdChart]);

  const maxRowsInChart = useMemo(() => {
    let max = 10;
    filteredIdChartColumns.forEach(trainId => {
      const len = (dynamicMasterIdChart[trainId] || dynamicMasterIdChart[normalizeTrackTrainId(trainId)] || []).length;
      if (len > max) max = len;
    });
    return Math.max(max, 10);
  }, [filteredIdChartColumns, dynamicMasterIdChart]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-2xl relative overflow-hidden font-mono">
      {/* Ambient BG Glow */}
      <div className="absolute -top-24 -left-24 w-56 h-56 bg-cyan-500/10 rounded-full blur-[70px] pointer-events-none"></div>
      <div className="absolute -bottom-24 -right-24 w-56 h-56 bg-emerald-500/10 rounded-full blur-[70px] pointer-events-none"></div>

      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-slate-800 pb-4 mb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-cyan-500/15 flex items-center justify-center border border-cyan-500/30 text-cyan-400 shrink-0">
            <Users className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-black text-slate-100 tracking-wider uppercase">
                Live Train Operator Relief Matrix
              </h3>
              <span className="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 text-[9px] font-black uppercase font-mono">
                {activeMeta.badge || `${selectedDay} LINK`}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 border border-blue-700/60 text-[9px] font-black uppercase font-mono flex items-center gap-1">
                <Sparkles size={10} className="text-blue-400" />
                MASTER ID CHART ({Object.keys(dynamicDutyRoster).length || activeMeta.dutyCount || 79} DUTIES • {trainColumns.length} TRAINS)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700/60 text-[9px] font-black uppercase font-mono flex items-center gap-1">
                <ShieldCheck size={11} className="text-emerald-400" />
                ALSTOM ATS RELIEF ENGINE
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-600/70 text-[9px] font-black uppercase font-mono flex items-center gap-1 shadow-sm" title="Real-time pipeline: Link Roster changes automatically update Duty Roster, Master ID Chart, and Handover Cards">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                LINK ROSTER ➔ DUTY ROSTER ➔ MASTER ID ➔ HANDOVERS
              </span>
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span>{activeMeta.title}</span>
              <span className="text-slate-600">•</span>
              <span className="text-emerald-400 font-bold">Verified Reliever-Only Handover System</span>
              <span className="text-slate-600">•</span>
              <span className="text-cyan-400 font-bold">{trainColumns.length} Timetabled Trains</span>
            </p>
          </div>
        </div>
        
        {/* Right Action Bar: View Mode & Audit Drawer Toggle */}
        <div className="flex items-center gap-2 flex-wrap self-stretch sm:self-auto justify-between sm:justify-start">
          <button
            type="button"
            onClick={() => setShowContinuityAudit(!showContinuityAudit)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all border ${
              showContinuityAudit 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
            }`}
            title="Inspect train continuity, mid-day stabling gaps, and night stabling times"
          >
            <Activity size={13} className={showContinuityAudit ? 'text-amber-400 animate-pulse' : 'text-amber-500'} />
            <span>Continuity &amp; Stabling Audit</span>
          </button>

          {/* View Mode Toggle Buttons */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('CARDS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all ${
                viewMode === 'CARDS'
                  ? 'bg-cyan-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Real-time previous, active, and upcoming operator handovers"
            >
              <LayoutGrid size={13} />
              <span>Handover Cards</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('ID_CHART')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all ${
                viewMode === 'ID_CHART'
                  ? 'bg-cyan-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={`Official ${trainColumns.length}-column Master ID Chart for ${activeMeta.dayType}`}
            >
              <Table size={13} />
              <span>Master ID Chart</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('DUTY_SUMMARY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all ${
                viewMode === 'DUTY_SUMMARY'
                  ? 'bg-cyan-600 text-white shadow-md font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={`Duty-wise breakdown of assigned train legs from the official ${activeMeta.dayType} ID chart`}
            >
              <Layers size={13} />
              <span>Duty Roster</span>
            </button>
          </div>

          {/* Master ID Chart Download Buttons */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => handleDownloadMasterIdChart('ALL_DAYS')}
              disabled={isExporting}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm disabled:opacity-50"
              title="Download full Master ID Chart Excel workbook for ALL train IDs and ALL day types (Weekday, Monday, Saturday, GH, Sunday)"
            >
              <Download size={13} className={isExporting ? 'animate-bounce' : ''} />
              <span>Download All Days (Excel)</span>
            </button>
            <button
              type="button"
              onClick={() => handleDownloadMasterIdChart('ACTIVE_DAY')}
              disabled={isExporting}
              className="px-2 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1 transition-all bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-750 disabled:opacity-50"
              title={`Download ${selectedDay} Master ID Chart Excel`}
            >
              <FileSpreadsheet size={13} />
              <span>{selectedDay}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Export Success Notification Banner */}
      {exportSuccessMsg && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 text-xs font-mono flex items-center justify-between shadow-lg shadow-emerald-950/40 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span className="font-bold">{exportSuccessMsg}</span>
          </div>
          <button 
            type="button"
            onClick={() => setExportSuccessMsg(null)}
            className="text-emerald-400 hover:text-white p-1 rounded"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Schedule Day Selector Bar */}
      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 mb-4 flex flex-wrap items-center justify-between gap-3 relative z-10 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 font-bold flex items-center gap-1 text-[11px] uppercase tracking-wider">
            <CalendarDays size={13} className="text-cyan-400" />
            Schedule Day:
          </span>
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            {[
              { id: 'WEEKDAY', label: 'WEEKDAY', duties: '79' },
              { id: 'MONDAY', label: 'MONDAY', duties: '80' },
              { id: 'SATURDAY', label: 'SATURDAY', duties: '74' },
              { id: 'GH', label: 'GH (HOLIDAY)', duties: '74' },
              { id: 'SUNDAY', label: 'SUNDAY', duties: '65' }
            ].map(day => (
              <button
                key={day.id}
                type="button"
                onClick={() => handleSelectScheduleDay(day.id)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold font-mono transition-all ${
                  selectedDay === day.id
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {day.label} <span className="text-[9px] opacity-75">({day.duties})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Fleet Scope: Scheduled Trains vs All 201-223 */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-[11px]">Fleet Scope:</span>
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setFleetScope('SCHEDULED')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                fleetScope === 'SCHEDULED' ? 'bg-cyan-600 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              Active ({scheduledTrains.length})
            </button>
            <button
              type="button"
              onClick={() => setFleetScope('ALL_FLEET')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                fleetScope === 'ALL_FLEET' ? 'bg-cyan-600 text-white font-black' : 'text-slate-400 hover:text-white'
              }`}
            >
              All 201-223 ({ALL_LINE2_FLEET.length})
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* CONTINUITY & STABLING BREAK AUDIT DRAWER (Expandable)                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showContinuityAudit && (
        <div className="mb-4 bg-slate-950 border border-amber-500/40 rounded-xl p-4 shadow-xl relative z-10 transition-all">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-amber-400 animate-pulse" />
              <h4 className="text-xs font-black text-white tracking-wider uppercase">
                TRAIN CONTINUITY &amp; STABLING AUDIT REPORT • {activeMeta.dayType} LINK
              </h4>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 size={11} />
                <span>Continuous Runs</span>
              </span>
              <span className="flex items-center gap-1 text-amber-400">
                <AlertTriangle size={11} />
                <span>Split-Shift / Mid-Day Breaks</span>
              </span>
              <span className="flex items-center gap-1 text-slate-500">
                <span>Stabled Full-Day</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-90 overflow-y-auto pr-1 custom-scrollbar">
            {continuityAudit.map(audit => (
              <div 
                key={`audit-${audit.trainId}`}
                className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                  audit.status === 'CONTINUOUS'
                    ? 'bg-emerald-950/15 border-emerald-500/30 text-slate-300'
                    : audit.status === 'SPLIT_SHIFT'
                    ? 'bg-amber-950/20 border-amber-500/40 text-slate-200'
                    : 'bg-slate-900/40 border-slate-800/80 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-850 pb-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Train size={12} className={audit.status === 'CONTINUOUS' ? 'text-emerald-400' : audit.status === 'SPLIT_SHIFT' ? 'text-amber-400' : 'text-slate-600'} />
                    <strong className="text-white font-mono">TRAIN {audit.trainId}</strong>
                  </div>
                  <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                    audit.status === 'CONTINUOUS'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : audit.status === 'SPLIT_SHIFT'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-slate-800/60 text-slate-400 border border-slate-700/40'
                  }`}>
                    {audit.status === 'CONTINUOUS' ? 'Continuous' : audit.status === 'SPLIT_SHIFT' ? 'Split-Shift' : 'Stabled'}
                  </span>
                </div>

                {audit.status !== 'STABLED_FULL_DAY' ? (
                  <div className="space-y-1.5 text-[10px]">
                    <div className="space-y-1 bg-slate-950/60 p-1.5 rounded border border-slate-850">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Induction: <strong className="text-slate-200">{audit.startTime}</strong> (Duty {audit.startDuty})</span>
                        <span className="text-[9px] text-emerald-400 font-mono font-bold truncate max-w-36" title={audit.firstLegLoc}>
                          📍 {audit.firstLegLoc}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Stables: <strong className="text-cyan-300">{audit.stablingTime}</strong> (Duty {audit.stablingDuty})</span>
                        <span className="text-[9px] text-cyan-300 font-mono font-bold truncate max-w-36" title={audit.stablingLocation}>
                          🏁 {audit.stablingLocation}
                        </span>
                      </div>
                    </div>

                    {audit.breaks.length > 0 ? (
                      <div className="mt-1 pt-1 border-t border-amber-500/20 space-y-1">
                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider block">
                          ⚠️ Off-Peak Stabling Break ({audit.breaks.length}):
                        </span>
                        {audit.breaks.map((b, bIdx) => (
                          <div key={bIdx} className="bg-slate-950/80 p-1.5 rounded text-[9.5px] text-amber-200 font-mono border border-amber-500/20">
                            Break: <strong>{b.breakFrom} ➔ {b.breakTo}</strong> ({b.durationMins} mins / {(b.durationMins / 60).toFixed(1)} hrs)
                            <div className="text-[8.5px] text-slate-400 mt-0.5">
                              Withdrawn under D{b.prevDuty} ➔ Re-inducted under D{b.nextDuty}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[9px] text-emerald-400/90 font-bold flex items-center gap-1 mt-0.5">
                        <CheckCircle2 size={10} /> Continuous service without mid-day withdrawal
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-500 italic py-1">
                    No timetabled service scheduled for {activeMeta.dayType}. Train stabled at depot siding.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4 relative z-10">
        {/* General Search */}
        <div className="relative flex-1 sm:w-56">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input 
            id="relieftracking-i1" 
            name="relieftracking-i1" 
            type="text" 
            placeholder="Search TID, Driver Name..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)} 
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors" 
          />
        </div>

        {/* Dedicated Duty Search */}
        <div className="relative flex-1 sm:w-56">
          <Filter className="absolute left-3 top-2.5 h-3.5 w-3.5 text-cyan-500/70" />
          <input 
            id="relieftracking-i2" 
            name="relieftracking-i2" 
            type="text" 
            placeholder="Filter Duty (e.g. 71, 11, 09)" 
            value={dutySearch} 
            onChange={(e) => setDutySearch(e.target.value)} 
            className="w-full bg-slate-950 border border-cyan-900/40 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-cyan-300 placeholder-slate-650 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/20 transition-colors" 
          />
        </div>

        {/* Train Filter Dropdown (ID Chart view) */}
        {viewMode === 'ID_CHART' && (
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-300">
            <Train size={12} className="text-cyan-400" />
            <select
              value={selectedTrainCol}
              onChange={(e) => setSelectedTrainCol(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none font-bold text-xs cursor-pointer"
            >
              <option value="ALL" className="bg-slate-900 text-white">
                All Trains ({trainColumns.length > 0 ? `${trainColumns[0]}-${trainColumns[trainColumns.length - 1]}` : ''})
              </option>
              {trainColumns.map(t => (
                <option key={t} value={t} className="bg-slate-900 text-white">Train {t}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 1: LIVE RELIEF HANDOVER CARDS                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {viewMode === 'CARDS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-160 overflow-y-auto pr-1 custom-scrollbar">
          {finalTrackingKeys.map(tid => {
            const tracking = effectiveLiveTrackingMap[tid] || effectiveLiveTrackingMap[normalizeTrackTrainId(tid)];
            const prev = tracking?.previous;
            const curr = tracking?.current;
            const next = tracking?.nextReliver;
            const isStabledFullDay = tracking?.isStabledFullDay;
            const isMidDayBreak = tracking?.isMidDayBreak;

            const cleanQuery = dutySearch.trim().toLowerCase().replace(/^d/i, '');
            const prevMatchesDuty = cleanQuery && String(prev?.dutyId || '').toLowerCase().includes(cleanQuery);
            const currMatchesDuty = cleanQuery && String(curr?.dutyId || '').toLowerCase().includes(cleanQuery);
            const nextMatchesDuty = cleanQuery && String(next?.dutyId || '').toLowerCase().includes(cleanQuery);

            return (
              <div key={tid} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all duration-200 shadow-md group">
                
                {/* Card Header */}
                <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-3">
                  <div className="flex items-center gap-2">
                    <Train className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                    <span className="font-black text-slate-100 text-xs tracking-wider">TRAIN ID: {tid}</span>
                  </div>
                  {curr ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span> ACTIVE FLEET
                    </span>
                  ) : isMidDayBreak ? (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-mono flex items-center gap-1">
                      <Clock size={10} /> MID-DAY STABLED ({tracking.breakDurationMins}m)
                    </span>
                  ) : isStabledFullDay ? (
                    <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/40 text-[9px] font-mono">
                      OFF-ROSTER / STABLED
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-slate-800/50 text-slate-400 border border-slate-700/40 text-[9px] font-mono">
                      STABLED / TERMINATED
                    </span>
                  )}
                </div>

                {/* Operators Flow */}
                <div className="space-y-2.5">
                  
                  {/* 1. PREVIOUS OPERATOR */}
                  <div className={`p-2 rounded-lg transition-colors flex flex-col gap-1 relative overflow-hidden ${
                    prevMatchesDuty 
                      ? 'bg-cyan-500/10 border-2 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.35)] animate-pulse' 
                      : 'bg-slate-900/40 border border-slate-900'
                  }`}>
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-slate-500">
                      <span className={prevMatchesDuty ? 'text-cyan-400 font-black' : ''}>Previous TO</span>
                      <span className="font-normal text-slate-600">Relieved</span>
                    </div>
                    {prev ? (
                      <div>
                        <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                          <User className={`h-3 w-3 ${prevMatchesDuty ? 'text-cyan-400' : 'text-slate-500'}`} />
                          {prev.empName} <span className="text-[9px] text-slate-600 font-normal">({prev.empId})</span>
                        </div>
                        <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${prevMatchesDuty ? 'text-cyan-300 font-bold' : 'text-slate-500'}`}>
                          <Clock className="h-2.5 w-2.5 text-slate-600" />
                          Duty {prev.dutyId} | {prev.startStr} - {prev.endStr}
                        </div>
                        {prev.isExchanged && (
                          <div className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider mt-1 border-t border-yellow-500/10 pt-1">
                            🔄 Exchanged | Orig: {prev.originalEmpName} ({prev.originalEmpId})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-650 italic">
                        {isStabledFullDay ? 'No previous operator (Stabled all day)' : 'No previous operator scheduled'}
                      </div>
                    )}
                  </div>

                  {/* Arrow Down */}
                  <div className="flex justify-center -my-1">
                    <ArrowRight className="h-3.5 w-3.5 text-slate-800 rotate-90" />
                  </div>

                  {/* 2. CURRENT OPERATOR */}
                  <div className={`p-2.5 rounded-lg flex flex-col gap-1 relative overflow-hidden transition-all ${
                    currMatchesDuty
                      ? 'bg-cyan-500/15 border-2 border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.45)] animate-pulse'
                      : curr
                      ? 'bg-emerald-500/5 border border-emerald-500/20'
                      : isMidDayBreak
                      ? 'bg-amber-950/20 border border-amber-600/30'
                      : 'bg-slate-900/40 border border-slate-900'
                  }`}>
                    <div className="absolute top-0 right-0 bottom-0 w-1 bg-emerald-500/40"></div>
                    <div className={`flex justify-between items-center text-[9px] uppercase tracking-wider font-bold ${
                      currMatchesDuty ? 'text-cyan-400' : curr ? 'text-emerald-400' : 'text-slate-500'
                    }`}>
                      <span>Current TO (At Controls)</span>
                      {curr ? (
                        <span className="flex items-center gap-1 text-[8px] px-1 bg-emerald-500/10 rounded text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span> Active
                        </span>
                      ) : isMidDayBreak ? (
                        <span className="text-[8px] text-amber-400 px-1 bg-amber-500/10 rounded">
                          Mid-Day Stabled
                        </span>
                      ) : null}
                    </div>
                    {curr ? (
                      <div>
                        <div className={`text-[11px] font-black flex items-center gap-1.5 ${
                          currMatchesDuty ? 'text-cyan-300' : 'text-emerald-300'
                        }`}>
                          <User className={`h-3 w-3 ${currMatchesDuty ? 'text-cyan-400' : 'text-emerald-400'}`} />
                          {curr.empName} <span className="text-[9px] text-slate-400 font-normal">({curr.empId})</span>
                        </div>
                        <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${
                          currMatchesDuty ? 'text-cyan-300 font-bold' : 'text-slate-400'
                        }`}>
                          <Clock className={`h-2.5 w-2.5 ${currMatchesDuty ? 'text-cyan-400' : 'text-emerald-500/70'}`} />
                          Duty {curr.dutyId} | {curr.startStr} - {curr.endStr}
                        </div>
                        {curr.isExchanged && (
                          <div className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider mt-1 border-t border-yellow-500/10 pt-1">
                            🔄 Exchanged | Orig: {curr.originalEmpName} ({curr.originalEmpId})
                          </div>
                        )}
                      </div>
                    ) : isMidDayBreak ? (
                      <div className="text-[10px] text-amber-300/80 italic">
                        Withdrawn at depot siding • Next re-induction in {tracking.breakDurationMins} mins
                      </div>
                    ) : isStabledFullDay ? (
                      <div className="text-[10px] text-slate-500 italic">
                        Not in mainline service • Stabled at Peenya Depot SBL
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-500/50 italic">No active operator on desk</div>
                    )}
                  </div>

                  {/* Arrow Down */}
                  <div className="flex justify-center -my-1">
                    <ArrowRight className="h-3.5 w-3.5 text-slate-800 rotate-90" />
                  </div>

                  {/* 3. NEXT OPERATOR */}
                  <div className={`p-2 rounded-lg transition-colors flex flex-col gap-1 relative overflow-hidden ${
                    nextMatchesDuty 
                      ? 'bg-cyan-500/10 border-2 border-cyan-500 shadow-[0_0_15px_rgba(6,182,212,0.35)] animate-pulse' 
                      : 'bg-slate-900/40 border border-slate-900'
                  }`}>
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold text-amber-500">
                      <span className={nextMatchesDuty ? 'text-cyan-400 font-black' : ''}>Next TO (Reliever)</span>
                      <span className="font-normal text-amber-600/60">Upcoming Handover</span>
                    </div>
                    {next ? (
                      <div>
                        <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                          <User className={`h-3 w-3 ${nextMatchesDuty ? 'text-cyan-400' : 'text-amber-500/70'}`} />
                          {next.empName} <span className="text-[9px] text-slate-500 font-normal">({next.empId})</span>
                        </div>
                        <div className={`text-[9px] font-medium flex items-center gap-1 mt-0.5 ${nextMatchesDuty ? 'text-cyan-300 font-bold' : 'text-slate-400'}`}>
                          <Clock className="h-2.5 w-2.5 text-amber-500/50" />
                          Duty {next.dutyId} | {next.startStr} - {next.endStr}
                        </div>
                        {next.isExchanged && (
                          <div className="text-[8px] text-yellow-500 font-bold uppercase tracking-wider mt-1 border-t border-yellow-500/10 pt-1">
                            🔄 Exchanged | Orig: {next.originalEmpName} ({next.originalEmpId})
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-650 italic">
                        {isStabledFullDay ? 'No upcoming reliever (Stabled all day)' : 'No upcoming reliever scheduled (Train Stabling)'}
                      </div>
                    )}
                  </div>

                </div>

                {/* Master ID Chart Leg Sequence Timeline */}
                {tracking?.allLegs && tracking.allLegs.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-slate-800/80">
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-cyan-400 font-bold">
                        <Layers size={11} className="text-cyan-400" />
                        Master ID Chart Leg Chain
                      </span>
                      <span className="text-[8px] text-slate-500 font-mono">
                        {tracking.allLegs.length} Shift Legs
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                      {tracking.allLegs.map((leg, lIdx) => {
                        const isCurrentLeg = curr?.dutyId === leg.dutyId && curr?.startStr === leg.startStr;
                        const isPastLeg = leg.endSec < currentTimeSecs;
                        const isNextLeg = next?.dutyId === leg.dutyId && next?.startStr === leg.startStr;
                        return (
                          <div
                            key={`leg-${leg.dutyId}-${lIdx}`}
                            className={`shrink-0 px-2 py-1 rounded text-[9px] font-mono border transition-all ${
                              isCurrentLeg
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 font-black shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                : isNextLeg
                                ? 'bg-amber-500/10 text-amber-300 border-amber-600/50 font-bold'
                                : isPastLeg
                                ? 'bg-slate-900/60 text-slate-500 border-slate-850'
                                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                            }`}
                            title={`Duty ${leg.dutyId}: ${leg.startStr} - ${leg.endStr} (${leg.empName})`}
                          >
                            <div className="flex items-center gap-1">
                              <span className={`font-black ${
                                isCurrentLeg ? 'text-emerald-400' : isNextLeg ? 'text-amber-400' : 'text-cyan-400'
                              }`}>
                                D{leg.dutyId}
                              </span>
                              <span className="text-[8px] text-slate-400">{leg.startStr}</span>
                              {isCurrentLeg && (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            );
          })}
          {finalTrackingKeys.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl italic font-bold">
              No active or relief operators match query parameters.
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 2: OFFICIAL MASTER RELIEVER ID CHART TABLE                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {viewMode === 'ID_CHART' && (
        <div className="space-y-3">
          {/* Header Banner */}
          <div className="bg-slate-950 border border-cyan-900/60 rounded-xl p-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-black text-xs">
                OFFICIAL WTT LINK
              </span>
              <span className="text-xs text-white font-bold">
                {activeMeta.title}
              </span>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-slate-400 mr-2">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-400 inline-block"></span>
                  <span>Active Leg Now</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-sm bg-cyan-950 border border-cyan-500 inline-block"></span>
                  <span>Matched Search</span>
                </span>
                <span className="text-slate-500 font-mono">Columns: {filteredIdChartColumns.length}</span>
              </div>

              {/* Master ID Chart Download Buttons */}
              <div className="flex items-center gap-1 bg-slate-900/90 p-0.5 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => handleDownloadMasterIdChart('ALL_DAYS')}
                  disabled={isExporting}
                  className="px-2.5 py-1 rounded text-[11px] font-bold font-mono flex items-center gap-1.5 transition-all bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm disabled:opacity-50"
                  title="Download full Master ID Chart Excel workbook for ALL train IDs and ALL day types (Weekday, Monday, Saturday, GH, Sunday)"
                >
                  <Download size={12} className={isExporting ? 'animate-bounce' : ''} />
                  <span>Download All Days</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadMasterIdChart('ACTIVE_DAY')}
                  disabled={isExporting}
                  className="px-2 py-1 rounded text-[11px] font-bold font-mono flex items-center gap-1 transition-all bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 disabled:opacity-50"
                  title={`Download ${selectedDay} Master ID Chart Excel`}
                >
                  <FileSpreadsheet size={12} />
                  <span>{selectedDay}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Master Grid Table (Horizontally Scrollable) */}
          <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-160 custom-scrollbar bg-slate-950">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-900 border-b border-slate-800">
                <tr>
                  {filteredIdChartColumns.map(trainId => (
                    <th key={`hdr-${trainId}`} colSpan={5} className="p-2 text-center border-r border-slate-800 bg-slate-900">
                      <div className="flex items-center justify-center gap-1.5">
                        <Train size={12} className="text-cyan-400" />
                        <span className="font-black text-white text-xs tracking-wider">{trainId}</span>
                      </div>
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-950/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800 font-bold">
                  {filteredIdChartColumns.map(trainId => (
                    <React.Fragment key={`sub-${trainId}`}>
                      <th className="py-1 px-1 text-center text-amber-400 w-12 border-r border-slate-800/40">Duty</th>
                      <th className="py-1 px-1.5 text-center text-emerald-400/90 w-24 border-r border-slate-800/40">TOC</th>
                      <th className="py-1 px-1 text-center text-slate-400 w-12 border-r border-slate-800/40">From</th>
                      <th className="py-1 px-1 text-center text-slate-400 w-12 border-r border-slate-800/40">To</th>
                      <th className="py-1 px-1.5 text-center text-cyan-300 w-20 border-r border-slate-800">HOC</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: maxRowsInChart }).map((_, rowIndex) => {
                  return (
                    <tr key={`row-${rowIndex}`} className="border-b border-slate-900/80 hover:bg-slate-900/40 transition-colors">
                      {filteredIdChartColumns.map(trainId => {
                        const legs = dynamicMasterIdChart[trainId] || dynamicMasterIdChart[normalizeTrackTrainId(trainId)] || [];
                        const leg = legs[rowIndex];

                        if (!leg) {
                          return (
                            <React.Fragment key={`cell-${trainId}-${rowIndex}`}>
                              <td className="py-1.5 px-1 text-center text-slate-700 border-r border-slate-800/30">-</td>
                              <td className="py-1.5 px-1 text-center text-slate-700 border-r border-slate-800/30">-</td>
                              <td className="py-1.5 px-1 text-center text-slate-700 border-r border-slate-800/30">-</td>
                              <td className="py-1.5 px-1 text-center text-slate-700 border-r border-slate-800/30">-</td>
                              <td className="py-1.5 px-1 text-center text-slate-700 border-r border-slate-800">-</td>
                            </React.Fragment>
                          );
                        }

                        const startSec = timeStringToSeconds(leg.from);
                        let endSec = timeStringToSeconds(leg.to);
                        if (endSec < startSec) endSec += 24 * 3600;

                        const isActiveNow = currentTimeSecs >= startSec && currentTimeSecs <= endSec;
                        const normDuty = String(leg.duty || leg.dutyId).padStart(2, '0');
                        const isDutyMatched = dutySearch && normDuty.includes(dutySearch.trim().replace(/^d/i, ''));

                        const dispatchOp = dispatchDutyOperatorMap[normDuty];
                        const tracking = effectiveLiveTrackingMap[trainId] || effectiveLiveTrackingMap[normalizeTrackTrainId(trainId)];
                        const matchedOp = (tracking?.current?.dutyId === normDuty) ? tracking.current
                                        : (tracking?.nextReliver?.dutyId === normDuty) ? tracking.nextReliver
                                        : (tracking?.previous?.dutyId === normDuty) ? tracking.previous
                                        : null;
                        const defaultRosterOp = getOperatorForDuty(normDuty);

                        const dynamicRosterItem = dynamicDutyRoster[normDuty];
                        const legEmpName = leg.empName || dynamicRosterItem?.assignedOperator?.empName;
                        const legEmpId = leg.empId || dynamicRosterItem?.assignedOperator?.empId;

                        const opDisplayName = dispatchOp?.empName
                          || (matchedOp?.empName && matchedOp.empName !== '--' && !matchedOp.empName.startsWith('Train Operator') && !matchedOp.empName.startsWith('Duty ') ? matchedOp.empName : null)
                          || (legEmpName && legEmpName !== '--' && !legEmpName.startsWith('Duty ') ? legEmpName : null)
                          || defaultRosterOp?.empName
                          || '';
                        const opDisplayId = dispatchOp?.empId
                          || (matchedOp?.empId && matchedOp.empId !== '--' ? matchedOp.empId : null)
                          || (legEmpId && legEmpId !== '--' ? legEmpId : null)
                          || defaultRosterOp?.empId
                          || '';

                        return (
                          <React.Fragment key={`cell-${trainId}-${rowIndex}`}>
                            {/* 1. DUTY */}
                            <td 
                              onDoubleClick={() => handleOpenDutyEdit(leg.duty || leg.dutyId)}
                              className={`py-1.5 px-1 text-center border-r border-slate-800/40 cursor-pointer transition-colors hover:bg-cyan-900/40 ${
                                isActiveNow 
                                  ? 'bg-emerald-950/80 text-emerald-300 font-black' 
                                  : isDutyMatched
                                  ? 'bg-cyan-950 text-cyan-300 font-black'
                                  : 'text-amber-400 font-black'
                              }`} 
                              title={opDisplayName ? `Operator: ${opDisplayName} (${opDisplayId}) • Double-click to edit Duty ${leg.duty || leg.dutyId}` : `Duty ${leg.duty || leg.dutyId} • Double-click to edit`}
                            >
                              <div className="flex flex-col items-center">
                                <span className="text-[11px] leading-tight font-black">
                                  {leg.duty || leg.dutyId}
                                </span>
                                {isActiveNow && (
                                  <span className="text-[7px] uppercase tracking-tighter text-emerald-400 font-black flex items-center gap-0.5">
                                    <span className="h-1 w-1 rounded-full bg-emerald-400 animate-ping"></span> LIVE
                                  </span>
                                )}
                                {opDisplayName && (
                                  <span className="text-[7.5px] text-slate-300 truncate max-w-12" title={`${opDisplayName} (${opDisplayId})`}>
                                    {opDisplayName.split(' ')[0]}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 2. TOC (Takeover Location) */}
                            <td 
                              className={`py-1.5 px-1.5 text-center text-[9px] font-bold border-r border-slate-800/40 whitespace-nowrap ${
                                leg.toc ? 'text-emerald-400/90 font-bold' : 'text-slate-650'
                              } ${isActiveNow ? 'bg-emerald-950/60' : ''}`}
                              title={leg.toc ? `Takeover Location: ${leg.toc}` : 'Standard TOC / Not Specified'}
                            >
                              {leg.toc || '-'}
                            </td>

                            {/* 3. FROM */}
                            <td 
                              onDoubleClick={() => handleOpenDutyEdit(leg.duty || leg.dutyId)}
                              className={`py-1.5 px-1 text-center text-[10px] font-mono font-bold border-r border-slate-800/40 cursor-pointer transition-colors hover:bg-slate-800/80 whitespace-nowrap ${
                                isActiveNow ? 'bg-emerald-950/60 text-emerald-300 font-black' : 'text-slate-300'
                              }`}
                              title="Double-click to quick-edit duty in roster"
                            >
                              {leg.from || '-'}
                            </td>

                            {/* 4. TO */}
                            <td 
                              onDoubleClick={() => handleOpenDutyEdit(leg.duty || leg.dutyId)}
                              className={`py-1.5 px-1 text-center text-[10px] font-mono font-bold border-r border-slate-800/40 cursor-pointer transition-colors hover:bg-slate-800/80 whitespace-nowrap ${
                                isActiveNow ? 'bg-emerald-950/60 text-emerald-300 font-black' : 'text-slate-300'
                              }`}
                              title="Double-click to quick-edit duty in roster"
                            >
                              {leg.to || '-'}
                            </td>

                            {/* 5. HOC (Handover Location) */}
                            <td 
                              className={`py-1.5 px-1.5 text-center text-[9px] font-bold border-r border-slate-800 whitespace-nowrap ${
                                leg.hoc ? 'text-cyan-300/90 font-bold' : 'text-slate-650'
                              } ${isActiveNow ? 'bg-emerald-950/60' : ''}`}
                              title={leg.hoc ? `Handover Location: ${leg.hoc}` : 'Standard HOC / Not Specified'}
                            >
                              {leg.hoc || '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 3: DUTY-TO-TRAIN ROSTER SUMMARY                                 */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {viewMode === 'DUTY_SUMMARY' && (
        <div className="space-y-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex justify-between items-center text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-white font-bold">
                Duty Roster Leg Sequence (Synced to {selectedDay} Link Roster • Dynamic Operational Terminal)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold font-mono">
                {Object.keys(dynamicDutyLegs).length} Duties Master ({selectedDay} LINK)
              </span>
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Total Duties: <strong className="text-cyan-400">{Object.keys(dynamicDutyLegs).length}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-160 overflow-y-auto pr-1 custom-scrollbar">
            {Object.keys(dynamicDutyLegs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(dutyNo => {
              const legs = dynamicDutyLegs[dutyNo] || [];
              const normD = dutyNo.padStart(2, '0');
              const cleanDutyQuery = dutySearch.trim().toLowerCase().replace(/^d/i, '');
              const matchesDuty = !cleanDutyQuery || 
                dutyNo.toLowerCase().includes(cleanDutyQuery) || 
                normD.includes(cleanDutyQuery) ||
                String(parseInt(dutyNo, 10)).includes(cleanDutyQuery);

              if (!matchesDuty) return null;

              const activeLeg = legs.find(l => currentTimeSecs >= l.startSec && currentTimeSecs <= l.endSec);
              const meta = legs.meta;

              const dispatchOp = dispatchDutyOperatorMap[normD];
              const defaultRosterOp = getOperatorForDuty(normD);
              const liveOpMatch = Object.values(effectiveLiveTrackingMap).find(t => 
                t.current?.dutyId === normD || t.nextReliver?.dutyId === normD || t.previous?.dutyId === normD
              );
              const liveOp = liveOpMatch?.current?.dutyId === normD ? liveOpMatch.current 
                          : liveOpMatch?.nextReliver?.dutyId === normD ? liveOpMatch.nextReliver 
                          : null;
              const hasLiveOp = Boolean(dispatchOp?.empName || liveOp?.empName);

              const displayEmpName = dispatchOp?.empName
                || (liveOp?.empName && liveOp.empName !== '--' && !liveOp.empName.startsWith('Duty ') ? liveOp.empName : null)
                || defaultRosterOp?.empName
                || null;
              const displayEmpId = dispatchOp?.empId
                || (liveOp?.empId && liveOp.empId !== '--' ? liveOp.empId : null)
                || defaultRosterOp?.empId
                || null;

              return (
                <div 
                  key={`duty-card-${dutyNo}`}
                  className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                    activeLeg 
                      ? 'bg-emerald-950/20 border-emerald-500/50 shadow-md ring-1 ring-emerald-500/30' 
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div>
                    {/* Header: Duty Number & Shift Badge */}
                    <div className="flex items-center justify-between border-b border-slate-850 pb-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-cyan-400">
                          DUTY {dutyNo}
                        </span>
                        {meta?.dutyType && (
                          <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded border uppercase ${
                            meta.dutyType === 'N' || meta.dutyType === 'NPRO'
                              ? 'bg-purple-950/80 text-purple-300 border-purple-800'
                              : meta.dutyType === 'B'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                              : 'bg-cyan-950/80 text-cyan-300 border-cyan-800'
                          }`}>
                            {meta.dutyType} SHIFT
                          </span>
                        )}
                        {meta?.remarks && meta.remarks !== '--' && !meta.remarks.startsWith('DUTY') && (
                          <span className="text-[8px] font-mono text-slate-400 truncate max-w-16.25" title={meta.remarks}>
                            {meta.remarks}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {legs.length === 0 ? (
                          <span className="text-[9.5px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800 font-bold">
                            NO TRIP (STANDBY/PRO)
                          </span>
                        ) : (
                          <span className="text-[9.5px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 font-bold">
                            {legs.length} Leg{legs.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenDutyEdit(dutyNo)}
                          className="px-1.5 py-0.5 rounded bg-cyan-950/80 hover:bg-cyan-800 text-cyan-300 border border-cyan-700/60 text-[9px] font-bold flex items-center gap-1 transition-all"
                          title="Quick Edit this Duty and synchronize sub-systems"
                        >
                          <Edit3 size={10} /> Edit
                        </button>
                      </div>
                    </div>

                    {/* Sign On / Off Times */}
                    {meta?.signOnTime && (
                      <div className="text-[8.5px] text-slate-400 font-mono mb-2 flex items-center justify-between bg-slate-900/40 px-2 py-1 rounded border border-slate-850/60">
                        <span>ON: <strong className="text-slate-200">{meta.signOnTime}</strong> ({meta.signOnLocation || 'PYID'})</span>
                        <span className="text-slate-600">➔</span>
                        <span>OFF: <strong className="text-slate-200">{meta.signOffTime}</strong> ({meta.signOffLocation || 'PYID'})</span>
                      </div>
                    )}

                    {/* Ordered Train Legs or Standby/Pro Notice */}
                    {legs.length === 0 ? (
                      <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-600/30 text-amber-300/90 flex flex-col items-center justify-center text-center space-y-1.5 my-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-300">
                          <AlertTriangle size={13} className="text-amber-400" />
                          <span>NO TRAIN TRIP ASSIGNED</span>
                        </div>
                        <span className="text-[9px] font-mono text-amber-400/80 font-bold px-2 py-0.5 rounded bg-amber-950/60 border border-amber-800/40">
                          {meta?.dutyProfile || meta?.remarks || 'STANDBY / PROCTOR DUTY'}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {legs.map((leg, idx) => {
                          const isLegActive = currentTimeSecs >= leg.startSec && currentTimeSecs <= leg.endSec;
                          return (
                            <div 
                              key={`leg-${dutyNo}-${idx}`}
                              className={`p-1.5 rounded-lg flex items-center justify-between text-[10px] ${
                                isLegActive 
                                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40' 
                                  : 'bg-slate-900/60 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-1.5">
                                <Train size={11} className={isLegActive ? 'text-emerald-400' : 'text-slate-500'} />
                                <strong className="text-white">T-{leg.trainId}</strong>
                              </div>
                              <span className="font-mono text-[9px] text-slate-400">
                                {leg.from} ➔ {leg.to}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer: KM, Driving Hours & Assigned Operator */}
                  <div className="mt-2.5 pt-2 border-t border-slate-850 space-y-1">
                    {meta && (meta.totalKm > 0 || (meta.drivingHrs && meta.drivingHrs !== '00:00')) && (
                      <div className="flex items-center justify-between text-[8.5px] font-mono text-slate-400">
                        <span>KM: <strong className="text-emerald-400">{meta.totalKm} km</strong></span>
                        <span>DRIVE: <strong className="text-cyan-300">{meta.drivingHrs}</strong></span>
                      </div>
                    )}
                    {(displayEmpName || hasLiveOp) && (
                      <div className={`text-[8.5px] font-mono px-2 py-0.5 rounded border flex items-center justify-between ${
                        hasLiveOp
                          ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}>
                        <span className="truncate">TO: <strong>{displayEmpName}</strong> {displayEmpId && displayEmpId !== '--' ? `(${displayEmpId})` : ''}</span>
                        <span className={`text-[7.5px] font-black uppercase ${hasLiveOp ? 'text-emerald-400' : 'text-cyan-400'}`}>
                          {hasLiveOp ? 'LIVE' : 'ROSTER'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* QUICK EDIT DUTY MODAL (Instantly Cascade: Link -> Duty -> Master ID -> Handover) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {editingDutyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-2xl p-5 w-full max-w-xl shadow-2xl shadow-cyan-950/50 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/40 font-black">
                  <Edit3 size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    Edit Duty {editingDutyModal}
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700/60 font-mono">
                      {selectedDay} SCHEDULE
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Saves directly to database and cascades automatically to Duty Roster, Master ID Chart, and Handover Cards.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDutyModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveDutyEdit} className="space-y-4">
              {/* Operator Details */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-3">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">
                  Assigned Train Operator Details
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Operator Name</label>
                    <input
                      type="text"
                      value={dutyFormData.empName}
                      onChange={e => setDutyFormData(prev => ({ ...prev, empName: e.target.value }))}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Operator Employee ID</label>
                    <input
                      type="text"
                      value={dutyFormData.empId}
                      onChange={e => setDutyFormData(prev => ({ ...prev, empId: e.target.value }))}
                      placeholder="e.g. BMRCL-1042"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                </div>

                {/* Shift Hours */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-slate-850">
                  <div>
                    <label className="text-[9px] text-slate-400 block mb-0.5">Sign On Time</label>
                    <input
                      type="time"
                      value={dutyFormData.signOnTime}
                      onChange={e => setDutyFormData(prev => ({ ...prev, signOnTime: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block mb-0.5">Sign On Place</label>
                    <input
                      type="text"
                      value={dutyFormData.signOnLocation}
                      onChange={e => setDutyFormData(prev => ({ ...prev, signOnLocation: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block mb-0.5">Sign Off Time</label>
                    <input
                      type="time"
                      value={dutyFormData.signOffTime}
                      onChange={e => setDutyFormData(prev => ({ ...prev, signOffTime: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-400 block mb-0.5">Sign Off Place</label>
                    <input
                      type="text"
                      value={dutyFormData.signOffLocation}
                      onChange={e => setDutyFormData(prev => ({ ...prev, signOffLocation: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Legs Working Configuration */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-3">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                  Train Legs Working (Roster Sequence)
                </span>

                {/* Leg 1 */}
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <span className="text-[9.5px] font-bold text-slate-300 block">Leg 1 Working</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">Train No</label>
                      <input
                        type="text"
                        value={dutyFormData.leg1TrainNo}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg1TrainNo: e.target.value }))}
                        placeholder="e.g. 101 or 1"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">From Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg1TimeFrom}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg1TimeFrom: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">To Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg1TimeTo}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg1TimeTo: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Leg 2 */}
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <span className="text-[9.5px] font-bold text-slate-300 block">Leg 2 Working (Follow Train)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">Train No</label>
                      <input
                        type="text"
                        value={dutyFormData.leg2TrainNo}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg2TrainNo: e.target.value }))}
                        placeholder="e.g. 102 or --"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">From Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg2DepTime}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg2DepTime: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">To Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg2ArrTime}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg2ArrTime: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Leg 3 */}
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <span className="text-[9.5px] font-bold text-slate-300 block">Leg 3 Working (Optional)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">Train No</label>
                      <input
                        type="text"
                        value={dutyFormData.leg3TrainNo}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg3TrainNo: e.target.value }))}
                        placeholder="e.g. 103 or --"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">From Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg3DepTime}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg3DepTime: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">To Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg3ArrTime}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg3ArrTime: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Leg 4 */}
                <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800 space-y-1.5">
                  <span className="text-[9.5px] font-bold text-slate-300 block">Leg 4 Working (Final Leg)</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">Train No</label>
                      <input
                        type="text"
                        value={dutyFormData.leg4TrainNo}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg4TrainNo: e.target.value }))}
                        placeholder="e.g. 104 or --"
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">From Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg4FinalDepTime}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg4FinalDepTime: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[8.5px] text-slate-500 block">To Time</label>
                      <input
                        type="time"
                        value={dutyFormData.leg4FinalArrTime}
                        onChange={e => setDutyFormData(prev => ({ ...prev, leg4FinalArrTime: e.target.value }))}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingDutyModal(null)}
                  disabled={isSavingDuty}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDuty}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-black shadow-lg shadow-cyan-900/40 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  <Save size={14} className={isSavingDuty ? "animate-spin" : ""} />
                  {isSavingDuty ? "Synchronizing Sub-Systems..." : "Save & Synchronize All Sub-Systems"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
import React, { useState } from 'react';
import { 
  Plus, Calendar, Clock, MapPin, AlertCircle, CheckCircle, ShieldAlert,
  GraduationCap, RefreshCw, HeartPulse, UserX, Users, ArrowRightLeft, 
  Sparkles, Trash2, Filter, CalendarRange, Repeat, CheckCircle2, ShieldCheck,
  BarChart2, Zap, Train, Award, Shield, FileText, CheckSquare, ClipboardList
} from 'lucide-react';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import WhatIfSimulator from './WhatIfSimulator';

// Helper: compute duration in days (inclusive)
function calcDuration(from, to) {
  if (!from || !to) return 1;
  const d1 = new Date(from);
  const d2 = new Date(to);
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return 1;
  return Math.floor((d2 - d1) / 86400000) + 1;
}

// Helper: format date "DD Mon YYYY"
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Helper: add days to an ISO date string
function addDays(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function NextDayRequirementsCenter({
  targetDate,
  crewList = EMPLOYEE_MASTER_REGISTRY,
  activeRequests = [],
  onRequestAdded,
  onRequestDeleted
}) {
  const [activeSection, setActiveSection] = useState('DEMANDS');
  const [modalType, setModalType] = useState(null);

  // Common Form States
  const [selectedEmpId,      setSelectedEmpId]      = useState('');
  const [selectedEmpId2,     setSelectedEmpId2]     = useState('');
  const [topic,              setTopic]              = useState('');
  const [dutyTitle,          setDutyTitle]          = useState('');
  const [startTime,          setStartTime]          = useState('10:00');
  const [endTime,            setEndTime]            = useState('13:00');
  const [location,           setLocation]           = useState('PYID');
  const [priority,           setPriority]           = useState('HIGH');
  const [qty,                setQty]                = useState(1);
  const [reason,             setReason]             = useState('');
  const [filterType,         setFilterType]         = useState('ALL');

  // Universal Duration Dates (From Date -> To Date)
  const [reqFromDate,        setReqFromDate]        = useState(targetDate);
  const [reqToDate,          setReqToDate]          = useState(targetDate);

  // Leave-specific state (CL, EL, HPL, ML, MS, GHEL, CO, Special)
  const [leaveType,          setLeaveType]          = useState('CL');

  // Shift-request-specific & Active Duty state (A, B, C/Night, G/General)
  const [preferredShift,     setPreferredShift]     = useState('A');
  const [dutyNumber,         setDutyNumber]         = useState('Duty 01');

  // Enhanced module-specific states
  const [trainingCategory,   setTrainingCategory]   = useState('Emergency Evacuation Skill Enhancement');
  const [crtModule,          setCrtModule]          = useState('Annual Rulebook & Safety Recertification');
  const [crtValidity,        setCrtValidity]        = useState('1 Year (Standard BMRCL Refresher)');
  const [bookOffReasonType,  setBookOffReasonType]  = useState('Sudden Sickness / Medical Indisposition');
  const [stationSector,      setStationSector]      = useState('Peenya Depot (PYID)');
  const [extraDutyType,      setExtraDutyType]      = useState('Line Driving');
  const [testingType,        setTestingType]        = useState('Peenya Depot Test Track Trial');
  const [competencyRequired, setCompetencyRequired] = useState('Mainline Certified TO');
  const [exchangeType,       setExchangeType]       = useState('Full Shift Mutual Swap');
  const [mlExtendedStatus,   setMlExtendedStatus]   = useState('Standard 180 Days (Karnataka Govt Norms)');
  const [restrictionType,    setRestrictionType]    = useState('Pink Duty (Pregnancy)');

  const activeTOs = crewList.filter(e => (e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active)) && !e.isRelieved && e.activeCrew !== false);

  const durationDays = calcDuration(reqFromDate, reqToDate);

  const openModal = (type, customDefaults = {}) => {
    setModalType(type);
    const fromD = customDefaults.fromDate || targetDate;
    const toD   = customDefaults.toDate   || targetDate;
    setReqFromDate(fromD);
    setReqToDate(toD);
    setSelectedEmpId(customDefaults.empId || '');
    setSelectedEmpId2(customDefaults.empId2 || '');
    setTopic(customDefaults.topic || '');
    setDutyTitle(customDefaults.dutyTitle || '');
    setStartTime(customDefaults.startTime || (type === 'TEST_TRACK' ? '23:00' : type === 'ACTIVE_DUTY' ? '06:00' : type === 'OTHER_DUTY' ? '09:00' : '10:00'));
    setEndTime(customDefaults.endTime || (type === 'TEST_TRACK' ? '03:30' : type === 'ACTIVE_DUTY' ? '14:00' : type === 'OTHER_DUTY' ? '17:30' : '13:00'));
    setLocation(customDefaults.location || 'PYID');
    setPriority(customDefaults.priority || (['BOOK_OFF', 'LEAVE', 'MATERNITY_LEAVE'].includes(type) ? 'CRITICAL' : 'HIGH'));
    setQty(customDefaults.qty || 1);
    setReason(customDefaults.reason || '');
    setLeaveType(customDefaults.leaveType || 'CL');
    setPreferredShift(customDefaults.preferredShift || 'A');
    setDutyNumber(customDefaults.dutyNumber || 'Duty 01');
    setTrainingCategory(customDefaults.trainingCategory || 'Emergency Evacuation Skill Enhancement');
    setCrtModule(customDefaults.crtModule || 'Annual Rulebook & Safety Recertification');
    setCrtValidity(customDefaults.crtValidity || '1 Year (Standard BMRCL Refresher)');
    setBookOffReasonType(customDefaults.bookOffReasonType || 'Sudden Sickness / Medical Indisposition');
    setStationSector(customDefaults.stationSector || 'Peenya Depot (PYID)');
    setExtraDutyType(customDefaults.extraDutyType || 'Line Driving');
    setTestingType(customDefaults.testingType || 'Peenya Depot Test Track Trial');
    setCompetencyRequired(customDefaults.competencyRequired || 'Mainline Certified TO');
    setExchangeType(customDefaults.exchangeType || 'Full Shift Mutual Swap');
    setMlExtendedStatus(customDefaults.mlExtendedStatus || 'Standard 180 Days (Karnataka Govt Norms)');
    setRestrictionType(customDefaults.restrictionType || 'Pink Duty (Pregnancy)');
  };

  const handleCreateRequest = (e) => {
    e.preventDefault();
    const emp  = activeTOs.find(x => x.empId === parseInt(selectedEmpId,  10));
    const emp2 = activeTOs.find(x => x.empId === parseInt(selectedEmpId2, 10));

    let autoTopic = topic;
    if (!autoTopic) {
      if (modalType === 'ACTIVE_DUTY') {
        autoTopic = `Active Duty: ${dutyNumber} (${preferredShift} Shift)`;
      } else if (modalType === 'TRAINING') {
        autoTopic = `Training: ${trainingCategory} (${durationDays}d)`;
      } else if (modalType === 'CRT') {
        autoTopic = `CRT: ${crtModule} (${durationDays}d)`;
      } else if (modalType === 'LEAVE') {
        autoTopic = `${leaveType} Leave (${durationDays}d)`;
      } else if (modalType === 'BOOK_OFF') {
        autoTopic = `Book-Off: ${bookOffReasonType} (${durationDays}d)`;
      } else if (modalType === 'SHIFT_REQUEST') {
        const sLabel = preferredShift === 'N' ? 'C Shift (Night)' : preferredShift === 'G' ? 'G Shift (General)' : `${preferredShift} Shift`;
        autoTopic = `Shift Request: ${sLabel}${dutyNumber ? ` (Pref: ${dutyNumber})` : ''} (${durationDays}d)`;
      } else if (modalType === 'MATERNITY_LEAVE') {
        autoTopic = `Maternity Leave (ML) — ${mlExtendedStatus}`;
      } else if (modalType === 'EXTRA_MANPOWER') {
        autoTopic = `Extra Manpower (${qty} TOs - ${extraDutyType} @ ${stationSector})`;
      } else if (modalType === 'TEST_TRACK') {
        autoTopic = `Test Track: ${testingType} (${competencyRequired})`;
      } else if (modalType === 'NIGHT_EXCHANGE') {
        autoTopic = `Mutual Shift Exchange (${exchangeType})`;
      } else if (modalType === 'SPECIAL_DUTY') {
        autoTopic = `Special Duty: ${restrictionType}`;
      } else if (modalType === 'OTHER_DUTY') {
        autoTopic = dutyTitle.trim() || 'Other Duty';
      } else {
        autoTopic = modalType.replace(/_/g, ' ');
      }
    }

    const newReq = {
      id:                 'REQ_' + Date.now(),
      type:               modalType,
      date:               targetDate,
      fromDate:           reqFromDate,
      toDate:             reqToDate,
      durationDays:       durationDays,
      empId:              emp  ? emp.empId  : null,
      empName:            emp  ? emp.name   : null,
      empId2:             emp2 ? emp2.empId : null,
      empName2:           emp2 ? emp2.name  : null,
      topic:              autoTopic,
      dutyTitle:          modalType === 'OTHER_DUTY' ? (dutyTitle.trim() || autoTopic) : null,
      dutyNumber:         ['ACTIVE_DUTY', 'SHIFT_REQUEST'].includes(modalType) ? dutyNumber : null,
      trainingCategory:   modalType === 'TRAINING' ? trainingCategory : null,
      crtModule:          modalType === 'CRT' ? crtModule : null,
      crtValidity:        modalType === 'CRT' ? crtValidity : null,
      bookOffReasonType:  modalType === 'BOOK_OFF' ? bookOffReasonType : null,
      stationSector:      modalType === 'EXTRA_MANPOWER' ? stationSector : null,
      testingType:        modalType === 'TEST_TRACK' ? testingType : null,
      exchangeType:       modalType === 'NIGHT_EXCHANGE' ? exchangeType : null,
      leaveType:          modalType === 'LEAVE' ? leaveType : (modalType === 'MATERNITY_LEAVE' ? 'ML' : null),
      preferredShift:     ['SHIFT_REQUEST', 'ACTIVE_DUTY'].includes(modalType) ? preferredShift : null,
      extraDutyType:      modalType === 'EXTRA_MANPOWER' ? extraDutyType : null,
      competencyRequired: modalType === 'TEST_TRACK' ? competencyRequired : null,
      mlExtendedStatus:   modalType === 'MATERNITY_LEAVE' ? mlExtendedStatus : null,
      restrictionType:    modalType === 'SPECIAL_DUTY' ? restrictionType : null,
      startTime,
      endTime,
      location,
      priority,
      qty:                parseInt(qty, 10) || 1,
      reason,
      status:             'APPROVED',
      createdAt:          new Date().toISOString()
    };

    if (onRequestAdded) onRequestAdded(newReq);

    // Close & Reset
    setModalType(null);
    setSelectedEmpId('');
    setSelectedEmpId2('');
    setTopic('');
    setDutyTitle('');
    setReason('');
  };

  const filteredList = activeRequests.filter(r => {
    if (filterType === 'ALL') return true;
    return r.type === filterType;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Sub-Navigation Switcher: Active Requirements vs. What-If Simulator */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveSection('DEMANDS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeSection === 'DEMANDS'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Operational Requirements Command</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
            activeSection === 'DEMANDS' ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-400'
          }`}>
            {activeRequests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSection('WHAT_IF')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${
            activeSection === 'WHAT_IF'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-850 border border-slate-800'
          }`}
        >
          <BarChart2 className="w-4 h-4 text-purple-400" />
          <span>What-If Scenario Simulator</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
            activeSection === 'WHAT_IF' ? 'bg-purple-800 text-white' : 'bg-purple-950/60 text-purple-300 border border-purple-500/30'
          }`}>
            Predictive AI
          </span>
        </button>
      </div>

      {activeSection === 'DEMANDS' ? (
        <>
          {/* Top Header Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/25 rounded-full text-xs font-bold uppercase tracking-wider">
                  Target Date: {targetDate}
                </span>
                <span className="text-xs text-slate-400">
                  Total Active Requirements: <strong className="text-white">{activeRequests.length}</strong>
                </span>
              </div>
              <h2 className="text-xl font-black text-white mt-1">Next-Day Requirements Command Center</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Submit pre-generation operational demands with interactive date-time pickers, duration tracking, and constraint enforcement.
              </p>
            </div>

            {/* Action Buttons Grid (All 11 Enhanced Requirement Modules) */}
            <div className="flex flex-wrap gap-2">
              {/* 1. ⚡ + Active Duty */}
              <button
                onClick={() => openModal('ACTIVE_DUTY', { dutyNumber: 'Duty 01', preferredShift: 'A', startTime: '06:00', endTime: '14:00', priority: 'HIGH' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/40 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Zap className="w-4 h-4 text-teal-400" />
                ⚡ + Active Duty
              </button>

              {/* 2. + Training */}
              <button
                onClick={() => openModal('TRAINING', { trainingCategory: 'Emergency Evacuation Skill Enhancement', qty: 1 })}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <GraduationCap className="w-4 h-4 text-indigo-400" />
                + Training
              </button>

              {/* 3. + CRT */}
              <button
                onClick={() => openModal('CRT', { crtModule: 'Annual Rulebook & Safety Recertification', qty: 1 })}
                className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-cyan-400" />
                + CRT
              </button>

              {/* 4. + Leave Request */}
              <button
                onClick={() => openModal('LEAVE', { leaveType: 'CL', priority: 'CRITICAL' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <CalendarRange className="w-4 h-4 text-rose-400" />
                + Leave Request
              </button>

              {/* 5. + Book-Off */}
              <button
                onClick={() => openModal('BOOK_OFF', { priority: 'CRITICAL', bookOffReasonType: 'Sudden Sickness / Medical Indisposition' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-300 border border-orange-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <UserX className="w-4 h-4 text-orange-400" />
                + Book-Off
              </button>

              {/* 6. + Shift Request */}
              <button
                onClick={() => openModal('SHIFT_REQUEST', { preferredShift: 'A', priority: 'HIGH' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Repeat className="w-4 h-4 text-emerald-400" />
                + Shift Request
              </button>

              {/* 7. + Extra Manpower */}
              <button
                onClick={() => openModal('EXTRA_MANPOWER', { qty: 2, extraDutyType: 'Line Driving', stationSector: 'Peenya Depot (PYID)' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Users className="w-4 h-4 text-amber-400" />
                + Extra Manpower
              </button>

              {/* 8. + Test Track */}
              <button
                onClick={() => openModal('TEST_TRACK', { testingType: 'Peenya Depot Test Track Trial', startTime: '23:00', endTime: '03:30', qty: 2, competencyRequired: 'Mainline Certified TO' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <MapPin className="w-4 h-4 text-purple-400" />
                + Test Track
              </button>

              {/* 9. + Duty Exchange */}
              <button
                onClick={() => openModal('NIGHT_EXCHANGE', { exchangeType: 'Full Shift Mutual Swap' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-600/20 hover:bg-slate-600/30 text-slate-300 border border-slate-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <ArrowRightLeft className="w-4 h-4 text-slate-400" />
                + Duty Exchange
              </button>

              {/* 10. 🌸 + Maternity Leave (ML) */}
              <button
                onClick={() => openModal('MATERNITY_LEAVE', {
                  fromDate: targetDate,
                  toDate: addDays(targetDate, 179), // Statutory 180 Days
                  priority: 'CRITICAL',
                  mlExtendedStatus: 'Standard 180 Days (Karnataka Govt Norms)',
                  reason: 'Maternity Leave (180 Days) as per Karnataka Govt Norms. Eligible for EL/HPL extension upon completion.'
                })}
                className="flex items-center gap-1.5 px-3 py-2 bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 border border-pink-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <HeartPulse className="w-4 h-4 text-pink-400" />
                🌸 + Maternity Leave (ML)
              </button>

              {/* 11. ++ Special Duty (Purple/Fuchsia Scheme) */}
              <button
                onClick={() => openModal('SPECIAL_DUTY', { restrictionType: 'Station / Depot Standby Support', startTime: '06:00', endTime: '14:00' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-fuchsia-600/20 hover:bg-fuchsia-600/30 text-fuchsia-300 border border-fuchsia-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-fuchsia-400" />
                ++ Special Duty
              </button>

              {/* 12. 📋 + Other Duty */}
              <button
                onClick={() => openModal('OTHER_DUTY', { dutyTitle: '', startTime: '09:00', endTime: '17:30', location: 'PYID', priority: 'HIGH' })}
                className="flex items-center gap-1.5 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Assign custom named duty with specific title, time slot and train operator"
              >
                <ClipboardList className="w-4 h-4 text-purple-400" />
                📋 + Other Duty
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {[
                { id: 'ALL', label: 'ALL' },
                { id: 'ACTIVE_DUTY', label: '⚡ ACTIVE DUTY' },
                { id: 'LEAVE', label: '📅 LEAVE' },
                { id: 'BOOK_OFF', label: '🚨 BOOK-OFF' },
                { id: 'SHIFT_REQUEST', label: '🔄 SHIFT REQ' },
                { id: 'TRAINING', label: '🎓 TRAINING' },
                { id: 'CRT', label: '✨ CRT' },
                { id: 'EXTRA_MANPOWER', label: '👥 EXTRA MANPOWER' },
                { id: 'TEST_TRACK', label: '🚆 TEST TRACK' },
                { id: 'NIGHT_EXCHANGE', label: '⇄ DUTY EXCHANGE' },
                { id: 'MATERNITY_LEAVE', label: '🌸 MATERNITY LEAVE' },
                { id: 'SPECIAL_DUTY', label: '✨ SPECIAL DUTY' },
                { id: 'OTHER_DUTY', label: '📋 OTHER DUTY' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setFilterType(t.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                    filterType === t.id ? 'bg-slate-100 text-slate-900 shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                  {t.id !== 'ALL' && ` (${activeRequests.filter(r => r.type === t.id).length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Requests List Grid */}
          {filteredList.length === 0 ? (
            <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl p-12 text-center text-slate-500">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-semibold text-slate-400">No Requirements Recorded for this filter</p>
              <p className="text-xs text-slate-500 mt-1">
                Use the command bar buttons above to schedule active duties, training, CRT, leaves, book-offs, shift preferences, test track, or special duties.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredList.map(req => {
                const isCritical   = req.priority === 'CRITICAL';
                const isHigh       = req.priority === 'HIGH';
                const isActiveDuty = req.type === 'ACTIVE_DUTY';
                const isOtherDuty  = req.type === 'OTHER_DUTY';
                const isLeave      = req.type === 'LEAVE';
                const isShiftReq   = req.type === 'SHIFT_REQUEST';
                const isML         = req.type === 'MATERNITY_LEAVE';
                const fromD        = req.fromDate || req.date;
                const toD          = req.toDate   || req.date;
                const durDays      = req.durationDays || calcDuration(fromD, toD);

                return (
                  <div
                    key={req.id}
                    className={`bg-slate-900 border rounded-2xl p-4 shadow-md transition-all flex flex-col justify-between ${
                      isActiveDuty                ? 'border-teal-500/50 bg-teal-950/15' :
                      isOtherDuty                 ? 'border-purple-500/50 bg-purple-950/20' :
                      isLeave                     ? 'border-rose-500/50 bg-rose-950/10' :
                      isShiftReq                  ? 'border-emerald-500/40 bg-emerald-950/10' :
                      isML                        ? 'border-pink-500/40 bg-pink-950/10' :
                      req.type === 'SPECIAL_DUTY' ? 'border-fuchsia-500/40 bg-fuchsia-950/10' :
                      isCritical                  ? 'border-rose-500/40 bg-rose-950/10' :
                      isHigh                      ? 'border-amber-500/30' : 'border-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                          isActiveDuty                ? 'bg-teal-500/20 text-teal-300' :
                          isOtherDuty                 ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30' :
                          isLeave                     ? 'bg-rose-500/20 text-rose-300' :
                          isShiftReq                  ? 'bg-emerald-500/20 text-emerald-300' :
                          req.type === 'BOOK_OFF'     ? 'bg-orange-500/20 text-orange-300' :
                          req.type === 'TRAINING'     ? 'bg-indigo-500/20 text-indigo-300' :
                          req.type === 'CRT'          ? 'bg-cyan-500/20 text-cyan-300' :
                          req.type === 'EXTRA_MANPOWER'? 'bg-amber-500/20 text-amber-300' :
                          req.type === 'TEST_TRACK'   ? 'bg-purple-500/20 text-purple-300' :
                          req.type === 'SPECIAL_DUTY' ? 'bg-fuchsia-500/20 text-fuchsia-300' :
                          isML                        ? 'bg-pink-600/20 text-pink-400' :
                                                        'bg-emerald-500/20 text-emerald-300'
                        }`}>
                          {req.type === 'ACTIVE_DUTY' ? '⚡ ACTIVE DUTY' : req.type === 'OTHER_DUTY' ? '📋 OTHER DUTY' : req.type.replace(/_/g, ' ')}
                        </span>

                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isCritical ? 'bg-rose-500 text-white' : isHigh ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-700 text-slate-300'}`}>
                          {req.priority}
                        </span>
                      </div>

                      {/* Prominent Duty Title Banner for Other Duty */}
                      {isOtherDuty ? (
                        <div className="mb-2 p-2.5 rounded-xl bg-purple-900/30 border border-purple-500/30">
                          <span className="text-[9px] uppercase tracking-wider text-purple-400 font-bold block mb-0.5">
                            Duty Title
                          </span>
                          <h4 className="text-sm font-black text-white font-mono flex items-center gap-1.5">
                            <ClipboardList className="w-4 h-4 text-purple-400 shrink-0" />
                            {req.dutyTitle || req.topic || 'Other Duty'}
                          </h4>
                        </div>
                      ) : (
                        <h4 className="text-sm font-bold text-white mb-1">
                          {req.topic || req.type.replace(/_/g, ' ')}
                        </h4>
                      )}

                      {req.empName && (
                        <div className="text-xs text-slate-200 font-bold mb-1.5 flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
                          <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="text-slate-400 font-normal text-[11px]">Assigned TO:</span>
                          <span className="text-white font-mono">{req.empName}</span>
                          <span className="text-slate-400 font-mono text-[10px]">({req.empId})</span>
                          {req.empName2 && <span> ⇄ {req.empName2} ({req.empId2})</span>}
                        </div>
                      )}

                      {/* ── Universal Duration Date Badge (From Date -> To Date) ── */}
                      <div className="flex items-center gap-2 mt-2 p-2.5 bg-slate-950/80 border border-slate-800 rounded-xl">
                        <CalendarRange className="w-4 h-4 text-blue-400 shrink-0" />
                        <div className="text-[11px] font-mono flex items-center flex-wrap gap-1">
                          <span className="text-slate-200 font-bold">{fmtDate(fromD)}</span>
                          <span className="text-slate-500">→</span>
                          <span className="text-slate-200 font-bold">{fmtDate(toD)}</span>
                          <span className="ml-1.5 px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded font-black text-[10px]">
                            {durDays} day{durDays > 1 ? 's' : ''}
                          </span>
                          {req.dutyNumber && (
                            <span className="px-1.5 py-0.5 bg-teal-500/20 text-teal-300 rounded text-[10px] font-black">
                              {req.dutyNumber}
                            </span>
                          )}
                          {req.leaveType && (
                            <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px] font-black">
                              {req.leaveType}
                            </span>
                          )}
                          {req.preferredShift && (
                            <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[10px] font-black">
                              {req.preferredShift === 'N' ? 'C Shift (Night)' : req.preferredShift === 'G' ? 'G Shift (General)' : `${req.preferredShift} Shift`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Operational Details (Times, Qty, Competency, etc.) */}
                      {!isLeave && !isML && req.startTime && req.endTime && (
                        <div className="flex items-center justify-between text-xs text-slate-300 font-mono mt-2 bg-slate-950/70 px-2.5 py-2 rounded-xl border border-slate-800">
                          <span className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="text-slate-400 text-[10px] uppercase font-sans font-bold">Time:</span>
                            <strong className="text-white">{req.startTime}</strong> - <strong className="text-white">{req.endTime}</strong>
                          </span>
                          <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            {req.location}
                          </span>
                        </div>
                      )}

                      {req.reason && (
                        <p className="text-xs text-slate-400 italic mt-2 bg-slate-950/40 p-2 rounded-xl border border-slate-800">
                          "{req.reason}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800">
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved in Engine
                      </span>

                      <button
                        onClick={() => onRequestDeleted && onRequestDeleted(req.id)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Delete Requirement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <WhatIfSimulator
          targetDate={targetDate}
          crewList={crewList}
        />
      )}

      {/* ──────────────── Interactive Module Modal with Duration Dates ──────────────── */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-black text-white mb-1 flex items-center gap-2">
              <Plus className="w-5 h-5 text-blue-400" />
              {modalType === 'ACTIVE_DUTY'     ? '⚡ Active Duty Assignment' :
               modalType === 'TRAINING'        ? '🎓 Training Operational Demand' :
               modalType === 'CRT'             ? '✨ Continuous Refresher Training (CRT)' :
               modalType === 'LEAVE'           ? '📅 Leave Request (Start / End Date)' :
               modalType === 'BOOK_OFF'        ? '🚨 Sudden Book-Off Notice' :
               modalType === 'SHIFT_REQUEST'   ? '🔄 Shift Preference (A / B / C / G)' :
               modalType === 'EXTRA_MANPOWER'  ? '👥 Extra Manpower Requirement' :
               modalType === 'TEST_TRACK'      ? '🚆 Test Track Testing Requirement' :
               modalType === 'NIGHT_EXCHANGE'  ? '🔄 Mutual Shift Exchange' :
               modalType === 'MATERNITY_LEAVE' ? '🌸 Statutory Maternity Leave (180 Days)' :
               modalType === 'SPECIAL_DUTY'    ? '✨ Special Duty Profile & Restriction' :
               modalType === 'OTHER_DUTY'      ? '📋 Other Duty Assignment' :
               `Add Requirement: ${modalType.replace(/_/g, ' ')}`}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {modalType === 'ACTIVE_DUTY'
                ? 'Pre-assign a specific Train Operator to a designated mainline or depot duty slot.'
                : modalType === 'LEAVE'
                ? 'Operator is excluded from active line driving for the entire duration window.'
                : modalType === 'MATERNITY_LEAVE'
                ? '180 Days statutory duration per Karnataka Govt Norms. Auto-retained on ML status.'
                : modalType === 'SHIFT_REQUEST'
                ? 'The AI optimizer will honour this shift preference across the specified dates as a prioritized constraint.'
                : modalType === 'OTHER_DUTY'
                ? 'Assign a designated non-driving or operational duty with a custom title, time window, and assigned train operator.'
                : `Configure date-time slots and parameters for ${modalType.replace(/_/g, ' ')}.`}
            </p>

            <form onSubmit={handleCreateRequest} className="space-y-4 text-xs font-sans">

              {/* ── 1. Operator Selection ── */}
              {modalType !== 'EXTRA_MANPOWER' && (
                <div>
                  <label className="font-bold text-slate-300 block mb-1">
                    {modalType === 'MATERNITY_LEAVE' ? 'Select Female Train Operator (ML)' : 'Select Train Operator'}
                  </label>
                  <select
                    value={selectedEmpId}
                    onChange={e => setSelectedEmpId(e.target.value)}
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">-- Choose Operator --</option>
                    {(modalType === 'MATERNITY_LEAVE' ? activeTOs.filter(e => e.gender === 'FEMALE') : activeTOs).map(emp => (
                      <option key={emp.empId} value={emp.empId}>
                        {emp.name} ({emp.empId}) - {emp.gender} - WO: {emp.fixedWo}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* ── 2. Active Duty Configuration (Duty Number & Shift) ── */}
              {modalType === 'ACTIVE_DUTY' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-teal-300 block mb-1">Designated Duty Number</label>
                    <input
                      type="text"
                      value={dutyNumber}
                      onChange={e => setDutyNumber(e.target.value)}
                      placeholder="e.g. Duty 01, Duty 45, Standby 1"
                      required
                      className="w-full bg-slate-800 border border-teal-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-teal-300 block mb-1">Shift Category</label>
                    <select
                      value={preferredShift}
                      onChange={e => setPreferredShift(e.target.value)}
                      className="w-full bg-slate-800 border border-teal-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    >
                      <option value="A">A Shift (06:00–14:00)</option>
                      <option value="B">B Shift (14:00–21:30)</option>
                      <option value="N">C Shift Night (21:30–06:30)</option>
                      <option value="G">G Shift General (07:00–16:00)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ── 3. Training Category Selection ── */}
              {modalType === 'TRAINING' && (
                <div>
                  <label className="font-bold text-indigo-300 block mb-1">Training Subject / Module</label>
                  <select
                    value={trainingCategory}
                    onChange={e => setTrainingCategory(e.target.value)}
                    className="w-full bg-slate-800 border border-indigo-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="Emergency Evacuation Skill Enhancement">Emergency Evacuation Skill Enhancement</option>
                    <option value="Simulator Refresher &amp; Incident Drill">Simulator Refresher &amp; Incident Drill</option>
                    <option value="S&amp;T (Signalling &amp; Telecommunication)">S&amp;T (Signalling &amp; Telecommunication)</option>
                    <option value="Fire &amp; Life Safety (FLS) Protocols">Fire &amp; Life Safety (FLS) Protocols</option>
                    <option value="Rolling Stock Troubleshooting">Rolling Stock Troubleshooting</option>
                    <option value="Cab Signaling &amp; ATO Procedures">Cab Signaling &amp; ATO Procedures</option>
                    <option value="BMRCL Karnataka Safety Standard Drill">BMRCL Karnataka Safety Standard Drill</option>
                  </select>
                </div>
              )}

              {/* ── 4. CRT Assessment Module & Validity ── */}
              {modalType === 'CRT' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-cyan-300 block mb-1">CRT Assessment Module</label>
                    <select
                      value={crtModule}
                      onChange={e => setCrtModule(e.target.value)}
                      className="w-full bg-slate-800 border border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="Annual Rulebook &amp; Safety Recertification">Annual Rulebook &amp; Safety Recertification</option>
                      <option value="Competency Assessment &amp; Simulator Audit">Competency Assessment &amp; Simulator Audit</option>
                      <option value="CBTC Signalling &amp; Degradation Modes">CBTC Signalling &amp; Degradation Modes</option>
                      <option value="Traction Power Isolation &amp; Shunting">Traction Power Isolation &amp; Shunting</option>
                      <option value="Full Line 2 Track Route Learning">Full Line 2 Track Route Learning</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-cyan-300 block mb-1">Validity Extension</label>
                    <select
                      value={crtValidity}
                      onChange={e => setCrtValidity(e.target.value)}
                      className="w-full bg-slate-800 border border-cyan-500/40 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="1 Year (Standard BMRCL Refresher)">1 Year (Standard BMRCL Refresher)</option>
                      <option value="6 Months (Targeted Monitoring)">6 Months (Targeted Monitoring)</option>
                      <option value="3 Months (Probationary Review)">3 Months (Probationary Review)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ── 5. Book-Off Reason Categories ── */}
              {modalType === 'BOOK_OFF' && (
                <div>
                  <label className="font-bold text-orange-300 block mb-1">Book-Off Reason Category</label>
                  <select
                    value={bookOffReasonType}
                    onChange={e => setBookOffReasonType(e.target.value)}
                    className="w-full bg-slate-800 border border-orange-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="Sudden Sickness / Medical Indisposition">Sudden Sickness / Medical Indisposition</option>
                    <option value="Domestic / Family Emergency">Domestic / Family Emergency</option>
                    <option value="Late Reporting Notice">Late Reporting Notice</option>
                    <option value="Unauthorized Absence (Loss of Pay)">Unauthorized Absence (Loss of Pay)</option>
                  </select>
                </div>
              )}

              {/* ── 6. Second Operator for Mutual Exchange ── */}
              {modalType === 'NIGHT_EXCHANGE' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Exchange With (Second Operator B)</label>
                    <select
                      value={selectedEmpId2}
                      onChange={e => setSelectedEmpId2(e.target.value)}
                      required
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="">-- Choose Operator B --</option>
                      {activeTOs.filter(x => String(x.empId) !== selectedEmpId).map(emp => (
                        <option key={emp.empId} value={emp.empId}>
                          {emp.name} ({emp.empId}) - {emp.fixedWo} WO
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Exchange Scope</label>
                    <select
                      value={exchangeType}
                      onChange={e => setExchangeType(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    >
                      <option value="Full Shift Mutual Swap">Full Shift Mutual Swap</option>
                      <option value="Single Day Swap">Single Day Swap</option>
                      <option value="Night Duty Swap">Night Duty Swap</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ── 7. Extra Manpower Count, Duty Type & Station ── */}
              {modalType === 'EXTRA_MANPOWER' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-amber-300 block mb-1">Operator Count</label>
                      <input
                        type="number"
                        min="1"
                        max="25"
                        value={qty}
                        onChange={e => setQty(e.target.value)}
                        required
                        className="w-full bg-slate-800 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-amber-300 block mb-1">Duty Type Required</label>
                      <select
                        value={extraDutyType}
                        onChange={e => setExtraDutyType(e.target.value)}
                        className="w-full bg-slate-800 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                      >
                        <option value="Line Driving">Line Driving</option>
                        <option value="Standby Reserve">Standby Reserve</option>
                        <option value="Station Control Support">Station Control Support</option>
                        <option value="Changeover Relief">Changeover Relief</option>
                        <option value="Peak Surge / Special Event">Peak Surge / Special Event</option>
                        <option value="VIP Movement Escort">VIP Movement Escort</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-amber-300 block mb-1">Depot / Station Sector</label>
                    <select
                      value={stationSector}
                      onChange={e => setStationSector(e.target.value)}
                      className="w-full bg-slate-800 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    >
                      <option value="Peenya Depot (PYID)">Peenya Depot (PYID)</option>
                      <option value="Nagasandra (NGSD)">Nagasandra (NGSD)</option>
                      <option value="Silk Institute (SKIT)">Silk Institute (SKIT)</option>
                      <option value="Kempegowda Majestic (MJST)">Kempegowda Majestic (MJST)</option>
                      <option value="Yeshwantpur (YPR)">Yeshwantpur (YPR)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ── 8. Leave Types (CL, EL, HPL, ML, MS, GHEL, CO, SPECIAL) ── */}
              {modalType === 'LEAVE' && (
                <div>
                  <label className="font-bold text-rose-300 block mb-1">Leave Type (BMRCL Service Rules)</label>
                  <select
                    value={leaveType}
                    onChange={e => setLeaveType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="CL">CL — Casual Leave</option>
                    <option value="EL">EL — Earned Leave</option>
                    <option value="HPL">HPL — Half Pay Leave</option>
                    <option value="ML">ML — Medical Leave</option>
                    <option value="MS">MS — Medical Special / Hospital Leave</option>
                    <option value="GHEL">GHEL — Government Holiday EL</option>
                    <option value="CO">CO — Compensatory Off</option>
                    <option value="SPECIAL">SPECIAL — Special Commuted Leave</option>
                  </select>
                </div>
              )}

              {/* ── 9. Shift Family Selection (A / B / C Night / G General) ── */}
              {modalType === 'SHIFT_REQUEST' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-emerald-300 block mb-1">Requested Shift Family</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'A', label: '☀️ A Shift', sub: '06:00–14:00', color: 'emerald' },
                        { id: 'B', label: '🌇 B Shift', sub: '14:00–21:30', color: 'amber'   },
                        { id: 'N', label: '🌙 C Shift', sub: '21:30–06:30 (Night)', color: 'indigo' },
                        { id: 'G', label: '📋 G Shift', sub: '07:00–16:00 (General)', color: 'cyan'   }
                      ].map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setPreferredShift(s.id)}
                          className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all ${
                            preferredShift === s.id
                              ? `bg-${s.color}-600/30 border-${s.color}-400 text-white shadow-md`
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          <div className="font-black text-sm">{s.label}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">{s.sub}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Preferred Specific Duty No. (Optional)</label>
                    <input
                      type="text"
                      value={dutyNumber}
                      onChange={e => setDutyNumber(e.target.value)}
                      placeholder="e.g. Duty 12, Duty 45, or leave blank for any"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
              )}

              {/* ── 10. Test Track Competency & Testing Type ── */}
              {modalType === 'TEST_TRACK' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-purple-300 block mb-1">Testing Type / Protocol</label>
                    <select
                      value={testingType}
                      onChange={e => setTestingType(e.target.value)}
                      className="w-full bg-slate-800 border border-purple-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                    >
                      <option value="Peenya Depot Test Track Trial">Peenya Depot Test Track Trial</option>
                      <option value="6-Car New Rake Commissioning">6-Car New Rake Commissioning</option>
                      <option value="CBTC Signaling Integration Trial">CBTC Signaling Integration Trial</option>
                      <option value="Braking Distance Verification">Braking Distance Verification</option>
                      <option value="Post-Overhaul High Speed Run">Post-Overhaul High Speed Run</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-purple-300 block mb-1">Competency Required</label>
                      <select
                        value={competencyRequired}
                        onChange={e => setCompetencyRequired(e.target.value)}
                        className="w-full bg-slate-800 border border-purple-500/40 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="Mainline Certified TO">Mainline Certified TO</option>
                        <option value="Test Track Specialist">Test Track Specialist</option>
                        <option value="Shunting Specialist">Shunting Specialist</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-purple-300 block mb-1">Operator Count</label>
                      <input
                        type="number"
                        min="1"
                        max="6"
                        value={qty}
                        onChange={e => setQty(e.target.value)}
                        required
                        className="w-full bg-slate-800 border border-purple-500/40 rounded-xl px-3 py-2 text-xs text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── 11. Maternity Leave Extended Status ── */}
              {modalType === 'MATERNITY_LEAVE' && (
                <div>
                  <label className="font-bold text-pink-300 block mb-1">Maternity Extended Status Tracker</label>
                  <select
                    value={mlExtendedStatus}
                    onChange={e => setMlExtendedStatus(e.target.value)}
                    className="w-full bg-slate-800 border border-pink-500/40 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="Standard 180 Days (Karnataka Govt Norms)">Standard 180 Days (Karnataka Govt Norms)</option>
                    <option value="Post-ML EL Extension (Earned Leave)">Post-ML EL Extension (Earned Leave)</option>
                    <option value="Post-ML HPL Extension (Half Pay Leave)">Post-ML HPL Extension (Half Pay Leave)</option>
                    <option value="Medical Certificate Extended">Medical Certificate Extended</option>
                  </select>
                </div>
              )}

              {/* ── 12. Special Duty Restriction Type ── */}
              {modalType === 'SPECIAL_DUTY' && (
                <div>
                  <label className="font-bold text-fuchsia-300 block mb-1">Restriction Profile</label>
                  <select
                    value={restrictionType}
                    onChange={e => setRestrictionType(e.target.value)}
                    className="w-full bg-slate-800 border border-fuchsia-500/40 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="Pink Duty (Pregnancy Profile)">Pink Duty (Pregnancy Profile)</option>
                    <option value="Medical Light Duty (Daylight Only)">Medical Light Duty (Daylight Only)</option>
                    <option value="Station / Depot Standby Support">Station / Depot Standby Support</option>
                    <option value="Administrative &amp; CC Desk Support">Administrative &amp; CC Desk Support</option>
                    <option value="Platform Marshalling &amp; Crowd Management">Platform Marshalling &amp; Crowd Management</option>
                  </select>
                </div>
              )}

              {/* ── 12.5. Other Duty Title Field ── */}
              {modalType === 'OTHER_DUTY' && (
                <div>
                  <label className="font-bold text-purple-300 block mb-1">
                    Duty Title / Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={dutyTitle}
                    onChange={e => setDutyTitle(e.target.value)}
                    placeholder="e.g. Yard Shunting In-Charge, CC Desk Relief, Safety Inspection"
                    required
                    className="w-full bg-slate-800 border border-purple-500/50 rounded-xl px-3 py-2 text-xs text-white font-bold placeholder:text-slate-500 placeholder:font-normal focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Enter the title of this particular duty. It will be displayed prominently alongside the assigned train operator and time window.
                  </p>
                </div>
              )}

              {/* ── 13. UNIVERSAL DURATION DATES (START DATE & END DATE) ── */}
              <div className="p-3.5 bg-slate-950/80 border border-blue-500/40 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between text-xs font-black text-blue-400 uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <CalendarRange className="w-4 h-4" /> Start Date &amp; End Date
                  </span>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-mono text-[10px]">
                    {durationDays} Day{durationDays > 1 ? 's' : ''} Duration
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">Start Date</label>
                    <input
                      type="date"
                      value={reqFromDate}
                      onChange={e => {
                        setReqFromDate(e.target.value);
                        if (e.target.value > reqToDate) setReqToDate(e.target.value);
                      }}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-300 block mb-1">End Date</label>
                    <input
                      type="date"
                      value={reqToDate}
                      min={reqFromDate}
                      onChange={e => setReqToDate(e.target.value)}
                      required
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center justify-between bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
                  <span>Period: <strong className="text-slate-200">{fmtDate(reqFromDate)}</strong> → <strong className="text-slate-200">{fmtDate(reqToDate)}</strong></span>
                  <span className="text-blue-300 font-bold font-mono">{durationDays} Day{durationDays > 1 ? 's' : ''}</span>
                </div>
              </div>

              {/* ── 14. Topic / Subject ── */}
              {modalType !== 'LEAVE' && modalType !== 'SHIFT_REQUEST' && modalType !== 'ACTIVE_DUTY' && modalType !== 'OTHER_DUTY' && (
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Topic / Subject</label>
                  <input
                    type="text"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. Emergency Evacuation, Coupling, Medical Leave"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              )}

              {/* ── 15. Time Slot (when applicable) ── */}
              {modalType !== 'LEAVE' && modalType !== 'SHIFT_REQUEST' && modalType !== 'MATERNITY_LEAVE' && modalType !== 'BOOK_OFF' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Daily Start / Reporting Time</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Daily End / Sign-off Time</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                  </div>
                </div>
              )}

              {/* ── 16. Location & Priority ── */}
              <div className="grid grid-cols-2 gap-3">
                {modalType !== 'LEAVE' && modalType !== 'MATERNITY_LEAVE' && modalType !== 'BOOK_OFF' && modalType !== 'SHIFT_REQUEST' ? (
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Location / Depot</label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white" />
                  </div>
                ) : (
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Depot / Base</label>
                    <input type="text" value="PYID" disabled
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 font-mono" />
                  </div>
                )}
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white">
                    <option value="CRITICAL">CRITICAL (Must Satisfy)</option>
                    <option value="HIGH">HIGH Priority</option>
                    <option value="NORMAL">NORMAL</option>
                  </select>
                </div>
              </div>

              {/* ── 17. Reason / Notes ── */}
              <div>
                <label className="font-bold text-slate-300 block mb-1">Operational Notes / Reason</label>
                <textarea value={reason} onChange={e => setReason(e.target.value)} rows="2"
                  placeholder="Enter reason or instruction for crew controller audit log..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button type="button" onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all">
                  Cancel
                </button>
                <button type="submit"
                  className={`px-5 py-2 text-white text-xs font-bold rounded-xl shadow-lg transition-all ${
                    modalType === 'ACTIVE_DUTY'     ? 'bg-teal-600 hover:bg-teal-500 shadow-teal-600/30' :
                    modalType === 'LEAVE'           ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30' :
                    modalType === 'SHIFT_REQUEST'   ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30' :
                    modalType === 'MATERNITY_LEAVE' ? 'bg-pink-600 hover:bg-pink-500 shadow-pink-600/30' :
                    modalType === 'BOOK_OFF'        ? 'bg-orange-600 hover:bg-orange-500 shadow-orange-600/30' :
                    modalType === 'SPECIAL_DUTY'    ? 'bg-fuchsia-600 hover:bg-fuchsia-500 shadow-fuchsia-600/30' :
                    modalType === 'OTHER_DUTY'      ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/30' :
                    'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                  }`}>
                  Confirm &amp; Add Requirement ({durationDays}d)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

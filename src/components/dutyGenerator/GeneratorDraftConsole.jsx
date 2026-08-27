import React, { useState, useEffect } from 'react';
import { 
  Play, Sparkles, ShieldCheck, AlertTriangle, CheckCircle2, Download, 
  Search, Filter, Edit3, Eye, FileSpreadsheet, Send, RefreshCw, X, Lock, Unlock,
  Layers, Users, Clock, Compass, HeartPulse, SplitSquareVertical, Table, Printer
} from 'lucide-react';
import { DAY_TYPE_CONFIGS, DUTY_TEMPLATES_REGISTRY } from '../../data/dutyTemplatesRegistry';
import { DAY_TYPE_PROFILES } from '../../data/dayTypeProfiles';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { HISTORICAL_ROSTER_INTELLIGENCE } from '../../data/historicalRosterIntelligence';
import { generateDailyRosterSolutions, explainAssignment } from '../../services/dutyOptimizerEngine';
import { validateDutyAssignment } from '../../services/dutyConstraintEngine';
import { exportRosterToExcel } from '../../services/rosterExportService';
import { rosterAutoClassifierService } from '../../services/RosterAutoClassifierService';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebase';
import { formatDutyTypeLink, formatTo24HourTime } from '../../utils/timeHelpers';
import RosterExplainerModal from './RosterExplainerModal';

export default function GeneratorDraftConsole({
  targetDate,
  setTargetDate,
  dayType,
  setDayType,
  crewList = EMPLOYEE_MASTER_REGISTRY,
  activeRequests = [],
  woOverrides = {},
  onOpenActiveCrewModal,
  onOpenCCWillingModal
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [solutions, setSolutions] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState('PLAN_A');
  const [searchQuery, setSearchQuery] = useState('');
  const [shiftFilter, setShiftFilter] = useState('ALL');
  const [viewMode, setViewMode] = useState('EXCEL_SPLIT'); // 'EXCEL_SPLIT' or 'TABLE'
  const [isPublished, setIsPublished] = useState(false);
  const [publishMessage, setPublishMessage] = useState('');
  const [lockedDuties, setLockedDuties] = useState({});

  const auth = useAuth();
  const currentUser = auth?.currentUser;
  const loggedInUserName = currentUser ? `${currentUser.displayName || currentUser.name || 'Crew Controller'} (${currentUser.employeeId || currentUser.empId || currentUser.email || 'OCC-2'})` : 'Crew Controller (OCC-2)';

  // Edit / Override Modal State
  const [editItem, setEditItem] = useState(null);
  const [newDutyCode, setNewDutyCode] = useState('');
  const [editValidation, setEditValidation] = useState(null);
  const [isForceOverride, setIsForceOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [changedBy, setChangedBy] = useState(loggedInUserName);
  const [isPublishing, setIsPublishing] = useState(false);
  
  // Audit Log State
  const [auditLogs, setAuditLogs] = useState([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  useEffect(() => {
    if (loggedInUserName && changedBy === 'Crew Controller (OCC-2)') {
      setChangedBy(loggedInUserName);
    }
  }, [loggedInUserName]);

  // Explainer Modal State
  const [explainerData, setExplainerData] = useState(null);

  const lastGenKeyRef = React.useRef('');
  const isGeneratingRef = React.useRef(false);

  const genTriggerKey = `${targetDate}_${dayType}_${crewList.length}_${activeRequests.length}_${Object.keys(woOverrides).length}`;

  // Auto-generate on initial mount or when key parameters change
  useEffect(() => {
    if (lastGenKeyRef.current === genTriggerKey) return;
    lastGenKeyRef.current = genTriggerKey;
    handleRunGenerator();
  }, [genTriggerKey]);

  const handleRunGenerator = () => {
    if (isGeneratingRef.current) return;
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setIsPublished(false);
    setPublishMessage('');

    // Filter strictly for active operational crew: 88 BMRCL TOs + 49 JMD TDs
    const activeCrewOnly = crewList.filter(e => 
      e && 
      (e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active)) && 
      !e.isRelieved && 
      e.activeCrew !== false &&
      e.status !== 'RELIEVED' &&
      e.status !== 'INACTIVE'
    );

    const lockedList = Object.values(lockedDuties);

    setTimeout(() => {
      try {
        const result = generateDailyRosterSolutions({
          targetDate,
          dayType,
          activeCrewList: activeCrewOnly,
          employees: activeCrewOnly,
          historicalData: HISTORICAL_ROSTER_INTELLIGENCE,
          activeRequests,
          woOverrides,
          lockedAssignments: lockedList
        });

        setSolutions(result.solutions);
      } catch (err) {
        console.error("Roster generation error:", err);
      } finally {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    }, 150);
  };

  const handleToggleLock = (item) => {
    if (!item.dutyNo) return;
    const dutyKey = String(item.dutyNo);
    setLockedDuties(prev => {
      const next = { ...prev };
      if (next[dutyKey]) {
        delete next[dutyKey];
      } else {
        next[dutyKey] = {
          dutyNo: item.dutyNo,
          empId: item.empId,
          name: item.name
        };
      }
      return next;
    });
  };

  const currentPlan = solutions ? solutions[selectedPlanId] : null;

  // ── Single Rendering Source of Truth: Group By assignmentCategory ──
  const allAssignments = currentPlan?.assignments || [];

  const groupedBuckets = allAssignments.reduce((acc, a) => {
    const cat = a.assignmentCategory || (a.role === 'TRAINEE' ? 'TRAINEE' : (a.status === 'ASSIGNED' ? 'ACTIVE_DUTY' : 'NOT_AVAILABLE'));
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, { ACTIVE_DUTY: [], CREW_CONTROLLER: [], SPECIAL_AUX_DUTY: [], NOT_AVAILABLE: [], TRAINEE: [] });

  const runningDuties = (groupedBuckets.ACTIVE_DUTY || []).sort((a, b) => (parseInt(a.dutyNo, 10) || 0) - (parseInt(b.dutyNo, 10) || 0));
  const ccDuties = groupedBuckets.CREW_CONTROLLER || [];
  
  // ── Special Duty split: true special duties vs residual overflow pool ──
  // True special: OR duties, Station Standbys, Test Track, Npro, NDR, etc.
  // Reserve pool: Phase 11 "OR_SPARE" overflow — crew with no active duty slot available
  const allSpecialAux = groupedBuckets.SPECIAL_AUX_DUTY || [];
  const specialDuties = allSpecialAux.filter(a => {
    const sub = (a.assignmentSubType || '').toUpperCase();
    const code = (a.dutyCode || a.assignedDutyCode || '').toUpperCase();
    // Exclude week-off entries that may have been mis-bucketed
    if (sub === 'WO' || code === 'WO' || a.status === 'WEEK_OFF') return false;
    // Exclude generic residual overflow
    if (code === 'OR_SPARE' || sub === 'OR SPARE POOL') return false;
    return true;
  });
  const reservePool = allSpecialAux.filter(a => {
    const code = (a.dutyCode || a.assignedDutyCode || '').toUpperCase();
    const sub = (a.assignmentSubType || '').toUpperCase();
    return code === 'OR_SPARE' || sub === 'OR SPARE POOL';
  });
  
  const notAvailableStaff = groupedBuckets.NOT_AVAILABLE || [];
  const traineeStaff = groupedBuckets.TRAINEE || [];

  // Sub-categories within NOT_AVAILABLE
  const leaveStaff = notAvailableStaff.filter(a => ['CL', 'EL', 'HPL', 'ML', 'MS', 'GHEL', 'SPECIAL', 'BOOK_OFF'].includes(a.assignmentSubType) || ['LEAVE', 'MATERNITY_LEAVE', 'BOOK_OFF'].includes(a.status));
  const weekOffStaff = notAvailableStaff.filter(a => a.assignmentSubType === 'WO' || a.status === 'WEEK_OFF');
  const trainingStaff = notAvailableStaff.filter(a => ['TRAINING', 'CRT'].includes(a.assignmentSubType) || a.status === 'TRAINING');
  const lrdDuties = notAvailableStaff.filter(a => a.assignmentSubType === 'LRD' || a.status === 'LRD');
  const pinkLine4Staff = allAssignments.filter(a => a.specialProfile === 'PINK_LINE_4' || a.notes?.includes('Pink Line 4'));
  const jmdStandbyStaff = specialDuties.filter(a => a.assignmentSubType?.includes('STBY') || a.assignedDutyCode?.includes('STBY'));

  // ── Dynamic Summary Breakdown from Generated Roster ──
  const presentRunningCount = runningDuties.length;
  const ccAssignedCount = ccDuties.length;
  const restWoCount = weekOffStaff.length;
  const clLeaveCount = allAssignments.filter(a => a.assignmentSubType === 'CL' || a.assignedDutyCode === 'CL').length;
  const elGhelCount = allAssignments.filter(a => ['EL', 'GHEL', 'GH'].includes(a.assignmentSubType) || ['EL', 'GHEL', 'GH'].includes(a.assignedDutyCode)).length;
  const mlHplCount = allAssignments.filter(a => ['ML', 'HPL', 'MS'].includes(a.assignmentSubType) || ['ML', 'HPL', 'MS'].includes(a.assignedDutyCode) || a.status === 'MATERNITY_LEAVE').length;
  const bookOffCount = allAssignments.filter(a => a.assignmentSubType === 'BOOK_OFF' || a.status === 'BOOK_OFF' || a.assignedDutyCode === 'BOOK_OFF').length;
  const specialAuxCount = specialDuties.length; // only true special duties (OR, STBY, Test Track)
  const reservePoolCount = reservePool.length;
  const lrdStaffCount = lrdDuties.length;
  const trainingTrgCount = trainingStaff.length;
  const totalAccountedStaff = allAssignments.length;

  // Filtered assignments for search
  const filteredRunningDuties = runningDuties.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(item.empId).includes(searchQuery) ||
                          String(item.assignedDutyCode).toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesShift = true;
    if (shiftFilter !== 'ALL') {
      if (shiftFilter === 'A') matchesShift = item.shift === 'A';
      else if (shiftFilter === 'B') matchesShift = item.shift === 'B';
      else if (shiftFilter === 'N') matchesShift = item.shift === 'N';
    }

    return matchesSearch && matchesShift;
  });

  // Handle Edit Duty Validation
  const handleSelectNewDuty = (dutyCode) => {
    setNewDutyCode(dutyCode);
    if (!editItem) return;

    const emp = crewList.find(e => e.empId === editItem.empId);
    const templateDuties = DUTY_TEMPLATES_REGISTRY[dayType] || DUTY_TEMPLATES_REGISTRY.WEEKDAY;
    const targetDuty = templateDuties.find(d => d.dutyCode === dutyCode) || {
      dutyCode,
      shift: dutyCode.startsWith('N') ? 'N' : dutyCode.startsWith('B') ? 'B' : 'A',
      sOnTime: '06:00',
      sOffTime: '14:00',
      isNight: dutyCode.startsWith('N')
    };

    const val = validateDutyAssignment({
      employee: emp,
      proposedDuty: targetDuty,
      targetDate,
      dayOfWeek: 'Wednesday',
      previousDuty: null,
      historicalStats: HISTORICAL_ROSTER_INTELLIGENCE[emp?.empId],
      activeRequests,
      woOverrides
    });

    setEditValidation(val);
  };

  // Save manual edit / force assign
  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editItem || !currentPlan) return;

    const templateDuties = DUTY_TEMPLATES_REGISTRY[dayType] || DUTY_TEMPLATES_REGISTRY.WEEKDAY;
    const targetDuty = templateDuties.find(d => d.dutyCode === newDutyCode) || {
      dutyCode: newDutyCode,
      shift: newDutyCode.startsWith('N') ? 'N' : newDutyCode.startsWith('B') ? 'B' : 'A',
      sOnTime: '06:00',
      sOffTime: '14:00',
      sOnLoc: 'PYID',
      sOffLoc: 'PYID',
      kms: 0
    };

    const updated = currentPlan.assignments.map(a => {
      if (a.empId === editItem.empId) {
        return {
          ...a,
          assignedDutyCode: targetDuty.dutyCode,
          shift: targetDuty.shift,
          sOnTime: targetDuty.sOnTime,
          sOffTime: targetDuty.sOffTime,
          sOnLoc: targetDuty.sOnLoc || 'PYID',
          sOffLoc: targetDuty.sOffLoc || 'PYID',
          kms: targetDuty.kms || 0,
          status: 'ASSIGNED',
          reason: isForceOverride ? `Manual Override by ${changedBy}: ${overrideReason}` : `Manual Duty Reassignment by ${changedBy}`
        };
      }
      return a;
    });

    // Record immutable audit log entry
    const newLogEntry = {
      id: 'AUDIT_' + Date.now(),
      empId: editItem.empId,
      empName: editItem.name,
      originalDuty: editItem.assignedDutyCode,
      newDuty: targetDuty.dutyCode,
      changedBy: changedBy || 'Crew Controller (OCC-2)',
      timestamp: new Date().toISOString(),
      reason: overrideReason || 'Manual optimization adjustment',
      isForceOverride
    };
    setAuditLogs(prev => [newLogEntry, ...prev]);

    setSolutions({
      ...solutions,
      [selectedPlanId]: {
        ...currentPlan,
        assignments: updated
      }
    });

    setEditItem(null);
    setNewDutyCode('');
    setEditValidation(null);
    setIsForceOverride(false);
    setOverrideReason('');
  };

  // Open Explainer Modal
  const handleOpenExplainer = (item) => {
    const emp = crewList.find(e => e.empId === item.empId);
    const hist = HISTORICAL_ROSTER_INTELLIGENCE[item.empId];
    const exp = explainAssignment({
      employee: emp,
      assignment: item,
      historicalStats: hist,
      targetDate
    });

    setExplainerData({
      employee: emp,
      assignment: item,
      explanation: exp
    });
  };

  // Handle Export to Excel
  const handleExportExcel = () => {
    if (!currentPlan) return;
    exportRosterToExcel({
      targetDate,
      dayType,
      planTitle: currentPlan.strategyTitle,
      assignments: currentPlan.assignments,
      qualityScore: currentPlan.overallScore
    });
  };

  // Handle Publication with Firestore Live Persistence
  const handlePublishRoster = async () => {
    if (!currentPlan) return;
    setIsPublishing(true);

    try {
      const dateStr = targetDate;

      const parsedDuties = runningDuties.map((item, idx) => ({
        dutyId: item.assignedDutyCode || `D_${idx + 1}`,
        dutyCode: item.assignedDutyCode,
        dutyNumber: item.dutyNo || idx + 1,
        trainOperatorName: item.name,
        empNo: String(item.empId),
        empId: item.empId,
        signOn: item.sOnTime,
        signOff: formatTo24HourTime(item.sOffTime, item.sOnTime, item.shift),
        signOnLoc: item.sOnLoc,
        signOffLoc: item.sOffLoc,
        shift: item.shift,
        kms: item.kms || 0,
        trainNo: item.trainNo || '',
        category: 'ACTIVE_DUTY',
        status: 'ASSIGNED'
      }));

      const controlDesks = ccDuties.map(item => ({
        name: item.name,
        empNo: String(item.empId),
        empId: item.empId,
        shift: item.shift,
        code: item.assignedDutyCode,
        timeFrom: item.sOnTime,
        timeTo: formatTo24HourTime(item.sOffTime, item.sOnTime, item.shift),
        loc: item.sOnLoc,
        role: item.role
      }));

      const weeklyOffs = weekOffStaff.map(item => ({
        name: item.name,
        empNo: String(item.empId),
        empId: item.empId,
        date: dateStr,
        reason: item.reason
      }));

      const leaves = leaveStaff.map(item => ({
        name: item.name,
        empNo: String(item.empId),
        empId: item.empId,
        type: item.assignmentSubType || 'CL',
        reason: item.reason
      }));

      const standbys = specialDuties.map(item => ({
        name: item.name,
        empNo: String(item.empId),
        empId: item.empId,
        code: item.assignedDutyCode,
        timeFrom: item.sOnTime,
        timeTo: item.sOffTime,
        loc: item.sOnLoc,
        reason: item.reason
      }));

      const routeLearning = lrdDuties.map(item => ({
        name: item.name,
        empNo: String(item.empId),
        empId: item.empId,
        info: item.reason
      }));

      const crtTraining = trainingStaff.map(item => ({
        name: item.name,
        empNo: String(item.empId),
        empId: item.empId,
        info: item.reason
      }));

      const classifiedData = {
        sheetName: `AI Daily Duty Roster - ${dateStr}`,
        dateStr,
        dayType,
        duties: parsedDuties,
        controlDesks,
        weeklyOffs,
        leaves,
        standbys,
        routeLearning,
        crtTraining,
        bmrtiTraining: [],
        outstationStepbacks: [],
        relievedOperators: [],
        pmeOperators: [],
        notReporting: [],
        absents: [],
        onDuty: [],
        customRegisters: {},
        dynamicExtraHeaders: []
      };

      // 1. Deploy live into crew_daily_deployment, dispatch_excel_cache, roster_desk_console
      await rosterAutoClassifierService.autoDeployClassifiedData(classifiedData);

      // 2. Record system audit log in Firestore
      try {
        const auditDocRef = doc(db, 'system_audit_logs', `roster_pub_${dateStr}_${Date.now()}`);
        await setDoc(auditDocRef, {
          eventType: 'ROSTER_PUBLISHED',
          targetDate: dateStr,
          dayType,
          planId: selectedPlanId,
          planTitle: currentPlan.strategyTitle,
          publishedBy: loggedInUserName,
          totalDuties: parsedDuties.length,
          totalCrewAccounted: allAssignments.length,
          timestamp: serverTimestamp()
        }, { merge: true });
      } catch (logErr) {
        console.warn("Audit log write warning:", logErr);
      }

      setIsPublished(true);
      setPublishMessage(`Duty Roster for ${targetDate} (${dayType}) successfully published live to BMRCL Dispatch Desk, Automated Dispatch Gate, and mobile consoles.`);
    } catch (publishErr) {
      console.error("Publication error:", publishErr);
      setPublishMessage(`Roster generated, but Firestore deployment error: ${publishErr.message}`);
      setIsPublished(true);
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      
      {/* ── 1. Compact Action Toolbar (Date/DayType now in Suite Header) ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-400" />
            Daily Duty Roster Auto-Generator
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            AI-optimized · Excel-structured · Constraint-validated · {targetDate} ({dayType})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunGenerator}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-black rounded-2xl shadow-xl shadow-blue-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'Solving Roster...' : '⚡ Generate Roster'}</span>
          </button>
        </div>
      </div>

      {/* ── 2. Plan Candidates (A / B / C) ── */}
      {solutions && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              id: 'PLAN_A',
              title: 'Plan A',
              subtitle: 'Balanced & Fatigue Safe',
              score: solutions.PLAN_A?.overallScore,
              desc: 'Zero violations, maximized rest & 26d night gap.',
              bullets: ['⏱ 8h+ rest enforced', '🌙 26d night recurrence locked', '✅ Zero hard violations'],
              color: 'emerald',
              gradient: 'from-emerald-600 to-teal-600'
            },
            {
              id: 'PLAN_B',
              title: 'Plan B',
              subtitle: 'Equal Night Balancing',
              score: solutions.PLAN_B?.overallScore,
              desc: 'Strict monthly 5/6 night quota balancing.',
              bullets: ['🌙 5/6 nights per month quota', '⚖ Equal night distribution', '📊 Monthly balance enforced'],
              color: 'indigo',
              gradient: 'from-indigo-600 to-purple-600'
            },
            {
              id: 'PLAN_C',
              title: 'Plan C',
              subtitle: 'Duty Diversity & Experience',
              score: solutions.PLAN_C?.overallScore,
              desc: 'Rotates links to prevent repetitive route fatigue.',
              bullets: ['🔄 Link diversity rotation', '🛤 Anti-repetitive routes', '🎯 Experience-weighted'],
              color: 'blue',
              gradient: 'from-blue-600 to-indigo-600'
            }
          ].map(plan => {
            const isSelected = selectedPlanId === plan.id;
            const scoreVal = plan.score || 0;
            const scoreColor = scoreVal >= 90 ? 'bg-emerald-400' : scoreVal >= 75 ? 'bg-amber-400' : 'bg-rose-400';
            return (
              <button
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`p-5 rounded-2xl border text-left transition-all relative overflow-hidden group ${
                  isSelected
                    ? `bg-gradient-to-br ${plan.gradient === 'from-emerald-600 to-teal-600' ? 'from-emerald-950/60 to-teal-950/40 border-emerald-500/60 shadow-xl shadow-emerald-900/20' : plan.gradient === 'from-indigo-600 to-purple-600' ? 'from-indigo-950/60 to-purple-950/40 border-indigo-500/60 shadow-xl shadow-indigo-900/20' : 'from-blue-950/60 to-indigo-950/40 border-blue-500/60 shadow-xl shadow-blue-900/20'}`
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <span className={`text-[10px] px-2 py-0.5 bg-gradient-to-r ${plan.gradient} text-white rounded-full font-black font-mono shadow-sm`}>
                      ✓ SELECTED
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center shadow-lg flex-shrink-0`}>
                    <span className="text-white font-black text-sm">{plan.id.replace('PLAN_', '')}</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-white">{plan.title}</h3>
                    <p className="text-[11px] text-slate-400">{plan.subtitle}</p>
                  </div>
                </div>

                {/* Score Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Quality Score</span>
                    <strong className="text-base font-black text-white font-mono">{scoreVal}<span className="text-slate-500 text-xs">/100</span></strong>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${scoreColor} rounded-full transition-all duration-700`}
                      style={{ width: `${scoreVal}%` }}
                    />
                  </div>
                </div>

                <ul className="space-y-1">
                  {plan.bullets.map((b, bi) => (
                    <li key={bi} className="text-[11px] text-slate-400">{b}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Empty State: when no roster generated yet ── */}
      {!solutions && !isGenerating && (
        <div className="bg-gradient-to-br from-slate-900 via-blue-950/20 to-slate-900 border border-blue-500/20 rounded-3xl p-10 flex flex-col items-center justify-center text-center shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-48 h-48 bg-blue-600/5 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-indigo-600/5 rounded-full blur-2xl" />
          </div>
          <div className="relative w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-600/30 mb-5">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Ready to Generate Duty Roster</h3>
          <p className="text-sm text-slate-400 max-w-md mb-2">
            The AI engine will analyze <strong className="text-white">{crewList.filter(e => e.status === 'ACTIVE' && !e.isRelieved).length} active crew members</strong>,
            apply <strong className="text-white">fatigue safety rules</strong>, check <strong className="text-white">{activeRequests.length} operational requests</strong>,
            and generate 3 optimized roster plans.
          </p>
          <p className="text-xs text-slate-600 mb-6">Roster generation takes approximately 1–2 seconds.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
              <span className="text-emerald-400">✓</span> 8h+ Rest Enforcement
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
              <span className="text-blue-400">✓</span> 26-Day Night Gap
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
              <span className="text-indigo-400">✓</span> Week-Off Locked
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
              <span className="text-pink-400">✓</span> Pink Duty Profiles
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">
              <span className="text-amber-400">✓</span> LRD Safety Gate
            </div>
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {isGenerating && (
        <div className="bg-slate-900 border border-blue-500/30 rounded-3xl p-12 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 border-4 border-blue-600/30 border-t-blue-500 rounded-full animate-spin mb-5" />
          <h3 className="text-lg font-black text-white mb-1">Solving Roster...</h3>
          <p className="text-xs text-slate-400">Running 13-phase optimization pipeline across all crew members</p>
        </div>
      )}

      {/* ── 3. Quality & Validation Firewall Gate Summary ── */}
      {currentPlan && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <div>
                <strong className="text-sm text-white block">{currentPlan.strategyTitle}</strong>
                <span className="text-[11px] text-slate-400">Canonical BMRCL A $\rightarrow$ B $\rightarrow$ N $\rightarrow$ G cyclic shift rotation &amp; anti-consecutive variety enforced.</span>
              </div>
            </div>

            {/* Actions: Audit Log, Excel Export, Publish */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsAuditModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Clock className="w-3.5 h-3.5 text-blue-400" />
                Audit Log ({auditLogs.length})
              </button>

              {/* View Mode Toggle */}
              <div className="bg-slate-950 p-1 rounded-xl border border-slate-800 flex items-center gap-1 text-xs">
                <button
                  onClick={() => setViewMode('EXCEL_SPLIT')}
                  className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all ${viewMode === 'EXCEL_SPLIT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  title="Excel Split View: Left Running Duties, Right Categorized Desk"
                >
                  <SplitSquareVertical className="w-3.5 h-3.5" />
                  Excel Split View
                </button>
                <button
                  onClick={() => setViewMode('TABLE')}
                  className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all ${viewMode === 'TABLE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                  title="Unified Full-width Table View"
                >
                  <Table className="w-3.5 h-3.5" />
                  Full Table
                </button>
              </div>

              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Export complete roster into Excel spreadsheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                Export Excel
              </button>

              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
                title="Print official BMRCL Control-Room Daily Duty Sheet"
              >
                <Printer className="w-3.5 h-3.5 text-cyan-400" />
                Print Duty Sheet
              </button>

              <button
                onClick={handlePublishRoster}
                disabled={currentPlan.canPublish === false || currentPlan.hardViolations?.length > 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20"
              >
                <Send className="w-3.5 h-3.5" />
                Publish Roster
              </button>
            </div>
          </div>

          {/* Validation Firewall Live Status Capsule */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-xl font-bold font-mono flex items-center gap-1 ${
                currentPlan.hardViolations?.length > 0 
                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-300' 
                  : 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              }`}>
                <CheckCircle2 className="w-3.5 h-3.5" /> 🟢 {runningDuties.length} Active Duties Valid
              </span>
              <span className="px-2.5 py-1 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 rounded-xl font-bold font-mono flex items-center gap-1">
                👥 {ccDuties.length} CCs Isolated
              </span>
              <span className="px-2.5 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-xl font-bold font-mono flex items-center gap-1">
                🟡 {currentPlan.warnings?.length || 0} Warnings
              </span>
              <span className={`px-2.5 py-1 rounded-xl font-bold font-mono flex items-center gap-1 ${
                currentPlan.hardViolations?.length > 0 
                  ? 'bg-rose-500 text-white animate-pulse' 
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
              }`}>
                🔴 {currentPlan.hardViolations?.length || 0} Hard Violations
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">🛡️ $\ge 8$h Rest Locked</span>
              <span>•</span>
              <span className="flex items-center gap-1">🌙 26d Night Recurrence Verified</span>
              <span>•</span>
              <span className="flex items-center gap-1">🌸 Single-Bucket Invariant Locked</span>
            </div>
          </div>

          {/* Hard Violations Alert Banner (if any) */}
          {currentPlan.hardViolations?.length > 0 && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/50 rounded-2xl text-xs text-rose-200 space-y-1">
              <strong className="font-black text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                PRE-PUBLISH VALIDATION BLOCKED: Resolve {currentPlan.hardViolations.length} Hard Violation(s)
              </strong>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-300">
                {currentPlan.hardViolations.map((v, i) => (
                  <li key={i}><strong>[{v.assertion}]</strong> {v.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Main Excel-Structure Roster Section ── */}
      {currentPlan && (
        <>
          {/* Print-Only Official BMRCL Header */}
          <div className="hidden print-only mb-6 text-black border-b-2 border-black pb-4">
            <div className="text-center space-y-1">
              <h1 className="text-xl font-black uppercase tracking-wider">BANGALORE METRO RAIL CORPORATION LIMITED</h1>
              <h2 className="text-base font-bold uppercase">Peenya Industry Depot (Line 2) — Daily Duty Roster</h2>
              <div className="flex justify-between items-center text-xs font-mono pt-2 border-t border-gray-400">
                <span><strong>Operating Date:</strong> {targetDate}</span>
                <span><strong>Day Type:</strong> {dayType} ({DAY_TYPE_PROFILES[dayType]?.totalDuties || 79} Duties)</span>
                <span><strong>Generated Plan:</strong> {currentPlan.strategyTitle}</span>
                <span><strong>Printed On:</strong> {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</span>
              </div>
            </div>
          </div>
          {viewMode === 'EXCEL_SPLIT' ? (
            /* Split View: Left Running Duties | Right Categorized Desks */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT COLUMN (8 Cols): Active Running Duties */}
              <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col">
                <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-400" />
                      Active Mainline Driving Duties
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded-full font-mono border border-blue-500/30">
                        {filteredRunningDuties.length} assigned
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Sorted Duty #1 → #{filteredRunningDuties.length} · Click 👁 to explain · ✏ to override
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Search name / ID / duty..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                      />
                    </div>
                    {/* Shift Filter tabs */}
                    <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
                      {[
                        { id: 'ALL', label: 'All' },
                        { id: 'A', label: 'A', color: 'bg-emerald-600' },
                        { id: 'B', label: 'B', color: 'bg-amber-600' },
                        { id: 'N', label: 'N', color: 'bg-indigo-600' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setShiftFilter(tab.id)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            shiftFilter === tab.id
                              ? `${tab.color || 'bg-blue-600'} text-white shadow-sm`
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/90 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="px-4 py-3">Duty No</th>
                        <th className="px-4 py-3 min-w-[150px]">Shift / Link</th>
                        <th className="px-4 py-3">Sign On</th>
                        <th className="px-4 py-3">Location</th>
                        <th className="px-4 py-3 font-bold text-slate-200">Train Operator</th>
                        <th className="px-4 py-3 font-mono">Emp No</th>
                        <th className="px-4 py-3">Sign Off</th>
                        <th className="px-4 py-3">Off Loc</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 font-sans">
                      {filteredRunningDuties.map((item, idx) => {
                        const isNight = item.shift === 'N';
                        const isBShift = item.shift === 'B';
                        const num = parseInt(item.dutyNo, 10);
                        const isLocked = !!lockedDuties[String(item.dutyNo)];
                        const isSpacerAfter = DAY_TYPE_PROFILES[dayType]?.spacers_after?.includes(num);

                        const shiftAccent = isNight
                          ? 'border-l-[3px] border-l-indigo-500 bg-indigo-950/10'
                          : isBShift
                          ? 'border-l-[3px] border-l-amber-500 bg-amber-950/10'
                          : 'border-l-[3px] border-l-emerald-500/60 bg-emerald-950/5';

                        return (
                          <React.Fragment key={item.empId || idx}>
                            <tr className={`hover:bg-slate-800/50 transition-colors ${shiftAccent} ${isLocked ? 'bg-amber-950/20 border-l-amber-500' : ''}`}>
                              <td className="px-4 py-3 font-mono font-black text-blue-400">
                                <div className="flex items-center gap-1.5">
                                  <span className="tabular-nums">{item.dutyNo || (idx + 1)}</span>
                                  {item.dutyNo && (
                                    <button
                                      onClick={() => handleToggleLock(item)}
                                      title={isLocked ? 'Pinned (Survives Re-generation)' : 'Click to pin assignment'}
                                      className="opacity-50 hover:opacity-100 transition-opacity"
                                    >
                                      {isLocked ? (
                                        <Lock className="w-3 h-3 text-amber-400" />
                                      ) : (
                                        <Unlock className="w-3 h-3 text-slate-600 hover:text-slate-400" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono font-bold whitespace-nowrap min-w-[150px]">
                                <span className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold inline-flex items-center gap-1.5 shadow-sm border ${
                                  isNight ? 'bg-indigo-950/80 text-indigo-300 border-indigo-500/50' :
                                  isBShift ? 'bg-amber-950/80 text-amber-300 border-amber-500/50' :
                                  item.shift === 'PRO' || item.shift === 'STBY' ? 'bg-purple-950/80 text-purple-300 border-purple-500/50' :
                                  'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
                                }`}>
                                  {formatDutyTypeLink(item)}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-mono text-white font-bold tabular-nums">
                                {item.sOnTime}
                              </td>
                              <td className="px-4 py-3 text-slate-400 text-[11px]">
                                {item.sOnLoc}
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-bold text-slate-100 flex items-center gap-1.5">
                                  {item.name}
                                  {item.specialTag === 'PINK_DUTY' && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-pink-500/20 text-pink-300 rounded-md border border-pink-500/30">
                                      🌸 Pink
                                    </span>
                                  )}
                                  {isLocked && (
                                    <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded-md border border-amber-500/30 font-mono">
                                      📌 PINNED
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-400 font-bold tabular-nums">
                                #{item.empId || '—'}
                              </td>
                              <td className="px-4 py-3 font-mono text-slate-300 tabular-nums">
                                {formatTo24HourTime(item.sOffTime, item.sOnTime, item.shift)}
                              </td>
                              <td className="px-4 py-3 text-slate-500 text-[11px]">
                                {item.sOffLoc}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => handleOpenExplainer(item)}
                                    className="p-1.5 bg-slate-800 hover:bg-cyan-900/50 text-slate-400 hover:text-cyan-300 rounded-lg border border-slate-700 hover:border-cyan-500/40 transition-all"
                                    title="Why was this operator assigned? (AI Explainer)"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditItem(item);
                                      handleSelectNewDuty(item.dutyCode || item.assignedDutyCode);
                                    }}
                                    className="p-1.5 bg-slate-800 hover:bg-blue-900/50 text-slate-400 hover:text-blue-300 rounded-lg border border-slate-700 hover:border-blue-500/40 transition-all"
                                    title="Override or Swap Duty Assignment"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isSpacerAfter && (
                              <tr className="bg-slate-950/90 border-y border-slate-700/60">
                                <td colSpan={9} className="py-1.5 px-4 text-[9px] font-mono text-slate-600 tracking-widest text-center uppercase font-bold">
                                  ── Shift Band Boundary (After Duty {num}) ──
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* Trainee Block: "JMD TD's" */}
                      {traineeStaff.length > 0 && (
                        <>
                          <tr className="bg-amber-950/40 border-y border-amber-500/40 font-bold">
                            <td colSpan={9} className="py-2.5 px-3 text-xs font-mono text-amber-300">
                              <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                  <Users className="w-4 h-4 text-amber-400" />
                                  JMD TD's (Contract Trainee Shadow Block)
                                </span>
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-mono">
                                  {traineeStaff.length} Paired Trainees
                                </span>
                              </div>
                            </td>
                          </tr>
                          {traineeStaff.map((t, tIdx) => (
                            <tr key={t.empId || tIdx} className="bg-slate-900/30 hover:bg-slate-800/40 text-xs text-amber-200/90">
                              <td className="px-3 py-2 font-mono font-bold text-amber-400">{t.dutyNo}</td>
                              <td className="px-3 py-2 font-mono">
                                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[11px] font-mono">
                                  {formatDutyTypeLink(t)}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono">{t.sOnTime}</td>
                              <td className="px-3 py-2 text-slate-400">{t.sOnLoc}</td>
                              <td className="px-3 py-2 font-bold text-white flex items-center gap-1.5">
                                {t.name}
                                <span className="text-[9px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-mono">
                                  Shadow {t.mentorName ? `with ${t.mentorName}` : ''}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-amber-300">{t.empId}</td>
                              <td className="px-3 py-2 font-mono">{formatTo24HourTime(t.sOffTime, t.sOnTime, t.shift)}</td>
                              <td className="px-3 py-2 text-slate-400">{t.sOffLoc}</td>
                              <td className="px-3 py-2 text-right">
                                <span className="text-[10px] text-amber-400/80 font-mono font-bold">Shadow TD</span>
                              </td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* RIGHT COLUMN (4 Cols): Categorized Operational Desks */}
              <div className="lg:col-span-4 space-y-3 max-h-[700px] overflow-y-auto pr-1">
                
                {/* Category 1: Crew Controllers (CC) */}
                <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/50 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-indigo-500/20 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                        <Users className="w-4 h-4 text-indigo-400" />
                      </div>
                      <span className="text-xs font-black text-indigo-300 uppercase tracking-wider">CC Desk</span>
                      <span className="text-[10px] font-mono bg-indigo-500/25 text-indigo-300 px-2 py-0.5 rounded-full font-bold border border-indigo-500/30">
                        {ccDuties.length} assigned
                      </span>
                    </div>
                    {onOpenCCWillingModal && (
                      <button
                        onClick={onOpenCCWillingModal}
                        className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 rounded-lg text-[10px] font-bold transition-all"
                      >
                        + Manage
                      </button>
                    )}
                  </div>
                  <div className="space-y-2 text-xs">
                    {ccDuties.map(emp => {
                      const isOfficial = emp.specialTag === 'OFFICIAL_CC' || emp.isOfficialCC || emp.specialProfile === 'CC';
                      const isRelief = emp.specialTag === 'CC_RELIEF' || emp.specialProfile === 'CC_RELIEF';

                      return (
                        <div key={emp.empId} className="p-2.5 bg-slate-950/60 rounded-xl flex items-center justify-between border border-indigo-500/20 hover:border-indigo-500/40 transition-colors">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <strong className="text-white text-xs">{emp.name}</strong>
                              {isOfficial ? (
                                <span className="text-[9px] px-1.5 py-0.5 bg-indigo-500/25 text-indigo-300 rounded-md font-bold">⭐ Official</span>
                              ) : isRelief ? (
                                <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/25 text-emerald-300 rounded-md font-bold">✓ Relief</span>
                              ) : null}
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              #{emp.empId} · {emp.sOnTime && emp.sOffTime ? `${emp.sOnTime}–${formatTo24HourTime(emp.sOffTime, emp.sOnTime, emp.shift)}` : 'CC Shift'}
                            </span>
                          </div>
                          <span className="px-2 py-1 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-bold font-mono flex-shrink-0">
                            {emp.assignedDutyCode || emp.role || 'CC'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Category 2: Special Duty, Standby & Test Track (Purple Scheme) */}
                {specialDuties.length > 0 && (
                  <div className="bg-slate-900 border border-purple-500/40 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                      <span className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5 whitespace-normal">
                        🚆 Special Duty &amp; Test Track
                      </span>
                      <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-1.5 py-0.2 rounded font-bold">
                        {specialDuties.length} Assigned
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {specialDuties.map(emp => (
                        <div key={emp.empId} className="p-2 bg-slate-950 rounded-xl flex items-center justify-between border border-purple-500/30">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <strong className="text-purple-200 block">{emp.name}</strong>
                              {emp.gender === 'FEMALE' && (
                                <span className="text-[9px] px-1 py-0.2 bg-pink-500/20 text-pink-300 rounded font-bold">
                                  🌸 Pink
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Emp #{emp.empId} • {emp.sOnTime}–{formatTo24HourTime(emp.sOffTime, emp.sOnTime, emp.shift)} • {emp.sOnLoc}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px] font-bold font-mono">
                            {emp.assignedDutyCode}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reserve Pool: Phase 11 OR_SPARE overflow — crew available but no duty slot */}
                {reservePool.length > 0 && (
                  <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-600/50 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-700/50 mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-slate-600/30 rounded-lg flex items-center justify-center">
                          <span className="text-slate-400 text-sm">🔄</span>
                        </div>
                        <span className="text-xs font-black text-slate-300 uppercase tracking-wider">Available Reserve</span>
                        <span className="text-[10px] font-mono bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full font-bold border border-slate-600/40">
                          {reservePool.length} crew
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">No duty slot available</span>
                    </div>
                    <p className="text-[10px] text-slate-600 mb-2 font-mono">
                      These TOs/TDs are active and available today but all duty slots are filled. They remain on standby.
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {reservePool.map(emp => (
                        <div key={emp.empId} className="flex items-center justify-between px-2.5 py-2 bg-slate-900/60 rounded-xl border border-slate-700/40 hover:border-slate-600/60 transition-colors">
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-300 block">{emp.name}</span>
                            <span className="text-[10px] text-slate-600 font-mono">#{emp.empId} · {emp.fixedWo ? `WO: ${emp.fixedWo}` : 'General Reserve'}</span>
                          </div>
                          <span className="px-2 py-1 bg-slate-800 text-slate-500 border border-slate-700 rounded-lg text-[10px] font-mono flex-shrink-0">
                            RESERVE
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category 3: Training & Continuous Refresher (CRT) */}
                {trainingStaff.length > 0 && (
                  <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                      <span className="text-xs font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1.5 whitespace-normal">
                        🎓 Training &amp; CRT Refresher
                      </span>
                      <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded font-bold">
                        {trainingStaff.length} Attendees
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {trainingStaff.map(emp => (
                        <div key={emp.empId} className="p-2 bg-slate-950 rounded-xl flex items-center justify-between border border-indigo-500/30">
                          <div>
                            <strong className="text-indigo-200 block">{emp.name}</strong>
                            <span className="text-[10px] text-slate-400 font-mono">Emp #{emp.empId} • {emp.sOnTime}–{formatTo24HourTime(emp.sOffTime, emp.sOnTime, emp.shift)}</span>
                          </div>
                          <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px] font-bold font-mono">
                            {emp.assignedDutyCode || 'TRAINING'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category 4: LRD (Learning Road Duty) */}
                {lrdDuties.length > 0 && (
                  <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                      <span className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-normal">
                        <Compass className="w-3.5 h-3.5" />
                        LRD (Learning Road Duty - 07:00–15:00 PYID)
                      </span>
                      <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-bold">
                        {lrdDuties.length} TO
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {lrdDuties.map(emp => (
                        <div key={emp.empId} className="p-2 bg-slate-950 rounded-xl flex items-center justify-between border border-amber-500/30">
                          <div>
                            <strong className="text-amber-200 block">{emp.name}</strong>
                            <span className="text-[10px] text-slate-400 font-mono">Emp #{emp.empId} • LRD Refresher</span>
                          </div>
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold font-mono">
                            07:00–15:00
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Category 3: Weekly Off (Rest Staff) */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                    <span className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-1.5 whitespace-normal">
                      <Lock className="w-3.5 h-3.5" />
                      Weekly Off (Rest / WO)
                    </span>
                    <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-bold">
                      {weekOffStaff.length} Rest
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                    {weekOffStaff.map(emp => (
                      <div key={emp.empId} className="px-2.5 py-1.5 bg-slate-950 rounded-lg flex items-center justify-between text-[11px] border border-slate-800/60">
                        <span className="text-slate-200 font-medium">{emp.name}</span>
                        <span className="text-slate-500 font-mono font-bold">#{emp.empId}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Category 4: Leaves & Maternity Leave (ML / HPL / CL / EL) — date-range aware */}
                <div className="bg-slate-900 border border-pink-500/30 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                    <span className="text-xs font-black text-pink-300 uppercase tracking-wider flex items-center gap-1.5 whitespace-normal">
                      <HeartPulse className="w-3.5 h-3.5 text-pink-400" />
                      Leaves, Maternity (ML) &amp; HPL
                    </span>
                    <span className="text-[10px] font-mono bg-pink-500/20 text-pink-300 px-1.5 py-0.2 rounded font-bold">
                      {leaveStaff.length} Staff
                    </span>
                  </div>
                  <div className="space-y-2 text-xs">
                    {leaveStaff.map(emp => {
                      const lp = emp.leavePeriod;
                      const fmtD = (s) => {
                        if (!s) return '';
                        const d = new Date(s);
                        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                      };
                      return (
                        <div key={emp.empId} className="p-2.5 bg-slate-950 rounded-xl border border-pink-500/20 space-y-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-white">{emp.name}</strong>
                            <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded text-[10px] font-bold font-mono">
                              {emp.assignedDutyCode}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Emp #{emp.empId}
                          </div>
                          {lp && lp.fromDate ? (
                            <div className="flex items-center gap-1.5 mt-1 px-2 py-1 bg-rose-950/30 border border-rose-500/25 rounded-lg">
                              <span className="text-[10px] font-mono text-rose-300 font-bold">
                                📅 {fmtD(lp.fromDate)} → {fmtD(lp.toDate)}
                              </span>
                              <span className="px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded text-[10px] font-black">
                                {lp.durationDays}d
                              </span>
                              <span className="px-1.5 py-0.2 bg-slate-800 text-white rounded text-[10px] font-black ml-auto">
                                {lp.leaveType}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-500 italic">
                              {emp.reason || 'Approved Leave'}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Category 5: Pink Line 4 Staff Pool */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                    <span className="text-xs font-black text-pink-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-normal">
                      🌸 Pink Line 4 Staff
                    </span>
                    <span className="text-[10px] font-mono bg-pink-500/20 text-pink-300 px-1.5 py-0.2 rounded font-bold">
                      {pinkLine4Staff.length} Staff
                    </span>
                  </div>
                  <div className="space-y-1 text-xs max-h-36 overflow-y-auto">
                    {pinkLine4Staff.map(emp => (
                      <div key={emp.empId} className="px-2.5 py-1.5 bg-slate-950 rounded-lg flex items-center justify-between text-[11px] border border-slate-800/60">
                        <span className="text-slate-200 font-medium">{emp.name}</span>
                        <span className="text-pink-400 font-mono font-bold">#{emp.empId}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Category 6: JMD TD Standby Pool */}
                {jmdStandbyStaff.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                      <span className="text-xs font-black text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 whitespace-normal">
                        JMD TD's (Standby Pool)
                      </span>
                      <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded font-bold">
                        {jmdStandbyStaff.length} TOs
                      </span>
                    </div>
                    <div className="space-y-1 text-xs max-h-36 overflow-y-auto">
                      {jmdStandbyStaff.map(emp => (
                        <div key={emp.empId} className="px-2.5 py-1.5 bg-slate-950 rounded-lg flex items-center justify-between text-[11px] border border-slate-800/60">
                          <span className="text-slate-200 font-medium">{emp.name}</span>
                          <span className="text-cyan-400 font-mono font-bold">#{emp.empId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Full Table View */
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-sm font-black text-white">Full Unified Roster ({allAssignments.length} Staff Records)</h3>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3">Sl No</th>
                      <th className="px-4 py-3">Duty Code</th>
                      <th className="px-4 py-3">Shift</th>
                      <th className="px-4 py-3">Train Operator</th>
                      <th className="px-4 py-3">Emp ID</th>
                      <th className="px-4 py-3">Sign On</th>
                      <th className="px-4 py-3">Sign Off</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-sans">
                    {allAssignments.map((item, idx) => (
                      <tr key={item.empId} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 font-mono text-slate-500">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-blue-400">{formatDutyTypeLink(item)}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-400">{item.shift}</td>
                        <td className="px-4 py-2.5 font-bold text-white">{item.name}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-400 font-bold">{item.empId}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{item.sOnTime}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{formatTo24HourTime(item.sOffTime, item.sOnTime, item.shift)}</td>
                        <td className="px-4 py-2.5 text-slate-400">{item.sOnLoc}</td>
                        <td className="px-4 py-2.5">
                          <span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] font-bold">{item.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 5. Enhanced Manpower Summary Strip ── */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <span className="text-sm font-black text-white block">BMRCL Daily Manpower Summary</span>
                  <span className="text-[11px] text-slate-500 font-mono">{targetDate} · {dayType} Schedule · Official Excel Reference</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl">
                  <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wider">Total Crew Accounted</span>
                  <span className="text-2xl font-black text-white font-mono">{totalAccountedStaff}</span>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-2">
              {[
                { label: 'Driving', value: presentRunningCount, color: 'emerald', icon: '🚆' },
                { label: 'CC Desk', value: ccAssignedCount, color: 'indigo', icon: '🎛' },
                { label: 'Week Off', value: restWoCount, color: 'blue', icon: '🔒' },
                { label: 'CL', value: clLeaveCount, color: 'amber', icon: '📋' },
                { label: 'EL / GHEL', value: elGhelCount, color: 'yellow', icon: '📅' },
                { label: 'ML & HPL', value: mlHplCount, color: 'pink', icon: '🌸' },
                { label: 'Book-Off', value: bookOffCount, color: 'orange', icon: '📖' },
                { label: 'Special/STBY', value: specialAuxCount, color: 'purple', icon: '⭐' },
                { label: 'LRD', value: lrdStaffCount, color: 'cyan', icon: '🧭' },
                { label: 'Training', value: trainingTrgCount, color: 'violet', icon: '🎓' },
              ].map(stat => {
                const colorMap = {
                  emerald: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300',
                  indigo: 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300',
                  blue: 'bg-blue-950/60 border-blue-500/40 text-blue-300',
                  amber: 'bg-amber-950/60 border-amber-500/40 text-amber-300',
                  yellow: 'bg-yellow-950/60 border-yellow-500/40 text-yellow-300',
                  pink: 'bg-pink-950/60 border-pink-500/40 text-pink-300',
                  orange: 'bg-orange-950/60 border-orange-500/40 text-orange-300',
                  purple: 'bg-purple-950/60 border-purple-500/40 text-purple-300',
                  cyan: 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300',
                  violet: 'bg-violet-950/60 border-violet-500/40 text-violet-300',
                };
                const barColorMap = {
                  emerald: 'bg-emerald-400',
                  indigo: 'bg-indigo-400',
                  blue: 'bg-blue-400',
                  amber: 'bg-amber-400',
                  yellow: 'bg-yellow-400',
                  pink: 'bg-pink-400',
                  orange: 'bg-orange-400',
                  purple: 'bg-purple-400',
                  cyan: 'bg-cyan-400',
                  violet: 'bg-violet-400',
                };
                const pct = totalAccountedStaff > 0 ? Math.round((stat.value / totalAccountedStaff) * 100) : 0;
                return (
                  <div key={stat.label} className={`p-3 rounded-2xl border ${colorMap[stat.color]} text-center`}>
                    <div className="text-lg font-black text-white tabular-nums">{stat.value}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wide mt-0.5 mb-2">{stat.icon} {stat.label}</div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${barColorMap[stat.color]} rounded-full transition-all duration-700`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-slate-600 mt-1 font-mono">{pct}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── 6. Edit Duty & Override Modal ── */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100 font-sans">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-blue-400" />
                  Manual Duty Override &amp; Audit Logger
                </h3>
                <p className="text-xs text-slate-400">
                  Modifying duty for {editItem.name} ({editItem.empId})
                </p>
              </div>
              <button
                onClick={() => setEditItem(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Select Proposed Duty</label>
                <select
                  value={newDutyCode}
                  onChange={(e) => handleSelectNewDuty(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {(DUTY_TEMPLATES_REGISTRY[dayType] || DUTY_TEMPLATES_REGISTRY.WEEKDAY).map(d => (
                    <option key={d.dutyCode} value={d.dutyCode}>
                      {d.dutyCode} ({d.shift} Shift: {d.sOnTime} → {formatTo24HourTime(d.sOffTime, d.sOnTime, d.shift)} • {d.kms} kms)
                    </option>
                  ))}
                  <option value="STBY_RESERVE">STBY_RESERVE (Standby)</option>
                  <option value="WO">WO (Week-Off)</option>
                  <option value="CL">CL (Casual Leave)</option>
                </select>
              </div>

              {/* Real-Time Constraint Validation Feedback */}
              {editValidation && (
                <div className={`p-3 rounded-2xl border text-xs ${editValidation.valid ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/30 border-rose-500/40 text-rose-300'}`}>
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    {editValidation.valid ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        🟢 Valid: Safe &amp; Conflict-Free Assignment
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        🔴 Hard Constraint Violation
                      </>
                    )}
                  </div>

                  {editValidation.errors.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-200">
                      {editValidation.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* Audit Logging Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Authorizing Controller</label>
                  <input
                    type="text"
                    value={changedBy}
                    onChange={e => setChangedBy(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-300 block mb-1">Override Reason / Audit Note</label>
                  <input
                    type="text"
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    required
                    placeholder="e.g. Special operational requirement"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {editValidation && !editValidation.valid && (
                <label className="flex items-center gap-2 p-2.5 bg-rose-950/40 border border-rose-500/40 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isForceOverride}
                    onChange={e => setIsForceOverride(e.target.checked)}
                    className="w-4 h-4 accent-rose-500"
                  />
                  <span className="text-xs text-rose-300 font-bold">Authorize Emergency Force Override (Audit Log Recorded)</span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editValidation && !editValidation.valid && !isForceOverride}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl shadow-lg"
                >
                  Apply &amp; Log Reassignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 7. Audit Log Drawer Modal ── */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl shadow-2xl p-6 text-slate-100 font-sans max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                  Immutable Controller Audit Log History
                </h3>
                <p className="text-xs text-slate-400">
                  Chronological tamper-evident record of all manual roster overrides.
                </p>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-3">
              {auditLogs.length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30 text-emerald-400" />
                  <p className="text-sm font-semibold">No Manual Overrides Recorded</p>
                  <p className="text-xs text-slate-600 mt-0.5">The current roster strictly conforms to 100% automated AI generation.</p>
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{log.empName} (#{log.empId})</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded">{log.originalDuty}</span>
                      <span className="text-slate-500">$\rightarrow$</span>
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded font-bold">{log.newDuty}</span>
                      {log.isForceOverride && (
                        <span className="px-1.5 py-0.5 bg-rose-500/20 text-rose-300 rounded text-[10px] font-black">
                          FORCE OVERRIDE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 italic">"{log.reason}" — <span className="text-slate-300 font-semibold">{log.changedBy}</span></p>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl"
              >
                Close Audit History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explainer Modal */}
      {explainerData && (
        <RosterExplainerModal
          isOpen={!!explainerData}
          onClose={() => setExplainerData(null)}
          employee={explainerData.employee}
          assignment={explainerData.assignment}
          explanation={explainerData.explanation}
        />
      )}
    </div>
  );
}

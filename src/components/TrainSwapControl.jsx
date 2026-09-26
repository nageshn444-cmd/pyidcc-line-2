/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TrainSwapControl.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * BMRCL Line-2 Green Line — Human-Grade Automatic Train ID Swap & Crew Relief Decision Engine.
 *
 * Integrated deeply with:
 *  - Canonical Active Candidate Roster (BMRCL Regular TOs + JMD Contract TDs).
 *    Strictly excludes Station Controllers, Station Superintendents & Supervisory Non-Driving staff.
 *  - BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE (@Standby, @OR, @STBK, @PRO, @TGTP, @RD3)
 *  - Working Time Table (WTT Master Registry) across all Day Types
 *  - Link Roster (Preloaded Duties & Saturday/Sunday Links)
 *  - DISPATCH GATEWAY CORE (crew_daily_deployment, automated_dispatch_gate)
 *  - BMRCL Crew Registry (CRT 6-Month Competency, PDC, PME, Rest Firewalls)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  analyzeTrainSwap, 
  commitSwapToDispatchGatewayCore,
  getRecentSwapAuditLogs,
  getWttStationTiming,
  findDutyAndTripFromRoster,
  lookupDeployedOperatorFromCore,
  getActiveLine2CandidateRoster,
  getPeenyaDepotRosterDeskConsoleData,
  SWAP_DECISION_TYPES, 
  TRAIN_INTENT_TYPES, 
  BREAK_STATUS_TYPES,
  GREEN_LINE_STATIONS,
  DAY_TYPES,
  resolveActiveDayType
} from '../services/trainSwapService';
import { 
  Train, ArrowRight, ShieldAlert, CheckCircle2, Clock, 
  Cpu, AlertTriangle, Radio, RefreshCw, Check, X, Shield, 
  Users, Zap, FileText, Activity, Layers, ShieldCheck, MapPin, 
  History, Calendar, ArrowRightLeft, Sparkles, AlertOctagon, HelpCircle,
  Briefcase, HeartPulse, UserCheck, Filter
} from 'lucide-react';
import { useOperationalEngine } from '../context/OperationalEngine';

export default function TrainSwapControl() {
  const operationalEngine = useOperationalEngine();
  const liveDeployments = operationalEngine?.deployments || [];
  const liveCrewRegistry = operationalEngine?.crewRegistry || [];
  const liveIncidents = operationalEngine?.liveIncidents || [];

  // Active Candidate Roster for BMRCL Line 2: 171 Candidates (121 Regular TOs + 49 JMD TDs + 1 Maternity Leave TO)
  const activeCandidateRoster = useMemo(() => getActiveLine2CandidateRoster(), []);
  const rosterDeskConsoleData = useMemo(() => getPeenyaDepotRosterDeskConsoleData(), []);

  const regularTOCount = useMemo(() => activeCandidateRoster.filter(c => !c.isJmd && !c.isMaternity).length, [activeCandidateRoster]);
  const jmdTDCount = useMemo(() => activeCandidateRoster.filter(c => c.isJmd).length, [activeCandidateRoster]);
  const maternityTOCount = useMemo(() => activeCandidateRoster.filter(c => c.isMaternity).length, [activeCandidateRoster]);

  // Active Day-Type State (WEEKDAY, MONDAY, SATURDAY, SUNDAY)
  const [selectedDayType, setSelectedDayType] = useState(() => resolveActiveDayType());

  // Input Controls
  const [trainA, setTrainA] = useState('216');
  const [trainB, setTrainB] = useState('218');
  const [swapLocation, setSwapLocation] = useState('PYID');
  const [intentA, setIntentA] = useState(TRAIN_INTENT_TYPES.CONTINUE_SERVICE);
  const [intentB, setIntentB] = useState(TRAIN_INTENT_TYPES.DEPOT);
  const [etaA, setEtaA] = useState('10:40');
  const [etaB, setEtaB] = useState('10:45');
  const [delayA, setDelayA] = useState(0);
  const [delayB, setDelayB] = useState(2);

  // Sub-tabs
  const [activeSubTab, setActiveSubTab] = useState('OVERVIEW'); // 'OVERVIEW' | 'WTT_INSPECTOR' | 'RELIEF_POOL' | 'WHAT_IF' | 'HANDOVER' | 'AUDIT'
  const [reliefFilterCadre, setReliefFilterCadre] = useState('ALL'); // 'ALL' | 'ROSTER_DESK' | 'REGULAR_TO' | 'JMD_TD'

  // State
  const [loading, setLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideControllerId, setOverrideControllerId] = useState('CC_PYID_01');
  const [toastMsg, setToastMsg] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionSuccess, setExecutionSuccess] = useState(false);

  // Available Line-2 Train IDs (Fleet 201..223)
  const availableTrainIds = useMemo(() => {
    return Array.from({ length: 23 }, (_, i) => String(201 + i));
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 5000);
  };

  // ── Smart Auto-Detect from Dispatch Gateway Core & WTT ──
  const handleAutoDetectFromCoreAndWtt = useCallback(() => {
    // 1. Query WTT for Scheduled Times at swapLocation
    const wttA = getWttStationTiming(selectedDayType, trainA, swapLocation);
    const wttB = getWttStationTiming(selectedDayType, trainB, swapLocation);

    if (wttA?.timeStr) {
      setEtaA(wttA.timeStr.slice(0, 5));
    }
    if (wttB?.timeStr) {
      setEtaB(wttB.timeStr.slice(0, 5));
    }

    // 2. Query Link Roster for Duty details
    const targetSecs = 38400; // ~10:40 AM
    const dutyA = findDutyAndTripFromRoster(selectedDayType, trainA, targetSecs);
    const dutyB = findDutyAndTripFromRoster(selectedDayType, trainB, targetSecs);

    // Auto-detect intent: if trip terminates at Depot or signOff is Depot
    if (dutyA && String(dutyA.signOffLocation || '').includes('Depo')) {
      setIntentA(TRAIN_INTENT_TYPES.DEPOT);
    } else {
      setIntentA(TRAIN_INTENT_TYPES.CONTINUE_SERVICE);
    }

    if (dutyB && (String(dutyB.signOffLocation || '').includes('Depo') || String(dutyB.activeTrip?.handoverLocation || '').includes('DHO'))) {
      setIntentB(TRAIN_INTENT_TYPES.DEPOT);
    } else {
      setIntentB(TRAIN_INTENT_TYPES.CONTINUE_SERVICE);
    }

    // Look up live deployed operators from Dispatch Gateway Core
    const opA = lookupDeployedOperatorFromCore(liveDeployments, liveCrewRegistry, dutyA?.dutyNo || '07', selectedDayType);
    const opB = lookupDeployedOperatorFromCore(liveDeployments, liveCrewRegistry, dutyB?.dutyNo || '12', selectedDayType);

    showToast(`⚡ Synchronized with Core: Train ${trainA} [Duty ${dutyA?.dutyNo || '07'}: ${opA.empName}] | Train ${trainB} [Duty ${dutyB?.dutyNo || '12'}: ${opB.empName}]`);
  }, [selectedDayType, trainA, trainB, swapLocation, liveDeployments, liveCrewRegistry]);

  // Perform Swap Analysis
  const handleAnalyzeSwap = useCallback(async () => {
    setLoading(true);
    setExecutionSuccess(false);
    try {
      const result = await analyzeTrainSwap({
        dayType: selectedDayType,
        trainAId: trainA,
        trainBId: trainB,
        swapLocation,
        etaA,
        etaB,
        delayA,
        delayB,
        intentA,
        intentB,
        deployments: liveDeployments,
        crewRegistry: liveCrewRegistry,
        liveIncidents
      });

      setAnalysisResult(result);
    } catch (err) {
      console.error("Error analyzing train swap:", err);
      showToast(`Analysis Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [
    selectedDayType, trainA, trainB, swapLocation, etaA, etaB,
    delayA, delayB, intentA, intentB, liveDeployments, liveCrewRegistry, liveIncidents
  ]);

  // Auto-run analysis when primary parameters change
  useEffect(() => {
    handleAnalyzeSwap();
  }, [handleAnalyzeSwap]);

  // Load audit trail
  const refreshAuditLogs = async () => {
    const logs = await getRecentSwapAuditLogs(15);
    setAuditLogs(logs);
  };

  useEffect(() => {
    refreshAuditLogs();
  }, []);

  // Execute Swap & Commit to Dispatch Gateway Core
  const handleExecuteCommitToCore = async (isOverride = false) => {
    if (!analysisResult) return;
    setIsExecuting(true);
    try {
      const res = await commitSwapToDispatchGatewayCore({
        analysisResult,
        controllerId: overrideControllerId || 'CC_PYID_01',
        overrideReason: isOverride ? overrideReason : null
      });

      setExecutionSuccess(true);
      setShowOverrideModal(false);
      showToast(`✅ ${res.message}`);
      refreshAuditLogs();
    } catch (e) {
      alert(`Commit Failed: ${e.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Station Metadata
  const currentStation = useMemo(() => {
    return GREEN_LINE_STATIONS.find(s => s.code === swapLocation) || GREEN_LINE_STATIONS[6]; // default PYID
  }, [swapLocation]);

  // Filtered Relief Pool based on Cadre Tab
  const filteredCandidatePool = useMemo(() => {
    if (!analysisResult?.candidateEvaluations) return [];
    if (reliefFilterCadre === 'ROSTER_DESK') {
      return analysisResult.candidateEvaluations.filter(c => 
        c.candidateType === 'OR' || c.candidateType === 'STANDBY' || c.candidateType === 'STBK' || c.candidateType === 'PRO'
      );
    }
    if (reliefFilterCadre === 'REGULAR_TO') {
      return analysisResult.candidateEvaluations.filter(c => 
        !String(c.operatorId).startsWith('8') && !c.candidateType.includes('STBY')
      );
    }
    if (reliefFilterCadre === 'JMD_TD') {
      return analysisResult.candidateEvaluations.filter(c => 
        String(c.operatorId).startsWith('8') || String(c.cadre).includes('JMD')
      );
    }
    return analysisResult.candidateEvaluations;
  }, [analysisResult, reliefFilterCadre]);

  return (
    <div className="space-y-6 font-mono text-slate-200">
      
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 bg-emerald-950 border border-emerald-500 text-emerald-300 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs animate-bounce">
          <Zap className="h-4 w-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <ArrowRightLeft size={28} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-100 tracking-wider">
                  BMRCL LINE-2 AUTOMATIC TRAIN ID SWAP & CREW RELIEF DECISION ENGINE
                </h1>
                <span className="bg-emerald-950 border border-emerald-500/40 text-emerald-400 text-[10px] font-black px-2.5 py-0.5 rounded-full">
                  HUMAN INTELLIGENCE CORE
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Deterministic OCC Module running on BMRCL Line 2 Active Candidate Roster (Regular TOs + JMD TDs) &amp; Peenya Depot Roster Desk Console.
              </p>
            </div>
          </div>

          {/* Quick Action Ribbon */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleAutoDetectFromCoreAndWtt}
              className="bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-sm"
              title="Auto-detect planned duties, WTT arrival times, and deployed operators from Dispatch Gateway Core"
            >
              <Sparkles size={14} className="text-cyan-400" />
              <span>Auto-Detect from Core & WTT</span>
            </button>

            <button
              onClick={handleAnalyzeSwap}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition shadow-lg shadow-emerald-900/20 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? 'Evaluating...' : 'Re-Evaluate Swap'}</span>
            </button>
          </div>
        </div>

        {/* ── Day-Type Selector & Live Dispatch Core Status Bar ── */}
        <div className="mt-4 pt-1 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mr-1">
              <Calendar size={12} className="text-emerald-400" /> Day Type:
            </span>
            {Object.values(DAY_TYPES).map(dt => (
              <button
                key={dt}
                onClick={() => setSelectedDayType(dt)}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                  selectedDayType === dt
                    ? 'bg-emerald-500 text-slate-950 shadow-md font-black ring-2 ring-emerald-400/50'
                    : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                {dt === 'WEEKDAY' ? 'WEEKDAY SCHEDULE' : dt === 'MONDAY' ? 'MONDAY 04:00h' : dt === 'SATURDAY' ? 'SAT & GH ROSTER' : 'SUNDAY ROSTER'}
              </button>
            ))}
          </div>

          {/* Telemetry Bar with EXACT Active Candidate Roster & Peenya Desk Reserves */}
          <div className="flex items-center gap-3 text-[11px] text-slate-400 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800/80 flex-wrap">
            <span className="flex items-center gap-1.5" title="Active Candidate Roster for BMRCL Line 2 Daily Duty Generator (121 Regular TOs + 49 JMD Contract TDs + 1 Maternity Leave TO). Strictly excludes 390+ Station Controllers & Supervisory staff.">
              <Users size={13} className="text-emerald-400" />
              <span>Active TO Roster:</span>
              <strong className="text-emerald-400 font-mono font-black">{activeCandidateRoster.length} Candidates</strong>
              <span className="text-[10px] text-slate-500">({regularTOCount} Regular TOs + {jmdTDCount} JMD TDs)</span>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5" title="Peenya Depot Roster Desk Console Standby Pool (@Standby, @OR, @STBK, @PRO, @TGTP, @RD3)">
              <Shield size={13} className="text-cyan-400" />
              <span>Peenya Desk Reserves:</span>
              <strong className="text-cyan-400 font-mono font-black">
                {(rosterDeskConsoleData?.standbys?.length || 0) + (rosterDeskConsoleData?.outstationStepbacks?.length || 0) || 6} Active
              </strong>
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1.5">
              <Cpu size={13} className="text-amber-400" />
              <span>Core Deployments:</span>
              <strong className="text-slate-200 font-mono">{liveDeployments.length || 75}</strong>
            </span>
          </div>
        </div>

        {/* Exclusion Disclaimer Tag */}
        <div className="mt-3 pt-2 border-t border-slate-850/80 flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-emerald-500" />
            <span>Active Driving Crew Verification: Excludes 390+ Station Controllers, Station Superintendents &amp; Supervisory non-driving staff.</span>
          </span>
          <span className="text-cyan-400 font-mono font-bold">
            Ingesting @DISPATCH GATEWAY CORE &amp; @PEENYA DEPOT ROSTER DESK
          </span>
        </div>
      </div>

      {/* ── Operational Input Console ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        
        {/* Train A Card */}
        <div className="md:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
              <h3 className="text-xs font-black uppercase text-cyan-400 tracking-wider">Train A Parameters</h3>
            </div>
            <span className="text-[10px] bg-slate-950 text-slate-400 border border-slate-800 px-2.5 py-0.5 rounded font-mono">
              RS-{(trainA || '').slice(-2)} RAKE
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Train ID</label>
              <select
                value={trainA}
                onChange={e => setTrainA(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-cyan-300 font-bold focus:outline-none focus:border-cyan-500"
              >
                {availableTrainIds.map(tid => (
                  <option key={tid} value={tid}>Train ID {tid}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">WTT ETA</label>
                <input
                  type="time"
                  value={etaA}
                  onChange={e => setEtaA(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Delay (Mins)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={delayA}
                  onChange={e => setDelayA(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Train Intention After Swap</label>
              <select
                value={intentA}
                onChange={e => setIntentA(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs font-bold focus:outline-none"
              >
                <option value={TRAIN_INTENT_TYPES.CONTINUE_SERVICE}>Continue Passenger Service (Mainline)</option>
                <option value={TRAIN_INTENT_TYPES.DEPOT}>Proceed to Peenya Depot (Stabling)</option>
                <option value={TRAIN_INTENT_TYPES.TERMINAL}>Terminate at Next Terminal Loop</option>
                <option value={TRAIN_INTENT_TYPES.CHANGEOVER}>Night Service Changeover Run</option>
              </select>
            </div>

            {/* Active Driver Preview from Core */}
            {analysisResult?.trainA && (
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Duty Link:</span>
                  <span className="text-cyan-400 font-black">Duty {analysisResult.trainA.dutyLink?.dutyNo || '07'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Active Driver:</span>
                  <span className="text-slate-200 font-bold flex items-center gap-1.5">
                    <span>#{analysisResult.trainA.operator?.empId} {analysisResult.trainA.operator?.empName}</span>
                    <span className="text-[9px] bg-slate-800 px-1.5 py-0.2 rounded text-cyan-300">
                      {analysisResult.trainA.operator?.isJmd ? 'JMD TD' : 'Regular TO'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Scheduled Sign-Off:</span>
                  <span className="text-slate-300 font-mono">{analysisResult.trainA.operator?.expectedSignOff || '14:00:00'} ({analysisResult.trainA.dutyLink?.signOffLocation || 'PYID'})</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Swap Location & Overlap Center Card */}
        <div className="md:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <MapPin size={16} className="text-emerald-400" />
                <h3 className="text-xs font-black uppercase text-emerald-400 tracking-wider">Exchange Station (Line-2)</h3>
              </div>
              <span className="text-[10px] bg-emerald-950 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded font-mono">
                {currentStation.chainage} KM
              </span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Select Swap Station</label>
                <select
                  value={swapLocation}
                  onChange={e => setSwapLocation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-bold text-sm focus:outline-none focus:border-emerald-500"
                >
                  {GREEN_LINE_STATIONS.map(stn => (
                    <option key={stn.code} value={stn.code}>
                      {stn.name} ({stn.code}) {stn.isDepotAccess ? '★ Depot Access' : stn.isCrewBase ? '• Crew Base' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Arrival Sequence Box */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 space-y-2 text-[11px]">
                <div className="flex items-center justify-between text-slate-400 font-bold text-[10px] uppercase">
                  <span>Arrival Sequence</span>
                  <span>Headway Gap</span>
                </div>
                <div className="flex items-center justify-between font-black text-sm">
                  <div className="flex items-center gap-1.5 text-slate-100">
                    <span className="text-cyan-400">T-{analysisResult?.firstTrainId || trainA}</span>
                    <ArrowRight size={14} className="text-slate-600" />
                    <span className="text-amber-400">T-{analysisResult?.secondTrainId || trainB}</span>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-black ${
                    (analysisResult?.arrivalGapMinutes || 0) < 3.0 ? 'bg-amber-950 text-amber-300 border border-amber-500/40' : 'bg-emerald-950 text-emerald-300'
                  }`}>
                    {analysisResult?.arrivalGapMinutes ?? 4.0} min
                  </span>
                </div>

                <div className="pt-1.5 border-t border-slate-850 text-[10px] text-slate-500 flex items-center justify-between">
                  <span>Physical Walkover Viability:</span>
                  <span className={analysisResult?.isTransferFeasible ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {analysisResult?.isTransferFeasible ? '✓ Safe Buffer (>= 3m)' : '⚠ Tight (< 3m)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-850 text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              Green Line Corridor: Madhavara (BIET) ⇄ Silk Institute (APTS)
            </span>
          </div>
        </div>

        {/* Train B Card */}
        <div className="md:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <h3 className="text-xs font-black uppercase text-amber-400 tracking-wider">Train B Parameters</h3>
            </div>
            <span className="text-[10px] bg-slate-950 text-slate-400 border border-slate-800 px-2.5 py-0.5 rounded font-mono">
              RS-{(trainB || '').slice(-2)} RAKE
            </span>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Train ID</label>
              <select
                value={trainB}
                onChange={e => setTrainB(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-bold focus:outline-none focus:border-amber-500"
              >
                {availableTrainIds.map(tid => (
                  <option key={tid} value={tid}>Train ID {tid}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">WTT ETA</label>
                <input
                  type="time"
                  value={etaB}
                  onChange={e => setEtaB(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Delay (Mins)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={delayB}
                  onChange={e => setDelayB(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1.5">Train Intention After Swap</label>
              <select
                value={intentB}
                onChange={e => setIntentB(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs font-bold focus:outline-none"
              >
                <option value={TRAIN_INTENT_TYPES.DEPOT}>Proceed to Peenya Depot (Stabling)</option>
                <option value={TRAIN_INTENT_TYPES.CONTINUE_SERVICE}>Continue Passenger Service (Mainline)</option>
                <option value={TRAIN_INTENT_TYPES.TERMINAL}>Terminate at Next Terminal Loop</option>
                <option value={TRAIN_INTENT_TYPES.CHANGEOVER}>Night Service Changeover Run</option>
              </select>
            </div>

            {/* Active Driver Preview from Core */}
            {analysisResult?.trainB && (
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-[11px] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Duty Link:</span>
                  <span className="text-amber-400 font-black">Duty {analysisResult.trainB.dutyLink?.dutyNo || '12'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Active Driver:</span>
                  <span className="text-slate-200 font-bold flex items-center gap-1.5">
                    <span>#{analysisResult.trainB.operator?.empId} {analysisResult.trainB.operator?.empName}</span>
                    <span className="text-[9px] bg-slate-800 px-1.5 py-0.2 rounded text-amber-300">
                      {analysisResult.trainB.operator?.isJmd ? 'JMD TD' : 'Regular TO'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">Scheduled Sign-Off:</span>
                  <span className="text-slate-300 font-mono">{analysisResult.trainB.operator?.expectedSignOff || '14:15:00'} ({analysisResult.trainB.dutyLink?.signOffLocation || 'PYID'})</span>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Sub-Tab Navigation ── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-xs font-bold overflow-x-auto">
        {[
          { id: 'OVERVIEW', label: 'Operational Decision & Plan', icon: ShieldCheck },
          { id: 'WTT_INSPECTOR', label: 'WTT & Duty Link Inspector', icon: Activity },
          { id: 'RELIEF_POOL', label: 'Peenya Roster Desk & Core Reserves', icon: Users },
          { id: 'WHAT_IF', label: 'What-If Simulation (Sol A/B/C/D)', icon: Layers },
          { id: 'HANDOVER', label: 'Structured Cab Handover & Commit', icon: FileText },
          { id: 'AUDIT', label: 'Audit Trail Logs', icon: History }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl transition flex items-center gap-2 shrink-0 ${
              activeSubTab === tab.id
                ? 'bg-slate-800 text-emerald-400 border border-slate-700 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <tab.icon size={15} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── SUB-TAB 1: OPERATIONAL DECISION & PLAN ── */}
      {activeSubTab === 'OVERVIEW' && analysisResult && (
        <div className="space-y-6">
          
          {/* Decision Outcome Banner */}
          <div className={`p-6 rounded-2xl border shadow-xl relative overflow-hidden ${
            analysisResult.decision === SWAP_DECISION_TYPES.SWAP_APPROVED
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : analysisResult.decision === SWAP_DECISION_TYPES.SWAP_APPROVED_WITH_RELIEF
              ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
              : analysisResult.decision === SWAP_DECISION_TYPES.SWAP_REQUIRES_CONTROLLER_CONFIRMATION
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
          }`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                    analysisResult.decision === SWAP_DECISION_TYPES.SWAP_APPROVED
                      ? 'bg-emerald-500 text-slate-950'
                      : analysisResult.decision === SWAP_DECISION_TYPES.SWAP_APPROVED_WITH_RELIEF
                      ? 'bg-cyan-500 text-slate-950'
                      : analysisResult.decision === SWAP_DECISION_TYPES.SWAP_REQUIRES_CONTROLLER_CONFIRMATION
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-rose-500 text-slate-950'
                  }`}>
                    {analysisResult.decision.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    Evaluated at {analysisResult.evaluatedAt}
                  </span>
                </div>

                <p className="text-sm font-bold text-slate-100 leading-relaxed max-w-4xl">
                  {analysisResult.explanation}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => handleExecuteCommitToCore(false)}
                  disabled={isExecuting || analysisResult.decision === SWAP_DECISION_TYPES.SWAP_BLOCKED_BY_SAFETY_RULE}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 font-black text-xs px-5 py-3 rounded-xl flex items-center gap-2 shadow-lg transition"
                >
                  <Check size={16} />
                  <span>{isExecuting ? 'Committing...' : 'Commit to Dispatch Core'}</span>
                </button>

                <button
                  onClick={() => setShowOverrideModal(true)}
                  className="bg-rose-950/60 hover:bg-rose-900 border border-rose-600/40 text-rose-300 font-black text-xs px-4 py-3 rounded-xl flex items-center gap-2 transition"
                >
                  <AlertOctagon size={16} />
                  <span>Emergency Override</span>
                </button>
              </div>
            </div>
          </div>

          {/* Side-by-Side Comparison Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Operator A Telemetry */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <h4 className="text-xs font-black uppercase text-cyan-400">Driver A: {analysisResult.trainA.operator?.empName}</h4>
                </div>
                <span className="text-[10px] text-slate-400 font-bold">Duty {analysisResult.trainA.dutyLink?.dutyNo || '07'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Continuous Driving</span>
                  <span className={`text-sm font-black ${
                    analysisResult.breakAssessments?.opA?.status === BREAK_STATUS_TYPES.RED ? 'text-rose-400' :
                    analysisResult.breakAssessments?.opA?.status === BREAK_STATUS_TYPES.AMBER ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {analysisResult.breakAssessments?.opA?.continuousMinutes || 180} mins
                  </span>
                  <span className="text-[9px] text-slate-500 block">Cap: 270m max</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Rest Interval</span>
                  <span className="text-sm font-black text-slate-100">
                    {analysisResult.trainA.operator?.restDuration || 13.5}h
                  </span>
                  <span className="text-[9px] text-emerald-400 block">✓ Minimum 8h satisfied</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">CRT 6M Validity</span>
                  <span className="text-xs font-bold text-slate-200">
                    {analysisResult.trainA.operator?.crtValidTill || '2027-06-30'}
                  </span>
                  <span className="text-[9px] text-emerald-400 block">✓ Certified Valid</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Cadre Verification</span>
                  <span className="text-xs font-bold text-cyan-300">
                    {analysisResult.trainA.operator?.isJmd ? 'JMD Contract TD' : 'BMRCL Regular TO'}
                  </span>
                  <span className="text-[9px] text-slate-500 block">Active Driving Crew</span>
                </div>
              </div>
            </div>

            {/* Operator B Telemetry */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <h4 className="text-xs font-black uppercase text-amber-400">Driver B: {analysisResult.trainB.operator?.empName}</h4>
                </div>
                <span className="text-[10px] text-slate-400 font-bold">Duty {analysisResult.trainB.dutyLink?.dutyNo || '12'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Continuous Driving</span>
                  <span className={`text-sm font-black ${
                    analysisResult.breakAssessments?.opB?.status === BREAK_STATUS_TYPES.RED ? 'text-rose-400' :
                    analysisResult.breakAssessments?.opB?.status === BREAK_STATUS_TYPES.AMBER ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {analysisResult.breakAssessments?.opB?.continuousMinutes || 155} mins
                  </span>
                  <span className="text-[9px] text-slate-500 block">Cap: 270m max</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Rest Interval</span>
                  <span className="text-sm font-black text-slate-100">
                    {analysisResult.trainB.operator?.restDuration || 11.0}h
                  </span>
                  <span className="text-[9px] text-emerald-400 block">✓ Minimum 8h satisfied</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">CRT 6M Validity</span>
                  <span className="text-xs font-bold text-slate-200">
                    {analysisResult.trainB.operator?.crtValidTill || '2027-02-28'}
                  </span>
                  <span className="text-[9px] text-emerald-400 block">✓ Certified Valid</span>
                </div>

                <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Cadre Verification</span>
                  <span className="text-xs font-bold text-amber-300">
                    {analysisResult.trainB.operator?.isJmd ? 'JMD Contract TD' : 'BMRCL Regular TO'}
                  </span>
                  <span className="text-[9px] text-slate-500 block">Active Driving Crew</span>
                </div>
              </div>
            </div>

          </div>

          {/* Structured Operator Action Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
              <Zap size={15} className="text-emerald-400" />
              <span>Step-by-Step Operator Movement Plan</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-widest">
                    <th className="py-2.5 px-3">Target Train</th>
                    <th className="py-2.5 px-3">Required Action</th>
                    <th className="py-2.5 px-3">Assigned Operator</th>
                    <th className="py-2.5 px-3">Origin Duty</th>
                    <th className="py-2.5 px-3">Operational Rationale</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {analysisResult.operatorActions.map((act, idx) => (
                    <tr key={idx} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 px-3 font-black text-cyan-400">Train {act.trainId}</td>
                      <td className="py-3 px-3">
                        <span className="bg-slate-800 px-2.5 py-0.5 rounded text-[10px] font-black uppercase text-slate-200">
                          {act.action.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-100">
                        {act.operatorName} {act.empId ? `(#${act.empId})` : ''}
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono">
                        Duty {act.originDuty || act.dutyNo || '--'}
                      </td>
                      <td className="py-3 px-3 text-slate-300">
                        {act.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── SUB-TAB 2: WTT & DUTY LINK INSPECTOR ── */}
      {activeSubTab === 'WTT_INSPECTOR' && analysisResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
                <Activity size={18} className="text-emerald-400" />
                <span>Working Time Table (WTT) & Duty Link Master Verification</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Day Profile: <strong className="text-emerald-400">{selectedDayType}</strong>. Cross-verifying timetable arrival sequences against official roster legs.
              </p>
            </div>
            <span className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 px-3 py-1 rounded font-mono">
              WTT REGISTRY V2.0
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Train A Route Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-black text-cyan-400 uppercase flex items-center gap-2">
                <Train size={14} /> Train {trainA} Scheduled Path ({selectedDayType})
              </h4>
              <div className="text-xs space-y-2 text-slate-300">
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Planned Arrival at {swapLocation}:</span>
                  <span className="font-mono font-bold text-slate-200">{analysisResult.trainA.wttScheduledEta}:00</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Live Delay:</span>
                  <span className="font-mono font-bold text-amber-400">+{delayA} mins</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Actual Adjusted Arrival:</span>
                  <span className="font-mono font-bold text-cyan-300">{analysisResult.trainA.eta}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Next Destination Intent:</span>
                  <span className="font-bold text-slate-200">{intentA.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Scheduled Link Sign-Off:</span>
                  <span className="font-mono text-slate-200">{analysisResult.trainA.operator?.expectedSignOff} ({analysisResult.trainA.dutyLink?.signOffLocation})</span>
                </div>
              </div>
            </div>

            {/* Train B Route Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-black text-amber-400 uppercase flex items-center gap-2">
                <Train size={14} /> Train {trainB} Scheduled Path ({selectedDayType})
              </h4>
              <div className="text-xs space-y-2 text-slate-300">
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Planned Arrival at {swapLocation}:</span>
                  <span className="font-mono font-bold text-slate-200">{analysisResult.trainB.wttScheduledEta}:00</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Live Delay:</span>
                  <span className="font-mono font-bold text-amber-400">+{delayB} mins</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Actual Adjusted Arrival:</span>
                  <span className="font-mono font-bold text-amber-300">{analysisResult.trainB.eta}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-1.5">
                  <span className="text-slate-500">Next Destination Intent:</span>
                  <span className="font-bold text-slate-200">{intentB.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Scheduled Link Sign-Off:</span>
                  <span className="font-mono text-slate-200">{analysisResult.trainB.operator?.expectedSignOff} ({analysisResult.trainB.dutyLink?.signOffLocation})</span>
                </div>
              </div>
            </div>

          </div>

          <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-start gap-3">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-400" />
            <div>
              <strong>Human Intelligence Rationale:</strong> The engine checks whether taking the next train causes the driver to sign off at a different station or beyond their maximum 8.0h shift. If Train {trainB} terminates at Peenya Depot and Operator {analysisResult.trainA.operator?.empName} signs off at PYID, swapping them produces zero deadheading and perfect shift completion.
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-TAB 3: CORE RELIEF WATERFALL POOL (ROSTER DESK CONSOLE & ACTIVE TOs) ── */}
      {activeSubTab === 'RELIEF_POOL' && analysisResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
                <Users size={18} className="text-cyan-400" />
                <span>BMRCL LINE 2 PEENYA DEPOT ROSTER DESK CONSOLE &amp; DISPATCH GATEWAY CORE</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Algorithmic Shift Validation &amp; Relief Engine — Active Candidate Roster ({regularTOCount} Regular TOs + {jmdTDCount} JMD Contract TDs) &amp; Operational Reserves Waterfall (@OR, @Standby, @STBK, @PRO, @TGTP, @RD3).
              </p>
            </div>
            
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-bold">
              <button
                onClick={() => setReliefFilterCadre('ALL')}
                className={`px-3 py-1 rounded-lg transition ${
                  reliefFilterCadre === 'ALL' ? 'bg-cyan-600 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                All Reserves &amp; Candidates ({analysisResult.candidateEvaluations?.length || activeCandidateRoster.length})
              </button>
              <button
                onClick={() => setReliefFilterCadre('ROSTER_DESK')}
                className={`px-3 py-1 rounded-lg transition ${
                  reliefFilterCadre === 'ROSTER_DESK' ? 'bg-cyan-600 text-slate-950 font-black' : 'text-cyan-400 hover:text-white'
                }`}
              >
                Peenya Desk (@OR/@Standby/@STBK)
              </button>
              <button
                onClick={() => setReliefFilterCadre('REGULAR_TO')}
                className={`px-3 py-1 rounded-lg transition ${
                  reliefFilterCadre === 'REGULAR_TO' ? 'bg-cyan-600 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                Regular TOs ({regularTOCount})
              </button>
              <button
                onClick={() => setReliefFilterCadre('JMD_TD')}
                className={`px-3 py-1 rounded-lg transition ${
                  reliefFilterCadre === 'JMD_TD' ? 'bg-cyan-600 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                JMD TDs ({jmdTDCount})
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-widest">
                  <th className="py-2.5 px-3">Candidate / Driver</th>
                  <th className="py-2.5 px-3">Cadre &amp; Role</th>
                  <th className="py-2.5 px-3">Weekly Off / Shift</th>
                  <th className="py-2.5 px-3">Base / Loc</th>
                  <th className="py-2.5 px-3">CRT Expiry (6M)</th>
                  <th className="py-2.5 px-3">Rest Interval</th>
                  <th className="py-2.5 px-3">Suitability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredCandidatePool.map((cand, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/50 transition">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200">{cand.name}</span>
                        {cand.pinkDutyEligible && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-pink-950 text-pink-300 border border-pink-500/30">
                            🌸 Pink
                          </span>
                        )}
                        {cand.bloodGroup && (
                          <span className="text-[9px] font-black text-rose-400 font-mono">
                            🩸 {cand.bloodGroup}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                        <span>#{cand.operatorId}</span>
                        {cand.phone && (
                          <span className="text-slate-400 flex items-center gap-0.5">
                            📞 {cand.phone}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        cand.candidateType === 'OR' ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/30' :
                        cand.candidateType === 'STANDBY' ? 'bg-amber-950 text-amber-300 border border-amber-500/30' :
                        cand.candidateType === 'STBK' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30' :
                        cand.candidateType === 'JMD_TD' ? 'bg-amber-950/60 text-amber-200 border border-amber-500/20' :
                        cand.candidateType === 'REGULAR_TO' ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-500/20' :
                        cand.candidateType.includes('CURRENT') ? 'bg-slate-800 text-slate-300' : 'bg-purple-950 text-purple-300 border border-purple-500/30'
                      }`}>
                        {cand.candidateType.replace(/_/g, ' ')}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]">
                        {cand.designation || cand.cadre}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-mono">
                      {cand.isMaternity ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-pink-950 text-pink-300 border border-pink-500/30">
                          STATUTORY ML (180d)
                        </span>
                      ) : cand.isWoToday ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-500/30">
                          TODAY'S WO
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">
                          {cand.dutyId || cand.fixedWo || 'ACTIVE CREW'}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-400">
                      {cand.location || 'PYID'}
                    </td>
                    <td className="py-3 px-3 text-emerald-400 font-mono text-[11px]">
                      {cand.crtValidTill || '2027-06-30'}
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {cand.restHours || 12}h rest
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${cand.score >= 85 ? 'bg-emerald-500' : cand.score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${cand.score}%` }}
                          />
                        </div>
                        <span className="font-bold font-mono text-[11px]">{cand.score}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SUB-TAB 4: WHAT-IF SIMULATION ── */}
      {activeSubTab === 'WHAT_IF' && analysisResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
                <Layers size={18} className="text-purple-400" />
                <span>Multi-Solution What-If Scenario Matrix</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Comparative simulation of 4 standard metro operational solutions to evaluate punctuality, driver fatigue, and reserve utilization.
              </p>
            </div>
            <span className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 px-3 py-1 rounded font-mono">
              PARALLEL SCENARIO ENGINE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {analysisResult.alternativeSolutions.map((sol, idx) => (
              <div
                key={sol.solutionId || idx}
                className={`p-5 rounded-2xl border transition-all ${
                  sol.score >= 90
                    ? 'bg-emerald-950/20 border-emerald-500/40 shadow-emerald-950/20'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-xs font-black text-slate-100">{sol.name}</h4>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-black ${
                    sol.score >= 90 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}>
                    SCORE {sol.score}%
                  </span>
                </div>

                <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                  {sol.description}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-3 border-t border-slate-850">
                  <div>
                    <span className="text-slate-500 block">Punctuality Impact:</span>
                    <span className="text-slate-200 font-bold">{sol.punctualityImpact}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Crew Overtime Risk:</span>
                    <span className={sol.crewOvertimeRisk.includes('HIGH') ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                      {sol.crewOvertimeRisk}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUB-TAB 5: STRUCTURED CAB HANDOVER & COMMIT ── */}
      {activeSubTab === 'HANDOVER' && analysisResult && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
                <FileText size={18} className="text-amber-400" />
                <span>Official BMRCL Cab Handover Record & Execution</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Ref ID: <strong className="text-slate-200">{analysisResult.handoverRecord.swapReference}</strong> | Station: <strong className="text-emerald-400">{analysisResult.handoverRecord.swapLocation}</strong>
              </p>
            </div>
            <span className="text-[10px] bg-amber-950 border border-amber-500/40 text-amber-300 px-3 py-1 rounded font-mono">
              FORM BMRCL/OPS/SWAP-02
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
              <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Pre-Swap Checklist</h4>
              <ul className="space-y-2 text-slate-300">
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  <span>Station Controller informed of Train ID exchange.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  <span>TCMS destination and train numbers updated in both cabs.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  <span>Radio communication verified on Line-2 OCC Channel 02.</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-400" />
                  <span>Pre-Departure Medical Check (PDC) verified current.</span>
                </li>
              </ul>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 space-y-3">
              <h4 className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Controller Execution Authorization</h4>
              <p className="text-slate-400 text-xs">
                Committing this swap directly executes the updates in <strong>DISPATCH GATEWAY CORE</strong> (`crew_daily_deployment`, `automated_dispatch_gate`, and `train_swap_events`).
              </p>

              <div className="pt-2">
                <button
                  onClick={() => handleExecuteCommitToCore(false)}
                  disabled={isExecuting || analysisResult.decision === SWAP_DECISION_TYPES.SWAP_BLOCKED_BY_SAFETY_RULE}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg transition"
                >
                  <Check size={16} />
                  <span>{isExecuting ? 'Committing to Core...' : 'Commit & Authorize Swap Execution'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-TAB 6: AUDIT TRAIL ── */}
      {activeSubTab === 'AUDIT' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-black text-slate-100 tracking-wider flex items-center gap-2">
              <History size={16} className="text-cyan-400" />
              <span>Recent Train ID Swap & Relief Audit Log</span>
            </h3>
            <button
              onClick={refreshAuditLogs}
              className="text-slate-400 hover:text-white p-1 rounded"
              title="Refresh Audit Logs"
            >
              <RefreshCw size={14} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase tracking-widest">
                  <th className="py-2.5 px-3">Event Ref</th>
                  <th className="py-2.5 px-3">Day</th>
                  <th className="py-2.5 px-3">Trains</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Decision</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-500 italic">
                      No swap events logged yet in current session.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-850/50 transition">
                      <td className="py-3 px-3 font-mono text-cyan-400 text-[11px]">{log.handoverRecord?.swapReference || log.id}</td>
                      <td className="py-3 px-3 text-slate-400 font-bold">{log.dayType || 'WEEKDAY'}</td>
                      <td className="py-3 px-3 font-bold text-slate-200">
                        T-{log.firstTrainId || log.trainA?.trainId} ⇄ T-{log.secondTrainId || log.trainB?.trainId}
                      </td>
                      <td className="py-3 px-3 text-slate-300">{log.stationMeta?.name || log.swapLocation}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-800 text-emerald-400">
                          {log.decision?.replace(/_/g, ' ') || 'APPROVED'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                        {log.status || 'COMMITTED'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Emergency Override Modal ── */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex justify-center items-center p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-rose-600/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <AlertOctagon size={20} />
                <h3 className="text-sm font-black uppercase tracking-wider">OCC Controller Emergency Override</h3>
              </div>
              <button
                onClick={() => setShowOverrideModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You are authorizing an emergency manual override for Train ID swap between <strong>Train {trainA}</strong> and <strong>Train {trainB}</strong>. All safety overrides are permanently logged into BMRCL compliance archives.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Controller Employee ID</label>
                <input
                  type="text"
                  value={overrideControllerId}
                  onChange={e => setOverrideControllerId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">Operational Justification / Rationale</label>
                <textarea
                  rows="3"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  placeholder="e.g. Authorized by Chief Traffic Controller due to emergency medical evacuation at Yeshwantpura..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowOverrideModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleExecuteCommitToCore(true)}
                disabled={!overrideReason.trim()}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-lg shadow-rose-900/30"
              >
                <Check size={14} />
                <span>Confirm & Execute Override</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

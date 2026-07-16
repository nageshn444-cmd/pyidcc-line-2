/* eslint-disable react/prop-types */
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, updateDoc, setDoc, doc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle, Clock, AlertTriangle, Train, UserCheck, Search, History, Settings, Check, X, ArrowRight, ShieldAlert, Cpu, Plus, Trash2, UploadCloud, Loader2, FileSpreadsheet, FileText, Image as ImageIcon, Repeat } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

// ── Duty ID Utilities (shared with Dashboard) ──
// Normalize: pad single-digit "1".."9" to "01".."09"
const normalizeDutyId = (id) => {
  const s = String(id || '').trim();
  if (/^[1-9]$/.test(s)) return '0' + s;
  return s;
};

// Validate: only allow numeric 1-99 or known special prefixes (CC, SB, RR, PRO, EX, ST)
const isValidDutyId = (id) => {
  const s = String(id || '').trim();
  if (!s || s === '--' || s === 'UNASSIGNED') return false;
  if (/^\d{1,2}$/.test(s)) return true;
  if (/^(CC|SB|RR|PRO|EX|ST)\d+$/i.test(s)) return true;
  return false;
};

// Deduplicate an array of deployment objects by normalized duty ID.
// Keeps the entry with an operator assigned; falls back to the padded-form document.
const deduplicateDeployments = (items) => {
  const seen = new Map();
  for (const item of items) {
    const raw = String(item.dutyId || '').trim();
    // Reject invalid duty IDs entirely (e.g. "6Z", "1A", empty)
    if (!isValidDutyId(raw)) continue;
    const norm = normalizeDutyId(raw);
    if (!seen.has(norm)) {
      seen.set(norm, { ...item, dutyId: norm });
    } else {
      const existing = seen.get(norm);
      const existingHasOp = existing.empName && existing.empName !== '--';
      const currentHasOp = item.empName && item.empName !== '--';
      if (!existingHasOp && currentHasOp) {
        seen.set(norm, { ...item, dutyId: norm });
      } else if (existingHasOp && !currentHasOp) {
        // keep existing, just ensure ID is padded
        seen.set(norm, { ...existing, dutyId: norm });
      }
      // both have op or both don't → existing wins
    }
  }
  return Array.from(seen.values());
};

const levenshteinDistance = (a, b) => {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

const findClosestRegistryEmployeeByName = (extractedName) => {
  if (!extractedName || extractedName === '--') return null;
  const cleanExtracted = extractedName.toLowerCase().replace(/[^a-z]/g, '');
  if (cleanExtracted.length < 3) return null;
  let bestMatch = null;
  let bestScore = 999;
  for (const emp of BMRCL_CREW_REGISTRY) {
    const cleanReg = emp.name.toLowerCase().replace(/[^a-z]/g, '');
    if (cleanReg === cleanExtracted) return emp;
    if (cleanReg.length >= 4 && cleanExtracted.length >= 4) {
      if (cleanReg.includes(cleanExtracted) || cleanExtracted.includes(cleanReg)) {
        return emp;
      }
    }
    const dist = levenshteinDistance(cleanReg, cleanExtracted);
    const maxAllowedDist = Math.max(2, Math.floor(cleanReg.length / 4));
    if (dist <= maxAllowedDist && dist < bestScore) {
      bestScore = dist;
      bestMatch = emp;
    }
  }
  return bestMatch;
};

const alignRecordWithRegistry = (record) => {
  let empNo = String(record.employeeId || record.empNo || '').trim();
  let name = String(record.name || '').trim();

  if (record._manuallyCorrected) {
    return { ...record, empNo, employeeId: empNo, name };
  }

  // 1. Swap check
  const empNoIsDigits = /^\d+$/.test(empNo);
  const nameIsDigits = /^\d+$/.test(name);
  if (!empNoIsDigits && nameIsDigits) {
    const temp = empNo;
    empNo = name;
    name = temp;
  }

  // 2. empNo has letters, name is empty or digits
  if (!/^\d+$/.test(empNo) && empNo !== '' && empNo !== '--') {
    const matchedByNameInEmpNo = findClosestRegistryEmployeeByName(empNo);
    if (matchedByNameInEmpNo) {
      if (/^\d+$/.test(name)) {
        empNo = name;
        name = matchedByNameInEmpNo.name;
      } else {
        empNo = matchedByNameInEmpNo.id;
        name = matchedByNameInEmpNo.name;
      }
    }
  }

  // 3. empNo is digits but name is empty, auto-fill name
  if (/^\d+$/.test(empNo) && (!name || name === '--' || name === '')) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      return { ...record, empNo, employeeId: empNo, name: matchById.name };
    }
  }

  // 4. empNo is empty but name has letters, auto-fill ID
  if ((!empNo || empNo === '--' || empNo === '') && name && name !== '--') {
    const matchedByName = findClosestRegistryEmployeeByName(name);
    if (matchedByName) {
      return { ...record, empNo: matchedByName.id, employeeId: matchedByName.id, name: matchedByName.name };
    }
  }

  // General registry alignment
  if (empNo && /^\d+$/.test(empNo)) {
    const matchById = BMRCL_CREW_REGISTRY.find((c) => String(c.id) === empNo);
    if (matchById) {
      const cleanRegistryName = matchById.name.toLowerCase().replace(/[^a-z]/g, '');
      const cleanExtractedName = name.toLowerCase().replace(/[^a-z]/g, '');
      const firstWordExtracted = name.split(/[\s.]+/)[0].toLowerCase();
      const firstWordRegistry = matchById.name.split(/[\s.]+/)[0].toLowerCase();

      const isMatch = cleanRegistryName.includes(cleanExtractedName) ||
        cleanExtractedName.includes(cleanRegistryName) ||
        firstWordExtracted === firstWordRegistry ||
        levenshteinDistance(cleanRegistryName, cleanExtractedName) <= 3;

      if (isMatch) {
        return { ...record, empNo, employeeId: empNo, name: matchById.name };
      } else {
        const matchedByFuzzyName = findClosestRegistryEmployeeByName(name);
        if (matchedByFuzzyName) {
          return { ...record, empNo: matchedByFuzzyName.id, employeeId: matchedByFuzzyName.id, name: matchedByFuzzyName.name };
        }
      }
    }
  }

  return { ...record, empNo, employeeId: empNo, name };
};



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


// --- CONSTANTS & HELPERS ---
const ABNORMAL_EVENT_TYPES = [
  { id: 'EMERGENCY', label: 'Emergency', className: 'border-rose-500/40 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30', icon: ShieldAlert },
  { id: 'EVENT', label: 'Event', className: 'border-cyan-500/40 bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30', icon: Clock },
  { id: 'INCIDENT', label: 'Incident', className: 'border-amber-500/40 bg-amber-600/20 text-amber-300 hover:bg-amber-600/30', icon: AlertTriangle },
  { id: 'DELAY', label: 'Delay', className: 'border-orange-500/40 bg-orange-600/20 text-orange-300 hover:bg-orange-600/30', icon: Train }
];

const timeToSeconds = (timeStr) => {
  if (!timeStr || timeStr === '--' || timeStr === '-') return null;
  const [hours = '0', minutes = '0', seconds = '0'] = String(timeStr).split(':');
  return (parseInt(hours, 10) * 3600) + (parseInt(minutes, 10) * 60) + parseInt(seconds, 10);
};

const getLegTrainIds = (deployment) => {
  const legs = deployment.rawLegs || {};
  return [deployment.trainId, legs.l1Train, legs.l2Train, legs.l3Train, legs.l4Train]
    .filter(tid => tid && tid !== '--' && tid !== '-')
    .map(tid => String(tid));
};

const getRemainingHours = (deployment) => {
  const signOnSeconds = timeToSeconds(deployment.signOnTime);
  if (signOnSeconds === null) return 8;
  const now = new Date();
  const nowSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
  const elapsedSeconds = Math.max(0, nowSeconds - signOnSeconds);
  return Math.max(0, 8 - (elapsedSeconds / 3600));
};

const getDutyProgress = (deployment) => {
  const signOnSeconds = timeToSeconds(deployment.signOnTime);
  if (signOnSeconds === null) return 0;
  const now = new Date();
  const nowSeconds = (now.getHours() * 3600) + (now.getMinutes() * 60) + now.getSeconds();
  const elapsedSeconds = Math.max(0, nowSeconds - signOnSeconds);
  const progress = (elapsedSeconds / (8 * 3600)) * 100;
  return Math.min(100, Math.max(0, progress));
};

// --- MAIN COMPONENT ---
export default function AutomatedDispatchGate({
  deployments: providedDeployments,
  loading: providedLoading = false,
  activeDay = 'WEEKDAY',
  setActiveDay,
  onAuthorize,
  onImportComplete
}) {
  const [fallbackDeployments, setFallbackDeployments] = useState([]);
  const [fallbackLoading, setFallbackLoading] = useState(!providedDeployments);

  const [localDayType, setLocalDayType] = useState(activeDay);
  
  useEffect(() => {
    setLocalDayType(activeDay);
  }, [activeDay]);

  const currentDayType = setActiveDay ? activeDay : localDayType;

  const handleDayTypeChange = (day) => {
    if (setActiveDay) {
      setActiveDay(day);
    } else {
      setLocalDayType(day);
    }
  };

  const handleEditEmpIdChange = (val) => {
    setEditEmpId(val);
    const match = BMRCL_CREW_REGISTRY.find(c => String(c.id) === String(val).trim());
    if (match) {
      setEditName(match.name);
    }
  };

  const handleExtraOpEmpIdChange = (val) => {
    const match = BMRCL_CREW_REGISTRY.find(c => String(c.id) === String(val).trim());
    setNewExtraOp(prev => ({
      ...prev,
      empId: val,
      empName: match ? match.name : prev.empName
    }));
  };

  const handleStepbackEmpIdChange = (val) => {
    const match = BMRCL_CREW_REGISTRY.find(c => String(c.id) === String(val).trim());
    setNewStepback(prev => ({
      ...prev,
      empId: val,
      empName: match ? match.name : prev.empName
    }));
  };
  
  // Advanced Feature States
  const [activeTab, setActiveTab] = useState('LIVE'); // LIVE or HISTORY
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  
  const [activeAbnormalEvent, setActiveAbnormalEvent] = useState(null);
  const [savingEvent, setSavingEvent] = useState(false);
  
  const [eventHistory, setEventHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Manual Override State
  const [overrideDutyId, setOverrideDutyId] = useState('');

  // Manual Operator Assignment States
  const [editingDeploymentId, setEditingDeploymentId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmpId, setEditEmpId] = useState('');
  const [editTrainId, setEditTrainId] = useState('');
  const [editDutyId, setEditDutyId] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Extra Operator Input State
  const [newExtraOp, setNewExtraOp] = useState({
    empId: '',
    empName: '',
    dutyId: '',
    trainId: 'UNASSIGNED',
    signOnTime: '06:00:00',
    signOffTime: '14:00:00'
  });

  // Step-back Input State
  const [newStepback, setNewStepback] = useState({
    empId: '',
    empName: '',
    station: 'PUTH',
    dutyId: '',
    startTime: '08:00',
    endTime: '12:00'
  });

  const [stepbacks, setStepbacks] = useState([]);

  // Fetch Deployments Fallback (used when AutomatedDispatchGate is standalone)
  useEffect(() => {
    if (providedDeployments) {
      setFallbackLoading(false);
      return undefined;
    }
    const q = query(collection(db, 'crew_daily_deployment'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const raw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Deduplicate and strip invalid duty IDs at the source
      setFallbackDeployments(deduplicateDeployments(raw));
      setFallbackLoading(false);
    });
    return () => unsubscribe();
  }, [providedDeployments]);

  // Fetch Historical Events when History tab is active
  useEffect(() => {
    if (activeTab === 'HISTORY') {
      setHistoryLoading(true);
      const q = query(collection(db, 'automated_dispatch_gate'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setEventHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setHistoryLoading(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  const deployments = providedDeployments || fallbackDeployments;
  const loading = providedLoading || fallbackLoading;

  const [selectedIds, setSelectedIds] = useState([]);

  // ── Deduplicate + validate deployments from any source ──
  // Applies isValidDutyId + normalization so "6Z", "1"/"01" twins etc. are cleaned up.
  const deduplicatedDeployments = deduplicateDeployments(deployments);

  // Filtering Logic
  const filteredDeployments = deduplicatedDeployments
    .filter(d => {
      if (filterStatus === 'ALL') return true;
      if (filterStatus === 'SIGNED_ON') return d.isSignedOn || d.status === 'DISPATCHED';
      if (filterStatus === 'PENDING') return !d.isSignedOn && d.status !== 'DISPATCHED';
      return true;
    })
    .filter(d => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        String(d.dutyId).toLowerCase().includes(q) ||
        String(d.empName).toLowerCase().includes(q) ||
        String(d.trainId).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      // Sort numerically by duty ID; non-numeric duty IDs go to the end
      const aNum = parseInt(String(a.dutyId).replace(/\D/g, ''), 10);
      const bNum = parseInt(String(b.dutyId).replace(/\D/g, ''), 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      if (!isNaN(aNum)) return -1;
      if (!isNaN(bNum)) return 1;
      return String(a.dutyId).localeCompare(String(b.dutyId));
    });

  const eligibleDeployments = useMemo(() => {
    return filteredDeployments.filter(d => d.status !== 'DISPATCHED' && d.status !== 'RELIEF_DISPATCHED');
  }, [filteredDeployments]);

  const authorizeDispatch = async (deployment) => {
    if (onAuthorize) {
      await onAuthorize(deployment);
      return;
    }
    try {
      const docId = deployment.dutyId && deployment.dutyId !== 'UNASSIGNED'
        ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
        : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;
      await setDoc(doc(db, 'crew_daily_deployment', docId), {
        status: 'DISPATCHED',
        dispatchTime: serverTimestamp(),
        dispatchAuthorizedBy: 'System'
      }, { merge: true });
    } catch (error) {
      console.error("Error authorizing dispatch:", error);
      alert("Failed to authorize dispatch.");
    }
  };

  const getReliefRecommendations = (targetDeployment) => {
    if (!targetDeployment) return [];
    const targetTrainIds = getLegTrainIds(targetDeployment);
    
    return deployments
      .filter(candidate => String(candidate.dutyId) !== String(targetDeployment.dutyId))
      .filter(candidate => candidate.empName && candidate.empName !== '--')
      .map(candidate => {
        const candidateTrainIds = getLegTrainIds(candidate);
        const sameTrainDuty = candidateTrainIds.some(tid => targetTrainIds.includes(tid));
        const remainingHours = getRemainingHours(candidate);
        
        // Exact Score Breakdown for visualization
        const scores = {
          readiness: candidate.isSignedOn || candidate.status === 'DISPATCHED' ? 40 : 20,
          trainMatch: sameTrainDuty ? 25 : 0,
          reliefWindow: Math.min(35, Math.max(0, Math.round(remainingHours * 4.375))), // 8 hours * 4.375 = 35 max
        };
        const totalScore = scores.readiness + scores.trainMatch + scores.reliefWindow;

        return {
          ...candidate,
          scoreBreakdown: scores,
          score: totalScore,
          remainingHours,
          reason: sameTrainDuty ? 'Path match detected' : 'Global available pool'
        };
      })
      .filter(candidate => candidate.remainingHours >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  };

  const handleAbnormalEvent = async (deployment, eventType) => {
    const recommendations = getReliefRecommendations(deployment);
    const eventId = `dispatch_${eventType.toLowerCase()}_${deployment.dutyId}_${Date.now()}`;
    const nextEvent = { id: eventId, eventType, deployment, recommendations };

    setActiveAbnormalEvent(nextEvent);
    setSavingEvent(true);
    setOverrideDutyId(''); // Reset manual override input

    try {
      await setDoc(doc(db, 'automated_dispatch_gate', eventId), {
        incidentId: eventId,
        incidentType: eventType,
        trainId: String(deployment.trainId || '--'),
        currentDutyId: String(deployment.dutyId || '--'),
        currentEmpId: deployment.empId || '--',
        currentEmpName: deployment.empName || '--',
        recommendations: recommendations.map(c => ({
          empId: c.empId || '--',
          empName: c.empName || '--',
          score: c.score,
          scoreBreakdown: c.scoreBreakdown,
          dutyId: String(c.dutyId || '--'),
          remainingHours: Number(c.remainingHours.toFixed(2)),
          reason: c.reason
        })),
        status: 'ANALYZING',
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error logging abnormal dispatch event:', error);
      alert('Failed to log event.');
    } finally {
      setSavingEvent(false);
    }
  };

  const executeRelief = async (recommendedCandidate) => {
    if (!activeAbnormalEvent) return;
    try {
      setSavingEvent(true);
      // 1. Mark the event as RESOLVED
      await updateDoc(doc(db, 'automated_dispatch_gate', activeAbnormalEvent.id), {
        status: 'RESOLVED',
        resolvedByDutyId: recommendedCandidate.dutyId,
        resolvedByEmpName: recommendedCandidate.empName,
        resolvedAt: serverTimestamp()
      });

      // 2. Update the candidate to show they are providing relief
      // (Assuming candidate is in crew_daily_deployment)
      const candDocId = recommendedCandidate.dutyId && recommendedCandidate.dutyId !== 'UNASSIGNED'
        ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${recommendedCandidate.dutyId}`
        : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${recommendedCandidate.empId}`;
      const candRef = doc(db, 'crew_daily_deployment', candDocId);
      await setDoc(candRef, {
        status: 'RELIEF_DISPATCHED',
        reliefTargetDuty: activeAbnormalEvent.deployment.dutyId
      }, { merge: true });

      alert(`Relief Dispatched: ${recommendedCandidate.empName} taking over duty ${activeAbnormalEvent.deployment.dutyId}.`);
      setActiveAbnormalEvent(null);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to execute relief. Ensure permissions are set.");
    } finally {
      setSavingEvent(false);
    }
  };

  const executeManualOverride = async () => {
    if (!overrideDutyId || !activeAbnormalEvent) return;
    const candidate = deployments.find(d => String(d.dutyId) === String(overrideDutyId));
    if (!candidate) {
      return alert("Duty ID not found in current deployment roster.");
    }
    
    // Convert to structure expected by executeRelief
    const candidateAdapter = {
      ...candidate,
      score: 'OVERRIDE',
      scoreBreakdown: { readiness: 0, trainMatch: 0, reliefWindow: 0 },
      reason: 'Manual Supervisor Override'
    };
    await executeRelief(candidateAdapter);
  };

  const handleSaveOperator = async (deploymentId) => {
    const original = deployments.find(d => d.id === deploymentId);
    let finalTrainId = String(editTrainId || 'UNASSIGNED').trim();
    let finalDutyId = String(editDutyId || 'UNASSIGNED').trim();

    if (!finalDutyId) finalDutyId = 'UNASSIGNED';

    const aligned = alignRecordWithRegistry({
      employeeId: editEmpId.trim(),
      name: editName.trim(),
      _manuallyCorrected: true
    });

    let finalName = aligned.name.toUpperCase();
    let finalEmpId = aligned.employeeId;

    const targetDocId = finalDutyId === 'UNASSIGNED'
      ? `gcc_deploy_${currentDayType.toLowerCase()}_extra_${finalEmpId}`
      : `gcc_deploy_${currentDayType.toLowerCase()}_duty_${finalDutyId}`;

    setSavingEdit(true);
    try {
      await setDoc(doc(db, 'crew_daily_deployment', targetDocId), {
        scheduleType: currentDayType,
        dutyId: finalDutyId,
        empName: finalName,
        empId: finalEmpId,
        trainId: finalTrainId,
        "rawLegs.l1Train": finalTrainId,
        "rawLegs.l4Train": finalTrainId,
        remarks: "GCC Manual Edit",
        lastUpdated: serverTimestamp()
      }, { merge: true });

      // Clean up the old document if the Duty ID or Employee ID changed
      if (original) {
        if (original.dutyId && original.dutyId !== 'UNASSIGNED' && String(original.dutyId) !== finalDutyId) {
          const oldDocId = `gcc_deploy_${currentDayType.toLowerCase()}_duty_${original.dutyId}`;
          if (oldDocId !== targetDocId) {
            await deleteDoc(doc(db, 'crew_daily_deployment', oldDocId));
          }
        } else if ((!original.dutyId || original.dutyId === 'UNASSIGNED') && original.empId && original.empId !== finalEmpId) {
          const oldDocId = `gcc_deploy_${currentDayType.toLowerCase()}_extra_${original.empId}`;
          if (oldDocId !== targetDocId) {
            await deleteDoc(doc(db, 'crew_daily_deployment', oldDocId));
          }
        }
      }

      setEditingDeploymentId(null);
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error("Failed to update operator assignment:", err);
      alert("Failed to save operator details.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Sync step-back duties
  useEffect(() => {
    const q = query(collection(db, 'stepback_duties'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setStepbacks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleAddExtraOperator = async (e) => {
    e.preventDefault();
    if (!newExtraOp.empId && !newExtraOp.empName) {
      alert("Please fill in Employee ID or Operator Name.");
      return;
    }
    
    let finalTrainId = String(newExtraOp.trainId || 'UNASSIGNED').trim();
    let rawDutyId = String(newExtraOp.dutyId || '').trim();

    // Validate and normalize duty ID: reject "6Z" style invalid IDs
    let finalDutyId;
    if (!rawDutyId || rawDutyId === 'UNASSIGNED') {
      finalDutyId = 'UNASSIGNED';
    } else if (!isValidDutyId(rawDutyId)) {
      alert(`❌ Invalid Duty ID "${rawDutyId}". Use numeric IDs (01-99) or known prefixes (CC, SB, RR, PRO).`);
      return;
    } else {
      finalDutyId = normalizeDutyId(rawDutyId);
    }

    const aligned = alignRecordWithRegistry({
      employeeId: String(newExtraOp.empId || '').trim(),
      name: String(newExtraOp.empName || '').trim(),
      _manuallyCorrected: true
    });

    let finalEmpId = aligned.employeeId;
    let finalName = aligned.name.toUpperCase();

    if (!finalEmpId || !finalName) {
      alert("Invalid Operator Details. Could not resolve employee mapping.");
      return;
    }

    try {
      const docId = finalDutyId === 'UNASSIGNED' 
        ? `gcc_deploy_${currentDayType.toLowerCase()}_extra_${finalEmpId}`
        : `gcc_deploy_${currentDayType.toLowerCase()}_duty_${finalDutyId}`;

      await setDoc(doc(db, "crew_daily_deployment", docId), {
        scheduleType: currentDayType,
        dutyId: finalDutyId,
        empId: finalEmpId,
        empName: finalName,
        trainId: finalTrainId,
        signOnTime: newExtraOp.signOnTime,
        remarks: "Extra Operator Assigned",
        status: 'AUTHORIZED_OK',
        isSignedOn: true,
        lastUpdated: serverTimestamp(),
        rawLegs: {
          l1Train: finalTrainId,
          l1Start: newExtraOp.signOnTime,
          l1End: newExtraOp.signOffTime,
          l2Train: '--',
          l2Start: '--',
          l2End: '--',
          l3Train: '--',
          l3Start: '--',
          l3End: '--',
          l4Train: '--',
          l4Start: '--',
          l4End: newExtraOp.signOffTime
        }
      });
      alert(`✅ Extra operator ${finalName} assigned successfully!`);
      setNewExtraOp({
        empId: '',
        empName: '',
        dutyId: '',
        trainId: 'UNASSIGNED',
        signOnTime: '06:00:00',
        signOffTime: '14:00:00'
      });
      if (onImportComplete) onImportComplete();
    } catch (err) {
      console.error(err);
      alert("Failed to add extra operator: " + err.message);
    }
  };

  const handleAddStepback = async (e) => {
    e.preventDefault();
    if ((!newStepback.empId && !newStepback.empName) || !newStepback.dutyId) {
      alert("Please fill in Duty ID and either Employee ID or Operator Name.");
      return;
    }
    if (newStepback.station !== 'PUTH' && newStepback.station !== 'NGSA') {
      alert("Step-back station must be PUTH or NGSA.");
      return;
    }

    const aligned = alignRecordWithRegistry({
      employeeId: String(newStepback.empId || '').trim(),
      name: String(newStepback.empName || '').trim(),
      _manuallyCorrected: true
    });

    let finalEmpId = aligned.employeeId;
    let finalName = aligned.name.toUpperCase();

    if (!finalEmpId || !finalName) {
      alert("Invalid Operator Details. Could not resolve employee mapping.");
      return;
    }

    try {
      const docId = `stepback_${newStepback.station}_${newStepback.dutyId}_${Date.now()}`;
      await setDoc(doc(db, 'stepback_duties', docId), {
        empId: finalEmpId,
        empName: finalName,
        station: newStepback.station,
        dutyId: String(newStepback.dutyId),
        startTime: newStepback.startTime || '08:00',
        endTime: newStepback.endTime || '12:00',
        timestamp: serverTimestamp()
      });
      alert("✅ Step-back duty registered at " + newStepback.station);
      setNewStepback({
        empId: '',
        empName: '',
        station: 'PUTH',
        dutyId: '',
        startTime: '08:00',
        endTime: '12:00'
      });
    } catch (err) {
      console.error(err);
      alert("Failed to register Step-back duty.");
    }
  };

  const handleDeleteStepback = async (id) => {
    if (window.confirm("Remove this step-back duty?")) {
      try {
        await deleteDoc(doc(db, 'stepback_duties', id));
      } catch (err) {
        console.error(err);
      }
    }
  };



  const handleToggleSelect = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(eligibleDeployments.map(d => d.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBatchAuthorize = async () => {
    if (selectedIds.length === 0) return;
    const selectedDeps = deployments.filter(d => selectedIds.includes(d.id));
    if (window.confirm(`Authorize dispatch for all ${selectedDeps.length} selected operator(s)?`)) {
      if (onAuthorize) {
        await onAuthorize(selectedDeps);
      } else {
        try {
          const batch = writeBatch(db);
          selectedDeps.forEach(deployment => {
            const docId = deployment.dutyId && deployment.dutyId !== 'UNASSIGNED'
              ? `gcc_deploy_${currentDayType.toLowerCase()}_duty_${deployment.dutyId}`
              : `gcc_deploy_${currentDayType.toLowerCase()}_extra_${deployment.empId}`;
            batch.set(doc(db, 'crew_daily_deployment', docId), {
              status: 'DISPATCHED',
              dispatchTime: serverTimestamp(),
              dispatchAuthorizedBy: 'System'
            }, { merge: true });
          });
          await batch.commit();
          alert(`${selectedDeps.length} Operators Authorized successfully!`);
          if (onImportComplete) onImportComplete();
        } catch (error) {
          console.error("Error authorizing dispatch batch:", error);
          alert("Failed to authorize dispatch batch.");
        }
      }
      setSelectedIds([]);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 border border-emerald-900/30 bg-emerald-950/10 rounded-xl shadow-inner font-mono">
        <Cpu className="h-12 w-12 text-emerald-500 mb-4 animate-pulse" />
        <div className="text-sm font-black text-emerald-400 tracking-widest animate-pulse">INITIALIZING AUTOMATED GATEWAY...</div>
        <div className="text-[10px] text-slate-500 mt-2 uppercase">Syncing Live Deployment Data</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-black tracking-wider text-emerald-400 flex items-center gap-2">
            <Cpu className="h-6 w-6" /> DISPATCH GATEWAY CORE
          </h2>
          <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest">Algorithmic Shift Validation & Relief Engine</p>
        </div>
        <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1">
          <button 
            onClick={() => setActiveTab('LIVE')} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors ${activeTab === 'LIVE' ? 'bg-emerald-600 text-slate-950' : 'text-slate-400 hover:text-emerald-400'}`}
          >
            LIVE GATE
          </button>
          <button 
            onClick={() => setActiveTab('CONFIG')} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors ${activeTab === 'CONFIG' ? 'bg-emerald-600 text-slate-950' : 'text-slate-400 hover:text-emerald-400'}`}
          >
            EXTRA & STEP-BACK
          </button>
          <button 
            onClick={() => setActiveTab('HISTORY')} 
            className={`px-4 py-1.5 text-xs font-bold rounded tracking-wider transition-colors flex items-center gap-1 ${activeTab === 'HISTORY' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <History className="h-3 w-3" /> AUDIT LOG
          </button>
        </div>
      </div>

      {activeTab === 'LIVE' && (
        <div className="space-y-6">
          {/* Day Types Selection Ribbon */}
          <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Select Roster Day Type:</span>
              <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-slate-850">
                {['WEEKDAY', 'MONDAY', 'SATURDAY', 'SUNDAY'].map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayTypeChange(day)}
                    className={`px-3 py-1.5 rounded text-xs font-bold font-mono transition-all ${
                      currentDayType === day
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.15)] font-black'
                        : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-900 border border-transparent'
                    }`}
                  >
                    {day === 'SATURDAY' ? 'SAT & GH' : day}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-xs font-black font-mono text-slate-400 uppercase tracking-wider">
              Target Day Roster: <span className="text-emerald-400">{currentDayType}</span>
            </div>
          </div>



          {/* Active Abnormal Event Relief Engine View */}
          {activeAbnormalEvent && (
            <div className="bg-slate-900 border-2 border-amber-500/50 rounded-xl p-5 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-300">
              <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-black px-3 py-1 rounded-bl-lg flex items-center gap-1 uppercase tracking-widest shadow">
                <span className="h-2 w-2 rounded-full bg-slate-950 animate-pulse"></span>
                ACTIVE INCIDENT ANALYSIS
              </div>
              
              <div className="flex items-center gap-3 mb-6">
                <ShieldAlert className="h-8 w-8 text-amber-500" />
                <div>
                  <h3 className="text-lg font-black text-amber-400 uppercase tracking-wider">
                    {activeAbnormalEvent.eventType} on Duty {activeAbnormalEvent.deployment.dutyId}
                  </h3>
                  <p className="text-xs text-slate-300">Operator: {activeAbnormalEvent.deployment.empName} | Train: {activeAbnormalEvent.deployment.trainId}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Engine Recommendations */}
                <div className="col-span-2 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 border-b border-slate-800 pb-2 uppercase tracking-widest flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-emerald-500" /> Engine Recommendations
                  </h4>
                  
                  {activeAbnormalEvent.recommendations.length === 0 ? (
                    <div className="p-4 bg-slate-950 border border-slate-800 border-dashed rounded text-center text-slate-500 text-xs">No suitable relief candidates found. Manual intervention required.</div>
                  ) : (
                    activeAbnormalEvent.recommendations.map((rec, i) => (
                      <div key={i} className="flex flex-col md:flex-row items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-emerald-500/30 transition-colors">
                        <div className="flex-1 w-full md:w-auto">
                          <div className="flex items-center gap-2">
                            <span className="bg-emerald-900/40 text-emerald-400 font-black text-xs px-2 py-0.5 rounded border border-emerald-800">#{i+1}</span>
                            <span className="font-bold text-emerald-300">{rec.empName}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">Duty {rec.dutyId}</span>
                          </div>
                          
                          {/* Score Visualization Bar */}
                          <div className="mt-2 w-full max-w-xs flex h-2 rounded bg-slate-900 overflow-hidden border border-slate-800">
                            <div style={{ width: `${rec.scoreBreakdown.readiness}%` }} className="bg-blue-500" title={`Readiness: ${rec.scoreBreakdown.readiness}`}></div>
                            <div style={{ width: `${rec.scoreBreakdown.trainMatch}%` }} className="bg-purple-500" title={`Path Match: ${rec.scoreBreakdown.trainMatch}`}></div>
                            <div style={{ width: `${rec.scoreBreakdown.reliefWindow}%` }} className="bg-emerald-500" title={`Relief Window: ${rec.scoreBreakdown.reliefWindow}`}></div>
                          </div>
                          
                          <div className="flex text-[9px] gap-3 mt-1 text-slate-500 uppercase font-bold tracking-widest">
                            <span className="text-blue-400">READY: {rec.scoreBreakdown.readiness}</span>
                            <span className="text-purple-400">PATH: {rec.scoreBreakdown.trainMatch}</span>
                            <span className="text-emerald-400">WIND: {rec.scoreBreakdown.reliefWindow}</span>
                            <span className="text-white ml-auto">TOTAL: {rec.score}</span>
                          </div>
                        </div>
                        
                        <div className="mt-3 md:mt-0 ml-0 md:ml-4 w-full md:w-auto">
                           <button 
                             onClick={() => executeRelief(rec)}
                             disabled={savingEvent}
                             className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black px-4 py-2 rounded text-[10px] tracking-widest flex items-center justify-center gap-1 uppercase shadow-md transition-colors"
                           >
                             <CheckCircle className="h-3 w-3" /> {savingEvent ? 'EXECUTING...' : 'DISPATCH RELIEF'}
                           </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Manual Override Panel */}
                <div className="col-span-1 border-l-0 lg:border-l border-slate-800 pl-0 lg:pl-6 space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 border-b border-slate-800 pb-2 uppercase tracking-widest flex items-center gap-2">
                    <Settings className="h-4 w-4 text-slate-400" /> Manual Override
                  </h4>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                    <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">If algorithmic recommendations are unsuitable, GCC may manually designate a relief Duty ID.</p>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1" htmlFor="automateddispatchgat-l1">Target Duty ID</label>
                    <input id="automateddispatchgat-i1" name="automateddispatchgat-i1" 
                      type="number" 
                      value={overrideDutyId}
                      onChange={(e) => setOverrideDutyId(e.target.value)}
                      placeholder="e.g. 104"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500 mb-3 font-mono"
                    />
                    <button 
                      onClick={executeManualOverride}
                      disabled={savingEvent || !overrideDutyId}
                      className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-600 font-bold px-3 py-2 rounded text-[10px] tracking-widest flex items-center justify-center gap-1 uppercase transition-colors"
                    >
                      FORCE DISPATCH <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  
                  <button 
                    onClick={() => setActiveAbnormalEvent(null)}
                    className="w-full mt-2 text-rose-500 hover:text-rose-400 text-xs font-bold tracking-wider uppercase border border-rose-900/50 rounded py-2 hover:bg-rose-950/30 transition-colors"
                  >
                    CANCEL EVENT
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Roster Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900 p-3 rounded-lg border border-slate-800 shadow">
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input id="automateddispatchgat-i2" name="automateddispatchgat-i2" 
                  type="text" 
                  placeholder="Search Duty ID, Name, Train..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded pl-9 pr-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                />
              </div>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto text-xs font-bold tracking-widest">
              <button onClick={() => setFilterStatus('ALL')} className={`px-3 py-1.5 rounded border ${filterStatus === 'ALL' ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}>ALL</button>
              <button onClick={() => setFilterStatus('SIGNED_ON')} className={`px-3 py-1.5 rounded border ${filterStatus === 'SIGNED_ON' ? 'bg-emerald-900/50 border-emerald-500/50 text-emerald-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-emerald-900/50'}`}>ACTIVE</button>
              <button onClick={() => setFilterStatus('PENDING')} className={`px-3 py-1.5 rounded border ${filterStatus === 'PENDING' ? 'bg-amber-900/50 border-amber-500/50 text-amber-400' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-amber-900/50'}`}>PENDING</button>
            </div>
          </div>

          {/* Batch Action Bar */}
          {selectedIds.length > 0 && (
            <div className="bg-slate-950 border border-emerald-500/20 p-3 rounded-lg flex items-center justify-between gap-4 mb-3 animate-in slide-in-from-top duration-300">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                {selectedIds.length} Operator(s) Selected for Dispatch Authorization
              </span>
              <button 
                onClick={handleBatchAuthorize}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded text-xs tracking-widest uppercase transition-colors shadow-lg animate-pulse"
              >
                AUTHORIZE SELECTED ({selectedIds.length})
              </button>
            </div>
          )}

          {/* Deployment Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[10px]">
                  <tr>
                    <th className="p-4 w-10 text-center">
                      {eligibleDeployments.length > 0 && (
                        <input id="automateddispatchgat-i3" name="automateddispatchgat-i3" 
                          type="checkbox" 
                          checked={selectedIds.length === eligibleDeployments.length && eligibleDeployments.length > 0} 
                          onChange={handleSelectAll} 
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                      )}
                    </th>
                    <th className="p-4 font-black">Duty / Status</th>
                    <th className="p-4 font-black">Operator</th>
                    <th className="p-4 font-black">Shift Progress</th>
                    <th className="p-4 font-black text-center">Engine Triggers</th>
                    <th className="p-4 font-black text-right border-l border-slate-800">Gate Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredDeployments.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">No deployments match criteria</td>
                    </tr>
                  ) : (
                    filteredDeployments.map(d => {
                      const progress = getDutyProgress(d);
                      const isDispatched = d.status === 'DISPATCHED' || d.status === 'RELIEF_DISPATCHED';
                      const isActive = d.isSignedOn || isDispatched;
                      
                      return (
                        <tr key={d.id} className={`hover:bg-slate-800/30 transition-colors ${activeAbnormalEvent?.deployment?.id === d.id ? 'bg-amber-950/20' : ''}`}>
                          <td className="p-4 w-10 text-center border-r border-slate-800">
                            {d.status !== 'DISPATCHED' && d.status !== 'RELIEF_DISPATCHED' ? (
                              <input id="automateddispatchgat-i4" name="automateddispatchgat-i4" 
                                type="checkbox" 
                                checked={selectedIds.includes(d.id)} 
                                onChange={() => handleToggleSelect(d.id)} 
                                className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                              />
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-white bg-slate-800 px-2 py-1 rounded">{d.dutyId}</span>
                              {isActive ? (
                                <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest uppercase flex items-center gap-1">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ACTIVE
                                </span>
                              ) : (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded text-[9px] font-black tracking-widest uppercase">
                                  PENDING
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">
                              Sign On: {d.signOnTime || '--:--'} | Train: <span className="text-cyan-400">{d.trainId || '--'}</span>
                            </div>
                          </td>
                          <td className={`p-4 font-bold text-slate-300 relative group ${d.isExchanged ? 'bg-yellow-500/10 border-l border-r border-yellow-500/20' : ''}`}>
                            {editingDeploymentId === d.id ? (
                              <div className="flex flex-col gap-2 bg-slate-950 p-2.5 rounded border border-slate-700 min-w-[220px]">
                                <div>
                                  <label className="block text-[8px] text-slate-500 uppercase tracking-widest mb-0.5" htmlFor="automateddispatchgat-l2">Operator Name</label>
                                  <input id="automateddispatchgat-i5" name="automateddispatchgat-i5"
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="Operator Name"
                                    className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white w-full focus:outline-none focus:border-emerald-500 font-mono"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] text-slate-500 uppercase tracking-widest mb-0.5" htmlFor="automateddispatchgat-l3">Employee ID</label>
                                  <input id="automateddispatchgat-i6" name="automateddispatchgat-i6"
                                    type="text"
                                    list="crew-employees"
                                    value={editEmpId}
                                    onChange={(e) => handleEditEmpIdChange(e.target.value)}
                                    placeholder="Employee ID"
                                    className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white w-full focus:outline-none focus:border-emerald-500 font-mono"
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[8px] text-slate-500 uppercase tracking-widest mb-0.5" htmlFor="automateddispatchgat-l4">Train ID</label>
                                    <input id="automateddispatchgat-i7" name="automateddispatchgat-i7"
                                      type="text"
                                      value={editTrainId}
                                      onChange={(e) => setEditTrainId(e.target.value)}
                                      placeholder="e.g. 201 or UNASSIGNED"
                                      className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white w-full focus:outline-none focus:border-emerald-500 font-mono"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[8px] text-slate-500 uppercase tracking-widest mb-0.5" htmlFor="automateddispatchgat-l5">Duty ID</label>
                                    <input id="automateddispatchgat-i8" name="automateddispatchgat-i8"
                                      type="text"
                                      value={editDutyId}
                                      onChange={(e) => setEditDutyId(e.target.value)}
                                      placeholder="e.g. 105 or UNASSIGNED"
                                      className="bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white w-full focus:outline-none focus:border-emerald-500 font-mono"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2 justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingDeploymentId(null)}
                                    className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
                                    title="Cancel"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveOperator(d.id)}
                                    disabled={savingEdit}
                                    className="p-1 hover:bg-slate-800 rounded text-emerald-400 hover:text-emerald-300"
                                    title="Save Assignment"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <span className={d.empName ? 'text-slate-200' : 'text-slate-500 italic'}>
                                    {d.empName || 'UNASSIGNED'}
                                  </span>
                                  {d.empId && (
                                    <span className="block text-[9px] text-slate-500 font-normal">
                                      ID: {d.empId}
                                    </span>
                                  )}
                                  {d.isExchanged && (
                                    <>
                                      <span className="mt-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-yellow-450 border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 rounded w-fit">
                                        <Repeat className="h-2.5 w-2.5 animate-spin-slow" />
                                        🔄 EXCHANGED
                                      </span>
                                      
                                      <div className="absolute left-1/2 bottom-full mb-1 -translate-x-1/2 bg-slate-950 border border-yellow-500/30 p-2.5 rounded-lg shadow-2xl hidden group-hover:block z-50 text-[10px] space-y-1 w-64 text-left font-mono normal-case">
                                        <div className="font-bold text-yellow-500 border-b border-slate-900 pb-1 flex items-center gap-1 uppercase tracking-wider">
                                          <Repeat className="h-3 w-3" /> Duty Exchanged
                                        </div>
                                        <div>
                                          <span className="text-slate-500">Original Operator:</span>
                                          <div className="text-slate-300 font-bold uppercase">{d.originalEmpName || '--'} <span className="text-slate-500 normal-case">(Duty {d.originalDutyId || d.dutyId})</span></div>
                                        </div>
                                        <div>
                                          <span className="text-slate-500">Current Operator:</span>
                                          <div className="text-emerald-400 font-bold uppercase">{d.empName || '--'} <span className="text-slate-500 normal-case">(Duty {d.dutyId})</span></div>
                                        </div>
                                        <div className="border-t border-slate-850 pt-1 text-[8.5px] text-slate-500 space-y-0.5">
                                          <div>Approved By: {d.approvedBy || "Crew Controller"}</div>
                                          <div>Approval Date: {d.approvedDateTime ? new Date(d.approvedDateTime).toLocaleString() : "--"}</div>
                                          <div className="text-slate-650 truncate mt-0.5">ID: {d.exchangeId}</div>
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingDeploymentId(d.id);
                                    setEditName(d.empName || '');
                                    setEditEmpId(d.empId || '');
                                    setEditTrainId(d.trainId || 'UNASSIGNED');
                                    setEditDutyId(d.dutyId || 'UNASSIGNED');
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 transition-opacity"
                                  title="Edit Assignment"
                                >
                                  <Settings className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {d.status === 'RELIEF_DISPATCHED' && (
                              <div className="text-[9px] text-rose-400 mt-0.5 uppercase tracking-widest font-bold">
                                Assigned to Relief (Target: {d.reliefTargetDuty})
                              </div>
                            )}
                          </td>
                          <td className="p-4 min-w-[200px]">
                            <div className="w-full max-w-[200px]">
                              <div className="flex justify-between text-[9px] text-slate-500 mb-1 font-bold tracking-widest uppercase">
                                <span>Start</span>
                                <span className={progress > 90 ? 'text-rose-400' : progress > 75 ? 'text-amber-400' : 'text-emerald-400'}>
                                  {Math.round(progress)}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${progress > 90 ? 'bg-rose-500' : progress > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                                  style={{ width: `${progress}%` }}
                                ></div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex justify-center gap-1 flex-wrap w-48 mx-auto">
                              {ABNORMAL_EVENT_TYPES.map(e => {
                                const Icon = e.icon;
                                return (
                                  <button 
                                    key={e.id} 
                                    onClick={() => handleAbnormalEvent(d, e.id)} 
                                    disabled={!!activeAbnormalEvent || d.status === 'RELIEF_DISPATCHED'}
                                    className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed ${e.className}`}
                                    title={`Trigger ${e.label} Resolution`}
                                  >
                                    <Icon className="h-3 w-3" /> {e.label}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="p-4 text-right border-l border-slate-800 bg-slate-900/50">
                            {!isDispatched ? (
                              <button 
                                onClick={() => authorizeDispatch(d)} 
                                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-1.5 rounded text-[10px] tracking-widest uppercase shadow-md transition-colors"
                              >
                                AUTHORIZE
                              </button>
                            ) : (
                              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center justify-end gap-1">
                                <CheckCircle className="h-3 w-3" /> DISPATCHED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONFIG Tab */}
      {activeTab === 'CONFIG' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-300">
            
            {/* Column 1: Add Extra Operator Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="font-bold text-xs uppercase text-emerald-400 tracking-wider flex items-center gap-1.5">
                  <UserCheck size={16} /> Assign Extra Operator on Roster Duty
                </span>
              </div>
              
              <form onSubmit={handleAddExtraOperator} className="space-y-4 text-xs font-bold uppercase">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l6">Employee ID</label>
                    <input id="automateddispatchgat-i9" name="automateddispatchgat-i9"
                      type="text"
                      list="crew-employees"
                      placeholder="e.g. 22464"
                      value={newExtraOp.empId}
                      onChange={(e) => handleExtraOpEmpIdChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l7">Operator Name</label>
                    <input id="automateddispatchgat-i10" name="automateddispatchgat-i10"
                      type="text"
                      placeholder="e.g. NAVEEN KUMAR"
                      value={newExtraOp.empName}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, empName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l8">Duty ID (Optional)</label>
                    <input id="automateddispatchgat-i11" name="automateddispatchgat-i11"
                      type="text"
                      placeholder="e.g. 105 or empty"
                      value={newExtraOp.dutyId}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, dutyId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l9">Train ID</label>
                    <select id="automateddispatchgat-i12" name="automateddispatchgat-i12"
                      value={newExtraOp.trainId}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, trainId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    >
                      <option value="UNASSIGNED">UNASSIGNED (STANDBY)</option>
                      {Array.from({ length: 23 }, (_, i) => String(201 + i)).map(tid => (
                        <option key={tid} value={tid}>Train {tid}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l10">Sign On Time</label>
                    <input id="automateddispatchgat-i13" name="automateddispatchgat-i13"
                      type="text"
                      placeholder="e.g. 06:00:00"
                      value={newExtraOp.signOnTime}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, signOnTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l11">Sign Off Time</label>
                    <input id="automateddispatchgat-i14" name="automateddispatchgat-i14"
                      type="text"
                      placeholder="e.g. 14:00:00"
                      value={newExtraOp.signOffTime}
                      onChange={(e) => setNewExtraOp({ ...newExtraOp, signOffTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-3 rounded-lg tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} /> Assign Extra Operator
                </button>
              </form>
            </div>

            {/* Column 2: Register Step-back Duty Form */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="font-bold text-xs uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                  <Clock size={16} /> Register Step-back Duty (PUTH / NGSA)
                </span>
              </div>
              
              <form onSubmit={handleAddStepback} className="space-y-4 text-xs font-bold uppercase">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l12">Employee ID</label>
                    <input id="automateddispatchgat-i15" name="automateddispatchgat-i15"
                      type="text"
                      list="crew-employees"
                      placeholder="e.g. 21460"
                      value={newStepback.empId}
                      onChange={(e) => handleStepbackEmpIdChange(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l13">Operator Name</label>
                    <input id="automateddispatchgat-i16" name="automateddispatchgat-i16"
                      type="text"
                      placeholder="e.g. KAVITHA M N"
                      value={newStepback.empName}
                      onChange={(e) => setNewStepback({ ...newStepback, empName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l14">Step-back Station</label>
                    <select id="automateddispatchgat-i17" name="automateddispatchgat-i17"
                      value={newStepback.station}
                      onChange={(e) => setNewStepback({ ...newStepback, station: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    >
                      <option value="PUTH">Yelachenahalli (PUTH)</option>
                      <option value="NGSA">Nagasandra (NGSA)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l15">Duty ID</label>
                    <input id="automateddispatchgat-i18" name="automateddispatchgat-i18"
                      type="text"
                      placeholder="e.g. SB12"
                      value={newStepback.dutyId}
                      onChange={(e) => setNewStepback({ ...newStepback, dutyId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l16">Start Time</label>
                    <input id="automateddispatchgat-i19" name="automateddispatchgat-i19"
                      type="time"
                      value={newStepback.startTime}
                      onChange={(e) => setNewStepback({ ...newStepback, startTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-slate-500 tracking-wider" htmlFor="automateddispatchgat-l17">End Time</label>
                    <input id="automateddispatchgat-i20" name="automateddispatchgat-i20"
                      type="time"
                      value={newStepback.endTime}
                      onChange={(e) => setNewStepback({ ...newStepback, endTime: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black py-3 rounded-lg tracking-widest uppercase transition-all shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Plus size={16} /> Register Step-back Duty
                </button>
              </form>
            </div>
            
          </div>

          {/* Active Step-back Registry Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-2">
              <span className="font-bold text-xs uppercase text-slate-200 tracking-wider">
                Active Step-back Duties Console (PUTH & NGSA Stations)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-850 text-slate-550 font-bold uppercase">
                    <th className="p-3">Employee ID</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Terminal Station</th>
                    <th className="p-3">Step-back Duty ID</th>
                    <th className="p-3">Time Slot</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-slate-300">
                  {stepbacks.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-500 italic text-[11px] uppercase">
                        No active Step-back duties currently registered.
                      </td>
                    </tr>
                  ) : (
                    stepbacks.map(sb => (
                      <tr key={sb.id} className="hover:bg-slate-950/40">
                        <td className="p-3 font-bold text-cyan-400">{sb.empId}</td>
                        <td className="p-3 font-bold uppercase text-slate-200">{sb.empName}</td>
                        <td className="p-3 font-bold text-amber-400">
                          {sb.station === 'PUTH' ? 'Yelachenahalli (PUTH)' : 'Nagasandra (NGSA)'}
                        </td>
                        <td className="p-3 text-slate-300 font-bold">{sb.dutyId}</td>
                        <td className="p-3 font-mono">{sb.startTime} - {sb.endTime}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteStepback(sb.id)}
                            className="text-rose-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 size={16} />
                          </button>
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

      {/* History Tab */}
      {activeTab === 'HISTORY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h3 className="text-sm font-black tracking-wider text-slate-300 mb-6 uppercase flex items-center gap-2">
            <History className="h-5 w-5 text-slate-400" /> Gateway Audit Log
          </h3>
          
          {historyLoading ? (
            <div className="text-center text-slate-500 font-bold uppercase tracking-widest text-xs py-8 animate-pulse">Syncing History...</div>
          ) : eventHistory.length === 0 ? (
            <div className="text-center text-slate-600 font-bold uppercase tracking-widest text-xs py-12 border border-dashed border-slate-800 rounded">No incidents logged today.</div>
          ) : (
            <div className="space-y-4">
              {eventHistory.map(evt => (
                <div key={evt.id} className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded tracking-widest uppercase border ${
                        evt.status === 'RESOLVED' ? 'bg-emerald-950 border-emerald-800 text-emerald-400' : 'bg-amber-950 border-amber-800 text-amber-400'
                      }`}>
                        {evt.status}
                      </span>
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">{evt.incidentType}</span>
                      <span className="text-[10px] text-slate-500">{evt.timestamp?.toDate().toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-white">Target Duty: <span className="text-cyan-400">{evt.currentDutyId}</span> ({evt.currentEmpName})</p>
                  </div>
                  
                  <div className="text-left md:text-right text-xs bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 font-bold uppercase tracking-widest block text-[9px] mb-1">Resolution</span>
                    {evt.status === 'RESOLVED' ? (
                      <span className="font-bold text-emerald-400">Relief Duty: {evt.resolvedByDutyId} ({evt.resolvedByEmpName})</span>
                    ) : (
                      <span className="font-bold text-amber-500">Awaiting Decision</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <datalist id="crew-employees">
        {BMRCL_CREW_REGISTRY.map(c => (
          <option key={c.id} value={c.id}>{c.id} - {c.name}</option>
        ))}
      </datalist>
    </div>
  );
}
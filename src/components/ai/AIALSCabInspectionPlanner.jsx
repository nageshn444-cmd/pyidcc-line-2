import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { 
  collection, doc, onSnapshot, setDoc, addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { 
  Sparkles, CheckCircle, AlertTriangle, 
  MapPin, Clock, Search, User, ArrowRight, 
  RefreshCw, FileSpreadsheet, PlusCircle, Save, 
  Check, Trash2, Calendar, Activity, 
  Compass, Users, UserCheck, ShieldCheck, Share2, Printer,
  Layers, CheckSquare, FileText, Award, Download,
  Edit3, Plus, ArrowRightLeft, RotateCcw, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  OFFICIAL_ALS_MENTORS, 
  getStoredMentors, 
  saveMentors,
  getMentorByName, 
  HARSH_JOSHI_NOMINEES,
  ARUNA_KUMAR_DS_NOMINEES,
  SHANTIRAJ_NOMINEES
} from '../../data/mentorTrainOperatorRegistry.js';
import { BMRCL_CREW_MASTER_BACKUP } from '../../data/bmrclCrewRegistry.js';
import { 
  generateALSCabInspectionPlan,
  GREEN_LINE_STATIONS_LIST,
  STATION_NAMES_MAP,
  timeStrToMins,
  minsToTimeStr
} from '../../services/alsInspectionPlannerService.js';
import { normalizeScheduleDay } from '../../data/weekdayReliefIdChartRegistry.js';

export default function AIALSCabInspectionPlanner() {
  const { userProfile, hasPermission } = useAuth();

  // ── 1. Concerned ALS Officer ──
  const [mentorsList, setMentorsList] = useState(() => getStoredMentors());
  const [selectedMentorName, setSelectedMentorName] = useState("HARSH JOSHI");

  const activeMentor = useMemo(() => {
    return mentorsList.find(m => 
      String(m.name).toUpperCase().trim() === String(selectedMentorName).toUpperCase().trim()
    ) || mentorsList[0];
  }, [mentorsList, selectedMentorName]);

  // ── 2. Operational Planning Context ──
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shiftStartTime, setShiftStartTime] = useState('09:00');
  const [shiftEndTime, setShiftEndTime] = useState('17:30');
  const [baseStation, setBaseStation] = useState('PYID');

  // Convert Date to Schedule Day Type
  const scheduleType = useMemo(() => {
    const d = new Date(selectedDate);
    const day = d.getDay(); // 0 = Sun, 1 = Mon, 6 = Sat
    if (day === 0) return 'SUNDAY';
    if (day === 1) return 'MONDAY';
    if (day === 6) return 'SATURDAY';
    return 'WEEKDAY';
  }, [selectedDate]);

  // ── 3. Real-Time Data from Firestore & Dispatch Gateway Core ──
  const [dutyRoster, setDutyRoster] = useState([]);
  const [completedInspections, setCompletedInspections] = useState([]);
  const [dispatchSyncVersion, setDispatchSyncVersion] = useState(0);

  // Focus filter for user-selected operators
  const [selectedOperatorIds, setSelectedOperatorIds] = useState([]);

  // Active Sub-Tab
  const [activeTab, setActiveTab] = useState('JOURNEY_PLAN'); // JOURNEY_PLAN, NOMINATED_DRIVERS, INSPECTION_HISTORY, OFFICIAL_MASTER
  const [driverFilter, setDriverFilter] = useState('IN_CAB'); // ALL, IN_CAB, OTHER
  const [searchQuery, setSearchQuery] = useState('');

  // Inspection Modal States
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedOpToInspect, setSelectedOpToInspect] = useState(null);
  const [inspectionForm, setInspectionForm] = useState({
    criteria1: 2, // Signal Observation & Aspect Call-Out
    criteria2: 2, // ATP / Speed Restriction Adherence
    criteria3: 2, // Accurate Platform Berthing & Stopping Mark
    criteria4: 2, // Emergency Drill & Radio Discipline
    criteria5: 2, // Cab Cleanliness, Logbook & Alertness
    overallScore: 10,
    inspectionResult: 'PASS',
    remarks: '',
    alsName: activeMentor.name
  });

  // ── Tab 4: Editable Notice Board States & Autocomplete ──
  const [boardSearch, setBoardSearch] = useState('');
  const [editingOp, setEditingOp] = useState(null); // { mentorId, originalEmpId, empId, name }
  const [showAddOpModal, setShowAddOpModal] = useState(false);
  const [addOpTargetMentorId, setAddOpTargetMentorId] = useState('');
  const [addOpForm, setAddOpForm] = useState({ empId: '', name: '' });
  const [addOpCrewQuery, setAddOpCrewQuery] = useState('');
  const [transferTarget, setTransferTarget] = useState(null); // { operator, fromMentorId }
  const [boardActionFeedback, setBoardActionFeedback] = useState(null); // { type: 'success'|'error', message }

  // Sync ALS Mentors from Firestore (als_nomination_board)
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'als_nomination_board'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (Array.isArray(data?.mentors) && data.mentors.length > 0) {
          setMentorsList(data.mentors);
          saveMentors(data.mentors);
        }
      }
    }, (err) => {
      console.warn('Firestore ALS nomination board sync error:', err);
    });
    return () => unsub();
  }, []);

  // Listen for local custom event pyidcc_mentors_updated
  useEffect(() => {
    const handleMentorsUpdate = (e) => {
      if (e.detail?.mentors) {
        setMentorsList(e.detail.mentors);
      }
    };
    window.addEventListener('pyidcc_mentors_updated', handleMentorsUpdate);
    return () => window.removeEventListener('pyidcc_mentors_updated', handleMentorsUpdate);
  }, []);

  const persistMentors = async (updated) => {
    setMentorsList(updated);
    saveMentors(updated);
    try {
      await setDoc(doc(db, 'system_config', 'als_nomination_board'), {
        mentors: updated,
        updatedAt: new Date().toISOString(),
        updatedBy: userProfile?.employeeName || userProfile?.employeeId || 'ALS Officer'
      }, { merge: true });
    } catch (e) {
      console.warn('Firestore als_nomination_board sync failed:', e);
    }
  };

  const crewMatches = useMemo(() => {
    if (!addOpCrewQuery.trim() || addOpCrewQuery.trim().length < 2) return [];
    const q = addOpCrewQuery.toLowerCase().trim();
    return BMRCL_CREW_MASTER_BACKUP.filter(c => {
      const id = String(c.id || c.employeeId || '').toLowerCase();
      const name = String(c.name || c.employeeName || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    }).slice(0, 8);
  }, [addOpCrewQuery]);

  const handleSaveNewOperator = (e) => {
    if (e) e.preventDefault();
    const cleanId = String(addOpForm.empId || '').trim();
    const cleanName = String(addOpForm.name || '').trim();
    if (!cleanId || !cleanName) {
      setBoardActionFeedback({ type: 'error', message: 'Both Employee ID and Name are required.' });
      return;
    }
    const targetId = addOpTargetMentorId || mentorsList[0]?.id;
    const targetMentor = mentorsList.find(m => String(m.id) === String(targetId));
    if (!targetMentor) return;

    // Check duplicate
    const exists = targetMentor.assignedOperators?.some(op => String(op.empId).trim() === cleanId);
    if (exists) {
      setBoardActionFeedback({ type: 'error', message: `Officer #${cleanId} is already assigned to ${targetMentor.name}.` });
      return;
    }

    const updated = mentorsList.map(m => {
      if (String(m.id) === String(targetId)) {
        return {
          ...m,
          assignedOperators: [...(m.assignedOperators || []), { empId: cleanId, name: cleanName }]
        };
      }
      return m;
    });

    persistMentors(updated);
    setShowAddOpModal(false);
    setAddOpForm({ empId: '', name: '' });
    setAddOpCrewQuery('');
    setBoardActionFeedback({ type: 'success', message: `Added ${cleanName} (#${cleanId}) to ${targetMentor.name}.` });
    setTimeout(() => setBoardActionFeedback(null), 4000);
  };

  const handleSaveInlineEdit = () => {
    if (!editingOp) return;
    const { mentorId, originalEmpId, empId, name } = editingOp;
    const cleanId = String(empId || '').trim();
    const cleanName = String(name || '').trim();
    if (!cleanId || !cleanName) {
      setBoardActionFeedback({ type: 'error', message: 'Employee ID and Name cannot be blank.' });
      return;
    }

    const updated = mentorsList.map(m => {
      if (String(m.id) === String(mentorId)) {
        const nextOps = (m.assignedOperators || []).map(op => {
          if (String(op.empId).trim() === String(originalEmpId).trim()) {
            return { empId: cleanId, name: cleanName };
          }
          return op;
        });
        return { ...m, assignedOperators: nextOps };
      }
      return m;
    });

    persistMentors(updated);
    setEditingOp(null);
    setBoardActionFeedback({ type: 'success', message: `Updated officer #${cleanId} (${cleanName}).` });
    setTimeout(() => setBoardActionFeedback(null), 4000);
  };

  const handleDeleteOperator = (mentorId, empId, opName) => {
    const mentor = mentorsList.find(m => String(m.id) === String(mentorId));
    const confirmMsg = `Remove ${opName || 'officer'} (#${empId}) from ${mentor?.name || 'this ALS mentor'}?`;
    if (!window.confirm(confirmMsg)) return;

    const updated = mentorsList.map(m => {
      if (String(m.id) === String(mentorId)) {
        return {
          ...m,
          assignedOperators: (m.assignedOperators || []).filter(op => String(op.empId).trim() !== String(empId).trim())
        };
      }
      return m;
    });

    persistMentors(updated);
    setBoardActionFeedback({ type: 'success', message: `Removed #${empId} from ${mentor?.name}.` });
    setTimeout(() => setBoardActionFeedback(null), 4000);
  };

  const handleTransferOperator = (fromMentorId, toMentorId, op) => {
    if (String(fromMentorId) === String(toMentorId)) return;
    const targetMentor = mentorsList.find(m => String(m.id) === String(toMentorId));
    if (!targetMentor) return;

    const cleanId = String(op.empId).trim();
    if (targetMentor.assignedOperators?.some(o => String(o.empId).trim() === cleanId)) {
      setBoardActionFeedback({ type: 'error', message: `Officer #${cleanId} is already in ${targetMentor.name}'s list.` });
      return;
    }

    const updated = mentorsList.map(m => {
      if (String(m.id) === String(fromMentorId)) {
        return {
          ...m,
          assignedOperators: (m.assignedOperators || []).filter(o => String(o.empId).trim() !== cleanId)
        };
      }
      if (String(m.id) === String(toMentorId)) {
        return {
          ...m,
          assignedOperators: [...(m.assignedOperators || []), { empId: cleanId, name: op.name }]
        };
      }
      return m;
    });

    persistMentors(updated);
    setTransferTarget(null);
    setBoardActionFeedback({ type: 'success', message: `Transferred ${op.name} (#${cleanId}) to ${targetMentor.name}.` });
    setTimeout(() => setBoardActionFeedback(null), 4000);
  };

  const handleResetBaseline = () => {
    if (!window.confirm('Reset all ALS Train Operator nominations back to the official BMRCL baseline (W.E.F 23/06/2026)? This will overwrite custom edits.')) {
      return;
    }
    persistMentors(OFFICIAL_ALS_MENTORS);
    setBoardActionFeedback({ type: 'success', message: 'Restored Official BMRCL Nomination baseline.' });
    setTimeout(() => setBoardActionFeedback(null), 4000);
  };

  const handleExportNoticeBoardExcel = () => {
    try {
      const rows = [];
      mentorsList.forEach(m => {
        (m.assignedOperators || []).forEach((op, idx) => {
          rows.push({
            'SL No': idx + 1,
            'ALS Mentor Name': m.name,
            'ALS Emp ID': m.id,
            'ALS Designation': m.designation,
            'ALS Weekly Off': m.fixedWo,
            'Operator Emp ID': op.empId,
            'Train Operator Name': op.name,
            'Base Station': m.defaultBaseStation || 'PYID',
            'Nomination Order': 'W.E.F 23/06/2026'
          });
        });
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'ALS Nomination Board');
      XLSX.writeFile(wb, `BMRCL_ALS_Nomination_Notice_Board_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Export error:', err);
      alert('Unable to export Notice Board: ' + err.message);
    }
  };

  // Listen for Dispatch Core changes
  useEffect(() => {
    const handleDispatchUpdate = () => setDispatchSyncVersion(v => v + 1);
    if (typeof window !== 'undefined') {
      window.addEventListener('pyidcc_dispatch_deployments_updated', handleDispatchUpdate);
      window.addEventListener('storage', handleDispatchUpdate);
      return () => {
        window.removeEventListener('pyidcc_dispatch_deployments_updated', handleDispatchUpdate);
        window.removeEventListener('storage', handleDispatchUpdate);
      };
    }
  }, []);

  // Listen to Firestore duties & completed inspections
  useEffect(() => {
    const unsubDuties = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDutyRoster(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubCompleted = onSnapshot(collection(db, 'alsCompletedInspection'), (snap) => {
      setCompletedInspections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => {
      unsubDuties();
      unsubCompleted();
    };
  }, []);

  // Sync ALS default shift when mentor changes
  useEffect(() => {
    if (activeMentor) {
      if (activeMentor.defaultShiftStart) setShiftStartTime(activeMentor.defaultShiftStart);
      if (activeMentor.defaultShiftEnd) setShiftEndTime(activeMentor.defaultShiftEnd);
      if (activeMentor.defaultBaseStation) setBaseStation(activeMentor.defaultBaseStation);
      setInspectionForm(prev => ({ ...prev, alsName: activeMentor.name }));
    }
  }, [activeMentor]);

  // ── 4. AUTOMATIC CAB INSPECTION PLAN GENERATION ──
  // The system ALWAYS computes the easiest, most accurate plan immediately!
  const generatedPlan = useMemo(() => {
    return generateALSCabInspectionPlan({
      mentorName: activeMentor.name,
      scheduleDay: scheduleType,
      shiftStartTime,
      shiftEndTime,
      baseStation,
      deployments: dutyRoster,
      completedInspections,
      selectedOperatorIds
    });
  }, [activeMentor, scheduleType, shiftStartTime, shiftEndTime, baseStation, dutyRoster, completedInspections, selectedOperatorIds, dispatchSyncVersion]);

  // Monthly completed map for quick badge check
  const currentMonthStr = useMemo(() => selectedDate.substring(0, 7), [selectedDate]);
  const monthlyCompletedMap = useMemo(() => {
    const map = new Map();
    completedInspections.forEach(insp => {
      if (insp.inspectionDate && insp.inspectionDate.startsWith(currentMonthStr)) {
        map.set(String(insp.employeeId).trim(), insp);
      }
    });
    return map;
  }, [completedInspections, currentMonthStr]);

  // Available driving segments breakdown
  const availableSegments = generatedPlan?.availableSegments || [];

  // Filtered segments for Nominated Operators Tab
  const filteredNominees = useMemo(() => {
    const allNominees = activeMentor.assignedOperators || [];
    return allNominees.filter(op => {
      const empId = String(op.empId).trim();
      const drivingSeg = availableSegments.find(s => s.operatorId === empId);
      const isDrivingInShift = Boolean(drivingSeg);

      if (driverFilter === 'IN_CAB' && !isDrivingInShift) return false;
      if (driverFilter === 'OTHER' && isDrivingInShift) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = op.name.toLowerCase().includes(q);
        const matchId = empId.includes(q);
        const matchTrain = drivingSeg && String(drivingSeg.trainId).includes(q);
        const matchDuty = drivingSeg && String(drivingSeg.dutyId).includes(q);
        return matchName || matchId || matchTrain || matchDuty;
      }
      return true;
    });
  }, [activeMentor, availableSegments, driverFilter, searchQuery]);

  // Modal open & calculation
  const openInspectionForm = (op) => {
    setSelectedOpToInspect(op);
    setInspectionForm({
      criteria1: 2,
      criteria2: 2,
      criteria3: 2,
      criteria4: 2,
      criteria5: 2,
      overallScore: 10,
      inspectionResult: 'PASS',
      remarks: '',
      alsName: activeMentor.name
    });
    setShowLogModal(true);
  };

  const handleScoreChange = (field, val) => {
    const num = Math.min(2, Math.max(0, parseInt(val, 10) || 0));
    setInspectionForm(prev => {
      const updated = { ...prev, [field]: num };
      const total = (updated.criteria1 || 0) + (updated.criteria2 || 0) + (updated.criteria3 || 0) + (updated.criteria4 || 0) + (updated.criteria5 || 0);
      let result = 'PASS';
      if (total < 6) result = 'NEEDS_TRAINING';
      else if (total < 8) result = 'SATISFACTORY';
      return {
        ...updated,
        overallScore: total,
        inspectionResult: result
      };
    });
  };

  const handleInspectionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOpToInspect) return;

    const timeStr = new Date().toTimeString().split(' ')[0];
    const payload = {
      employeeId: selectedOpToInspect.operatorId || selectedOpToInspect.empId,
      employeeName: selectedOpToInspect.operatorName || selectedOpToInspect.name,
      trainId: selectedOpToInspect.trainId || '214',
      dutyNumber: selectedOpToInspect.dutyId || 'N/A',
      inspectionDate: selectedDate,
      inspectionTime: timeStr,
      alsName: inspectionForm.alsName,
      overallScore: Number(inspectionForm.overallScore),
      inspectionResult: inspectionForm.inspectionResult,
      remarks: inspectionForm.remarks,
      checklistScores: {
        signalObservation: inspectionForm.criteria1,
        speedCompliance: inspectionForm.criteria2,
        berthingAccuracy: inspectionForm.criteria3,
        emergencyPreparedness: inspectionForm.criteria4,
        cabDiscipline: inspectionForm.criteria5
      },
      timestamp: serverTimestamp()
    };

    try {
      const docId = `inspection_${selectedDate}_${payload.employeeId}`;
      await setDoc(doc(db, 'alsCompletedInspection', docId), payload);

      await addDoc(collection(db, 'alsInspectionHistory'), {
        event: 'INSPECTION_COMPLETED',
        description: `Cab Inspection completed for ${payload.employeeName} on Train ${payload.trainId}. Result: ${payload.inspectionResult}, Score: ${payload.overallScore}/10`,
        officer: payload.alsName,
        timestamp: serverTimestamp()
      });

      alert(`Official Cab Inspection logged successfully for ${payload.employeeName}!`);
      setShowLogModal(false);
      setSelectedOpToInspect(null);
    } catch (err) {
      console.error(err);
      alert("Failed to save inspection report.");
    }
  };

  const handleCopyWhatsAppOrder = () => {
    if (!generatedPlan || !generatedPlan.steps || generatedPlan.steps.length === 0) {
      alert("No journey plan available.");
      return;
    }
    let text = `*BMRCL LINE-2 OFFICIAL CAB INSPECTION JOURNEY ORDER*\n`;
    text += `*Concerned ALS:* ${activeMentor.name} (Shift: ${shiftStartTime}–${shiftEndTime})\n`;
    text += `*Date:* ${selectedDate} (${scheduleType}) | *Base Station:* ${baseStation}\n`;
    text += `*Status:* ${generatedPlan.coveredInspectionsCount} Cab Inspections Planned\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    generatedPlan.steps.forEach(s => {
      if (s.action === 'BOARD') {
        text += `🟢 *${s.time}* - *BOARD Train ${s.trainId}* at ${s.stationName} (${s.platform})\n`;
        text += `   Driver in Cab: *${s.operatorName}* (#${s.operatorId})\n`;
      } else if (s.action === 'INSPECT') {
        text += `🟣 *${s.time}* - *CAB INSPECTION* ${s.fromStation} ➔ ${s.toStation}\n`;
      } else if (s.action === 'DEBOARD') {
        text += `🛑 *${s.time}* - *DEBOARD Train ${s.trainId}* at ${s.stationName}\n`;
        if (s.relieverName && s.relieverName !== '--') {
          text += `   *Reliever:* ${s.relieverName} (Duty ${s.relieverDutyId}) takes over\n`;
        }
      } else if (s.action === 'TRANSFER') {
        text += `🔄 *${s.time}* - ${s.details}\n`;
      } else if (s.action === 'LEAVE' || s.action === 'COMPLETED') {
        text += `🏁 *${s.time}* - ${s.details}\n`;
      }
    });
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nGenerated via BMRCL AI ALS Cab Inspection Planner • Peenya Depot`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      alert("Official Cab Inspection Order copied to clipboard for WhatsApp!");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const rows = (generatedPlan?.steps || []).map(s => ({
      "Step #": s.stepIndex,
      "Time": s.time,
      "Action": s.action,
      "Station": s.stationName,
      "Platform": s.platform || '--',
      "Train ID": s.trainId || '--',
      "Operator in Cab": s.operatorName || '--',
      "Operator ID": s.operatorId || '--',
      "Reliever Name": s.relieverName || '--',
      "Reliever Duty": s.relieverDutyId || '--',
      "Details": s.details
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cab Inspection Journey");
    XLSX.writeFile(wb, `BMRCL_ALS_Cab_Inspection_${activeMentor.name.replace(/\s+/g, '_')}_${selectedDate}.xlsx`);
  };

  if (userProfile?.role === 'TRAIN_OPERATOR' || userProfile?.role === 'STATION_CONTROLLER' || userProfile?.role === 'VIEWER' || !hasPermission('AI ALS Cab Inspection', 'View')) {
    return null;
  }

  return (
    <div className="space-y-6 text-xs font-mono text-slate-200">
      
      {/* ── 1. OFFICIAL TOP HEADER PANEL ── */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-xl flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded tracking-wider uppercase">
              BMRCL Line 2 Peenya Depot Crew Control
            </span>
            <span className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black px-2 py-0.5 rounded tracking-wider uppercase flex items-center gap-1">
              <Activity className="h-3 w-3 animate-pulse" /> Live Synced @DISPATCH GATEWAY CORE & Relief Chart
            </span>
          </div>
          <h1 className="text-lg font-black text-slate-100 flex items-center gap-2 uppercase tracking-wider mt-1.5">
            <Sparkles className="text-cyan-400 h-5 w-5 animate-pulse" /> AI ALS Cab Inspection Planner
          </h1>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Automated Mainline Train Boarding, In-Cab Evaluation, and Reliever Handover Route Planner
          </p>
        </div>

        {/* Operational Context Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* ALS Officer Selector */}
          <div className="bg-slate-950 border border-cyan-800/80 p-2 rounded-lg flex items-center gap-2 shadow-inner">
            <User className="h-4 w-4 text-cyan-400" />
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Concerned ALS:</span>
            <select
              value={selectedMentorName}
              onChange={e => {
                setSelectedMentorName(e.target.value);
                setSelectedOperatorIds([]);
              }}
              className="bg-transparent border-none text-cyan-300 font-black text-xs focus:outline-none cursor-pointer"
            >
              {mentorsList.map(m => (
                <option key={m.id || m.name} value={m.name} className="bg-slate-900 text-slate-100 font-bold">
                  {m.displayName || m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Selector */}
          <div className="bg-slate-950 border border-slate-800 p-2 rounded-lg flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={e => {
                setSelectedDate(e.target.value);
                setSelectedOperatorIds([]);
              }}
              className="bg-transparent border-none text-indigo-300 font-black outline-none cursor-pointer w-28 text-xs"
            />
            <span className="bg-indigo-950 text-indigo-400 px-1.5 py-0.5 rounded text-[9px] font-black border border-indigo-900">
              {scheduleType}
            </span>
          </div>

          {/* Shift Hours */}
          <div className="bg-slate-950 border border-slate-800 p-2 rounded-lg flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Shift:</span>
            <input
              type="time"
              value={shiftStartTime}
              onChange={e => setShiftStartTime(e.target.value)}
              className="bg-transparent border-none text-amber-300 font-black outline-none w-16 cursor-pointer"
              title="Shift Start Time"
            />
            <span className="text-slate-600 font-bold">➔</span>
            <input
              type="time"
              value={shiftEndTime}
              onChange={e => setShiftEndTime(e.target.value)}
              className="bg-transparent border-none text-amber-300 font-black outline-none w-16 cursor-pointer"
              title="Shift End Time"
            />
          </div>

          {/* Base Station */}
          <div className="bg-slate-950 border border-slate-800 p-2 rounded-lg flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Base:</span>
            <select
              value={baseStation}
              onChange={e => setBaseStation(e.target.value)}
              className="bg-transparent border-none text-emerald-300 font-black focus:outline-none cursor-pointer"
            >
              {GREEN_LINE_STATIONS_LIST.map(st => (
                <option key={st.code} value={st.code} className="bg-slate-900 text-slate-200">
                  {st.code} ({st.name})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── 2. METRICS DASHBOARD CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex justify-between items-center text-slate-400 text-[10px] font-bold uppercase">
            <span>Nominated Mentees</span>
            <Users className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-300">{activeMentor.assignedOperators?.length || 0}</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase">TOs under {activeMentor.name.split(' ')[0]}</span>
          </div>
        </div>

        <div className="bg-emerald-950/20 border border-emerald-900/40 p-3.5 rounded-xl">
          <div className="flex justify-between items-center text-emerald-400 text-[10px] font-bold uppercase">
            <span>In Train Driving Now</span>
            <Activity className="h-4 w-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400">{generatedPlan.activeInShiftCount}</span>
            <span className="text-[10px] text-emerald-500 font-bold uppercase">Active Targets Today</span>
          </div>
        </div>

        <div className="bg-cyan-955/20 border border-cyan-900/40 p-3.5 rounded-xl">
          <div className="flex justify-between items-center text-cyan-400 text-[10px] font-bold uppercase">
            <span>Planned Inspections</span>
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-cyan-300">{generatedPlan.coveredInspectionsCount}</span>
            <span className="text-[10px] text-slate-400 font-bold uppercase">Scheduled in Plan</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-xl">
          <div className="flex justify-between items-center text-slate-400 text-[10px] font-bold uppercase">
            <span>Plan Route Efficiency</span>
            <Compass className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-black text-indigo-300">{generatedPlan.efficiency}%</span>
            <span className="text-[10px] text-emerald-400 font-bold uppercase">Easiest Sequential Route</span>
          </div>
        </div>

        <div className="bg-amber-955/20 border border-amber-900/30 p-3.5 rounded-xl">
          <div className="flex justify-between items-center text-amber-400 text-[10px] font-bold uppercase">
            <span>Shift Time Window</span>
            <Clock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-base font-black text-amber-300 font-mono">{shiftStartTime} ➔ {shiftEndTime}</span>
            <span className="text-[10px] text-slate-500 font-bold uppercase">8h 30m</span>
          </div>
        </div>
      </div>

      {/* ── 3. SUB TAB NAVIGATION ── */}
      <div className="flex flex-wrap border-b border-slate-800 pb-3 gap-2 justify-between items-center">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'JOURNEY_PLAN', label: '1. Official Cab Inspection Journey Plan', icon: Compass },
            { id: 'NOMINATED_DRIVERS', label: `2. Nominated Train Operators (${activeMentor.assignedOperators?.length || 0})`, icon: Users },
            { id: 'INSPECTION_HISTORY', label: '3. Inspection Logs & Audit Records', icon: ShieldCheck },
            { id: 'OFFICIAL_MASTER', label: '4. Official BMRCL Nomination Notice Board', icon: FileText }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 font-bold rounded-lg transition-colors border flex items-center gap-2 cursor-pointer ${
                  activeTab === tab.id 
                    ? 'bg-cyan-950/40 text-cyan-300 border-cyan-800 shadow-md' 
                    : 'bg-slate-900 border-transparent text-slate-400 hover:bg-slate-850'
                }`}
              >
                <Icon size={14} /> {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setDispatchSyncVersion(v => v + 1)}
            className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 font-bold px-3 py-1.5 rounded flex items-center gap-1.5 transition text-[10px] cursor-pointer"
            title="Reload live active train operators from @DISPATCH GATEWAY CORE"
          >
            <RefreshCw size={12} className="text-cyan-400" /> Refresh Live Dispatches
          </button>
        </div>
      </div>

      {/* ── TAB 1: OFFICIAL CAB INSPECTION JOURNEY PLAN ── */}
      {activeTab === 'JOURNEY_PLAN' && (
        <div className="space-y-6">
          
          {/* Top Plan Directive Card */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-lg">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-cyan-950/80 text-cyan-300 border border-cyan-800 px-2.5 py-0.5 rounded text-[10px] font-black uppercase">
                  {activeMentor.name} • CAB INSPECTION ORDER
                </span>
                <span className="text-[10px] text-slate-400">
                  Base: <strong className="text-emerald-400">{baseStation} (Peenya Industry)</strong> | Shift: <strong className="text-amber-400">{shiftStartTime} ➔ {shiftEndTime}</strong>
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-sans mt-1">
                Easiest sequential boarding plan using <strong>Relief ID Chart & WTT</strong>. Below is your step-by-step itinerary detailing where to board, which train ID, which nominated operator is in the cab, where to deboard, and who relieves them.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyWhatsAppOrder}
                className="bg-emerald-950/50 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 px-3.5 py-1.5 rounded font-black flex items-center gap-1.5 transition text-[10px] cursor-pointer shadow"
              >
                <Share2 size={13} /> WhatsApp Order
              </button>
              <button
                onClick={handlePrint}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 px-3.5 py-1.5 rounded font-bold flex items-center gap-1.5 transition text-[10px] cursor-pointer"
              >
                <Printer size={13} /> Print Sheet
              </button>
              <button
                onClick={handleExportExcel}
                className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 px-3.5 py-1.5 rounded font-bold flex items-center gap-1.5 transition text-[10px] cursor-pointer"
              >
                <FileSpreadsheet size={13} /> Excel
              </button>
            </div>
          </div>

          {/* Step-by-Step Interactive Itinerary */}
          <div className="bg-slate-900/40 border border-slate-800 p-5 rounded-xl space-y-4">
            <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
              <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                <Compass className="h-4 w-4 text-cyan-400" />
                Step-by-Step Itinerary for ALS {activeMentor.name}
              </h3>
              <span className="text-[10px] text-slate-400 font-bold">
                {generatedPlan.steps?.length || 0} Sequential Actions
              </span>
            </div>

            <div className="space-y-3">
              {generatedPlan.steps && generatedPlan.steps.length > 0 ? (
                generatedPlan.steps.map((step, idx) => {
                  const isBoard = step.action === 'BOARD';
                  const isInspect = step.action === 'INSPECT';
                  const isDeboard = step.action === 'DEBOARD';
                  const isTransfer = step.action === 'TRANSFER';
                  const isWait = step.action === 'WAIT';
                  const isLeave = step.action === 'LEAVE';
                  const isCompleted = step.action === 'COMPLETED';

                  return (
                    <div 
                      key={idx}
                      className={`p-4 rounded-xl border transition-all ${
                        isInspect ? 'bg-cyan-950/20 border-cyan-800/80 shadow-md' :
                        isBoard ? 'bg-indigo-950/20 border-indigo-800/80 shadow-sm' :
                        isDeboard ? 'bg-rose-955/20 border-rose-800/80' :
                        isTransfer ? 'bg-purple-955/20 border-purple-800/80' :
                        isCompleted ? 'bg-emerald-955/20 border-emerald-800/80' :
                        'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="space-y-1.5 flex-1">
                          
                          {/* Badges Bar */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-black text-slate-200 bg-slate-900 border border-slate-750 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                              <Clock size={11} className="text-cyan-400" /> {step.time}
                            </span>
                            
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${
                              isBoard ? 'bg-indigo-950 text-indigo-300 border-indigo-700' :
                              isInspect ? 'bg-cyan-950 text-cyan-300 border-cyan-700' :
                              isDeboard ? 'bg-rose-955 text-rose-300 border-rose-700' :
                              isTransfer ? 'bg-purple-955 text-purple-300 border-purple-700' :
                              isCompleted ? 'bg-emerald-955 text-emerald-300 border-emerald-700' :
                              'bg-slate-900 text-slate-300 border-slate-700'
                            }`}>
                              {step.action}
                            </span>

                            {step.trainId && (
                              <span className="bg-slate-900 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded text-[9.5px] font-black">
                                🚆 Train {step.trainId} {step.direction ? `(${step.direction})` : ''}
                              </span>
                            )}

                            {step.stationName && (
                              <span className="text-[9.5px] text-slate-400 font-bold flex items-center gap-1">
                                <MapPin size={11} className="text-emerald-400" /> {step.stationName}
                              </span>
                            )}
                          </div>

                          {/* Primary Description */}
                          <p className="text-slate-100 font-bold text-xs mt-1 leading-relaxed">
                            {step.details}
                          </p>

                          {/* Operator in Cab details if inspecting or boarding */}
                          {(isBoard || isInspect) && step.operatorName && (
                            <div className="mt-2 bg-slate-950/80 border border-slate-800 p-2.5 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[10px]">
                              <div>
                                <span className="text-slate-400 font-bold">Driver in Cab: </span>
                                <strong className="text-cyan-300 font-black uppercase">{step.operatorName}</strong>
                                <span className="text-slate-500 font-bold"> (ID: #{step.operatorId} • Duty: {step.dutyId})</span>
                              </div>
                              <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                {activeMentor.name.split(' ')[0]} Nominee
                              </span>
                            </div>
                          )}

                          {/* Reliever details on Deboard step */}
                          {isDeboard && step.relieverName && step.relieverName !== '--' && (
                            <div className="mt-2 bg-rose-955/20 border border-rose-900/40 p-2.5 rounded-lg flex flex-wrap items-center gap-2 text-[10px]">
                              <span className="text-rose-400 font-black uppercase">🔄 Handover / Reliever:</span>
                              <strong className="text-slate-200 font-bold">{step.relieverName}</strong>
                              <span className="text-slate-400 font-bold">(Duty #{step.relieverDutyId}) takes over Train {step.trainId}</span>
                            </div>
                          )}

                        </div>

                        {/* Action Buttons for Log Inspection */}
                        {isInspect && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openInspectionForm(step)}
                              className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-4 py-2 rounded-lg uppercase tracking-wider text-[10px] flex items-center gap-1.5 transition shadow cursor-pointer"
                            >
                              <Award size={13} /> Log Cab Inspection
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-500 italic">
                  Generating inspection itinerary...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: NOMINATED TRAIN OPERATORS & DUTIES TABLE ── */}
      {activeTab === 'NOMINATED_DRIVERS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                <Users size={14} className="text-cyan-400" />
                Train Operators Nominated under ALS {activeMentor.name}
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Official crew list from Crew Control Peenya Depot • Status on current date & shift
              </p>
            </div>

            {/* Scope Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setDriverFilter('IN_CAB')}
                className={`px-3 py-1.5 rounded font-black text-[10px] border transition cursor-pointer ${
                  driverFilter === 'IN_CAB'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850'
                }`}
              >
                🟢 Driving in Shift ({generatedPlan.activeInShiftCount})
              </button>
              <button
                onClick={() => setDriverFilter('ALL')}
                className={`px-3 py-1.5 rounded font-black text-[10px] border transition cursor-pointer ${
                  driverFilter === 'ALL'
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850'
                }`}
              >
                All Nominees ({activeMentor.assignedOperators?.length || 0})
              </button>
              <button
                onClick={() => setDriverFilter('OTHER')}
                className={`px-3 py-1.5 rounded font-black text-[10px] border transition cursor-pointer ${
                  driverFilter === 'OTHER'
                    ? 'bg-amber-955 text-amber-300 border-amber-700'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-850'
                }`}
              >
                Other Shifts / Standby
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, employee ID, train..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded pl-8 pr-2 py-1.5 outline-none focus:border-cyan-500 text-slate-200 text-xs"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="text-[9px] text-slate-400 uppercase tracking-wider bg-slate-950/70 border-b border-slate-800">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Train Operator</th>
                  <th className="p-3">Mainline Train</th>
                  <th className="p-3">Driving Time (Relief Chart)</th>
                  <th className="p-3">Duty #</th>
                  <th className="p-3">Reliever Taking Over</th>
                  <th className="p-3">Monthly Inspection</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-350 text-[10px]">
                {filteredNominees.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-slate-500 italic">
                      No nominated operators match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredNominees.map((op, idx) => {
                    const empId = String(op.empId).trim();
                    const drivingSeg = availableSegments.find(s => s.operatorId === empId);
                    const isInspectedThisMonth = monthlyCompletedMap.has(empId);

                    return (
                      <tr key={empId || idx} className="hover:bg-slate-850/40">
                        <td className="p-3 text-slate-500 font-bold">{idx + 1}</td>
                        <td className="p-3">
                          <strong className="text-slate-100 font-bold block">{op.name}</strong>
                          <span className="text-[9px] text-slate-500">ID: #{empId}</span>
                        </td>
                        <td className="p-3">
                          {drivingSeg ? (
                            <span className="bg-indigo-950/80 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded font-black">
                              Train {drivingSeg.trainId}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">Not in cab during shift</span>
                          )}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-200">
                          {drivingSeg ? `${drivingSeg.legFromTime} ➔ ${drivingSeg.legToTime}` : '--:--'}
                        </td>
                        <td className="p-3 font-bold text-slate-300">
                          {drivingSeg ? `Duty ${drivingSeg.dutyId}` : '--'}
                        </td>
                        <td className="p-3">
                          {drivingSeg && drivingSeg.relieverName ? (
                            <div>
                              <strong className="text-slate-200 block">{drivingSeg.relieverName}</strong>
                              <span className="text-[9px] text-slate-500">Duty #{drivingSeg.relieverDutyId}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500">--</span>
                          )}
                        </td>
                        <td className="p-3">
                          {isInspectedThisMonth ? (
                            <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[8.5px] font-black uppercase">
                              Completed
                            </span>
                          ) : (
                            <span className="bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded text-[8.5px] font-black uppercase">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => openInspectionForm({
                              operatorId: empId,
                              operatorName: op.name,
                              trainId: drivingSeg?.trainId || '214',
                              dutyId: drivingSeg?.dutyId || 'N/A'
                            })}
                            className="bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 px-3 py-1 rounded text-[9px] font-bold uppercase transition cursor-pointer"
                          >
                            Log Inspection
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: INSPECTION LOGS & AUDIT RECORDS ── */}
      {activeTab === 'INSPECTION_HISTORY' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={14} className="text-cyan-400" />
                Completed Cab Inspection Evaluation Reports
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Archived evaluations committed to Firestore by Assistant Loco Superintendents
              </p>
            </div>
            <button
              onClick={() => {
                const data = completedInspections.map(e => ({
                  "Date": e.inspectionDate,
                  "Time": e.inspectionTime,
                  "ALS Officer": e.alsName,
                  "Operator Name": e.employeeName,
                  "Employee ID": e.employeeId,
                  "Train ID": e.trainId,
                  "Duty ID": e.dutyNumber,
                  "Score (10)": e.overallScore,
                  "Result": e.inspectionResult,
                  "Remarks": e.remarks
                }));
                const ws = XLSX.utils.json_to_sheet(data);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Inspections");
                XLSX.writeFile(wb, `BMRCL_ALS_Cab_Inspection_Log.xlsx`);
              }}
              className="bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 px-3.5 py-1.5 rounded font-bold text-[10px] transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={13} /> Export Excel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead className="text-[9px] text-slate-400 uppercase tracking-wider bg-slate-950/70 border-b border-slate-800">
                <tr>
                  <th className="p-3">Date & Time</th>
                  <th className="p-3">ALS Officer</th>
                  <th className="p-3">Train Operator</th>
                  <th className="p-3">Train & Duty</th>
                  <th className="p-3">Overall Score</th>
                  <th className="p-3">Decision</th>
                  <th className="p-3">Observations / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-350 text-[10px]">
                {completedInspections.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="p-8 text-center text-slate-500 italic">
                      No cab inspection evaluations logged yet.
                    </td>
                  </tr>
                ) : (
                  completedInspections.map((insp, idx) => (
                    <tr key={insp.id || idx} className="hover:bg-slate-850/40">
                      <td className="p-3 font-mono">{insp.inspectionDate} {insp.inspectionTime}</td>
                      <td className="p-3 font-bold text-slate-200">{insp.alsName}</td>
                      <td className="p-3 font-bold text-slate-100">{insp.employeeName} (#{insp.employeeId})</td>
                      <td className="p-3">Train {insp.trainId} (Duty {insp.dutyNumber})</td>
                      <td className="p-3 font-black text-cyan-400 text-xs">{insp.overallScore}/10</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase ${
                          insp.inspectionResult === 'PASS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                          insp.inspectionResult === 'SATISFACTORY' ? 'bg-amber-955 text-amber-400 border border-amber-800' :
                          'bg-rose-955 text-rose-400 border border-rose-800'
                        }`}>
                          {insp.inspectionResult}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 truncate max-w-xs">{insp.remarks || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 4: OFFICIAL BMRCL NOMINATION NOTICE BOARD MASTER ── */}
      {activeTab === 'OFFICIAL_MASTER' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
          {/* Header & Notice Metadata */}
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">Official BMRCL Crew Control Document</span>
                <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded text-[9px] font-bold">
                  Editable & Synced
                </span>
              </div>
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest mt-0.5">
                ALS NOMINATION OF LINE-2 TOs • CREW CONTROL - PYID W.E.F 23/6/2026
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Authoritative Master Roster • Signed by Naveen Kumar HN, Manager (Train Operation), 25/06/2026
              </p>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={boardSearch}
                  onChange={(e) => setBoardSearch(e.target.value)}
                  placeholder="Filter TO name or ID..."
                  className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 w-48 transition"
                />
                {boardSearch && (
                  <button 
                    onClick={() => setBoardSearch('')}
                    className="absolute right-2 top-2 text-slate-500 hover:text-slate-300 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  setAddOpTargetMentorId(mentorsList[0]?.id || '');
                  setAddOpForm({ empId: '', name: '' });
                  setAddOpCrewQuery('');
                  setShowAddOpModal(true);
                }}
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider flex items-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Plus size={13} /> Add Train Operator
              </button>

              <button
                type="button"
                onClick={handleExportNoticeBoardExcel}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                title="Export Notice Board to Excel"
              >
                <Download size={13} /> Export Excel
              </button>

              <button
                type="button"
                onClick={handleResetBaseline}
                className="bg-slate-950 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-800 hover:border-rose-800 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
                title="Reset back to official 23/06/2026 baseline document"
              >
                <RotateCcw size={12} /> Baseline
              </button>
            </div>
          </div>

          {/* Action Feedback Banner */}
          {boardActionFeedback && (
            <div className={`p-2.5 rounded-lg text-xs font-bold flex items-center justify-between animate-in fade-in ${
              boardActionFeedback.type === 'error' 
                ? 'bg-rose-950/60 border border-rose-500/50 text-rose-200' 
                : 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-200'
            }`}>
              <span>{boardActionFeedback.message}</span>
              <button 
                onClick={() => setBoardActionFeedback(null)}
                className="text-slate-400 hover:text-white text-xs ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* 3 Columns Grid for ALS Mentors */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {mentorsList.map((mentor, mIdx) => {
              const theme = [
                {
                  border: 'border-cyan-800/80',
                  headerBg: 'bg-cyan-950/40',
                  headerBorder: 'border-cyan-900/40',
                  title: 'text-cyan-300',
                  badge: 'bg-cyan-950 text-cyan-400 border-cyan-800',
                  btnAdd: 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/40',
                  rowHighlight: 'hover:border-cyan-700/60'
                },
                {
                  border: 'border-indigo-800/80',
                  headerBg: 'bg-indigo-950/40',
                  headerBorder: 'border-indigo-900/40',
                  title: 'text-indigo-300',
                  badge: 'bg-indigo-950 text-indigo-400 border-indigo-800',
                  btnAdd: 'bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border-indigo-500/40',
                  rowHighlight: 'hover:border-indigo-700/60'
                },
                {
                  border: 'border-purple-800/80',
                  headerBg: 'bg-purple-950/40',
                  headerBorder: 'border-purple-900/40',
                  title: 'text-purple-300',
                  badge: 'bg-purple-950 text-purple-400 border-purple-800',
                  btnAdd: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border-purple-500/40',
                  rowHighlight: 'hover:border-purple-700/60'
                }
              ][mIdx % 3];

              const allOps = mentor.assignedOperators || [];
              const q = boardSearch.toLowerCase().trim();
              const visibleOps = q 
                ? allOps.filter(o => 
                    String(o.empId).toLowerCase().includes(q) || 
                    String(o.name).toLowerCase().includes(q)
                  )
                : allOps;

              return (
                <div key={mentor.id || mentor.name} className={`bg-slate-950 border ${theme.border} rounded-xl p-4 space-y-3 flex flex-col justify-between`}>
                  {/* Column Header */}
                  <div>
                    <div className={`flex justify-between items-start border-b ${theme.headerBorder} pb-2.5`}>
                      <div>
                        <strong className={`${theme.title} font-black text-xs block uppercase tracking-wide`}>
                          ALS {mentor.name}
                        </strong>
                        <span className="text-[9px] text-slate-400 font-bold block mt-0.5">
                          Emp ID: #{mentor.id} • {mentor.designation || 'Official ALS'}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          WO: {mentor.fixedWo || 'Sunday'} • Desk: {mentor.desk || 'PYID ALS Desk'}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`${theme.badge} border px-2 py-0.5 rounded text-[9px] font-black`}>
                          {allOps.length} TOs
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAddOpTargetMentorId(mentor.id);
                            setAddOpForm({ empId: '', name: '' });
                            setAddOpCrewQuery('');
                            setShowAddOpModal(true);
                          }}
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${theme.btnAdd} transition flex items-center gap-1 cursor-pointer`}
                        >
                          <Plus size={10} /> Add TO
                        </button>
                      </div>
                    </div>

                    {/* Operator List */}
                    <div className="max-h-[520px] overflow-y-auto space-y-1.5 pr-1 mt-3">
                      {visibleOps.length === 0 ? (
                        <div className="text-center py-6 text-slate-600 text-xs">
                          {boardSearch ? 'No matching TO found.' : 'No operators assigned yet.'}
                        </div>
                      ) : (
                        visibleOps.map((op, idx) => {
                          const isEditingThis = editingOp?.mentorId === mentor.id && String(editingOp?.originalEmpId) === String(op.empId);

                          if (isEditingThis) {
                            return (
                              <div key={op.empId} className="bg-slate-900 border border-amber-500/50 p-2 rounded-lg space-y-1.5">
                                <div className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Edit Operator</div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input
                                    type="text"
                                    value={editingOp.name}
                                    onChange={(e) => setEditingOp(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Name"
                                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                                  />
                                  <input
                                    type="text"
                                    value={editingOp.empId}
                                    onChange={(e) => setEditingOp(prev => ({ ...prev, empId: e.target.value }))}
                                    placeholder="Emp ID"
                                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                                  />
                                </div>
                                <div className="flex justify-end gap-1.5 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setEditingOp(null)}
                                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] font-bold uppercase cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveInlineEdit}
                                    className="px-2.5 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                                  >
                                    <Check size={11} /> Save
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div 
                              key={op.empId} 
                              className={`group bg-slate-900/70 border border-slate-800/80 ${theme.rowHighlight} p-2 rounded-lg flex justify-between items-center text-[10px] transition`}
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <span className="text-slate-500 font-mono w-5 shrink-0">{idx + 1}.</span>
                                <strong className="text-slate-200 truncate">{op.name}</strong>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-slate-400 font-mono font-bold bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[9px]">
                                  #{op.empId}
                                </span>
                                
                                {/* Edit & Transfer & Delete Action Icons (Visible on group hover or always accessible) */}
                                <div className="opacity-70 group-hover:opacity-100 flex items-center gap-1 transition">
                                  <button
                                    type="button"
                                    onClick={() => setEditingOp({ mentorId: mentor.id, originalEmpId: op.empId, empId: op.empId, name: op.name })}
                                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-amber-300 rounded transition cursor-pointer"
                                    title="Edit Operator Name/ID"
                                  >
                                    <Edit3 size={11} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setTransferTarget({ operator: op, fromMentorId: mentor.id })}
                                    className="p-1 hover:bg-slate-800 text-slate-400 hover:text-cyan-300 rounded transition cursor-pointer"
                                    title="Transfer TO to another ALS"
                                  >
                                    <ArrowRightLeft size={11} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteOperator(mentor.id, op.empId, op.name)}
                                    className="p-1 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded transition cursor-pointer"
                                    title="Remove TO from this ALS"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Column Footer */}
                  <div className="pt-2 border-t border-slate-900 text-[9px] text-slate-500 flex justify-between items-center">
                    <span>Base: {mentor.defaultBaseStation || 'PYID'}</span>
                    <span>Shift: {mentor.defaultShift || '09:00 - 17:30'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 5. LOG CAB INSPECTION FILE MODAL ── */}
      {showLogModal && selectedOpToInspect && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <ShieldCheck className="text-cyan-400 h-5 w-5" /> Official BMRCL Cab Inspection Report
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Line 2 Mainline Evaluation Checklist • Peenya Industry Depot
                </p>
              </div>
              <button 
                onClick={() => setShowLogModal(false)}
                className="text-slate-500 hover:text-slate-300 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Operator Card */}
            <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl grid grid-cols-2 gap-3 text-[10px]">
              <div>
                <span className="text-slate-500 block uppercase">Train Operator</span>
                <strong className="text-slate-100 text-xs font-black">{selectedOpToInspect.operatorName || selectedOpToInspect.name}</strong>
                <span className="text-slate-500 block">ID: #{selectedOpToInspect.operatorId || selectedOpToInspect.empId}</span>
              </div>
              <div>
                <span className="text-slate-500 block uppercase">Mainline Train & Duty</span>
                <strong className="text-cyan-400 text-xs font-black">Train {selectedOpToInspect.trainId || '214'}</strong>
                <span className="text-slate-500 block">Duty: {selectedOpToInspect.dutyId || 'N/A'}</span>
              </div>
            </div>

            <form onSubmit={handleInspectionSubmit} className="space-y-4">
              {/* 5 Official Criteria */}
              <div className="space-y-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Evaluation Criteria (0–2 Points Each)
                </span>

                {[
                  { id: 'criteria1', label: '1. Signal Observation & Aspect Call-Out Discipline' },
                  { id: 'criteria2', label: '2. ATP / Speed Restrictions & Curve Adherence' },
                  { id: 'criteria3', label: '3. Platform Berthing & Dwell Stopping Accuracy' },
                  { id: 'criteria4', label: '4. Emergency Preparedness & Radio Discipline' },
                  { id: 'criteria5', label: '5. Cab Cleanliness, Logbook Entry & Alertness' }
                ].map(crit => (
                  <div key={crit.id} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 flex justify-between items-center text-[10px]">
                    <span className="text-slate-200 font-bold">{crit.label}</span>
                    <select
                      value={inspectionForm[crit.id]}
                      onChange={e => handleScoreChange(crit.id, e.target.value)}
                      className="bg-slate-900 border border-slate-750 text-cyan-400 font-black px-2 py-1 rounded outline-none cursor-pointer"
                    >
                      <option value="2">2 - Excellent (Pass)</option>
                      <option value="1">1 - Satisfactory (Minor)</option>
                      <option value="0">0 - Non-Compliant</option>
                    </select>
                  </div>
                ))}
              </div>

              {/* Overall Score & Result Decision */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Overall Score (Out of 10)</span>
                  <strong className="text-xl font-black text-cyan-400">{inspectionForm.overallScore} / 10</strong>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase block">Evaluation Decision</span>
                  <span className={`px-2.5 py-1 rounded text-[10px] font-black uppercase ${
                    inspectionForm.inspectionResult === 'PASS' ? 'bg-emerald-955 text-emerald-400 border border-emerald-800' :
                    inspectionForm.inspectionResult === 'SATISFACTORY' ? 'bg-amber-955 text-amber-400 border border-amber-800' :
                    'bg-rose-955 text-rose-400 border border-rose-800'
                  }`}>
                    {inspectionForm.inspectionResult}
                  </span>
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1">
                <label className="text-[9px] text-slate-400 font-bold uppercase block">ALS Officer Observations & Remarks</label>
                <textarea
                  rows="2"
                  value={inspectionForm.remarks}
                  onChange={e => setInspectionForm(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="e.g. Crisp signal call-out; smooth train handling into Kempegowda station platform."
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 outline-none focus:border-cyan-500 text-slate-200"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 px-4 py-2 rounded font-bold uppercase text-[10px] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-5 py-2 rounded font-bold uppercase text-[10px] transition flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Save size={13} /> Save Cab Inspection Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 6. ADD TRAIN OPERATOR TO NOTICE BOARD MODAL ── */}
      {showAddOpModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <Plus className="text-cyan-400 h-4 w-4" /> Add Train Operator to Notice Board
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Nominate a Train Operator to an Official ALS Mentor
                </p>
              </div>
              <button 
                onClick={() => setShowAddOpModal(false)}
                className="text-slate-500 hover:text-slate-300 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewOperator} className="space-y-4">
              {/* Target ALS Mentor */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Assign To ALS Mentor
                </label>
                <select
                  value={addOpTargetMentorId}
                  onChange={(e) => setAddOpTargetMentorId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-bold"
                >
                  {mentorsList.map(m => (
                    <option key={m.id} value={m.id}>
                      ALS {m.name} (#{m.id}) • {m.assignedOperators?.length || 0} TOs
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Autocomplete Search from BMRCL Crew Master */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Quick Search BMRCL Crew Registry
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                  <input
                    type="text"
                    value={addOpCrewQuery}
                    onChange={(e) => setAddOpCrewQuery(e.target.value)}
                    placeholder="Type name or Emp ID (e.g. 21414, Harsha)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {crewMatches.length > 0 && (
                  <div className="mt-1 bg-slate-950 border border-slate-800 rounded-lg max-h-36 overflow-y-auto divide-y divide-slate-900 shadow-xl">
                    {crewMatches.map(c => (
                      <div
                        key={c.id || c.employeeId}
                        onClick={() => {
                          setAddOpForm({
                            empId: String(c.id || c.employeeId),
                            name: c.name || c.employeeName
                          });
                          setAddOpCrewQuery('');
                        }}
                        className="p-2 hover:bg-cyan-950/40 text-xs flex justify-between items-center cursor-pointer transition"
                      >
                        <span className="font-bold text-slate-200">{c.name || c.employeeName}</span>
                        <span className="font-mono text-cyan-400 text-[10px]">#{c.id || c.employeeId}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Direct Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Employee ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={addOpForm.empId}
                    onChange={(e) => setAddOpForm(prev => ({ ...prev, empId: e.target.value }))}
                    placeholder="e.g. 21414"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Operator Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={addOpForm.name}
                    onChange={(e) => setAddOpForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Harsha N"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddOpModal(false)}
                  className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 px-4 py-2 rounded-lg font-bold uppercase text-[10px] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-4 py-2 rounded-lg font-bold uppercase text-[10px] transition flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Plus size={13} /> Add to Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 7. TRANSFER TRAIN OPERATOR MODAL ── */}
      {transferTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-xl shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest flex items-center gap-2">
                  <ArrowRightLeft className="text-cyan-400 h-4 w-4" /> Transfer Train Operator
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Reassign TO nomination to another Official ALS Mentor
                </p>
              </div>
              <button 
                onClick={() => setTransferTarget(null)}
                className="text-slate-500 hover:text-slate-300 font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs space-y-1">
              <div className="text-slate-400 text-[10px] uppercase font-bold">Selected Train Operator</div>
              <div className="text-slate-200 font-black text-sm flex items-center justify-between">
                <span>{transferTarget.operator.name}</span>
                <span className="font-mono text-cyan-400 text-xs">#{transferTarget.operator.empId}</span>
              </div>
              <div className="text-[10px] text-slate-500 pt-1">
                Currently Assigned to: <strong className="text-slate-300">ALS {mentorsList.find(m => String(m.id) === String(transferTarget.fromMentorId))?.name || 'Current ALS'}</strong>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Select Destination ALS Mentor:
              </label>
              <div className="space-y-1.5">
                {mentorsList
                  .filter(m => String(m.id) !== String(transferTarget.fromMentorId))
                  .map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleTransferOperator(transferTarget.fromMentorId, m.id, transferTarget.operator)}
                      className="w-full bg-slate-950 hover:bg-cyan-950/40 border border-slate-800 hover:border-cyan-700/60 p-3 rounded-lg flex items-center justify-between text-left transition cursor-pointer"
                    >
                      <div>
                        <strong className="text-xs text-slate-200 block">ALS {m.name}</strong>
                        <span className="text-[9px] text-slate-500">#{m.id} • WO: {m.fixedWo || 'Sunday'}</span>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-1 rounded bg-slate-900 text-cyan-300 border border-slate-700 flex items-center gap-1">
                        Move Here <ArrowRight size={10} />
                      </span>
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setTransferTarget(null)}
                className="bg-slate-950 border border-slate-800 hover:bg-slate-800 text-slate-400 px-4 py-2 rounded-lg font-bold uppercase text-[10px] transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

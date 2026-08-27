import React, { useState } from 'react';
import { 
  UserX, RefreshCw, Search, Filter, AlertTriangle, 
  CheckCircle2, X, ShieldAlert, Clock, ArrowRight, UserMinus,
  FileText, Calendar, Sparkles, Plus, Edit, Save, Phone, Droplet, Users,
  CheckSquare, Square, Database, Check, Trash2
} from 'lucide-react';
import { normalizeCanonicalEmpId, purgeDuplicateFirestoreCrewDocuments } from '../../utils/crewRegistryDataMerger';

export default function RelievedCrewManagerModal({
  isOpen,
  onClose,
  crewList,
  onUpdateCrewStatus,
  onBatchUpdateCrewStatus,
  onOpenActiveCrewModal
}) {
  const [viewMode, setViewMode] = useState('INACTIVE'); // 'INACTIVE', 'ACTIVE', 'ALL'
  const [searchQuery, setSearchQuery] = useState('');
  const [reasonFilter, setReasonFilter] = useState('ALL'); // 'ALL', 'SC', 'LINE1', 'OCC', 'MEDICAL', 'PROMOTED', 'MAINLINE', 'PINK', 'CC', 'MATERNITY'
  const [isPurging, setIsPurging] = useState(false);
  const [purgeStatusMsg, setPurgeStatusMsg] = useState('');
  
  // Multi-Selection State
  const [selectedEmpIds, setSelectedEmpIds] = useState(new Set());

  // Edit Directory Profile Modal State
  const [editProfileTO, setEditProfileTO] = useState(null);
  const [editDesignation, setEditDesignation] = useState('Station Controller');
  const [editDepot, setEditDepot] = useState('PYID');
  const [editPhone, setEditPhone] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState('');
  const [editCompetencyDate, setEditCompetencyDate] = useState('');
  const [editMedicalDate, setEditMedicalDate] = useState('');
  const [editRelieveReason, setEditRelieveReason] = useState('');
  const [editRelieveNotes, setEditRelieveNotes] = useState('');

  // Quick Relieve Single TO Modal State
  const [quickRelieveTO, setQuickRelieveTO] = useState(null);
  const [quickRelieveReason, setQuickRelieveReason] = useState('Working as Station Controller / Transferred from PYID CC');
  const [quickRelieveNotes, setQuickRelieveNotes] = useState('');

  // Strict single-count deduplication: every employee is indexed once by canonical integer ID
  const allUniqueCrew = React.useMemo(() => {
    const map = new Map();
    (crewList || []).forEach(emp => {
      if (emp) {
        const canonicalId = normalizeCanonicalEmpId(emp.empId || emp.employeeId || emp.id);
        if (canonicalId && !map.has(canonicalId)) {
          map.set(canonicalId, { 
            ...emp, 
            empId: canonicalId 
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.empId - b.empId);
  }, [crewList]);

  const totalDatabaseCount = allUniqueCrew.length;

  const activeCrewList = React.useMemo(() => {
    return allUniqueCrew.filter(emp => (emp.status === 'ACTIVE' || emp.status === 'MATERNITY_LEAVE' || (emp.maternityLeave && emp.maternityLeave.active)) && !emp.isRelieved && emp.activeCrew !== false);
  }, [allUniqueCrew]);

  const activeCrewCount = activeCrewList.length;

  const inactiveCrewList = React.useMemo(() => {
    return allUniqueCrew.filter(emp => emp.status === 'RELIEVED' || emp.isRelieved || emp.activeCrew === false || emp.status === 'INACTIVE');
  }, [allUniqueCrew]);

  const inactiveCrewCount = inactiveCrewList.length;

  const scCount = React.useMemo(() => {
    return inactiveCrewList.filter(e => String(e.relievedReason || '').toLowerCase().includes('station controller')).length;
  }, [inactiveCrewList]);

  const line1Count = React.useMemo(() => {
    return inactiveCrewList.filter(e => String(e.relievedReason || '').toLowerCase().includes('line 1') || String(e.relievedReason || '').toLowerCase().includes('baiyappanahalli')).length;
  }, [inactiveCrewList]);

  const medicalCount = React.useMemo(() => {
    return inactiveCrewList.filter(e => String(e.relievedReason || '').toLowerCase().includes('medical')).length;
  }, [inactiveCrewList]);

  const otherCount = Math.max(0, inactiveCrewCount - scCount - line1Count - medicalCount);

  // Active sub-counts
  const pinkCount = React.useMemo(() => {
    return activeCrewList.filter(e => e.specialProfile === 'PINK' || e.pinkDutyEligible).length;
  }, [activeCrewList]);

  const ccCount = React.useMemo(() => {
    return activeCrewList.filter(e => e.isOfficialCC || e.ccWilling || e.specialProfile === 'CC_WILLING').length;
  }, [activeCrewList]);

  // Target population based on viewMode
  const targetPopulation = React.useMemo(() => {
    if (viewMode === 'ACTIVE') return activeCrewList;
    if (viewMode === 'ALL') return allUniqueCrew;
    return inactiveCrewList; // default 'INACTIVE'
  }, [viewMode, activeCrewList, allUniqueCrew, inactiveCrewList]);

  const filteredCrew = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return targetPopulation.filter(emp => {
      const name = String(emp.name || '').toLowerCase();
      const empIdStr = String(emp.empId || emp.employeeId || emp.id || '');
      const reason = String(emp.relievedReason || '').toLowerCase();
      const designation = String(emp.designation || '').toLowerCase();

      const matchesSearch = !q || name.includes(q) || empIdStr.includes(q) || reason.includes(q) || designation.includes(q);
      
      let matchesReason = true;
      if (reasonFilter === 'SC') matchesReason = reason.includes('station controller');
      else if (reasonFilter === 'LINE1') matchesReason = reason.includes('line 1') || reason.includes('baiyappanahalli');
      else if (reasonFilter === 'MEDICAL') matchesReason = reason.includes('medical');
      else if (reasonFilter === 'OTHER') matchesReason = !reason.includes('station controller') && !reason.includes('line 1') && !reason.includes('baiyappanahalli') && !reason.includes('medical');
      else if (reasonFilter === 'ACTIVE_ONLY') matchesReason = (emp.status === 'ACTIVE' || emp.status === 'MATERNITY_LEAVE') && !emp.isRelieved;
      else if (reasonFilter === 'PINK') matchesReason = emp.specialProfile === 'PINK' || emp.pinkDutyEligible;
      else if (reasonFilter === 'CC') matchesReason = emp.isOfficialCC || emp.ccWilling || emp.specialProfile === 'CC_WILLING';
      else if (reasonFilter === 'MATERNITY') matchesReason = emp.status === 'MATERNITY_LEAVE' || (emp.maternityLeave && emp.maternityLeave.active);

      return matchesSearch && matchesReason;
    });
  }, [targetPopulation, searchQuery, reasonFilter]);

  const handleReinstateSingle = (empId) => {
    const key = String(empId).trim();
    onUpdateCrewStatus(empId, {
      status: 'ACTIVE',
      activeCrew: true,
      isRelieved: false,
      relievedReason: null,
      relievedNotes: null,
      relievedDate: null,
      relievedBy: null
    });
    // Remove from local selection if selected
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      next.delete(key);
      next.delete(parseInt(key, 10));
      return next;
    });
  };

  const handleOpenRelieveModal = (emp) => {
    setQuickRelieveTO(emp);
    setQuickRelieveReason('Working as Station Controller / Transferred from PYID CC');
    setQuickRelieveNotes('');
  };

  const handleConfirmQuickRelieve = (e) => {
    e.preventDefault();
    if (!quickRelieveTO) return;

    onUpdateCrewStatus(quickRelieveTO.empId, {
      status: 'RELIEVED',
      activeCrew: false,
      isRelieved: true,
      relievedReason: quickRelieveReason,
      relievedNotes: quickRelieveNotes,
      relievedDate: new Date().toISOString().split('T')[0],
      relievedBy: 'Crew Controller (Console)'
    });

    setQuickRelieveTO(null);
  };

  const handleToggleSelect = (empId) => {
    const key = String(empId).trim();
    setSelectedEmpIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAllVisible = () => {
    const allVisibleIds = filteredCrew.map(e => String(e.empId).trim());
    setSelectedEmpIds(prev => {
      const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => prev.has(id));
      if (allSelected) {
        return new Set();
      } else {
        return new Set([...prev, ...allVisibleIds]);
      }
    });
  };

  const handleSelectAllInMode = () => {
    const allIds = targetPopulation.map(e => String(e.empId).trim());
    setSelectedEmpIds(new Set(allIds));
  };

  const handleDeselectAll = () => {
    setSelectedEmpIds(new Set());
  };

  const handleBulkReinstate = () => {
    if (selectedEmpIds.size === 0) return;
    const uniqueIds = Array.from(selectedEmpIds);
    const updatesList = uniqueIds.map(empId => ({
      empId: parseInt(empId, 10) || empId,
      status: 'ACTIVE',
      activeCrew: true,
      isRelieved: false,
      relievedReason: null,
      relievedNotes: null,
      relievedDate: null,
      relievedBy: null
    }));

    if (onBatchUpdateCrewStatus) {
      onBatchUpdateCrewStatus(updatesList);
    } else {
      updatesList.forEach(u => onUpdateCrewStatus(u.empId, u));
    }
    setSelectedEmpIds(new Set());
  };

  const handlePurgeDuplicates = async () => {
    if (!window.confirm("Clean & Purge Database Duplicates?\n\nThis will scan the Firestore crewRegistry collection, merge duplicate documents for each employee ID into exactly 1 canonical document (crew_${empId}), and permanently delete orphan/duplicate records.\n\nProceed?")) {
      return;
    }
    try {
      setIsPurging(true);
      setPurgeStatusMsg('Scanning and purging duplicate documents from Firestore...');
      const res = await purgeDuplicateFirestoreCrewDocuments();
      setPurgeStatusMsg(`✅ Purged ${res.totalDuplicatesDeleted} duplicate documents! Clean unique database total: ${res.canonicalUniqueCount}.`);
      setTimeout(() => setPurgeStatusMsg(''), 7000);
    } catch (err) {
      console.error("Purge error:", err);
      setPurgeStatusMsg(`❌ Purge error: ${err.message}`);
    } finally {
      setIsPurging(false);
    }
  };

  const handleBulkRelieve = () => {
    if (selectedEmpIds.size === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const uniqueIds = Array.from(selectedEmpIds);
    const updatesList = uniqueIds.map(empId => ({
      empId: parseInt(empId, 10) || empId,
      status: 'RELIEVED',
      activeCrew: false,
      isRelieved: true,
      relievedReason: 'Working as Station Controller / Transferred from PYID CC',
      relievedNotes: 'Bulk Relieved from Console',
      relievedDate: todayStr,
      relievedBy: 'Crew Controller'
    }));

    if (onBatchUpdateCrewStatus) {
      onBatchUpdateCrewStatus(updatesList);
    } else {
      updatesList.forEach(u => onUpdateCrewStatus(u.empId, u));
    }
    setSelectedEmpIds(new Set());
  };

  const handleOpenEditProfile = (emp) => {
    setEditProfileTO(emp);
    setEditDesignation(emp.designation || (emp.isRelieved ? 'Station Controller' : 'Train Operator'));
    setEditDepot(emp.depot || emp.boardingStation || 'PYID');
    setEditPhone(emp.phone || emp.mobileNumber || '');
    setEditBloodGroup(emp.bloodGroup || '');
    setEditCompetencyDate(emp.competencyValidTill || '2027-12-31');
    setEditMedicalDate(emp.medicalValidTill || '2027-12-31');
    setEditRelieveReason(emp.relievedReason || (emp.isRelieved ? 'Working as Station Controller / Transferred from PYID CC' : 'Active Mainline Operations'));
    setEditRelieveNotes(emp.relievedNotes || '');
  };

  const handleSaveEditProfile = (e) => {
    e.preventDefault();
    if (!editProfileTO) return;

    onUpdateCrewStatus(editProfileTO.empId, {
      designation: editDesignation,
      depot: editDepot,
      boardingStation: editDepot,
      phone: editPhone,
      mobileNumber: editPhone,
      bloodGroup: editBloodGroup,
      competencyValidTill: editCompetencyDate,
      medicalValidTill: editMedicalDate,
      relievedReason: editRelieveReason,
      relievedNotes: editRelieveNotes,
      updatedAt: new Date().toISOString()
    });

    setEditProfileTO(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md animate-fadeIn font-sans">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-7xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl border transition-colors ${
              viewMode === 'ACTIVE' 
                ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30' 
                : viewMode === 'ALL'
                  ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/30'
                  : 'bg-rose-600/20 text-rose-400 border-rose-500/30'
            }`}>
              {viewMode === 'ACTIVE' ? <CheckSquare className="w-5 h-5" /> : viewMode === 'ALL' ? <Database className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  Relieved TO &amp; Station Controllers Console
                </h2>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                  viewMode === 'ACTIVE' 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                    : viewMode === 'ALL'
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  {viewMode === 'ACTIVE' ? 'Active View' : viewMode === 'ALL' ? 'Total Database View' : 'Inactive / Relieved View'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Manage all Station Controllers, transferred, and active personnel. Click any category card to filter views.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePurgeDuplicates}
              disabled={isPurging}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900/80 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              title="Delete all duplicate documents in Firestore and keep 1 record per employee ID"
            >
              <Trash2 className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin' : ''}`} />
              {isPurging ? 'Purging Duplicates...' : 'Purge DB Duplicates'}
            </button>

            {onOpenActiveCrewModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenActiveCrewModal();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Users className="w-4 h-4" />
                Go to Active Crew Desk
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Purge Status Message Banner */}
        {purgeStatusMsg && (
          <div className="px-6 py-2 bg-indigo-950/80 border-b border-indigo-500/40 text-xs font-mono text-indigo-300 flex items-center justify-between animate-fadeIn">
            <span>{purgeStatusMsg}</span>
            <button onClick={() => setPurgeStatusMsg('')} className="text-slate-400 hover:text-white text-xs">&times;</button>
          </div>
        )}

        {/* Primary View Selector & Strength Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-950/70 border-b border-slate-800/90 text-xs">
          {/* Card 1: Total Database */}
          <button
            type="button"
            onClick={() => {
              setViewMode('ALL');
              setReasonFilter('ALL');
              setSelectedEmpIds(new Set());
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              viewMode === 'ALL'
                ? 'bg-slate-850 border-indigo-500 shadow-xl ring-2 ring-indigo-500/30'
                : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-850/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-4 h-4 text-indigo-400" />
                Total Database
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-md font-bold">
                ALL
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-white font-mono">{totalDatabaseCount}</span>
              <span className="text-xs text-slate-400 font-sans">Total Crew</span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-1">Entire registry (active + inactive)</span>
          </button>

          {/* Card 2: Active Crew */}
          <button
            type="button"
            onClick={() => {
              setViewMode('ACTIVE');
              setReasonFilter('ALL');
              setSelectedEmpIds(new Set());
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              viewMode === 'ACTIVE'
                ? 'bg-emerald-950/40 border-emerald-500 shadow-xl ring-2 ring-emerald-500/30'
                : 'bg-slate-900/80 border-slate-800 hover:border-emerald-500/40 hover:bg-slate-850/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4 text-emerald-400" />
                ☑ Active Crew
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-md font-bold">
                OPERATIONAL
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400 font-mono">{activeCrewCount}</span>
              <span className="text-xs text-emerald-500/80 font-sans">Active TOs</span>
            </div>
            <span className="text-[10px] text-emerald-500/70 block mt-1">Available for PYID CC mainline roster</span>
          </button>

          {/* Card 3: Inactive Crew */}
          <button
            type="button"
            onClick={() => {
              setViewMode('INACTIVE');
              setReasonFilter('ALL');
              setSelectedEmpIds(new Set());
            }}
            className={`p-3.5 rounded-2xl border text-left transition-all ${
              viewMode === 'INACTIVE'
                ? 'bg-rose-950/40 border-rose-500 shadow-xl ring-2 ring-rose-500/30'
                : 'bg-slate-900/80 border-slate-800 hover:border-rose-500/40 hover:bg-slate-850/50'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <Square className="w-4 h-4 text-rose-400" />
                ☐ Inactive
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded-md font-bold">
                RELIEVED / SC
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-rose-400 font-mono">{inactiveCrewCount}</span>
              <span className="text-xs text-rose-400/80 font-sans">Relieved TOs</span>
            </div>
            <span className="text-[10px] text-rose-500/70 block mt-1">Station Controllers &amp; Transferred crew</span>
          </button>
        </div>

        {/* Search & Dynamic Sub-Filters Bar */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, Emp ID, or Order notes..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Dynamic Filter Tabs based on View Mode */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {viewMode === 'INACTIVE' && (
              <>
                {[
                  { id: 'ALL', label: `All Inactive (${inactiveCrewCount})` },
                  { id: 'SC', label: `Station Controllers (${scCount})` },
                  { id: 'LINE1', label: `Line 1 / BYPL (${line1Count})` },
                  { id: 'MEDICAL', label: `Medical Board (${medicalCount})` },
                  { id: 'OTHER', label: `Other Transfers (${otherCount})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setReasonFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      reasonFilter === tab.id 
                        ? 'bg-rose-600 text-white shadow-md' 
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </>
            )}

            {viewMode === 'ACTIVE' && (
              <>
                {[
                  { id: 'ALL', label: `All Active (${activeCrewCount})` },
                  { id: 'PINK', label: `Pink Duty (${pinkCount})` },
                  { id: 'CC', label: `CC & Willing (${ccCount})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setReasonFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      reasonFilter === tab.id 
                        ? 'bg-emerald-600 text-white shadow-md' 
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </>
            )}

            {viewMode === 'ALL' && (
              <>
                {[
                  { id: 'ALL', label: `All Database (${totalDatabaseCount})` },
                  { id: 'ACTIVE_ONLY', label: `Active (${activeCrewCount})` },
                  { id: 'SC', label: `Station Controllers (${scCount})` },
                  { id: 'LINE1', label: `Line 1 (${line1Count})` },
                  { id: 'MEDICAL', label: `Medical (${medicalCount})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setReasonFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      reasonFilter === tab.id 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Quick Selection Strip         {/* Quick Selection Strip & SL NO Verifier */}
        <div className="px-6 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              Quick Select:
            </span>
            
            <button
              onClick={handleSelectAllInMode}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
              title={`Select all in ${viewMode} view`}
            >
              Select All in View ({targetPopulation.length})
            </button>

            <button
              onClick={handleSelectAllVisible}
              className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-bold transition-all shadow-sm"
              title="Select all visible filtered operators"
            >
              Select Visible Filtered ({filteredCrew.length})
            </button>

            <span className="text-[11px] font-mono text-indigo-400/90 font-semibold flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 ml-2">
              <span>Verified SL NO:</span>
              <strong className="text-indigo-300">#01 – #{String(filteredCrew.length).padStart(2, '0')}</strong>
              <span className="text-slate-500">(Total {targetPopulation.length} in View)</span>
            </span>
          </div>

          {selectedEmpIds.size > 0 && (
            <button
              onClick={handleDeselectAll}
              className="text-xs text-slate-400 hover:text-white underline font-semibold transition-colors"
            >
              Clear Selection ({selectedEmpIds.size})
            </button>
          )}
        </div>

        {/* Multi-Selection Bulk Action Toolbar */}
        {selectedEmpIds.size > 0 && (
          <div className="px-6 py-2.5 bg-indigo-950/90 border-b border-indigo-500/40 flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 bg-indigo-500 text-white rounded-full font-mono font-bold">
                {selectedEmpIds.size} Selected Personnel
              </span>
              <span className="text-slate-200 text-xs">
                Apply bulk status change to selected operators:
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkReinstate}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reinstate Selected to Active
              </button>

              <button
                onClick={handleBulkRelieve}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                <UserX className="w-3.5 h-3.5" />
                Relieve / Transfer Selected
              </button>

              <button
                onClick={handleDeselectAll}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Deselect
              </button>
            </div>
          </div>
        )}

        {/* Crew Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filteredCrew.length > 0 && filteredCrew.every(e => selectedEmpIds.has(String(e.empId)))}
                    onChange={handleSelectAllVisible}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                    title="Select / Deselect All Visible"
                  />
                </th>
                <th className="px-3 py-3 w-16 text-center font-black text-indigo-300 font-mono bg-indigo-950/40 border-r border-slate-800">
                  SL NO
                </th>
                <th className="px-4 py-3">Emp ID</th>
                <th className="px-4 py-3">Personnel Name &amp; Contact</th>
                <th className="px-4 py-3">Roster Status</th>
                <th className="px-4 py-3">Current Assignment / Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredCrew.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    No personnel found matching the current criteria.
                  </td>
                </tr>
              ) : (
                filteredCrew.map((emp, idx) => {
                  const isSelected = selectedEmpIds.has(String(emp.empId));
                  const isEmpRelieved = emp.status === 'RELIEVED' || emp.isRelieved || emp.activeCrew === false;

                  return (
                    <tr key={emp.empId} className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-indigo-950/30' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(emp.empId)}
                          className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-3 text-center font-mono font-black text-indigo-400 bg-indigo-950/20 border-r border-slate-800/80 text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-white">
                        #{emp.empId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          {emp.name}
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                            {emp.gender}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                          {emp.phone && <span>📞 {emp.phone}</span>}
                          {emp.bloodGroup && <span>🩸 {emp.bloodGroup}</span>}
                          <span>Depot: {emp.boardingStation || emp.depot || 'PYID'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isEmpRelieved ? (
                          <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-[10px] font-bold inline-flex items-center gap-1">
                            <UserX className="w-3 h-3" />
                            RELIEVED / SC
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-bold inline-flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            ACTIVE CREW
                          </span>
                        )}
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {emp.designation || (isEmpRelieved ? 'Station Controller' : 'Train Operator')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-200">
                          {emp.relievedReason || (isEmpRelieved ? 'Working as Station Controller / Transferred' : 'Active Mainline Roster')}
                        </div>
                        {emp.relievedDate && isEmpRelieved && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            📅 Relieved Date: {emp.relievedDate}
                          </div>
                        )}
                        {emp.relievedNotes && (
                          <div className="text-[10px] text-slate-400 italic mt-0.5">
                            "{emp.relievedNotes}"
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditProfile(emp)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1"
                            title="Edit Directory and Relieve records"
                          >
                            <Edit className="w-3 h-3 text-blue-400" />
                            Directory
                          </button>

                          {isEmpRelieved ? (
                            <button
                              onClick={() => handleReinstateSingle(emp.empId)}
                              className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
                              title="Reinstate operator immediately into active PYID CC roster"
                            >
                              <RefreshCw className="w-3 h-3" />
                              Reinstate
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenRelieveModal(emp)}
                              className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm"
                              title="Relieve or transfer operator"
                            >
                              <UserX className="w-3 h-3" />
                              Relieve / SC
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Directory Profile Modal */}
        {editProfileTO && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-blue-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Edit className="w-5 h-5 text-blue-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Profile &amp; Assignment Record: {editProfileTO.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Emp ID: #{editProfileTO.empId} • {editProfileTO.status || 'ACTIVE'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setEditProfileTO(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEditProfile} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Assignment / Transfer Reason
                  </label>
                  <select
                    value={editRelieveReason}
                    onChange={(e) => setEditRelieveReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Active Mainline Operations">Active Mainline Operations</option>
                    <option value="Working as Station Controller / Transferred from PYID CC">Working as Station Controller / Transferred from PYID CC</option>
                    <option value="Transferred to Line 1 / Baiyappanahalli">Transferred to Line 1 / Baiyappanahalli</option>
                    <option value="Transferred to OCC / GCC Desk">Transferred to OCC / GCC Desk</option>
                    <option value="Medical Board / Unfit for Driving">Medical Board / Unfit for Driving</option>
                    <option value="Promoted to Station Superintendent / Supervisor">Promoted to Station Superintendent / Supervisor</option>
                    <option value="Depot Relieve / Long Leave">Depot Relieve / Long Leave</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Order Notes / Remarks
                  </label>
                  <input
                    type="text"
                    value={editRelieveNotes}
                    onChange={(e) => setEditRelieveNotes(e.target.value)}
                    placeholder="e.g. Office Order BMRCL/OCC/2026"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Designation
                    </label>
                    <select
                      value={editDesignation}
                      onChange={(e) => setEditDesignation(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="Station Controller">Station Controller</option>
                      <option value="Train Operator">Train Operator</option>
                      <option value="Station Superintendent">Station Superintendent</option>
                      <option value="Crew Controller">Crew Controller</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditProfileTO(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Quick Relieve / Transfer Modal */}
        {quickRelieveTO && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <UserX className="w-5 h-5 text-rose-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Relieve Operator: {quickRelieveTO.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Emp ID: #{quickRelieveTO.empId}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setQuickRelieveTO(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmQuickRelieve} className="space-y-3 mt-4 text-xs">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Relieve / Transfer Reason
                  </label>
                  <select
                    value={quickRelieveReason}
                    onChange={(e) => setQuickRelieveReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Working as Station Controller / Transferred from PYID CC">Working as Station Controller / Transferred from PYID CC</option>
                    <option value="Transferred to Line 1 / Baiyappanahalli">Transferred to Line 1 / Baiyappanahalli</option>
                    <option value="Transferred to OCC / GCC Desk">Transferred to OCC / GCC Desk</option>
                    <option value="Medical Board / Unfit for Driving">Medical Board / Unfit for Driving</option>
                    <option value="Promoted to Station Superintendent / Supervisor">Promoted to Station Superintendent / Supervisor</option>
                    <option value="Depot Relieve / Long Leave">Depot Relieve / Long Leave</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Order Remarks
                  </label>
                  <input
                    type="text"
                    value={quickRelieveNotes}
                    onChange={(e) => setQuickRelieveNotes(e.target.value)}
                    placeholder="e.g. Relieved per Office Order"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setQuickRelieveTO(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    Confirm Relieve
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

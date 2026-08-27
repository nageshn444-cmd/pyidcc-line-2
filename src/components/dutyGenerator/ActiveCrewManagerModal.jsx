import React, { useState } from 'react';
import { 
  Users, UserMinus, UserCheck, Search, Filter, AlertTriangle, 
  CheckCircle2, X, ShieldAlert, Clock, ArrowRight, UserX, RefreshCw,
  HeartPulse, Calendar, Sparkles, Plus, Edit, Save, Phone, Droplet, FileText, Check, Briefcase
} from 'lucide-react';
import { normalizeCanonicalEmpId, OFFICIAL_PYID_ACTIVE_IDS } from '../../utils/crewRegistryDataMerger';
import { getCanonicalStaffName } from './CCWillingDeskModal';

export default function ActiveCrewManagerModal({
  isOpen,
  onClose,
  crewList,
  onUpdateCrewStatus,
  onBatchUpdateCrewStatus,
  onAddNewCrewMember,
  onOpenRelievedModal,
  onOpenJmdModal
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'BMRCL_TO', 'JMD_TD', 'MATERNITY', 'PINK', 'NORMAL'
  
  // Multi-Selection State
  const [selectedEmpIds, setSelectedEmpIds] = useState(new Set());
  const [isBulkRelieveModalOpen, setIsBulkRelieveModalOpen] = useState(false);
  const [bulkRelieveReason, setBulkRelieveReason] = useState('Working as Station Controller / Transferred from PYID CC');
  const [bulkRelieveNotes, setBulkRelieveNotes] = useState('');

  // Edit Directory Profile Modal State
  const [editProfileTO, setEditProfileTO] = useState(null);
  const [editDesignation, setEditDesignation] = useState('Train Operator');
  const [editDepot, setEditDepot] = useState('PYID');
  const [editPhone, setEditPhone] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState('');
  const [editCompetencyDate, setEditCompetencyDate] = useState('');
  const [editMedicalDate, setEditMedicalDate] = useState('');

  // Add New TO Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState('MALE');
  const [newFixedWo, setNewFixedWo] = useState('Sunday');
  const [newProfile, setNewProfile] = useState('NORMAL');
  const [newStation, setNewStation] = useState('PYID');
  const [newNotes, setNewNotes] = useState('Newly Reported to PYID CC');

  // Relieve Modal State
  const [relieveModalTO, setRelieveModalTO] = useState(null);
  const [relieveReason, setRelieveReason] = useState('Working as Station Controller / Transferred from PYID CC');
  const [relieveNotes, setRelieveNotes] = useState('');
  const [controllerName, setControllerName] = useState('Crew Controller (CC-1)');

  // Maternity Modal State
  const [maternityModalTO, setMaternityModalTO] = useState(null);
  const [mlStartDate, setMlStartDate] = useState('2026-08-01');
  const [mlExtensionType, setMlExtensionType] = useState('NONE'); // 'NONE', 'EL', 'HPL'
  const [mlExtensionReason, setMlExtensionReason] = useState('Doctor advice / Pediatric nursing extension');
  const [mlExtensionDays, setMlExtensionDays] = useState(30);

  // Strict isolation & Deduplication: Active Driving Candidate Crew ONLY (BMRCL Regular TOs + JMD Contract TDs)
  // Guaranteed exclusion of Station Controllers, supervisory non-driving staff, and relieved crew.
  const activeCrewOnly = React.useMemo(() => {
    const map = new Map();
    (crewList || []).forEach(e => {
      if (!e) return;
      const canonicalId = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
      if (!canonicalId) return;

      const isRelieved = e.isRelieved === true || e.status === 'RELIEVED' || e.status === 'INACTIVE' || e.activeCrew === false;
      if (isRelieved) return;

      // Exclude supervisory non-driving staff, official CCs, and station controllers
      if (e.isOfficialCC === true || e.role === 'OFFICIAL_CREW_CONTROLLER' || e.specialProfile === 'CC') return;
      if (e.role === 'Official ALS' || e.role === 'Official GCC' || e.role === 'STATION_CONTROLLER') return;
      if ([20726, 20038, 20037, 20018, 20019, 20057, 20087].includes(canonicalId)) return;

      // Active candidate driving crew (BMRCL Regular TOs + JMD Contract TDs + Maternity leave TOs)
      const isActive = e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active);
      const isOfficialActive = OFFICIAL_PYID_ACTIVE_IDS.has(canonicalId);
      const isJmd = String(canonicalId).startsWith('8');

      if ((isActive || isOfficialActive || isJmd) && !map.has(canonicalId)) {
        const canonicalName = getCanonicalStaffName(e);
        const isJmdEmp = String(canonicalId).startsWith('8');
        map.set(canonicalId, {
          ...e,
          empId: canonicalId,
          name: canonicalName,
          designation: isJmdEmp ? 'Train Driver (JMD Contract)' : (e.designation || 'Train Operator (BMRCL Regular)')
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.empId - b.empId);
  }, [crewList]);

  const activeCrewCount = activeCrewOnly.length;

  const jmdCrewCount = React.useMemo(() => {
    return activeCrewOnly.filter(e => String(e.empId || '').startsWith('8')).length;
  }, [activeCrewOnly]);

  const bmrclCrewCount = Math.max(0, activeCrewCount - jmdCrewCount);
  
  const relievedCrewCount = React.useMemo(() => {
    const map = new Map();
    (crewList || []).forEach(e => {
      if (e && (e.status === 'RELIEVED' || e.isRelieved || e.status === 'INACTIVE' || e.activeCrew === false)) {
        const canonicalId = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
        if (canonicalId && !map.has(canonicalId)) {
          map.set(canonicalId, true);
        }
      }
    });
    return map.size;
  }, [crewList]);

  const totalDatabaseCount = React.useMemo(() => {
    const map = new Map();
    (crewList || []).forEach(e => {
      if (e) {
        const canonicalId = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
        if (canonicalId && !map.has(canonicalId)) {
          map.set(canonicalId, true);
        }
      }
    });
    return map.size;
  }, [crewList]);
  
  const maternityCount = React.useMemo(() => {
    return activeCrewOnly.filter(e => e.maternityLeave && e.maternityLeave.active && !e.maternityLeave.actualReportDate).length;
  }, [activeCrewOnly]);

  const pinkDutyCount = React.useMemo(() => {
    return activeCrewOnly.filter(e => e.specialProfile === 'PINK' || e.pinkDutyEligible).length;
  }, [activeCrewOnly]);

  const normalDutyCount = Math.max(0, activeCrewCount - maternityCount - pinkDutyCount);

  const filteredCrew = React.useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return activeCrewOnly.filter(emp => {
      const name = String(emp.name || '').toLowerCase();
      const empIdStr = String(emp.empId || emp.employeeId || emp.id || '');
      const matchesSearch = !q || name.includes(q) || empIdStr.includes(q);
      
      let matchesCategory = true;
      const isJmd = empIdStr.startsWith('8');

      if (activeFilter === 'BMRCL_TO') {
        matchesCategory = !isJmd;
      } else if (activeFilter === 'JMD_TD') {
        matchesCategory = isJmd;
      } else if (activeFilter === 'MATERNITY') {
        matchesCategory = emp.maternityLeave && emp.maternityLeave.active && !emp.maternityLeave.actualReportDate;
      } else if (activeFilter === 'PINK') {
        matchesCategory = (emp.specialProfile === 'PINK' || emp.pinkDutyEligible) && !(emp.maternityLeave && emp.maternityLeave.active && !emp.maternityLeave.actualReportDate);
      } else if (activeFilter === 'NORMAL') {
        matchesCategory = emp.specialProfile !== 'PINK' && !(emp.maternityLeave && emp.maternityLeave.active && !emp.maternityLeave.actualReportDate);
      }

      return matchesSearch && matchesCategory;
    });
  }, [activeCrewOnly, searchQuery, activeFilter]);

  const handleConfirmRelieve = (e) => {
    e.preventDefault();
    if (!relieveModalTO) return;

    onUpdateCrewStatus(relieveModalTO.empId, {
      status: 'RELIEVED',
      activeCrew: false,
      isRelieved: true,
      relievedReason: relieveReason,
      relievedNotes: relieveNotes,
      relievedDate: new Date().toISOString().split('T')[0],
      relievedBy: controllerName
    });

    setRelieveModalTO(null);
    setRelieveNotes('');
  };

  const handleSaveMaternity = (e) => {
    e.preventDefault();
    if (!maternityModalTO) return;

    const start = new Date(mlStartDate);
    const statutoryEnd = new Date(start.getTime() + 180 * 86400000);
    const expectedEndStr = statutoryEnd.toISOString().split('T')[0];

    onUpdateCrewStatus(maternityModalTO.empId, {
      status: 'MATERNITY_LEAVE',
      maternityLeave: {
        active: true,
        startDate: mlStartDate,
        statutoryEndDate: expectedEndStr,
        statutoryDays: 180,
        extensionType: mlExtensionType,
        extendedDays: mlExtensionType !== 'NONE' ? parseInt(mlExtensionDays, 10) : 0,
        expectedReportDate: expectedEndStr,
        actualReportDate: null,
        remarks: `Statutory Maternity Leave (180 Days per Karnataka Govt Norms)${mlExtensionType !== 'NONE' ? ` + Extended via ${mlExtensionType}` : ''}`
      }
    });

    setMaternityModalTO(null);
  };

  const handleReportBackFromML = (empId) => {
    const todayStr = new Date().toISOString().split('T')[0];
    onUpdateCrewStatus(empId, {
      status: 'ACTIVE',
      specialProfile: 'PINK',
      maternityLeave: {
        active: false,
        actualReportDate: todayStr,
        remarks: 'Reported back from Maternity Leave. Transitioned to Pink Duty profile.'
      }
    });
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
      updatedAt: new Date().toISOString()
    });

    setEditProfileTO(null);
  };

  const handleOpenEditProfile = (emp) => {
    setEditProfileTO(emp);
    setEditDesignation(emp.designation || 'Train Operator');
    setEditDepot(emp.depot || emp.boardingStation || 'PYID');
    setEditPhone(emp.phone || emp.mobileNumber || '');
    setEditBloodGroup(emp.bloodGroup || '');
    setEditCompetencyDate(emp.competencyValidTill || '2027-12-31');
    setEditMedicalDate(emp.medicalValidTill || '2027-12-31');
  };

  const handleAddNewTO = (e) => {
    e.preventDefault();
    if (!newEmpId || !newName) return;

    const numericId = parseInt(newEmpId, 10);
    const idKey = String(numericId || newEmpId).trim();

    // Prevent duplicate empId addition
    const existing = (crewList || []).find(e => String(e.empId || e.id).trim() === idKey);
    if (existing) {
      alert(`Employee #${idKey} already exists in registry (${existing.name}). Please use Directory Edit or enter a unique Employee ID.`);
      return;
    }

    const newMember = {
      empId: numericId || newEmpId,
      name: newName.trim(),
      gender: newGender,
      fixedWo: newFixedWo,
      specialProfile: newGender === 'FEMALE' && newProfile === 'NORMAL' ? 'PINK' : newProfile,
      pinkDutyEligible: newGender === 'FEMALE' || newProfile === 'PINK',
      nightTarget: newGender === 'FEMALE' ? 5 : 6,
      boardingStation: newStation,
      travellingBy: 'Train',
      homeLocation: '',
      status: 'ACTIVE',
      competency: 'TRAIN_OPERATOR_MAINLINE',
      competencyValidUntil: '2028-12-31',
      activeCrew: true,
      isRelieved: false,
      notes: newNotes,
      lrd: { daysRequired: 0, daysCompleted: 0, reason: null, confirmedByUser: false },
      maternityLeave: null,
      role: 'TRAIN_OPERATOR',
      isOfficialCC: false,
      canDriveTrain: true,
      ccWilling: newProfile === 'CC_WILLING'
    };

    if (onAddNewCrewMember) {
      onAddNewCrewMember(newMember);
    }

    setNewEmpId('');
    setNewName('');
    setNewGender('MALE');
    setNewFixedWo('Sunday');
    setNewProfile('NORMAL');
    setNewStation('PYID');
    setNewNotes('Newly Reported to PYID CC');
    setIsAddModalOpen(false);
  };

  // Multi-select handlers
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

  const handleSelectAllActive = () => {
    const allActiveIds = activeCrewOnly.map(e => String(e.empId).trim());
    setSelectedEmpIds(new Set(allActiveIds));
  };

  const handleDeselectAll = () => {
    setSelectedEmpIds(new Set());
  };

  const handleConfirmBulkRelieve = (e) => {
    e.preventDefault();
    if (selectedEmpIds.size === 0) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const uniqueIds = Array.from(selectedEmpIds);
    const updatesList = uniqueIds.map(empId => ({
      empId: parseInt(empId, 10) || empId,
      status: 'RELIEVED',
      activeCrew: false,
      isRelieved: true,
      relievedReason: bulkRelieveReason,
      relievedNotes: bulkRelieveNotes,
      relievedDate: todayStr,
      relievedBy: controllerName
    }));

    if (onBatchUpdateCrewStatus) {
      onBatchUpdateCrewStatus(updatesList);
    } else {
      updatesList.forEach(u => onUpdateCrewStatus(u.empId, u));
    }
    setSelectedEmpIds(new Set());
    setIsBulkRelieveModalOpen(false);
    setBulkRelieveNotes('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-2xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Active Crew &amp; Maternity Leave Console
              </h2>
              <p className="text-xs text-slate-400">
                Active candidate roster for BMRCL Line 2 Daily Duty Generator (BMRCL Regular TOs + JMD Contract TDs).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenRelievedModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenRelievedModal();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <UserX className="w-4 h-4" />
                Relieved / SC ({relievedCrewCount})
              </button>
            )}

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              + Add Reported TO
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Strength Metrics Ribbon */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 px-6 py-3 bg-slate-950/70 border-b border-slate-800/80 text-xs">
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-indigo-500/30">
            <span className="text-[10px] text-indigo-300 uppercase block font-bold">Total Database</span>
            <span className="text-xl font-black text-white font-mono">{totalDatabaseCount} Staff</span>
          </div>
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-emerald-500/30">
            <span className="text-[10px] text-emerald-400 uppercase block font-bold">☑ Active Total</span>
            <span className="text-xl font-black text-emerald-400 font-mono">{activeCrewCount}</span>
          </div>
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-blue-500/30">
            <span className="text-[10px] text-blue-400 uppercase block font-bold">BMRCL Regular TOs</span>
            <span className="text-xl font-black text-blue-400 font-mono">{bmrclCrewCount} TOs</span>
          </div>
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-pink-500/30">
            <span className="text-[10px] text-pink-400 uppercase block font-bold">🌸 Maternity Leave</span>
            <span className="text-xl font-black text-pink-400 font-mono">{maternityCount} TOs</span>
          </div>
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-purple-500/30">
            <span className="text-[10px] text-purple-400 uppercase block font-bold">🌸 Pink Duty Pool</span>
            <span className="text-xl font-black text-purple-300 font-mono">{pinkDutyCount} TOs</span>
          </div>
        </div>

        {/* Search & Category Filter Bar */}
        <div className="p-4 bg-slate-950/30 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Operator Name or Emp ID..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {[
              { id: 'ALL', label: `All Active (${activeCrewCount})` },
              { id: 'BMRCL_TO', label: `BMRCL TOs (${bmrclCrewCount})` },
              { id: 'MATERNITY', label: `🌸 Maternity (${maternityCount})` },
              { id: 'PINK', label: `🌸 Pink Pool (${pinkDutyCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${activeFilter === tab.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Selection Strip */}
        {/* Quick Selection Strip & SL NO Verifier */}
        <div className="px-6 py-2.5 bg-slate-950/70 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              Quick Select:
            </span>
            
            <button
              onClick={handleSelectAllActive}
              className="px-2.5 py-1 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
              title="Select all active train operators"
            >
              <UserCheck className="w-3.5 h-3.5" />
              Select All Active ({activeCrewCount})
            </button>

            <button
              onClick={handleSelectAllVisible}
              className="px-2.5 py-1 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-500/40 rounded-lg text-xs font-bold transition-all shadow-sm"
              title="Select all visible filtered operators"
            >
              Select All Visible ({filteredCrew.length})
            </button>

            <span className="text-[11px] font-mono text-emerald-400/90 font-semibold flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 ml-2">
              <span>Verified SL NO:</span>
              <strong className="text-emerald-300">#01 – #{String(filteredCrew.length).padStart(2, '0')}</strong>
              <span className="text-slate-500">(Total {activeCrewCount} Active TOs)</span>
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

        {/* Multi-Selection Bulk Actions Bar */}
        {selectedEmpIds.size > 0 && (
          <div className="px-6 py-2.5 bg-rose-950/90 border-b border-rose-500/40 flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-0.5 bg-rose-500 text-white rounded-full font-mono font-bold">
                {selectedEmpIds.size} Active TOs Selected
              </span>
              <span className="text-slate-200 text-xs">
                Relieve selected operators to Station Controller / Transfer console in a single click:
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsBulkRelieveModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                <UserMinus className="w-3.5 h-3.5" />
                Bulk Relieve to SC ({selectedEmpIds.size} TOs)
              </button>

              <button
                onClick={handleDeselectAll}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* Active Crew Table List */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filteredCrew.length > 0 && filteredCrew.every(e => selectedEmpIds.has(e.empId))}
                    onChange={handleSelectAllVisible}
                    className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer w-4 h-4"
                    title="Select / Deselect All Visible"
                  />
                </th>
                <th className="px-3 py-3 w-16 text-center font-black text-emerald-300 font-mono bg-emerald-950/40 border-r border-slate-800">
                  SL NO
                </th>
                <th className="px-4 py-3">Emp ID</th>
                <th className="px-4 py-3">Train Operator &amp; Directory Info</th>
                <th className="px-4 py-3">Designation / Base Depot</th>
                <th className="px-4 py-3">Fixed WO</th>
                <th className="px-4 py-3">Status / Duty Profile</th>
                <th className="px-4 py-3 text-right">Directory &amp; Relieve Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredCrew.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                    No active train operators found matching the criteria.
                  </td>
                </tr>
              ) : (
                filteredCrew.map((emp, idx) => {
                  const isSelected = selectedEmpIds.has(emp.empId);
                  const isFemale = emp.gender === 'FEMALE';
                  const ml = emp.maternityLeave;
                  const isMLActive = ml && ml.active && !ml.actualReportDate;

                  return (
                    <tr key={emp.empId} className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-emerald-950/30' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(emp.empId)}
                          className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0 cursor-pointer w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-3 text-center font-mono font-black text-emerald-400 bg-emerald-950/20 border-r border-slate-800/80 text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-white">
                        {emp.empId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          {emp.name}
                          {emp.specialProfile === 'PINK' && (
                            <span className="text-[10px] px-1.5 py-0.2 bg-pink-500/20 text-pink-300 rounded border border-pink-500/30">
                              🌸 Pink
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${isFemale ? 'bg-pink-500/20 text-pink-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {emp.gender}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                          {emp.phone && <span>📞 {emp.phone}</span>}
                          {emp.bloodGroup && <span>🩸 {emp.bloodGroup}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-200 font-semibold text-[11px]">
                          {emp.designation || 'Train Operator'}
                        </div>
                        <div className="text-[10px] text-blue-400 font-mono">
                          Base: {emp.depot || emp.boardingStation || 'PYID'}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-400 font-semibold">
                        {emp.fixedWo || 'Sunday'}
                      </td>
                      <td className="px-4 py-3">
                        {isMLActive ? (
                          <div className="space-y-1">
                            <span className="px-2 py-0.5 bg-pink-500/20 text-pink-300 border border-pink-500/30 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
                              <HeartPulse className="w-3 h-3" /> STATUTORY ML (180d)
                            </span>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {ml.startDate} → {ml.statutoryEndDate}
                              {ml.extensionType !== 'NONE' && (
                                <span className="text-amber-300 ml-1 font-bold">({ml.extensionType} Ext: +{ml.extendedDays}d)</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold flex items-center gap-1 w-fit">
                            <UserCheck className="w-3 h-3" /> ACTIVE CREW
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            onClick={() => handleOpenEditProfile(emp)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1"
                            title="Edit full employee record in Crew Directory"
                          >
                            <Edit className="w-3 h-3 text-blue-400" />
                            Directory
                          </button>

                          {isFemale && (
                            <>
                              {isMLActive ? (
                                <button
                                  onClick={() => handleReportBackFromML(emp.empId)}
                                  className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1"
                                  title="Operator reports back from ML and transitions to Pink Duty"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Report to Duty
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setMaternityModalTO(emp);
                                    setMlStartDate(new Date().toISOString().split('T')[0]);
                                  }}
                                  className="px-2.5 py-1.5 bg-pink-600/20 hover:bg-pink-600/30 text-pink-300 border border-pink-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1"
                                  title="Grant 180 Days Maternity Leave"
                                >
                                  <HeartPulse className="w-3.5 h-3.5" />
                                  Grant ML (180d)
                                </button>
                              )}
                            </>
                          )}

                          <button
                            onClick={() => {
                              setRelieveModalTO(emp);
                              setRelieveReason('Working as Station Controller / Transferred from PYID CC');
                            }}
                            className="px-2.5 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1"
                            title="Relieve operator from active PYID roster to Station Controller / Transferred"
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            Relieve to SC
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Relieve Single TO Modal */}
        {relieveModalTO && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserMinus className="w-5 h-5 text-rose-400" />
                  Relieve Train Operator: {relieveModalTO.name}
                </h3>
                <button
                  onClick={() => setRelieveModalTO(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmRelieve} className="space-y-4 mt-4 text-xs">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Relieve / Transfer Reason *
                  </label>
                  <select
                    value={relieveReason}
                    onChange={(e) => setRelieveReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
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
                    Operational Remarks / Office Order Ref
                  </label>
                  <input
                    type="text"
                    value={relieveNotes}
                    onChange={(e) => setRelieveNotes(e.target.value)}
                    placeholder="e.g. Office Order BMRCL/OCC/2026/08"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setRelieveModalTO(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg"
                  >
                    Confirm Relieve
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Bulk Relieve Confirmation Modal */}
        {isBulkRelieveModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserMinus className="w-5 h-5 text-rose-400" />
                  Bulk Relieve Selected Train Operators ({selectedEmpIds.size} TOs)
                </h3>
                <button
                  onClick={() => setIsBulkRelieveModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleConfirmBulkRelieve} className="space-y-4 mt-4 text-xs">
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-xl text-rose-200">
                  You are about to relieve <strong className="text-white font-mono">{selectedEmpIds.size} train operators</strong> from active PYID CC candidate duty list. They will be moved to the Relieved TO &amp; SC Console.
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Relieve / Transfer Reason *
                  </label>
                  <select
                    value={bulkRelieveReason}
                    onChange={(e) => setBulkRelieveReason(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
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
                    Operational Remarks / Office Order Ref
                  </label>
                  <input
                    type="text"
                    value={bulkRelieveNotes}
                    onChange={(e) => setBulkRelieveNotes(e.target.value)}
                    placeholder="e.g. Office Order BMRCL/OCC/2026/08"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsBulkRelieveModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg"
                  >
                    Confirm Bulk Relieve ({selectedEmpIds.size} TOs)
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Maternity Modal */}
        {maternityModalTO && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-pink-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <HeartPulse className="w-5 h-5 text-pink-400" />
                  Grant Maternity Leave: {maternityModalTO.name}
                </h3>
                <button
                  onClick={() => setMaternityModalTO(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveMaternity} className="space-y-4 mt-4 text-xs">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Leave Commencement Date
                  </label>
                  <input
                    type="date"
                    value={mlStartDate}
                    onChange={(e) => setMlStartDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div className="p-3 bg-pink-950/30 border border-pink-500/30 rounded-xl text-xs space-y-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Statutory Duration:</span>
                    <strong className="text-pink-300">180 Continuous Days</strong>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-400">Scheduled Completion:</span>
                    <strong className="text-emerald-300">
                      {new Date(new Date(mlStartDate).getTime() + 180 * 86400000).toISOString().split('T')[0]}
                    </strong>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Post-Maternity Extension (Optional)
                  </label>
                  <select
                    value={mlExtensionType}
                    onChange={(e) => setMlExtensionType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="NONE">No Extension (Standard 180 Days)</option>
                    <option value="EL">Extend via EL (Earned Leave)</option>
                    <option value="HPL">Extend via HPL (Half Pay Leave)</option>
                  </select>
                </div>

                {mlExtensionType !== 'NONE' && (
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Extension Duration (Days)
                    </label>
                    <input
                      type="number"
                      min="5"
                      max="90"
                      value={mlExtensionDays}
                      onChange={(e) => setMlExtensionDays(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setMaternityModalTO(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-pink-600 hover:bg-pink-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Confirm Maternity Leave
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add New TO Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-400" />
                  Add Newly Reported Train Operator to PYID CC
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddNewTO} className="space-y-3 mt-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Employee ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={newEmpId}
                      onChange={(e) => setNewEmpId(e.target.value)}
                      placeholder="e.g. 22601 or 88000150"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Anand Kumar"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Gender
                    </label>
                    <select
                      value={newGender}
                      onChange={(e) => setNewGender(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="MALE">Male (Max 6 Nights)</option>
                      <option value="FEMALE">Female (Max 5 Nights / Pink Roster)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Fixed Weekly Off Day
                    </label>
                    <select
                      value={newFixedWo}
                      onChange={(e) => setNewFixedWo(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Profile / Category
                    </label>
                    <select
                      value={newProfile}
                      onChange={(e) => setNewProfile(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="NORMAL">Standard Train Operator</option>
                      <option value="PINK">Pink Duty Pool (Female / Light Duty)</option>
                      <option value="CC_WILLING">CC-Willing (Relief Desk Pool)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Boarding / Base Depot
                    </label>
                    <input
                      type="text"
                      value={newStation}
                      onChange={(e) => setNewStation(e.target.value)}
                      placeholder="e.g. PYID or KGWA"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Reporting Notes / Remarks
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    placeholder="e.g. Newly Reported from JMD / Training Centre"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg"
                  >
                    Save &amp; Add to Crew Pool
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Directory Profile Modal */}
        {editProfileTO && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-blue-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Edit className="w-5 h-5 text-blue-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Edit Directory Profile: {editProfileTO.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Emp ID: #{editProfileTO.empId} • Synchronized with Crew Directory Matrix
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
                      <option value="Train Operator">Train Operator</option>
                      <option value="Station Controller">Station Controller</option>
                      <option value="Station Superintendent">Station Superintendent</option>
                      <option value="Station Superintendent / CC">Station Superintendent / CC</option>
                      <option value="Crew Controller">Crew Controller</option>
                      <option value="ALS Desk Supervisor">ALS Desk Supervisor</option>
                      <option value="GCC Desk Supervisor">GCC Desk Supervisor</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Depot / Base Station
                    </label>
                    <input
                      type="text"
                      value={editDepot}
                      onChange={(e) => setEditDepot(e.target.value)}
                      placeholder="e.g. PYID or KGWA"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Mobile / Contact No
                    </label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Blood Group
                    </label>
                    <select
                      value={editBloodGroup}
                      onChange={(e) => setEditBloodGroup(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="">Select Blood Group</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Competency Valid Till
                    </label>
                    <input
                      type="date"
                      value={editCompetencyDate}
                      onChange={(e) => setEditCompetencyDate(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Medical Valid Till
                    </label>
                    <input
                      type="date"
                      value={editMedicalDate}
                      onChange={(e) => setEditMedicalDate(e.target.value)}
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
                    Save Directory Profile
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

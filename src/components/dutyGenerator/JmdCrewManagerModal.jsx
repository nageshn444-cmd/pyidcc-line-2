import React, { useState, useMemo } from 'react';
import { 
  Users, UserCheck, UserX, Search, Filter, AlertTriangle, 
  CheckCircle2, X, ShieldAlert, Clock, ArrowRight, UserMinus,
  FileText, Calendar, Sparkles, Plus, Edit, Save, Phone, Droplet,
  Check, Briefcase, Zap, Compass, Moon, Sun, HeartPulse, RefreshCw
} from 'lucide-react';

import { OFFICIAL_JMD_TD_REGISTRY } from '../../data/jmdCrewMaster';
import { normalizeCanonicalEmpId } from '../../utils/crewRegistryDataMerger';

export default function JmdCrewManagerModal({
  isOpen,
  onClose,
  crewList = [],
  onUpdateCrewStatus,
  onBatchUpdateCrewStatus,
  onAddNewCrewMember,
  onOpenActiveCrewModal
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL', 'MAINLINE', 'NIGHT', 'LOOP', 'PINK', 'WO', 'LEAVE'
  
  // Multi-Selection State
  const [selectedEmpIds, setSelectedEmpIds] = useState(new Set());

  // Edit Directory Profile Modal State
  const [editProfileTD, setEditProfileTD] = useState(null);
  const [editDesignation, setEditDesignation] = useState('Train Driver (JMD Contract)');
  const [editDepot, setEditDepot] = useState('PYID');
  const [editPhone, setEditPhone] = useState('');
  const [editBloodGroup, setEditBloodGroup] = useState('');
  const [editCompetencyDate, setEditCompetencyDate] = useState('2028-12-31');
  const [editMedicalDate, setEditMedicalDate] = useState('2027-12-31');
  const [editFixedWo, setEditFixedWo] = useState('Sunday');
  const [editNotes, setEditNotes] = useState('');

  // Add New JMD TD Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpId, setNewEmpId] = useState('880001');
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState('MALE');
  const [newFixedWo, setNewFixedWo] = useState('Sunday');
  const [newStation, setNewStation] = useState('PYID');
  const [newPhone, setNewPhone] = useState('');
  const [newBloodGroup, setNewBloodGroup] = useState('');
  const [newNotes, setNewNotes] = useState('Newly Reported JMD Train Driver (Contract)');

  // Strict isolation of JMD TD Crew ONLY (Emp ID starts with '8')
  const jmdCrewList = useMemo(() => {
    const map = new Map();
    // 1. Seed with official master
    (OFFICIAL_JMD_TD_REGISTRY || []).forEach(e => {
      const canonicalId = normalizeCanonicalEmpId(e.empId);
      if (canonicalId) {
        map.set(canonicalId, { ...e, empId: canonicalId, isJMD: true });
      }
    });
    // 2. Overlay live crewList
    (crewList || []).forEach(e => {
      if (e) {
        const canonicalId = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
        if (canonicalId && String(canonicalId).startsWith('8')) {
          const existing = map.get(canonicalId) || {};
          map.set(canonicalId, {
            ...existing,
            ...e,
            empId: canonicalId,
            isJMD: true,
            designation: e.designation || existing.designation || 'Train Driver (JMD Contract)'
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.empId - b.empId);
  }, [crewList]);

  const totalJmdCount = jmdCrewList.length;

  const activeJmdList = useMemo(() => {
    return jmdCrewList.filter(e => (e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active)) && !e.isRelieved && e.activeCrew !== false);
  }, [jmdCrewList]);

  const activeJmdCount = activeJmdList.length;

  const pinkJmdCount = useMemo(() => {
    return activeJmdList.filter(e => e.gender === 'FEMALE' || e.specialProfile === 'PINK' || e.pinkDutyEligible).length;
  }, [activeJmdList]);

  const filteredCrew = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return jmdCrewList.filter(emp => {
      const name = String(emp.name || '').toLowerCase();
      const empIdStr = String(emp.empId || '');
      const notes = String(emp.notes || '').toLowerCase();
      const phone = String(emp.phone || '');

      const matchesSearch = !q || name.includes(q) || empIdStr.includes(q) || notes.includes(q) || phone.includes(q);

      let matchesFilter = true;
      if (activeFilter === 'ACTIVE_ONLY') {
        matchesFilter = (emp.status === 'ACTIVE' || emp.status === 'MATERNITY_LEAVE') && !emp.isRelieved;
      } else if (activeFilter === 'PINK') {
        matchesFilter = emp.gender === 'FEMALE' || emp.specialProfile === 'PINK' || emp.pinkDutyEligible;
      } else if (activeFilter === 'WO') {
        matchesFilter = emp.fixedWo === 'Sunday' || String(emp.notes || '').toLowerCase().includes('weekly off');
      } else if (activeFilter === 'RELIEVED') {
        matchesFilter = emp.status === 'RELIEVED' || emp.isRelieved === true;
      }

      return matchesSearch && matchesFilter;
    });
  }, [jmdCrewList, searchQuery, activeFilter]);

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
      if (allSelected) return new Set();
      return new Set([...prev, ...allVisibleIds]);
    });
  };

  const handleOpenEdit = (emp) => {
    setEditProfileTD(emp);
    setEditDesignation(emp.designation || 'Train Driver (JMD Contract)');
    setEditDepot(emp.boardingStation || emp.depot || 'PYID');
    setEditPhone(emp.phone || emp.mobileNumber || '');
    setEditBloodGroup(emp.bloodGroup || '');
    setEditCompetencyDate(emp.competencyValidUntil || emp.competencyValidTill || '2028-12-31');
    setEditMedicalDate(emp.medicalValidTill || '2027-12-31');
    setEditFixedWo(emp.fixedWo || 'Sunday');
    setEditNotes(emp.notes || '');
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editProfileTD) return;

    onUpdateCrewStatus(editProfileTD.empId, {
      designation: editDesignation,
      depot: editDepot,
      boardingStation: editDepot,
      phone: editPhone,
      mobileNumber: editPhone,
      bloodGroup: editBloodGroup,
      competencyValidUntil: editCompetencyDate,
      competencyValidTill: editCompetencyDate,
      medicalValidTill: editMedicalDate,
      fixedWo: editFixedWo,
      notes: editNotes,
      updatedAt: new Date().toISOString()
    });

    setEditProfileTD(null);
  };

  const handleAddJmdTD = (e) => {
    e.preventDefault();
    if (!newEmpId || !newName) return;

    const parsedId = parseInt(newEmpId, 10);
    if (isNaN(parsedId)) {
      alert("Please enter a valid numeric 8-series Emp ID (e.g. 88000144)");
      return;
    }

    const newTD = {
      empId: parsedId,
      name: newName.trim(),
      gender: newGender,
      fixedWo: newFixedWo,
      specialProfile: newGender === 'FEMALE' ? 'PINK' : 'STANDARD',
      role: 'Train Driver (JMD)',
      designation: 'Train Driver (JMD Contract)',
      isOfficialCC: false,
      canDriveTrain: true,
      ccWilling: false,
      pinkDutyEligible: newGender === 'FEMALE',
      nightTarget: newGender === 'FEMALE' ? 5 : 6,
      boardingStation: newStation,
      travellingBy: 'Train',
      homeLocation: '',
      status: 'ACTIVE',
      competency: 'TRAIN_OPERATOR',
      competencyValidUntil: '2028-12-31',
      activeCrew: true,
      isRelieved: false,
      notes: newNotes || 'JMD Train Driver (Contract)',
      phone: newPhone,
      bloodGroup: newBloodGroup,
      lrd: { required: false, daysRequired: 0, daysCompleted: 0 },
      maternityLeave: null
    };

    if (onAddNewCrewMember) {
      onAddNewCrewMember(newTD);
    } else {
      onUpdateCrewStatus(parsedId, newTD);
    }

    setIsAddModalOpen(false);
    setNewName('');
    setNewPhone('');
    setNewBloodGroup('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-5xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-2xl">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  JMD TD (Train Drivers) Contract Crew Console
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  TD Roster Desk (8-Series)
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Dedicated management desk for contract JMD Train Drivers (TD) assigned to Line 2 Peenya Depot Mainline Running Duties #1 to #78.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenActiveCrewModal && (
              <button
                onClick={() => {
                  onClose();
                  onOpenActiveCrewModal();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all shadow-sm"
              >
                <Users className="w-4 h-4" />
                BMRCL TO Desk
              </button>
            )}

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              + Register New JMD TD
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-3 bg-slate-950/70 border-b border-slate-800/80 text-xs">
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-amber-500/30">
            <span className="text-[10px] text-amber-400 uppercase block font-bold">Total JMD TD Pool</span>
            <span className="text-xl font-black text-amber-400 font-mono">{totalJmdCount} TDs</span>
          </div>
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-emerald-500/30">
            <span className="text-[10px] text-emerald-400 uppercase block font-bold">Active Driving TDs</span>
            <span className="text-xl font-black text-emerald-400 font-mono">{activeJmdCount} TDs</span>
          </div>
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-pink-500/30">
            <span className="text-[10px] text-pink-400 uppercase block font-bold">🌸 Pink Duty TDs (Female)</span>
            <span className="text-xl font-black text-pink-400 font-mono">{pinkJmdCount} TDs</span>
          </div>
          <div className="p-2.5 bg-slate-900/90 rounded-xl border border-blue-500/30">
            <span className="text-[10px] text-blue-400 uppercase block font-bold">Designation Standard</span>
            <span className="text-xs font-bold text-blue-300 block mt-1">TD = Train Driver (Contract)</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search JMD Driver by Name, 8-series ID, Phone..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {[
              { id: 'ALL', label: `All JMD TDs (${totalJmdCount})` },
              { id: 'ACTIVE_ONLY', label: `Active (${activeJmdCount})` },
              { id: 'PINK', label: `🌸 Pink Pool (${pinkJmdCount})` },
              { id: 'WO', label: 'Weekly Off' },
              { id: 'RELIEVED', label: 'Standby / Relieved' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  activeFilter === tab.id 
                    ? 'bg-amber-600 text-white shadow-md' 
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Selection Strip & SL NO Verifier */}
        <div className="px-6 py-2 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAllVisible}
              className="px-2.5 py-1 bg-amber-950/50 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition-all"
            >
              Select All Visible ({filteredCrew.length} TDs)
            </button>
            <span className="text-[11px] font-mono text-amber-400/90 font-semibold flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              <span>Verified SL NO:</span>
              <strong className="text-amber-300">#01 – #{String(filteredCrew.length).padStart(2, '0')}</strong>
              <span className="text-slate-500">(Total {totalJmdCount} in Master)</span>
            </span>
          </div>

          {selectedEmpIds.size > 0 && (
            <button
              onClick={() => setSelectedEmpIds(new Set())}
              className="text-xs text-slate-400 hover:text-white underline font-semibold"
            >
              Clear Selection ({selectedEmpIds.size})
            </button>
          )}
        </div>

        {/* JMD TD Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filteredCrew.length > 0 && filteredCrew.every(e => selectedEmpIds.has(String(e.empId)))}
                    onChange={handleSelectAllVisible}
                    className="rounded bg-slate-800 border-slate-700 text-amber-600 focus:ring-0 cursor-pointer w-4 h-4"
                  />
                </th>
                <th className="px-3 py-3 w-16 text-center font-black text-amber-300 font-mono bg-amber-950/40 border-r border-slate-800">
                  SL NO
                </th>
                <th className="px-4 py-3">JMD Emp ID (10-Digit)</th>
                <th className="px-4 py-3">Driver Name &amp; Contact</th>
                <th className="px-4 py-3">Designation &amp; Role</th>
                <th className="px-4 py-3">Fixed WO &amp; Depot</th>
                <th className="px-4 py-3">Roster Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredCrew.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                    No JMD Train Drivers found matching the query.
                  </td>
                </tr>
              ) : (
                filteredCrew.map((emp, idx) => {
                  const isSelected = selectedEmpIds.has(String(emp.empId));
                  const isFemale = emp.gender === 'FEMALE';

                  return (
                    <tr key={emp.empId} className={`hover:bg-slate-800/40 transition-colors ${isSelected ? 'bg-amber-950/30' : ''}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(emp.empId)}
                          className="rounded bg-slate-800 border-slate-700 text-amber-600 focus:ring-0 cursor-pointer w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-3 text-center font-mono font-black text-amber-400 bg-amber-950/20 border-r border-slate-800/80 text-xs">
                        {idx + 1}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-amber-400">
                        #{emp.empId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          {emp.name}
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                            isFemale ? 'bg-pink-900/60 text-pink-300 border border-pink-500/40' : 'bg-slate-800 text-slate-300'
                          }`}>
                            {isFemale ? 'FEMALE (PINK)' : 'MALE'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5 font-mono">
                          {emp.phone && <span>📞 {emp.phone}</span>}
                          {emp.bloodGroup && <span>🩸 {emp.bloodGroup}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold inline-flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          TD (Train Driver - JMD)
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Mainline Duties #1 - #78
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-slate-200 font-semibold font-mono">
                          WO: {emp.fixedWo || 'Sunday'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Depot: {emp.boardingStation || 'PYID'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-bold inline-flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          ACTIVE
                        </span>
                        {emp.notes && (
                          <div className="text-[10px] text-slate-400 italic mt-0.5 truncate max-w-xs">
                            "{emp.notes}"
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition-all inline-flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3 text-amber-400" />
                          Edit TD Profile
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Edit TD Profile Modal */}
        {editProfileTD && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Edit className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Edit JMD TD: {editProfileTD.name}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Emp ID: #{editProfileTD.empId} • Train Driver (Contract)
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setEditProfileTD(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-3 mt-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Designation
                    </label>
                    <input
                      type="text"
                      value={editDesignation}
                      onChange={(e) => setEditDesignation(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Fixed Weekly Off
                    </label>
                    <select
                      value={editFixedWo}
                      onChange={(e) => setEditFixedWo(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Blood Group
                    </label>
                    <input
                      type="text"
                      value={editBloodGroup}
                      onChange={(e) => setEditBloodGroup(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Driver Notes / Contract Details
                  </label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEditProfileTD(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Add New JMD TD Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn font-sans">
            <div className="bg-slate-900 border border-amber-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Plus className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Register New JMD Train Driver (TD)
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Contract Driver Onboarding (8-Series Emp ID)
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddJmdTD} className="space-y-3 mt-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      JMD Emp ID (8-Series) *
                    </label>
                    <input
                      type="text"
                      value={newEmpId}
                      onChange={(e) => setNewEmpId(e.target.value)}
                      placeholder="e.g. 88000144"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Driver Full Name *
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Suresh Kumar"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                      required
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
                      <option value="MALE">MALE</option>
                      <option value="FEMALE">FEMALE (Pink TD)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Fixed Weekly Off
                    </label>
                    <select
                      value={newFixedWo}
                      onChange={(e) => setNewFixedWo(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    >
                      {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      Blood Group
                    </label>
                    <input
                      type="text"
                      value={newBloodGroup}
                      onChange={(e) => setNewBloodGroup(e.target.value)}
                      placeholder="O+, B+, etc."
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Onboarding Remarks
                  </label>
                  <input
                    type="text"
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
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
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Register TD Driver
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

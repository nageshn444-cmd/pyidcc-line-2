import React, { useState, useMemo } from 'react';
import { 
  Users, UserCheck, CheckCircle2, ShieldCheck, UserPlus, 
  X, Search, Sparkles, Clock, AlertTriangle, ArrowRight, UserX, UserCheck2,
  Edit, Trash2, Plus, Save, Phone, Check, ShieldAlert
} from 'lucide-react';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { OFFICIAL_JMD_TD_REGISTRY } from '../../data/jmdCrewMaster';
import { ALL_OFFICIAL_SUPERVISORY_STAFF } from '../../data/ccRosterRegistry';
import { BMRCL_CREW_REGISTRY } from '../../data/bmrclCrewRegistry';
import { normalizeCanonicalEmpId, OFFICIAL_PYID_ACTIVE_IDS } from '../../utils/crewRegistryDataMerger';

// Build unified canonical name map across all master data sources
const MASTER_STAFF_NAME_MAP = new Map();
[
  ...ALL_OFFICIAL_SUPERVISORY_STAFF,
  ...EMPLOYEE_MASTER_REGISTRY,
  ...OFFICIAL_JMD_TD_REGISTRY,
  ...(BMRCL_CREW_REGISTRY || [])
].forEach(e => {
  if (!e) return;
  const id = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
  const rawName = e.name || e.employeeName || e.empName;
  if (id && rawName && !rawName.startsWith('Employee #') && !MASTER_STAFF_NAME_MAP.has(id)) {
    MASTER_STAFF_NAME_MAP.set(id, String(rawName).trim());
  }
});

/**
 * Returns the exact real official staff name for an employee object,
 * preventing any fallback to "Employee #..." placeholder strings.
 */
export function getCanonicalStaffName(emp) {
  if (!emp) return '—';
  const id = normalizeCanonicalEmpId(emp.empId || emp.employeeId || emp.id);
  const rawName = emp.name || emp.employeeName || emp.empName;
  if (rawName && !rawName.startsWith('Employee #')) {
    return String(rawName).trim();
  }
  if (id && MASTER_STAFF_NAME_MAP.has(id)) {
    return MASTER_STAFF_NAME_MAP.get(id);
  }
  return id ? `Staff #${id}` : (rawName || '—');
}

export default function CCWillingDeskModal({
  isOpen,
  onClose,
  crewList,
  onUpdateCrewStatus,
  onDeleteCrewMember,
  onModifyCrewMember,
  onAddNewCrewMember
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterWilling, setFilterWilling] = useState('ALL'); // 'ALL', 'WILLING', 'LINE_ONLY'

  // Modals state for Edit, Delete, and Add
  const [editingStaff, setEditingStaff] = useState(null);
  const [editEmpId, setEditEmpId] = useState('');
  const [editName, setEditName] = useState('');
  const [editGender, setEditGender] = useState('MALE');
  const [editFixedWo, setEditFixedWo] = useState('Sunday');
  const [editRoleDisplay, setEditRoleDisplay] = useState('Train Operator (BMRCL Regular)');
  const [editCcWilling, setEditCcWilling] = useState(false);
  const [editPhone, setEditPhone] = useState('');

  const [deletingStaff, setDeletingStaff] = useState(null);
  const [relieveReason, setRelieveReason] = useState('Working as Station Controller / Transferred from PYID CC');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmpId, setNewEmpId] = useState('');
  const [newName, setNewName] = useState('');
  const [newGender, setNewGender] = useState('MALE');
  const [newFixedWo, setNewFixedWo] = useState('Sunday');
  const [newRole, setNewRole] = useState('Train Operator (BMRCL Regular)');
  const [newCcWilling, setNewCcWilling] = useState(false);

  // Filter strictly to Train Operators only (BMRCL Regular TOs + JMD Contract TDs)
  // Exclude Official CCs (shown in top banner), Station Controllers, and Supervisory staff
  const trainOperatorsOnly = useMemo(() => {
    const map = new Map();
    (crewList || []).forEach(emp => {
      if (!emp) return;
      const canonicalId = normalizeCanonicalEmpId(emp.empId || emp.employeeId || emp.id);
      if (!canonicalId) return;

      const isRelieved = emp.isRelieved === true || emp.status === 'RELIEVED' || emp.status === 'INACTIVE' || emp.activeCrew === false || emp.isDeleted === true;
      if (isRelieved) return;

      // Exclude dedicated permanent CCs and supervisory non-driving staff
      if (emp.isOfficialCC === true || emp.role === 'OFFICIAL_CREW_CONTROLLER' || emp.specialProfile === 'CC') return;
      if ([20726, 20038, 20037, 20018, 20019, 20057, 20087].includes(canonicalId)) return;
      if (emp.role === 'Official ALS' || emp.role === 'Official GCC' || emp.role === 'STATION_CONTROLLER') return;

      if (!map.has(canonicalId)) {
        const canonicalName = getCanonicalStaffName(emp);
        const isJmd = String(canonicalId).startsWith('8');
        map.set(canonicalId, {
          ...emp,
          empId: canonicalId,
          name: canonicalName,
          roleDisplay: emp.designation || (isJmd ? 'Train Driver (JMD Contract)' : 'Train Operator (BMRCL Regular)')
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.empId - b.empId);
  }, [crewList]);

  // Dynamic Official CCs resolution from crewList
  const officialCCs = useMemo(() => {
    const defaultCCs = [
      { empId: 20726, defaultId: 20726, name: 'Nagesh N', role: 'Official CC (CC1 Morning)', fixedWo: 'Sunday', desk: 'CC1 Desk' },
      { empId: 20038, defaultId: 20038, name: 'Deepa L', role: 'Official CC (CC2 Afternoon)', fixedWo: 'Sunday', desk: 'CC2 Desk' },
      { empId: 20037, defaultId: 20037, name: 'Rashmi', role: 'Official CC (CC3 Night)', fixedWo: 'Sunday', desk: 'CC3 Desk' }
    ];

    return defaultCCs.map(cc => {
      const match = (crewList || []).find(e => {
        const id = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
        return id === cc.empId || id === cc.defaultId;
      });
      if (match) {
        return {
          ...cc,
          ...match,
          empId: match.empId || cc.empId,
          name: match.name || getCanonicalStaffName(match) || cc.name,
          role: match.role || cc.role,
          fixedWo: match.fixedWo || cc.fixedWo
        };
      }
      return cc;
    });
  }, [crewList]);

  // Dynamic Supervisory Staff resolution
  const supervisoryStaff = useMemo(() => {
    const defaultStaff = [
      { empId: 20018, defaultId: 20018, name: 'Arunkumar D S', role: 'Official ALS', fixedWo: 'Sunday', desk: 'ALS Desk' },
      { empId: 20019, defaultId: 20019, name: 'Manjunath BM', role: 'Official GCC', fixedWo: 'Sunday', desk: 'GCC Desk' },
      { empId: 20057, defaultId: 20057, name: 'Shanthiraj S', role: 'Official ALS', fixedWo: 'Monday', desk: 'ALS Desk' },
      { empId: 20087, defaultId: 20087, name: 'Harsh Joshi', role: 'Official ALS', fixedWo: 'Sunday', desk: 'ALS Desk' }
    ];

    return defaultStaff.map(staff => {
      const match = (crewList || []).find(e => {
        const id = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
        return id === staff.empId || id === staff.defaultId;
      });
      if (match) {
        return {
          ...staff,
          ...match,
          empId: match.empId || staff.empId,
          name: match.name || getCanonicalStaffName(match) || staff.name,
          role: match.role || staff.role,
          fixedWo: match.fixedWo || staff.fixedWo
        };
      }
      return staff;
    });
  }, [crewList]);

  if (!isOpen) return null;

  const ccWillingTOs = trainOperatorsOnly.filter(e => e.ccWilling || e.specialProfile === 'CC_WILLING');
  const lineOnlyTOs = trainOperatorsOnly.filter(e => !e.ccWilling && e.specialProfile !== 'CC_WILLING');

  const filteredTOs = trainOperatorsOnly.filter(emp => {
    const canonicalName = emp.name || '';
    const matchesSearch = canonicalName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          String(emp.empId).includes(searchQuery);

    let matchesFilter = true;
    const isWilling = emp.ccWilling || emp.specialProfile === 'CC_WILLING';
    if (filterWilling === 'WILLING') matchesFilter = isWilling;
    if (filterWilling === 'LINE_ONLY') matchesFilter = !isWilling;

    return matchesSearch && matchesFilter;
  });

  const handleToggleCCWilling = (empId, currentStatus) => {
    const newStatus = !currentStatus;
    onUpdateCrewStatus(empId, {
      ccWilling: newStatus,
      specialProfile: newStatus ? 'CC_WILLING' : 'NORMAL'
    });
  };

  const handleOpenEdit = (staff) => {
    setEditingStaff(staff);
    setEditEmpId(String(staff.empId || staff.employeeId || ''));
    setEditName(staff.name || getCanonicalStaffName(staff) || '');
    setEditGender(staff.gender || 'MALE');
    setEditFixedWo(staff.fixedWo || 'Sunday');
    setEditRoleDisplay(staff.roleDisplay || staff.designation || 'Train Operator (BMRCL Regular)');
    setEditCcWilling(Boolean(staff.ccWilling || staff.specialProfile === 'CC_WILLING'));
    setEditPhone(staff.phone || staff.mobileNumber || '');
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingStaff) return;
    if (!editEmpId || !editName.trim()) {
      alert('Please enter a valid Employee ID and Staff Name.');
      return;
    }

    const numericNewId = parseInt(editEmpId, 10) || editEmpId;
    const oldId = editingStaff.empId;

    const updatedData = {
      ...editingStaff,
      empId: numericNewId,
      employeeId: String(numericNewId),
      name: editName.trim(),
      employeeName: editName.trim(),
      gender: editGender,
      fixedWo: editFixedWo,
      weeklyOffDay: editFixedWo,
      designation: editRoleDisplay,
      roleDisplay: editRoleDisplay,
      ccWilling: editCcWilling,
      specialProfile: editCcWilling ? 'CC_WILLING' : (editGender === 'FEMALE' ? 'PINK' : 'NORMAL'),
      pinkDutyEligible: editGender === 'FEMALE' || editingStaff.specialProfile === 'PINK',
      phone: editPhone,
      mobileNumber: editPhone
    };

    if (onModifyCrewMember) {
      onModifyCrewMember(oldId, updatedData);
    } else {
      onUpdateCrewStatus(oldId, updatedData);
    }

    setEditingStaff(null);
  };

  const handleConfirmDelete = (e) => {
    e.preventDefault();
    if (!deletingStaff) return;

    const targetEmpId = deletingStaff.empId;
    if (onDeleteCrewMember) {
      onDeleteCrewMember(targetEmpId);
    } else {
      onUpdateCrewStatus(targetEmpId, {
        status: 'RELIEVED',
        activeCrew: false,
        isRelieved: true,
        isDeleted: true,
        relievedReason: 'Deleted / Removed from PYID CC Registry'
      });
    }

    setDeletingStaff(null);
  };

  const handleConfirmRelieveInstead = () => {
    if (!deletingStaff) return;
    const targetEmpId = deletingStaff.empId;
    onUpdateCrewStatus(targetEmpId, {
      status: 'RELIEVED',
      activeCrew: false,
      isRelieved: true,
      relievedReason: relieveReason,
      relievedDate: new Date().toISOString().split('T')[0]
    });
    setDeletingStaff(null);
  };

  const handleSaveAddEmployee = (e) => {
    e.preventDefault();
    if (!newEmpId || !newName.trim()) {
      alert('Please provide a valid Employee ID and Staff Name.');
      return;
    }

    const numericId = parseInt(newEmpId, 10) || newEmpId;
    const newMember = {
      empId: numericId,
      employeeId: String(numericId),
      name: newName.trim(),
      employeeName: newName.trim(),
      gender: newGender,
      fixedWo: newFixedWo,
      weeklyOffDay: newFixedWo,
      roleDisplay: newRole,
      designation: newRole,
      role: 'TRAIN_OPERATOR',
      status: 'ACTIVE',
      activeCrew: true,
      isRelieved: false,
      isOfficialCC: false,
      canDriveTrain: true,
      ccWilling: newCcWilling,
      specialProfile: newCcWilling ? 'CC_WILLING' : (newGender === 'FEMALE' ? 'PINK' : 'NORMAL'),
      pinkDutyEligible: newGender === 'FEMALE',
      boardingStation: 'PYID',
      travellingBy: 'Train',
      competency: 'TRAIN_OPERATOR_MAINLINE',
      competencyValidUntil: '2028-12-31'
    };

    if (onAddNewCrewMember) {
      onAddNewCrewMember(newMember);
    } else if (onModifyCrewMember) {
      onModifyCrewMember(numericId, newMember);
    } else {
      onUpdateCrewStatus(numericId, newMember);
    }

    setNewEmpId('');
    setNewName('');
    setNewGender('MALE');
    setNewFixedWo('Sunday');
    setNewRole('Train Operator (BMRCL Regular)');
    setNewCcWilling(false);
    setIsAddModalOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-5xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-2xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                Official Crew Controllers &amp; CC-Willing Relief Pool Desk
              </h2>
              <p className="text-xs text-slate-400">
                Official CCs are strictly dedicated to CC desk. Select CC-Willing Train Operators below to provide automated relief when official CCs take leave. Modify staff name, Emp ID, or delete records as needed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              + Add Employee
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Official Crew Controllers Fixed Banner */}
        <div className="p-4 bg-indigo-950/20 border-b border-indigo-500/30 space-y-3">
          {/* Section 1: Dedicated 3 CC Desk Staff */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-400" />
              Dedicated Official CCs (Permanent CC1, CC2, CC3 Driving Control)
            </span>
            <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-bold">
              3 Official CCs
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {officialCCs.map(cc => (
              <div key={cc.empId} className="p-3 bg-slate-950 border border-indigo-500/40 rounded-2xl flex items-center justify-between shadow-sm group">
                <div>
                  <div className="flex items-center gap-1.5">
                    <strong className="text-white text-xs">{cc.name}</strong>
                    <span className="text-[10px] text-indigo-400 font-mono font-bold">#{cc.empId}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Role: <strong className="text-indigo-300">{cc.role}</strong> (WO: {cc.fixedWo})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded-lg text-[10px] font-bold font-mono">
                    {cc.desk}
                  </span>
                  <button
                    onClick={() => handleOpenEdit(cc)}
                    className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                    title="Modify Official CC details (Name, Emp ID, WO)"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Section 2: Dedicated 4 ALS & GCC Staff (Non-CC Desk) */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-indigo-500/20">
            <span className="font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-purple-400" />
              Official ALS &amp; GCC Supervisory Staff (Non-CC Desk, Non-Mainline Driving)
            </span>
            <span className="text-[10px] font-mono bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">
              4 Supervisory Staff
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {supervisoryStaff.map(staff => (
              <div key={staff.empId} className="p-3 bg-slate-950 border border-purple-500/40 rounded-2xl flex items-center justify-between shadow-sm group">
                <div>
                  <div className="flex items-center gap-1.5">
                    <strong className="text-white text-xs">{staff.name}</strong>
                    <span className="text-[10px] text-purple-400 font-mono font-bold">#{staff.empId}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Role: <strong className="text-purple-300">{staff.role}</strong> (WO: {staff.fixedWo})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded-lg text-[10px] font-bold font-mono">
                    {staff.desk}
                  </span>
                  <button
                    onClick={() => handleOpenEdit(staff)}
                    className="p-1 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded transition-colors"
                    title="Modify Supervisory Staff details"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-4 bg-slate-950/30 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Operator Name or Emp ID..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {[
              { id: 'ALL', label: `All Train Operators (${trainOperatorsOnly.length})` },
              { id: 'WILLING', label: `CC-Willing Relief Pool (${ccWillingTOs.length})` },
              { id: 'LINE_ONLY', label: `Line Driving Only (${lineOnlyTOs.length})` }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterWilling(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterWilling === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Crew Table List — Train Operators Only */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3">Emp ID</th>
                <th className="px-4 py-3">Train Operator Name</th>
                <th className="px-4 py-3">Role / Track</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3">Fixed WO</th>
                <th className="px-4 py-3">CC Relief Status</th>
                <th className="px-4 py-3 text-right">Actions (CC Willing, Edit, Delete)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredTOs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    No train operators match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredTOs.map(emp => {
                  const isWilling = emp.ccWilling || emp.specialProfile === 'CC_WILLING';
                  const staffName = emp.name;

                  return (
                    <tr key={emp.empId} className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-white">
                        #{emp.empId}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-100 flex items-center gap-1.5">
                          {staffName}
                          {isWilling && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                              ✓ CC-Willing
                            </span>
                          )}
                          {emp.specialProfile === 'PINK' && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-pink-500/20 text-pink-300 rounded border border-pink-500/30">
                              🌸 Pink
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {emp.roleDisplay}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${emp.gender === 'FEMALE' ? 'bg-pink-500/20 text-pink-300' : 'bg-blue-500/20 text-blue-300'}`}>
                          {emp.gender || 'MALE'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-400 font-semibold">
                        {emp.fixedWo || 'Sunday'}
                      </td>
                      <td className="px-4 py-3">
                        {isWilling ? (
                          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3 h-3" /> CC-Willing Relief
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] font-bold">
                            Line Driving Only
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleCCWilling(emp.empId, isWilling)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 ${
                              isWilling 
                                ? 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30' 
                                : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30'
                            }`}
                            title={isWilling ? "Remove from CC-Willing Pool" : "Add to CC-Willing Pool"}
                          >
                            {isWilling ? (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                Remove CC-Willing
                              </>
                            ) : (
                              <>
                                <UserPlus className="w-3.5 h-3.5" />
                                Make CC-Willing
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-slate-700 rounded-lg text-xs font-bold transition-all"
                            title="Modify Employee Name or Emp ID"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setDeletingStaff(emp);
                              setRelieveReason('Working as Station Controller / Transferred from PYID CC');
                            }}
                            className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold transition-all"
                            title="Delete or Relieve Employee"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <div>
            Designated CC-Willing Train Operators are automatically selected to relieve official CCs on leave/rest.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all"
          >
            Done &amp; Apply
          </button>
        </div>
      </div>

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-blue-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit className="w-4 h-4 text-blue-400" />
                Modify Staff Record
              </h3>
              <button
                onClick={() => setEditingStaff(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Employee ID (Emp ID) *
                </label>
                <input
                  type="text"
                  value={editEmpId}
                  onChange={(e) => setEditEmpId(e.target.value)}
                  placeholder="e.g. 20726"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Staff / Operator Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. Nagesh N"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Gender
                  </label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="MALE">MALE</option>
                    <option value="FEMALE">FEMALE</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Fixed Weekly Off (WO)
                  </label>
                  <select
                    value={editFixedWo}
                    onChange={(e) => setEditFixedWo(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Sunday">Sunday</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Role / Track / Designation
                </label>
                <input
                  type="text"
                  value={editRoleDisplay}
                  onChange={(e) => setEditRoleDisplay(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Contact Phone Number (Optional)
                </label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">CC-Willing Relief Pool</span>
                  <span className="text-[10px] text-slate-400">Available to provide relief on CC Desk</span>
                </div>
                <input
                  type="checkbox"
                  checked={editCcWilling}
                  onChange={(e) => setEditCcWilling(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save &amp; Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete / Relieve Confirmation Modal */}
      {deletingStaff && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl w-full max-w-lg shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                Remove / Relieve Staff: {deletingStaff.name} (#{deletingStaff.empId})
              </h3>
              <button
                onClick={() => setDeletingStaff(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div className="p-3 bg-rose-950/40 border border-rose-500/30 rounded-xl text-rose-200">
                You can either permanently delete this staff member (if it was an unwanted/mistaken record) or relieve them to the Station Controller / Transferred console.
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Relieve Reason (if relieving to SC)
                </label>
                <select
                  value={relieveReason}
                  onChange={(e) => setRelieveReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="Working as Station Controller / Transferred from PYID CC">Working as Station Controller / Transferred from PYID CC</option>
                  <option value="Transferred to Line 1 / Baiyappanahalli">Transferred to Line 1 / Baiyappanahalli</option>
                  <option value="Transferred to OCC / GCC Desk">Transferred to OCC / GCC Desk</option>
                  <option value="Promoted to Station Superintendent / Supervisor">Promoted to Station Superintendent / Supervisor</option>
                  <option value="Mistaken / Erroneous Data Record">Mistaken / Erroneous Data Record</option>
                </select>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeletingStaff(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleConfirmRelieveInstead}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-md flex items-center justify-center gap-1"
                >
                  <UserX className="w-3.5 h-3.5" />
                  Relieve to SC Console
                </button>

                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Permanently Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add New Staff Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl w-full max-w-md shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                Add New Staff Member
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAddEmployee} className="space-y-4 mt-4 text-xs">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Employee ID (Emp ID) *
                </label>
                <input
                  type="text"
                  value={newEmpId}
                  onChange={(e) => setNewEmpId(e.target.value)}
                  placeholder="e.g. 20999 or 80999"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Staff / Operator Name *
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Anand Kumar"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  required
                />
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
                    <option value="FEMALE">FEMALE</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Fixed Weekly Off (WO)
                  </label>
                  <select
                    value={newFixedWo}
                    onChange={(e) => setNewFixedWo(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="Sunday">Sunday</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Role / Track
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="Train Operator (BMRCL Regular)">Train Operator (BMRCL Regular)</option>
                  <option value="Train Driver (JMD Contract)">Train Driver (JMD Contract)</option>
                  <option value="Official CC">Official CC</option>
                </select>
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">CC-Willing Relief Pool</span>
                  <span className="text-[10px] text-slate-400">Available to provide relief on CC Desk</span>
                </div>
                <input
                  type="checkbox"
                  checked={newCcWilling}
                  onChange={(e) => setNewCcWilling(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
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
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add to Desk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

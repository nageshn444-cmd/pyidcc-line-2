import React, { useState } from 'react';
import { 
  UserPlus, ShieldAlert, CheckCircle2, AlertTriangle, X, 
  Clock, Compass, Calendar, Search, Sparkles, Check, Info,
  Building2
} from 'lucide-react';

export default function NewStaffLRDModal({
  isOpen,
  onClose,
  crewList,
  onAddNewStaff,
  onUpdateStaffLRD
}) {
  const [activeTab, setActiveTab] = useState('NEW_STAFF');

  // New Staff Form State
  const [empId,               setEmpId]               = useState('');
  const [name,                setName]                = useState('');
  const [gender,              setGender]              = useState('MALE');
  const [fixedWo,             setFixedWo]             = useState('Sunday');
  const [absenceDuration,     setAbsenceDuration]     = useState('UP_TO_3_MONTHS');
  const [notes,               setNotes]               = useState('');
  const [controllerSignature, setControllerSignature] = useState('Crew Controller (CC-1)');
  // NEW: Reported to PYID CC gate
  const [reportedToPYID,      setReportedToPYID]      = useState(false);
  const [reportDate,          setReportDate]          = useState(new Date().toISOString().split('T')[0]);
  // NEW: Success toast
  const [successToast,        setSuccessToast]        = useState(null);

  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen) return null;

  const staffWithLRD = crewList.filter(e => e.lrd && e.lrd.required && e.lrd.daysCompleted < e.lrd.daysRequired);

  const handleCreateNewStaff = (e) => {
    e.preventDefault();
    if (!reportedToPYID) return; // Guard: must confirm reporting
    const idNum = parseInt(empId, 10);
    if (!idNum || !name) return;

    let lrdDaysRequired = 0;
    let lrdReason = 'Direct Induction';

    if (absenceDuration === 'UP_TO_3_MONTHS') {
      lrdDaysRequired = 1;
      lrdReason = 'Absent / Not available up to 3 months (1-day LRD mandatory)';
    } else if (absenceDuration === 'SIX_MONTHS_OR_MORE') {
      lrdDaysRequired = 3;
      lrdReason = 'Absent / Not available 6 months or more (3-day LRD mandatory)';
    }

    const newOperator = {
      empId: idNum,
      name: name.trim(),
      gender,
      fixedWo,
      specialProfile: lrdDaysRequired > 0 ? 'LRD' : 'NORMAL',
      pinkDutyEligible: gender === 'FEMALE',
      nightTarget: gender === 'FEMALE' ? 5 : 6,
      boardingStation: 'PYID',
      travellingBy: 'Train',
      homeLocation: '',
      status: 'ACTIVE',
      competency: 'TRAIN_OPERATOR_MAINLINE',
      competencyValidUntil: '2027-12-31',
      activeCrew: true,
      isRelieved: false,
      notes: notes || `Inducted by ${controllerSignature} — Reported to PYID CC on ${reportDate}`,
      reportedToPYIDCC: true,
      reportedDate: reportDate,
      lrd: {
        required: lrdDaysRequired > 0,
        daysRequired: lrdDaysRequired,
        daysCompleted: 0,
        reason: lrdReason,
        confirmedByUser: true,
        authorizedBy: controllerSignature,
        authorizedDate: reportDate
      },
      maternityLeave: null
    };

    onAddNewStaff(newOperator);

    // Show success toast
    setSuccessToast({
      empName: name.trim(),
      empId: idNum,
      lrdDays: lrdDaysRequired,
      reportDate
    });
    setTimeout(() => setSuccessToast(null), 5000);

    // Reset Form
    setEmpId('');
    setName('');
    setNotes('');
    setReportedToPYID(false);
    setReportDate(new Date().toISOString().split('T')[0]);
    setAbsenceDuration('UP_TO_3_MONTHS');
    setActiveTab('LRD_MANAGER');
  };

  const handleMarkLRDDayCompleted = (emp) => {
    const nextCompleted = (emp.lrd?.daysCompleted || 0) + 1;
    const isFullyComplete = nextCompleted >= (emp.lrd?.daysRequired || 1);

    onUpdateStaffLRD(emp.empId, {
      specialProfile: isFullyComplete ? 'NORMAL' : 'LRD',
      lrd: {
        ...emp.lrd,
        daysCompleted: nextCompleted,
        required: !isFullyComplete,
        completionDate: isFullyComplete ? new Date().toISOString().split('T')[0] : null
      }
    });
  };

  const handleAuthorizeDirectDeploy = (emp) => {
    onUpdateStaffLRD(emp.empId, {
      specialProfile: 'NORMAL',
      lrd: {
        ...emp.lrd,
        required: false,
        daysCompleted: emp.lrd?.daysRequired || 1,
        confirmedByUser: true,
        authorizedBy: controllerSignature,
        directDeployApproved: true
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden text-slate-100 font-sans">
        
        {/* ── SUCCESS TOAST ── */}
        {successToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4">
            <div className="bg-emerald-900/90 border border-emerald-500/60 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start gap-3 animate-fadeIn">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-black text-emerald-300">
                  ✅ {successToast.empName} (#{successToast.empId}) added to PYID CC Active Crew!
                </p>
                <p className="text-xs text-emerald-200/80 mt-0.5">
                  Reported on {successToast.reportDate}.
                  {successToast.lrdDays > 0
                    ? ` Mandatory LRD: ${successToast.lrdDays} day(s) — auto-assigned to LRD slot.`
                    : ' Direct Line Ready — no LRD required.'}
                </p>
              </div>
              <button onClick={() => setSuccessToast(null)} className="ml-auto text-emerald-400 hover:text-white shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-2xl">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                New Staff Induction & LRD (Learning Road Duty) Safety Gate
              </h2>
              <p className="text-xs text-slate-400">
                Mandatory confirmation before deploying new/returning operators (1-day LRD for ≤3mo absence, 3-day LRD for ≥6mo absence).
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-3 px-6 py-3 bg-slate-950/50 border-b border-slate-800">
          <button
            onClick={() => setActiveTab('NEW_STAFF')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'NEW_STAFF' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            + Induct New Train Operator
          </button>

          <button
            onClick={() => setActiveTab('LRD_MANAGER')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'LRD_MANAGER' ? 'bg-amber-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            Pending LRD Deployments ({staffWithLRD.length})
          </button>
        </div>

        {/* Tab 1: Induct New Staff */}
        {activeTab === 'NEW_STAFF' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="p-3.5 bg-amber-950/30 border border-amber-500/30 rounded-2xl text-xs text-amber-200 space-y-1">
              <strong className="flex items-center gap-1.5 font-black text-amber-300">
                <Info className="w-4 h-4" /> BMRCL LRD Operational Safety Rule:
              </strong>
              <p className="text-[11px] text-slate-300">
                Every operator not available in crew up to <strong>3 months</strong> must complete <strong>1 day of LRD</strong> (Learning Road Duty: 07:00–15:00 at PYID). Operators absent for <strong>6 months or more</strong> must complete <strong>3 days of LRD</strong> before regular passenger driving duties.
              </p>
            </div>

            <form onSubmit={handleCreateNewStaff} className="space-y-4 font-sans text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Employee ID (Emp No)
                  </label>
                  <input
                    type="number"
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    required
                    placeholder="e.g. 22601 or 88000150"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Full Name (Train Operator)
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Ramesh Kumar K"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    <option value="MALE">Male (Night Target: 6)</option>
                    <option value="FEMALE">Female (Night Target: 5, Pink Duty Eligible)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Assigned Week-Off Day
                  </label>
                  <select
                    value={fixedWo}
                    onChange={(e) => setFixedWo(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  >
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-amber-300 block mb-1">
                  Absence / Availability Period (Determines Mandatory LRD Days)
                </label>
                <select
                  value={absenceDuration}
                  onChange={(e) => setAbsenceDuration(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-500/50 rounded-xl px-3 py-2 text-xs text-amber-200 font-bold"
                >
                  <option value="NONE">Active / Direct Line Ready (0 LRD Days Required)</option>
                  <option value="UP_TO_3_MONTHS">Absent / Not available up to 3 Months → 1 Day LRD Required</option>
                  <option value="SIX_MONTHS_OR_MORE">Absent / Not available 6 Months or More → 3 Days LRD Required</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Authorizing Crew Controller Signature
                  </label>
                  <input
                    type="text"
                    value={controllerSignature}
                    onChange={(e) => setControllerSignature(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Induction Remarks / Depot Order Ref
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Returned from medical leave / transfer from Line 1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* ── PYID CC Reporting Gate (mandatory) ── */}
              <div className="p-4 bg-slate-950/60 border border-emerald-500/40 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-emerald-300 uppercase tracking-wide">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  PYID CC Reporting Confirmation (Mandatory)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-300 block mb-1">Date of Reporting to PYID CC</label>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={e => setReportDate(e.target.value)}
                      className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className={`flex items-center gap-2.5 cursor-pointer p-3 rounded-xl border w-full transition-all ${
                      reportedToPYID
                        ? 'bg-emerald-900/30 border-emerald-500/60'
                        : 'bg-slate-950 border-slate-700 hover:border-emerald-500/40'
                    }`}>
                      <input
                        type="checkbox"
                        checked={reportedToPYID}
                        onChange={e => setReportedToPYID(e.target.checked)}
                        className="w-4 h-4 accent-emerald-500 shrink-0"
                      />
                      <span className={`text-xs font-bold leading-snug ${
                        reportedToPYID ? 'text-emerald-300' : 'text-slate-400'
                      }`}>
                        ✅ Confirmed — Operator has physically reported to PYID CC and is ready for crew induction
                      </span>
                    </label>
                  </div>
                </div>

                {!reportedToPYID && (
                  <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    You must confirm PYID CC reporting before inducting this operator into the active crew.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!reportedToPYID}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all"
                >
                  <UserPlus className="w-4 h-4" />
                  Induct &amp; Authorize Staff to PYID CC
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 2: LRD Manager & Tracker */}
        {activeTab === 'LRD_MANAGER' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-400" />
                Train Operators with Mandatory LRD Refresher Status
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                Auto-assigned to LRD (07:00–15:00 at PYID)
              </span>
            </div>

            {staffWithLRD.length === 0 ? (
              <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-white">All Active Crew LRD Requirements Completed</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Zero operators currently pending LRD refresher duties. All active staff are certified for regular passenger train driving.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {staffWithLRD.map(emp => {
                  const required = emp.lrd?.daysRequired || 1;
                  const completed = emp.lrd?.daysCompleted || 0;
                  const remaining = required - completed;

                  return (
                    <div key={emp.empId} className="p-4 bg-slate-950 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">#{emp.empId}</span>
                          <strong className="text-slate-100 text-sm">{emp.name}</strong>
                          <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-bold">
                            LRD Refresher: {completed} / {required} Days
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Reason: <span className="text-amber-300 font-medium">{emp.lrd?.reason || 'Absence refresher requirement'}</span>
                        </p>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Assigned Duty: <strong>LRD (07:00–15:00 at PYID)</strong> • Remaining: {remaining} day(s)
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleMarkLRDDayCompleted(emp)}
                          className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Record 1 LRD day completed"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Complete Day ({completed + 1}/{required})
                        </button>

                        <button
                          onClick={() => handleAuthorizeDirectDeploy(emp)}
                          className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                          title="Controller override to clear LRD and deploy on regular duty"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Authorize Regular Duty
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <div>
            Operators with pending LRD are automatically allocated to <strong>LRD (07:00–15:00 at PYID)</strong>.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg transition-all"
          >
            Done & Apply
          </button>
        </div>
      </div>
    </div>
  );
}

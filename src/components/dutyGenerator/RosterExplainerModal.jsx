import React from 'react';
import { X, CheckCircle2, AlertTriangle, ShieldCheck, Clock, Moon, Sparkles, User, Award } from 'lucide-react';
import { formatTo24HourTime } from '../../utils/timeHelpers';

export default function RosterExplainerModal({
  isOpen,
  onClose,
  employee,
  assignment,
  explanation
}) {
  if (!isOpen || !employee || !assignment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-100 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Assignment Transparency Explainer
              </h3>
              <p className="text-xs text-slate-400">
                Decision rationale for {employee.name} ({employee.empId})
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

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Duty Pill Card */}
          <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Assigned Duty</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xl font-black text-emerald-400 font-mono">
                  {assignment.assignedDutyCode || 'WO'}
                </span>
                <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 font-bold rounded-md">
                  {assignment.shift} Shift
                </span>
                {assignment.specialTag === 'PINK_DUTY' && (
                  <span className="text-xs px-2 py-0.5 bg-pink-500/20 text-pink-300 border border-pink-500/30 font-bold rounded-md flex items-center gap-1">
                    🌸 Pink Duty
                  </span>
                )}
              </div>
            </div>

            <div className="text-right font-mono">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Timing & Location</span>
              <span className="text-xs text-slate-200 block font-semibold">
                {assignment.sOnTime} → {formatTo24HourTime(assignment.sOffTime, assignment.sOnTime, assignment.shift)}
              </span>
              <span className="text-[11px] text-slate-400 block">
                {assignment.sOnLoc} ({assignment.kms || 0} kms)
              </span>
            </div>
          </div>

          {/* Rationale Points */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Verified Constraints & AI Recommendation
            </h4>

            <div className="space-y-2">
              {explanation?.points?.map((pt, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-800/40 border border-slate-750 text-xs text-slate-200"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span>{pt}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Profile Summary */}
          <div className="grid grid-cols-3 gap-3 pt-2 text-center text-xs">
            <div className="p-2.5 bg-slate-950/50 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Fixed WO</span>
              <span className="font-bold text-slate-200">{employee.fixedWo || 'Sunday'}</span>
            </div>
            <div className="p-2.5 bg-slate-950/50 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Night Target</span>
              <span className="font-bold text-slate-200">{employee.nightTarget || 6} Nights</span>
            </div>
            <div className="p-2.5 bg-slate-950/50 rounded-lg border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-semibold">Boarding Stn</span>
              <span className="font-bold text-slate-200">{employee.boardingStation || 'PYID'}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/70 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all"
          >
            Close Explainer
          </button>
        </div>
      </div>
    </div>
  );
}

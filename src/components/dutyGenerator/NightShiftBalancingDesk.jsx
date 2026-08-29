import React, { useState } from 'react';
import { Moon, ShieldCheck, AlertTriangle, ArrowRightLeft, Users, CheckCircle2, Clock, Calendar, Search } from 'lucide-react';
import { EMPLOYEE_MASTER_REGISTRY } from '../../data/employeeProfileMaster';
import { HISTORICAL_ROSTER_INTELLIGENCE } from '../../data/historicalRosterIntelligence';
import { validateMutualShiftExchange } from '../../services/dutyConstraintEngine';

export default function NightShiftBalancingDesk({
  targetDate,
  crewList = EMPLOYEE_MASTER_REGISTRY
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGender, setFilterGender] = useState('ALL');
  const [nightRecurrenceGap, setNightRecurrenceGap] = useState(26);

  // Exchange Test State
  const [opAId, setOpAId] = useState('');
  const [opBId, setOpBId] = useState('');
  const [exchangeValidation, setExchangeValidation] = useState(null);

  const activeTOs = crewList.filter(e => (e.status === 'ACTIVE' || e.status === 'MATERNITY_LEAVE' || (e.maternityLeave && e.maternityLeave.active)) && !e.isRelieved && e.activeCrew !== false);

  const femaleCount = activeTOs.filter(e => e.gender === 'FEMALE').length;
  const maleCount = activeTOs.filter(e => e.gender === 'MALE').length;

  const operatorsWithStats = activeTOs.map(emp => {
    const hist = HISTORICAL_ROSTER_INTELLIGENCE[emp.empId] || { nightCount: 0, lastNightDate: null, lastNightDuty: null };
    const maxNights = emp.nightTarget || 6;
    const remainingNights = Math.max(0, maxNights - (hist.nightCount || 0));
    
    // Calculate days since last night
    let daysSinceLastNight = 999;
    if (hist.lastNightDate) {
      const diff = Math.abs(new Date(targetDate) - new Date(hist.lastNightDate));
      daysSinceLastNight = Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    const isRecurrenceSafe = daysSinceLastNight >= nightRecurrenceGap;
    const isEligible = remainingNights > 0 && isRecurrenceSafe && emp.specialProfile !== 'PINK';

    return {
      ...emp,
      nightCount: hist.nightCount || 0,
      maxNights,
      remainingNights,
      lastNightDate: hist.lastNightDate,
      lastNightDuty: hist.lastNightDuty,
      daysSinceLastNight,
      isRecurrenceSafe,
      isEligible
    };
  });

  const filteredOperators = operatorsWithStats.filter(op => {
    const matchSearch = op.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(op.empId).includes(searchQuery);
    const matchGender = filterGender === 'ALL' || op.gender === filterGender;
    return matchSearch && matchGender;
  });

  const handleTestExchange = () => {
    const opA = crewList.find(e => e.empId === parseInt(opAId, 10));
    const opB = crewList.find(e => e.empId === parseInt(opBId, 10));

    if (!opA || !opB) return;

    const result = validateMutualShiftExchange({
      operatorA: opA,
      operatorB: opB,
      dutyA: { dutyCode: 'A24', shift: 'A', sOnTime: '06:00', sOffTime: '14:00', isNight: false },
      dutyB: { dutyCode: 'N69Bi', shift: 'N', sOnTime: '21:30', sOffTime: '05:45', isNight: true },
      targetDate,
      dayOfWeek: 'Wednesday',
      prevDutyA: null,
      prevDutyB: null,
      historyA: HISTORICAL_ROSTER_INTELLIGENCE[opA.empId],
      historyB: HISTORICAL_ROSTER_INTELLIGENCE[opB.empId]
    });

    setExchangeValidation(result);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <Moon className="w-3.5 h-3.5" /> 26-Day Recurrence &amp; Quota Balancer
            </span>
            <span className="text-xs text-slate-400">
              Women: <strong>{femaleCount}</strong> (Max 6) • Men: <strong>{maleCount}</strong> (Max 6)
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">Night Shift Balancing &amp; Recurrence Desk</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Strictly balances monthly night quotas and enforces the 26-day night gap rule across all train operators.
          </p>
        </div>

        {/* Recurrence Gap Setting */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Night Gap Rule</span>
            <span className="text-xs text-slate-200 font-semibold">{nightRecurrenceGap} Days Minimum</span>
          </div>
          <input
            type="range"
            min="14"
            max="30"
            value={nightRecurrenceGap}
            onChange={(e) => setNightRecurrenceGap(parseInt(e.target.value, 10))}
            className="w-24 accent-indigo-500"
          />
        </div>
      </div>

      {/* Exchange Validator Card */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
          Interactive Night Duty Exchange Pre-Validator (8-Hour Rest Compliance)
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Test if Operator A and Operator B can legally swap night/day duties without violating 8-hour rest, WO locks, or quotas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">Operator A (Day Duty)</label>
            <select
              value={opAId}
              onChange={(e) => setOpAId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="">-- Select Operator A --</option>
              {crewList.map(e => (
                <option key={e.empId} value={e.empId}>{e.name} ({e.empId})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-300 font-bold block mb-1">Operator B (Night Duty)</label>
            <select
              value={opBId}
              onChange={(e) => setOpBId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
            >
              <option value="">-- Select Operator B --</option>
              {crewList.map(e => (
                <option key={e.empId} value={e.empId}>{e.name} ({e.empId})</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleTestExchange}
              disabled={!opAId || !opBId}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg transition-all"
            >
              Validate Mutual Swap
            </button>
          </div>
        </div>

        {/* Validation Output */}
        {exchangeValidation && (
          <div className={`mt-4 p-4 rounded-xl border ${exchangeValidation.allowed ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/20 border-rose-500/40 text-rose-300'}`}>
            <div className="flex items-center gap-2 font-bold text-xs">
              {exchangeValidation.allowed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  EXCHANGE APPROVED: Both operators satisfy 8-hour rest, competency, and night cycle rules.
                </>
              ) : (
                <>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  EXCHANGE BLOCKED: Violations detected.
                </>
              )}
            </div>

            {exchangeValidation.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs list-disc list-inside text-rose-200">
                {exchangeValidation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Operators Night Status Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search train operators..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-2">
            {['ALL', 'FEMALE', 'MALE'].map(g => (
              <button
                key={g}
                onClick={() => setFilterGender(g)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterGender === g ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-[11px] uppercase tracking-wider text-slate-400 font-bold font-mono">
              <tr>
                <th className="px-4 py-3">Emp ID</th>
                <th className="px-4 py-3">Operator Name</th>
                <th className="px-4 py-3">Gender</th>
                <th className="px-4 py-3">Completed / Target</th>
                <th className="px-4 py-3">Last Night Duty</th>
                <th className="px-4 py-3">Days Since Last Night</th>
                <th className="px-4 py-3">26-Day Status</th>
                <th className="px-4 py-3 text-right">Night Eligibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredOperators.slice(0, 50).map(op => (
                <tr key={op.empId} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono font-bold text-white">{op.empId}</td>
                  <td className="px-4 py-3 font-bold text-slate-100">{op.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${op.gender === 'FEMALE' ? 'bg-pink-500/20 text-pink-300' : 'bg-blue-500/20 text-blue-300'}`}>
                      {op.gender}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full"
                          style={{ width: `${Math.min(100, (op.nightCount / op.maxNights) * 100)}%` }}
                        />
                      </div>
                      <span className="font-bold text-white">{op.nightCount}/{op.maxNights}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {op.lastNightDuty ? `${op.lastNightDuty} (${op.lastNightDate})` : 'None'}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold">
                    {op.daysSinceLastNight > 300 ? '30+ days' : `${op.daysSinceLastNight} days`}
                  </td>
                  <td className="px-4 py-3">
                    {op.isRecurrenceSafe ? (
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> ≥26 Days Safe
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> &lt;26 Days (Cooling)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {op.isEligible ? (
                      <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                        ELIGIBLE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-slate-800 text-slate-500 rounded text-[10px] font-bold">
                        RESTRICTED
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

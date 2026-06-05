import React, { useState } from 'react';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { AlertTriangle } from 'lucide-react';

export default function DelayTracker({ onIncidentLogged }) {
  const [targetTid, setTargetTid] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('');
  const [incidentReason, setIncidentReason] = useState('Signal Fluctuation');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!targetTid || !delayMinutes) return;

    try {
      const incId = `incident_t${targetTid}_${Date.now()}`;
      await setDoc(doc(db, "wtt_live_incidents", incId), {
        trainId: String(targetTid),
        delayMins: parseInt(delayMinutes, 10),
        reason: incidentReason,
        timestamp: serverTimestamp()
      });
      alert(`Variance of +${delayMinutes} mins logged for Train ${targetTid}.`);
      setTargetTid(''); setDelayMinutes('');
      if (onIncidentLogged) onIncidentLogged();
    } catch (err) { console.error("Logger error:", err); }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center gap-2 text-amber-500 font-mono text-xs font-bold border-b border-slate-800 pb-2 mb-3">
        <AlertTriangle className="h-4 w-4 animate-pulse" /> LIVE INCIDENT LOG
      </div>
      <form onSubmit={handleSubmit} className="space-y-3 font-mono text-xs">
        <div>
          <label className="block text-slate-400 mb-1">Target Train ID</label>
          <input type="text" value={targetTid} onChange={(e) => setTargetTid(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500" />
        </div>
        <div>
          <label className="block text-slate-400 mb-1">Delay (Minutes)</label>
          <input type="number" value={delayMinutes} onChange={(e) => setDelayMinutes(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-slate-200 focus:outline-none focus:border-amber-500" />
        </div>
        <button type="submit" className="w-full bg-amber-600 text-slate-950 font-black py-2 rounded uppercase text-[11px] hover:bg-amber-500 transition">LOG DELAY</button>
      </form>
    </div>
  );
}
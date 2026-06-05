import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { AlertTriangle, ShieldAlert, CheckCircle2, Train, Users, RefreshCw } from 'lucide-react';

export default function RosterIntegrity() {
  const [activeDay, setActiveDay] = useState('WEEKDAY');
  const [warnings, setWarnings] = useState([]);
  const [manningStats, setManningStats] = useState({ totalTrains: 0, unmannedTrains: 0 });
  const [loading, setLoading] = useState(true);

  const dayTabs = [
    { id: 'WEEKDAY', label: 'WEEKDAY SCHEDULE' },
    { id: 'MONDAY', label: 'MONDAY SCHEDULE' },
    { id: 'SATURDAY', label: 'SAT & GH ROSTER' },
    { id: 'SUNDAY', label: 'SUNDAY SCHEDULE' }
  ];

  const timeToSeconds = (timeStr) => {
    if (!timeStr || typeof timeStr !== 'string' || timeStr === '--' || timeStr === '-') return 999999;
    const parts = timeStr.split(':');
    let secs = 0;
    if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
    if (parts[1]) secs += parseInt(parts[1], 10) * 60;
    if (parts[2]) secs += parseInt(parts[2], 10);
    return secs;
  };

  const runIntegrityAudit = async () => {
    try {
      setLoading(true);
      const [wttSnapshot, linksSnapshot, deploySnapshot] = await Promise.all([
        getDocs(collection(db, "wtt_final_matrix")),
        getDocs(collection(db, "crew_final_links")),
        getDocs(collection(db, "crew_daily_deployment"))
      ]);

      const wttData = wttSnapshot.docs.map(doc => doc.data());
      const linksData = linksSnapshot.docs.map(doc => doc.data());
      const deployData = deploySnapshot.docs.map(doc => doc.data());

      // Filter based on active schedule selection
      const activeWtt = wttData.filter(t => String(t.scheduleType || '').toUpperCase() === activeDay);
      const activeLinks = linksData.filter(l => String(l.scheduleType || '').toUpperCase() === activeDay);

      let validationAlerts = [];
      let trainTimelineMap = {};
      let operatorTimeBlocks = {};

      // Build active deployments profile
      const activeDeployments = activeLinks.map(link => {
        const matchingGcc = deployData.find(d => String(d.dutyId) === String(link.dutyId) && String(d.scheduleType).toUpperCase() === activeDay);
        return {
          dutyId: link.dutyId,
          empId: matchingGcc ? matchingGcc.empId : '--',
          empName: matchingGcc ? matchingGcc.empName : '--',
          legs: [
            { tid: link.trainId, start: link.signOnTime, end: link.leg2ArrTime, label: 'Leg 1' },
            { tid: link.leg2TrainNo, start: link.leg2DepTime, end: link.leg3HandoverTime, label: 'Leg 2' },
            { tid: link.leg3TrainNo, start: link.leg3TakeoverTime, end: link.leg4FinalArrTime, label: 'Leg 3' },
            { tid: link.leg4TrainNo, start: link.leg4FinalArrTime, end: link.signOffTime, label: 'Leg 4' }
          ]
        };
      });

      // Audit loops
      activeDeployments.forEach(item => {
        if (item.empId === '--' || item.empId === 'Pending GCC Load') return;
        if (!operatorTimeBlocks[item.empId]) operatorTimeBlocks[item.empId] = [];

        item.legs.forEach(leg => {
          if (!leg.tid || leg.tid === '--' || leg.tid === '-') return;
          if (String(leg.tid).includes(':')) return;

          const currentStart = timeToSeconds(leg.start);
          const currentEnd = timeToSeconds(leg.end);

          if (currentStart >= 999999 || currentEnd >= 999999) return;

          // Populate running timeline mapping dynamically
          if (!trainTimelineMap[leg.tid]) trainTimelineMap[leg.tid] = [];
          trainTimelineMap[leg.tid].push({ empName: item.empName, start: currentStart, end: currentEnd });

          // Audit Overlaps
          operatorTimeBlocks[item.empId].forEach(prevLeg => {
            if (currentStart < prevLeg.end && currentEnd > prevLeg.start) {
              validationAlerts.push({
                type: 'CRITICAL CONFLICT',
                details: `Operator ${item.empName} (ID: ${item.empId}) is double-booked on Train ${leg.tid} (${leg.label}) and Train ${prevLeg.trainId} (${prevLeg.label}) simultaneously.`
              });
            }
          });

          operatorTimeBlocks[item.empId].push({ trainId: leg.tid, start: currentStart, end: currentEnd, label: leg.label });
        });
      });

      // Audit for Unmanned WTT lines
      let unmannedCount = 0;
      const ignoredHeaders = ['TID', 'APTS DN', 'APTS UP', 'NLC DN', 'NLC UP', 'PUTH DN', 'PUTH UP', 'SRR DN', 'SRR UP', 'MAD DN', 'MAD UP', 'RESV', 'RESERVE', 'SPARE', 'STANDBY'];
      const uniqueWttTrainIds = [...new Set(activeWtt.map(t => t.trainId).filter(Boolean))];

      uniqueWttTrainIds.forEach(tid => {
        const strTid = String(tid).trim().toUpperCase();
        if (strTid === '--' || strTid === '-' || strTid.includes(':') || ignoredHeaders.includes(strTid)) return;

        const isManned = Object.keys(trainTimelineMap).includes(String(tid));
        if (!isManned) {
          unmannedCount++;
          validationAlerts.push({
            type: 'MANNING GAP',
            details: `Train ID ${tid} is scheduled in the Working Timetable (WTT) matrix but has no rostered operator allocation.`
          });
        }
      });

      setWarnings(validationAlerts);
      setManningStats({
        totalTrains: uniqueWttTrainIds.length,
        unmannedTrains: unmannedCount
      });

    } catch (err) {
      console.error("Integrity validation audit crashed: ", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runIntegrityAudit();
  }, [activeDay]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 font-mono">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Module Title Box */}
        <div className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
          <div>
            <h1 className="text-md font-bold tracking-wider text-slate-200 uppercase flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-500" /> Roster Integrity Verification Desk
            </h1>
            <p className="text-[11px] text-slate-500 mt-1">Independent safety and timing constraint cross-layer evaluation module</p>
          </div>
          <button onClick={runIntegrityAudit} className="bg-slate-950 border border-slate-800 hover:bg-slate-850 p-2 rounded-lg text-slate-400 transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Schedule Select Ribbon */}
        <div className="flex flex-wrap gap-2">
          {dayTabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveDay(tab.id)} className={`px-4 py-2 rounded-lg text-xs border transition-all ${activeDay === tab.id ? 'bg-slate-800 text-cyan-400 border-slate-700 font-bold shadow' : 'bg-slate-900/40 text-slate-500 border-slate-900/60 hover:text-slate-400'}`}>{tab.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-xs py-24 text-slate-600 tracking-widest animate-pulse">PERFORMING SYSTEM INTEGRITY CHECKS...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left Metrics Cards Block */}
            <div className="space-y-4 lg:col-span-1">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1">WTT Asset Coverage</span>
                <span className="text-3xl font-black text-cyan-400">{manningStats.totalTrains - manningStats.unmannedTrains} <span className="text-xs font-normal text-slate-500">/ {manningStats.totalTrains} Manned</span></span>
              </div>
              <div className={`border p-4 rounded-xl shadow-md transition-colors ${manningStats.unmannedTrains > 0 ? 'bg-amber-950/10 border-amber-500/30' : 'bg-slate-900 border-slate-800'}`}>
                <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider mb-1">Manning Gaps Detected</span>
                <span className={`text-3xl font-black ${manningStats.unmannedTrains > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>{manningStats.unmannedTrains}</span>
              </div>
            </div>

            {/* Right Alerts Table Block */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 font-bold text-xs text-slate-300">
                ACTIVE SYSTEM ANOMALY LOGS
              </div>
              <div className="p-4 max-h-[500px] overflow-y-auto space-y-3">
                {warnings.map((warn, index) => (
                  <div key={index} className={`flex items-start gap-3 p-3 rounded-lg border text-xs leading-relaxed ${warn.type.includes('CRITICAL') ? 'bg-rose-950/20 border-rose-500/20 text-rose-300' : 'bg-amber-950/20 border-amber-500/20 text-amber-300'}`}>
                    <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${warn.type.includes('CRITICAL') ? 'text-rose-500' : 'text-amber-500'}`} />
                    <div>
                      <span className="font-black uppercase tracking-wide block mb-1">[{warn.type}]</span>
                      {warn.details}
                    </div>
                  </div>
                ))}
                
                {warnings.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500 space-y-2">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Roster Fully Compliant</span>
                    <p className="text-[10px] max-w-xs text-slate-600">Zero timeline overlaps or unmanned timetabled blocks discovered for this operational shift run.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
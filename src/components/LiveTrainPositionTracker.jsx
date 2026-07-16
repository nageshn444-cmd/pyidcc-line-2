/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { 
  Train, MapPin, Clock, Shield, User, Sliders 
} from 'lucide-react';
import { 
  STATION_CHAINAGE, 
  STATION_ORDER, 
  getTripEndpoints, 
  timeToMinutes, 
  minutesToTime 
} from '../utils/kpiEngine';

export default function LiveTrainPositionTracker() {
  // States
  const [dailyDeployments, setDailyDeployments] = useState([]);
  const [wttMatrix, setWttMatrix] = useState([]);
  const [liveIncidents, setLiveIncidents] = useState([]);
  const [stationChainageDB, setStationChainageDB] = useState({});
  const [simulatedTime, setSimulatedTime] = useState('08:30'); // Simulated Time for Live Map
  const [isLiveClock, setIsLiveClock] = useState(false);
  const [clockIntervalId, setClockIntervalId] = useState(null);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [activeSchedule, setActiveSchedule] = useState(() => {
    const day = new Date().getDay();
    if (day === 0) return 'SUNDAY';
    if (day === 6) return 'SATURDAY';
    return 'WEEKDAY';
  });

  // Real-time Firestore subscriptions
  useEffect(() => {
    const unsubDeploy = onSnapshot(collection(db, 'crew_daily_deployment'), (snap) => {
      setDailyDeployments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubWtt = onSnapshot(collection(db, 'wtt_final_matrix'), (snap) => {
      setWttMatrix(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubIncidents = onSnapshot(collection(db, 'wtt_live_incidents'), (snap) => {
      setLiveIncidents(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubChainage = onSnapshot(collection(db, 'station_chainage'), (snap) => {
      if (!snap.empty) {
        const chainageMap = {};
        snap.docs.forEach(doc => {
          chainageMap[doc.id] = doc.data().chainage;
        });
        setStationChainageDB(chainageMap);
      }
    });

    return () => {
      unsubDeploy();
      unsubWtt();
      unsubIncidents();
      unsubChainage();
    };
  }, []);

  // Simulated / Live Clock Management
  useEffect(() => {
    if (isLiveClock) {
      const interval = setInterval(() => {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        setSimulatedTime(`${hrs}:${mins}`);
      }, 1000);
      setClockIntervalId(interval);
    } else {
      if (clockIntervalId) {
        clearInterval(clockIntervalId);
        setClockIntervalId(null);
      }
    }
    return () => {
      if (clockIntervalId) clearInterval(clockIntervalId);
    };
  }, [isLiveClock]);

  // Position detection logic for active trains moving along Green Line
  const liveTrainPositions = useMemo(() => {
    const timeMins = timeToMinutes(simulatedTime);
    const activeChainages = Object.keys(stationChainageDB).length > 0 ? stationChainageDB : STATION_CHAINAGE;

    // Filter WTT matrix for active day
    const activeTrips = wttMatrix.filter(t => String(t.scheduleType).toUpperCase() === activeSchedule);
    const activeWTTTrains = [...new Set(activeTrips.map(t => String(t.trainId).trim()))];
    const positions = [];

    activeWTTTrains.forEach(tId => {
      const trainTrips = activeTrips.filter(t => String(t.trainId).trim() === tId);
      let activeTrip = null;

      // Find if train has an active trip at this time
      for (let i = 0; i < trainTrips.length; i++) {
        const trip = trainTrips[i];
        const stations = [];
        for (const [st, timeStr] of Object.entries(trip.stations || {})) {
          if (timeStr && timeStr !== '--' && timeStr !== '-') {
            stations.push({ station: st, timeMin: timeToMinutes(timeStr) });
          }
        }
        if (stations.length < 2) continue;
        stations.sort((a, b) => a.timeMin - b.timeMin);

        // Incorporate active live delays
        const matchedDelay = liveIncidents.filter(inc => String(inc.trainId).trim() === tId);
        const delayOffset = matchedDelay.reduce((acc, curr) => acc + (curr.delayMins || 0), 0);

        const tripStart = stations[0].timeMin + delayOffset;
        const tripEnd = stations[stations.length - 1].timeMin + delayOffset;

        if (timeMins >= tripStart && timeMins <= tripEnd) {
          activeTrip = trip;
          break;
        }
      }

      if (activeTrip) {
        const stations = [];
        for (const [st, timeStr] of Object.entries(activeTrip.stations || {})) {
          if (timeStr && timeStr !== '--' && timeStr !== '-') {
            stations.push({ station: st, timeMin: timeToMinutes(timeStr) });
          }
        }
        stations.sort((a, b) => a.timeMin - b.timeMin);

        // Apply delay offsets
        const matchedDelay = liveIncidents.filter(inc => String(inc.trainId).trim() === tId);
        const delayOffset = matchedDelay.reduce((acc, curr) => acc + (curr.delayMins || 0), 0);
        stations.forEach(s => s.timeMin += delayOffset);

        // Find current station segment
        let prevSt = stations[0];
        let nextSt = stations[stations.length - 1];

        for (let j = 0; j < stations.length - 1; j++) {
          if (timeMins >= stations[j].timeMin && timeMins <= stations[j+1].timeMin) {
            prevSt = stations[j];
            nextSt = stations[j+1];
            break;
          }
        }

        const prevChain = activeChainages[prevSt.station] || 0;
        const nextChain = activeChainages[nextSt.station] || 0;
        const startChain = activeChainages[stations[0].station] || 0;
        const endChain = activeChainages[stations[stations.length - 1].station] || 0;

        // Calculate progress percentage in segment
        const segmentDuration = nextSt.timeMin - prevSt.timeMin;
        const timePassed = timeMins - prevSt.timeMin;
        const pct = segmentDuration > 0 ? timePassed / segmentDuration : 1;

        // Calculate current chainage
        const currentChainage = prevChain + pct * (nextChain - prevChain);

        // Calculate distance travelled / remaining
        const distanceTravelled = Math.abs(currentChainage - startChain);
        const distanceRemaining = Math.abs(endChain - currentChainage);

        // Get direction
        const { direction } = getTripEndpoints(activeTrip);

        // Get current operator name
        const currentDeploy = dailyDeployments.find(d => {
          if (String(d.trainId).trim() !== tId) return false;
          if (d.scheduleType && String(d.scheduleType).toUpperCase() !== activeSchedule) return false;
          if (!d.rawLegs) return false;
          const processLeg = (start, end) => {
            const startMin = timeToMinutes(start);
            const endMin = timeToMinutes(end);
            return timeMins >= startMin && timeMins <= endMin;
          };
          return processLeg(d.rawLegs.l1Start, d.rawLegs.l1End) ||
                 processLeg(d.rawLegs.l2Start, d.rawLegs.l2End) ||
                 processLeg(d.rawLegs.l3Start, d.rawLegs.l3End) ||
                 processLeg(d.rawLegs.l4Start, d.rawLegs.l4End);
        });

        positions.push({
          trainId: tId,
          operatorName: currentDeploy?.empName || 'Unassigned Operator',
          operatorId: currentDeploy?.empId || '--',
          currentStation: pct > 0.8 ? nextSt.station : pct < 0.2 ? prevSt.station : `${prevSt.station} ➔ ${nextSt.station}`,
          previousStation: prevSt.station,
          nextStation: nextSt.station,
          direction,
          chainage: parseFloat(currentChainage.toFixed(3)),
          distanceTravelled: parseFloat(distanceTravelled.toFixed(2)),
          distanceRemaining: parseFloat(distanceRemaining.toFixed(2)),
          pctLine: (currentChainage - activeChainages.BIET) / (activeChainages.APTS - activeChainages.BIET) // position percentage on Green Line
        });
      }
    });

    return positions;
  }, [simulatedTime, wttMatrix, liveIncidents, dailyDeployments, stationChainageDB, activeSchedule]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden font-mono text-slate-200">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-850 pb-4 mb-5 gap-3">
        <div>
          <h3 className="text-xs font-black text-slate-200 tracking-wider uppercase flex items-center gap-2">
            <MapPin className="h-4 w-4 text-cyan-400 animate-bounce" /> Live Schematic Track Position Detector (Line-2)
          </h3>
          <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">
            Calculating live segments, distance traveled, remaining chainages, and active operators
          </p>
        </div>

        {/* Simulated Time Panel */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
            <Clock className="h-3.5 w-3.5 text-cyan-400" /> Time Simulator:
          </div>
          <input
            type="time"
            value={simulatedTime}
            onChange={(e) => {
              setSimulatedTime(e.target.value);
              setIsLiveClock(false);
            }}
            className="bg-slate-900 border border-slate-700 text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500 font-bold text-cyan-300 font-mono"
          />
          <button
            onClick={() => setIsLiveClock(!isLiveClock)}
            className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded transition-colors ${
              isLiveClock ? 'bg-cyan-600 text-slate-950 font-bold animate-pulse' : 'bg-slate-850 text-slate-400 hover:bg-slate-800'
            }`}
          >
            {isLiveClock ? 'Live Clock Active' : 'Live Clock Off'}
          </button>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-2 border-l border-slate-800">
            Schedule:
          </div>
          <select
            value={activeSchedule}
            onChange={(e) => setActiveSchedule(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs rounded px-2 py-1 focus:outline-none focus:border-cyan-500 font-bold text-cyan-300 font-mono"
          >
            <option value="WEEKDAY">WEEKDAY</option>
            <option value="SATURDAY">SATURDAY</option>
            <option value="SUNDAY">SUNDAY</option>
          </select>
        </div>
      </div>

      {/* Time range slider */}
      <div className="mb-6 bg-slate-950 p-4 rounded-xl border border-slate-850/80 flex items-center gap-4">
        <span className="text-[10px] font-bold text-slate-500 uppercase">05:00</span>
        <input 
          type="range"
          min="300" // 5:00 AM in minutes
          max="1439" // 11:59 PM in minutes
          value={timeToMinutes(simulatedTime)}
          onChange={(e) => {
            setSimulatedTime(minutesToTime(parseInt(e.target.value)));
            setIsLiveClock(false);
          }}
          className="flex-1 accent-cyan-500 bg-slate-900 h-1.5 rounded-lg border border-slate-800 cursor-pointer"
        />
        <span className="text-[10px] font-bold text-slate-500 uppercase">23:59</span>
        <div className="bg-slate-900 border border-slate-800 px-3.5 py-1 rounded-md text-sm font-black text-cyan-400 tracking-widest shadow-inner">
          {simulatedTime}
        </div>
      </div>      {/* Track schematic visualization */}
      <div className="bg-slate-950 border border-slate-850 p-6 rounded-2xl relative overflow-x-auto mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 border-b border-slate-850 pb-2">
          <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Official Chainage Alignment representation (Green Line)</h4>
          <div className="flex gap-4 text-[9px] font-mono font-bold">
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              UP TRACK (APTS ➔ BIET)
            </span>
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
              DOWN TRACK (BIET ➔ APTS)
            </span>
          </div>
        </div>
        
        {/* Track Graphic Container */}
        <div className="w-[1700px] h-[210px] relative select-none py-10">
          
          {/* UP Track Line (Emerald) */}
          <div className="absolute top-[40px] left-[4%] right-[4%] h-1 bg-emerald-950/60 rounded-full border-t border-emerald-800/40"></div>
          
          {/* DOWN Track Line (Cyan) */}
          <div className="absolute top-[120px] left-[4%] right-[4%] h-1 bg-cyan-950/60 rounded-full border-t border-cyan-800/40"></div>

          {/* Station grid alignment lines & tick marks */}
          {STATION_ORDER.map((station) => {
            const chainages = Object.keys(stationChainageDB).length > 0 ? stationChainageDB : STATION_CHAINAGE;
            const posPct = (chainages[station] - chainages.BIET) / (chainages.APTS - chainages.BIET);
            const leftPos = `${4 + posPct * 92}%`;
            
            return (
              <div 
                key={station} 
                className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center group cursor-help z-10"
                style={{ left: leftPos, height: '170px' }}
              >
                {/* Station label rotated at -45 degrees */}
                <div className="absolute -top-3 text-[9px] font-bold text-slate-400 font-mono group-hover:text-slate-100 transition-colors transform -rotate-45 origin-bottom-left whitespace-nowrap pl-1">
                  {station}
                </div>

                {/* Vertical dashed alignment marker */}
                <div className="absolute top-4 bottom-6 w-0.5 border-l border-dashed border-slate-800/60 group-hover:border-cyan-500/30 transition-colors"></div>

                {/* UP track tick */}
                <div className="absolute top-[40px] -translate-y-1/2 h-3 w-3 rounded-full bg-slate-950 border-2 border-slate-700 flex items-center justify-center group-hover:border-emerald-400 group-hover:bg-slate-900 transition-colors shadow">
                  <span className="h-1 w-1 rounded-full bg-emerald-500/20 group-hover:bg-emerald-400 transition-colors"></span>
                </div>

                {/* DOWN track tick */}
                <div className="absolute top-[120px] -translate-y-1/2 h-3 w-3 rounded-full bg-slate-950 border-2 border-slate-700 flex items-center justify-center group-hover:border-cyan-400 group-hover:bg-slate-900 transition-colors shadow">
                  <span className="h-1 w-1 rounded-full bg-cyan-500/20 group-hover:bg-cyan-400 transition-colors"></span>
                </div>

                {/* Chainage display */}
                <div className="absolute bottom-0 text-[7px] text-slate-600 font-mono tracking-wide group-hover:text-slate-300 transition-colors">
                  {chainages[station]?.toFixed(3)}
                </div>
              </div>
            );
          })}

          {/* Dynamic train markers moving on the tracks */}
          {liveTrainPositions.map((train) => {
            const leftPos = `${4 + train.pctLine * 92}%`;
            const isUp = train.direction === 'UP';
            const topOffset = isUp ? '40px' : '120px';
            const themeColorClass = isUp 
              ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.5)]' 
              : 'bg-cyan-500 text-slate-950 font-black border-cyan-400/40 shadow-[0_0_12px_rgba(6,182,212,0.5)]';

            return (
              <div
                key={train.trainId}
                className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group z-20 transition-all duration-300"
                style={{ left: leftPos, top: topOffset }}
              >
                {/* Glowing train badge */}
                <div 
                  onClick={() => setSelectedTrain(train)}
                  className={`${themeColorClass} text-[9px] px-2 py-1 rounded-md border flex items-center gap-1 cursor-pointer hover:scale-105 transition-transform`}
                >
                  <Train size={9} className={isUp ? 'rotate-180 transition-transform' : ''} />
                  T{train.trainId}
                </div>

                {/* Operator Name label directly below train marker */}
                <div className="absolute top-6 bg-slate-900/90 text-[8px] font-bold text-slate-350 px-1 py-0.2 rounded border border-slate-800 whitespace-nowrap max-w-[85px] truncate shadow-md">
                  {train.operatorName.split(' ')[0]}
                </div>

                {/* Popover detailed info panel on hover */}
                <div className="absolute top-9 w-48 bg-slate-950 border border-slate-800 p-2.5 rounded-lg shadow-2xl invisible group-hover:visible z-30 flex flex-col gap-1 text-[9px] text-slate-400 font-sans tracking-wide">
                  <div className="font-bold text-slate-200 font-mono text-[10px] border-b border-slate-850 pb-1 mb-1 flex justify-between">
                    <span>Train {train.trainId} ({train.direction})</span>
                    <span className="text-cyan-400 font-sans">Ch: {train.chainage}</span>
                  </div>
                  <div>Operator: <strong className="text-emerald-400 font-mono">{train.operatorName} ({train.operatorId})</strong></div>
                  <div>Current Station: <strong className="text-slate-200 font-mono">{train.currentStation}</strong></div>
                  <div>Next Target: <strong className="text-slate-300 font-mono">{train.nextStation}</strong></div>
                  <div>Distance Run: <strong className="text-slate-350">{train.distanceTravelled} KM</strong></div>
                  <div>Remaining: <strong className="text-slate-350">{train.distanceRemaining} KM</strong></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Trains Position details list grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {liveTrainPositions.length === 0 ? (
          <div className="col-span-3 py-10 bg-slate-950 border border-slate-850 rounded-xl text-center text-slate-500 italic font-bold">
            No scheduled train matrix movements detected at {simulatedTime}.
          </div>
        ) : (
          liveTrainPositions.map((t) => (
            <div key={t.trainId} className="bg-slate-950 border border-slate-850 rounded-xl p-4 flex flex-col justify-between hover:border-cyan-500/30 transition shadow-md group">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded bg-cyan-500 animate-ping"></span>
                  <span className="font-black text-slate-100 text-xs tracking-wider font-mono">TRAIN ID: {t.trainId}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[9px] font-black uppercase tracking-wider">
                  {t.direction} Direction
                </span>
              </div>

              <div className="space-y-1.5 text-[10px] text-slate-400 font-sans">
                <div className="flex justify-between font-mono">
                  <span>Assigned Operator:</span>
                  <strong className="text-emerald-400">{t.operatorName} ({t.operatorId})</strong>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Current Position:</span>
                  <strong className="text-slate-200">{t.currentStation}</strong>
                </div>
                <div className="flex justify-between font-mono">
                  <span>Active Chainage:</span>
                  <strong className="text-cyan-400 font-bold">{t.chainage.toFixed(3)}</strong>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-850/60 font-mono">
                  <div className="bg-slate-900 p-2 rounded border border-slate-800 text-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-widest">Travelled</div>
                    <strong className="text-slate-200 text-[11px]">{t.distanceTravelled} KM</strong>
                  </div>
                  <div className="bg-slate-900 p-2 rounded border border-slate-800 text-center">
                    <div className="text-[8px] text-slate-500 uppercase tracking-widest">Remaining</div>
                    <strong className="text-slate-200 text-[11px]">{t.distanceRemaining} KM</strong>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Train Dialog Box */}
      {selectedTrain && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 w-full max-w-md shadow-2xl animate-scale-up font-mono">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Train className="text-cyan-400 h-5 w-5" />
                <h3 className="text-base font-black text-slate-100 uppercase">TRAIN MODULE: T{selectedTrain.trainId}</h3>
              </div>
              <button 
                onClick={() => setSelectedTrain(null)} 
                className="text-slate-500 hover:text-slate-350 text-sm font-bold bg-slate-900 border border-slate-800 hover:border-slate-700 px-2 py-1 rounded"
              >
                CLOSE
              </button>
            </div>

            <div className="space-y-3.5 text-xs text-slate-400">
              <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-[9px] uppercase text-slate-500 block">Operator Assigned</span>
                  <strong className="text-emerald-400 text-sm">{selectedTrain.operatorName} ({selectedTrain.operatorId})</strong>
                </div>
                <User className="h-5 w-5 text-slate-650" />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div className="bg-slate-900/40 p-2.5 border border-slate-850 rounded">
                  <span className="text-[9px] uppercase text-slate-500 block">Active Chainage</span>
                  <strong className="text-cyan-400 font-mono text-sm">{selectedTrain.chainage} KM</strong>
                </div>
                <div className="bg-slate-900/40 p-2.5 border border-slate-850 rounded">
                  <span className="text-[9px] uppercase text-slate-500 block">Directional Run</span>
                  <strong className="text-slate-200 uppercase text-sm">{selectedTrain.direction}</strong>
                </div>
              </div>

              <div className="bg-slate-900/40 p-3 border border-slate-850 rounded space-y-1.5">
                <div className="flex justify-between">
                  <span>Current Leg Segment:</span>
                  <strong className="text-slate-200">{selectedTrain.currentStation}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Previous Station:</span>
                  <strong className="text-slate-300">{selectedTrain.previousStation}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Next Target Station:</span>
                  <strong className="text-slate-300">{selectedTrain.nextStation}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/60 border border-slate-800 p-3 rounded text-center">
                  <span className="text-[8px] text-slate-500 uppercase tracking-wider block">Odometer Travelled</span>
                  <strong className="text-emerald-400 text-base font-black">{selectedTrain.distanceTravelled} KM</strong>
                </div>
                <div className="bg-slate-900/60 border border-slate-800 p-3 rounded text-center">
                  <span className="text-[8px] text-slate-500 uppercase tracking-wider block">Distance Remaining</span>
                  <strong className="text-cyan-400 text-base font-black">{selectedTrain.distanceRemaining} KM</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

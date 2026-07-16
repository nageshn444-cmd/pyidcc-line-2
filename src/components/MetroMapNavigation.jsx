import React, { useState, useEffect } from 'react';
import { Train, AlertTriangle, MapPin, Shield, User } from 'lucide-react';

const GREEN_LINE_STATIONS = [
  "BIET", "JIDL", "MNJN", "NGSA", "DSH", "JLHL", "PYID", "PEYA", "YPI", "YPM",
  "SSFY", "MHLI", "RJNR", "KVPR", "SPRU", "SPGD", "KGWA", "CKPE", "KRMT", "NLC",
  "LBGH", "SECE", "JYN", "RVR", "BSNK", "JPN", "PUTH", "APRC", "KLPK", "VJRH",
  "TGTP", "APTS"
];

// Helper to convert time "HH:MM:SS" or "HH:MM" to seconds
const timeToSeconds = (timeStr) => {
  if (!timeStr || timeStr === '--' || timeStr === '-') return null;
  const parts = timeStr.split(':');
  let secs = 0;
  if (parts[0]) secs += parseInt(parts[0], 10) * 3600;
  if (parts[1]) secs += parseInt(parts[1], 10) * 60;
  if (parts[2]) secs += parseInt(parts[2], 10);
  // Rollover late-night runs
  if (secs < 3 * 3600) secs += 24 * 3600;
  return secs;
};

export default function MetroMapNavigation({ 
  liveTrainTrackingMap = {}, 
  unifiedRows = [], 
  liveIncidents = [],
  deployments = []
}) {
  const [selectedStation, setSelectedStation] = useState(null);
  const [stationStates, setStationStates] = useState({});
  const [currentTimeSecs, setCurrentTimeSecs] = useState(0);

  // Update current time locally
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const secs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      setCurrentTimeSecs(secs < 3 * 3600 ? secs + 24 * 3600 : secs);
    };
    updateTime();
    const interval = setInterval(updateTime, 5000);
    return () => clearInterval(interval);
  }, []);

  // Compute station coordinates for winding layout (11, 11, 10)
  const getStationCoords = (index) => {
    const width = 1000;
    const paddingX = 70;
    const spacingX1 = (width - paddingX * 2) / 10; // Row 0 & 1 spacing
    const spacingX2 = (width - paddingX * 2) / 9;  // Row 2 spacing

    if (index <= 10) {
      // Row 0 (Left to Right)
      return {
        x: paddingX + index * spacingX1,
        y: 60
      };
    } else if (index <= 21) {
      // Row 1 (Right to Left)
      const offset = index - 11;
      return {
        x: (width - paddingX) - offset * spacingX1,
        y: 160
      };
    } else {
      // Row 2 (Left to Right)
      const offset = index - 22;
      return {
        x: paddingX + offset * spacingX2,
        y: 260
      };
    }
  };

  // Compile active trains and their current estimated positions
  const getActiveTrainsAtStations = () => {
    const trainPositions = {};
    
    Object.keys(liveTrainTrackingMap).forEach(tid => {
      const tracking = liveTrainTrackingMap[tid];
      if (!tracking || !tracking.current) return;

      // Find the delay of this train
      const delayObj = liveIncidents.find(inc => String(inc.trainId) === String(tid) && inc.status !== 'RESOLVED');
      const delayMins = delayObj ? Number(delayObj.delayMinutes || delayObj.delay || 0) : 0;

      // Find the corresponding schedule row
      const scheduleRow = unifiedRows.find(row => String(row.trainId) === String(tid));
      if (!scheduleRow) return;

      // Check downTrip and upTrip stations
      let bestStation = null;
      let minDiff = Infinity;

      const processTripStations = (trip) => {
        if (!trip || !trip.stations) return;
        
        Object.keys(trip.stations).forEach(stationName => {
          const schedTime = trip.stations[stationName];
          const schedSecs = timeToSeconds(schedTime);
          if (schedSecs === null) return;

          // Add delay to scheduled time
          const adjustedSecs = schedSecs + (delayMins * 60);
          const diff = Math.abs(currentTimeSecs - adjustedSecs);

          if (diff < minDiff) {
            minDiff = diff;
            bestStation = stationName;
          }
        });
      };

      processTripStations(scheduleRow.downTrip);
      processTripStations(scheduleRow.upTrip);

      if (bestStation) {
        if (!trainPositions[bestStation]) trainPositions[bestStation] = [];
        trainPositions[bestStation].push({
          trainId: tid,
          operator: tracking.current.empName,
          empId: tracking.current.empId,
          dutyId: tracking.current.dutyId,
          delay: delayMins,
          direction: scheduleRow.downTrip ? 'DN' : 'UP'
        });
      }
    });

    return trainPositions;
  };

  const trainPositions = getActiveTrainsAtStations();

  // Find active delays per station from incident list
  const getStationDelays = () => {
    const delays = {};
    liveIncidents.forEach(inc => {
      if (inc.status === 'RESOLVED') return;
      const station = inc.station || inc.location;
      if (station && GREEN_LINE_STATIONS.includes(station)) {
        delays[station] = {
          delay: inc.delayMinutes || inc.delay || 0,
          reason: inc.reason || inc.incidentType || 'Operational Delay',
          trainId: inc.trainId
        };
      }
    });
    return delays;
  };

  const stationDelays = getStationDelays();

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-2xl relative overflow-hidden font-mono text-slate-200">
      
      {/* Ambient background glow */}
      <div className="absolute -right-24 -bottom-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-[60px] pointer-events-none"></div>

      <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></div>
          <h2 className="text-sm font-black tracking-wider uppercase text-emerald-400">Green Line Live WTT SVG Map</h2>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-400 font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600 border border-emerald-400"></span>
            <span>Green Line Path</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-emerald-500 flex items-center justify-center text-[8px] text-emerald-400 font-black">
              T
            </span>
            <span>Active Train</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-600 animate-pulse border border-rose-400"></span>
            <span>Delay Alert</span>
          </div>
        </div>
      </div>

      {/* SVG Container */}
      <div className="overflow-x-auto w-full pb-4">
        <svg viewBox="0 0 1000 320" className="w-full min-w-[900px] h-auto select-none overflow-visible">
          
          {/* Glowing Green Line Path */}
          <path
            d={`
              M 70,60 
              L 930,60 
              C 970,60 970,160 930,160 
              L 70,160 
              C 30,160 30,260 70,260 
              L 930,260
            `}
            fill="none"
            stroke="#052e16"
            strokeWidth="10"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={`
              M 70,60 
              L 930,60 
              C 970,60 970,160 930,160 
              L 70,160 
              C 30,160 30,260 70,260 
              L 930,260
            `}
            fill="none"
            stroke="#10b981"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="filter drop-shadow-[0_0_8px_#10b981]"
          />

          {/* Station Nodes */}
          {GREEN_LINE_STATIONS.map((stationName, idx) => {
            const coords = getStationCoords(idx);
            const trains = trainPositions[stationName] || [];
            const delay = stationDelays[stationName];
            const isDelayed = !!delay;

            return (
              <g 
                key={stationName} 
                onClick={() => setSelectedStation({ name: stationName, trains, delay })}
                className="cursor-pointer group"
              >
                {/* Delayed Blinking Ring */}
                {isDelayed && (
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r="12"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2"
                    className="animate-ping"
                  />
                )}

                {/* Train Presence Pulse */}
                {trains.length > 0 && (
                  <circle
                    cx={coords.x}
                    cy={coords.y}
                    r="14"
                    fill="none"
                    stroke="#06b6d4"
                    strokeWidth="2"
                    className="animate-pulse"
                  />
                )}

                {/* Main Node Circle */}
                <circle
                  cx={coords.x}
                  cy={coords.y}
                  r="7"
                  fill={isDelayed ? "#ef4444" : trains.length > 0 ? "#06b6d4" : "#020617"}
                  stroke={isDelayed ? "#f87171" : trains.length > 0 ? "#22d3ee" : "#10b981"}
                  strokeWidth="2.5"
                  className="transition-all group-hover:scale-125"
                />

                {/* Station Code Text */}
                <text
                  x={coords.x}
                  y={coords.y - 12}
                  textAnchor="middle"
                  fill={isDelayed ? "#fca5a5" : trains.length > 0 ? "#67e8f9" : "#cbd5e1"}
                  fontSize="8.5"
                  fontWeight="bold"
                  className="group-hover:fill-white transition-colors"
                >
                  {stationName}
                </text>

                {/* Train count indicator bubble */}
                {trains.length > 0 && (
                  <g transform={`translate(${coords.x + 8}, ${coords.y - 8})`}>
                    <circle r="6" fill="#0891b2" />
                    <text
                      y="2"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="7.5"
                      fontWeight="black"
                    >
                      {trains.length}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected Station Overlay Dialog */}
      {selectedStation && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-2xl animate-scale-up font-mono">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="text-emerald-400 h-5 w-5" />
                <h3 className="text-base font-black text-slate-100 uppercase">STATION CONTROL: {selectedStation.name}</h3>
              </div>
              <button 
                onClick={() => setSelectedStation(null)} 
                className="text-slate-500 hover:text-slate-300 text-sm font-bold bg-slate-900 border border-slate-800 hover:border-slate-700 px-2 py-1 rounded"
              >
                CLOSE
              </button>
            </div>

            {/* Delay Info */}
            {selectedStation.delay ? (
              <div className="bg-rose-950/40 border border-rose-900/50 text-rose-300 p-3 rounded-lg flex items-start gap-3 mb-4">
                <AlertTriangle className="text-rose-500 h-5 w-5 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider">ACTIVE INCIDENT ALERT</div>
                  <div className="text-sm mt-1">{selectedStation.delay.reason}</div>
                  <div className="text-[10px] text-rose-400 font-semibold uppercase mt-1">
                    Delay: {selectedStation.delay.delay} Mins | Impacting TID: {selectedStation.delay.trainId}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-950/20 border border-emerald-900/30 text-emerald-400 p-3 rounded-lg flex items-center gap-2 mb-4 text-xs font-bold uppercase">
                <Shield className="h-4 w-4" /> Station Clear | No Active Delays
              </div>
            )}

            {/* Active Trains at Station */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-900 pb-1.5">
                Active Trains & Deployments
              </h4>

              {selectedStation.trains.length === 0 ? (
                <div className="text-xs text-slate-600 italic py-3 text-center">No active trains at station platform</div>
              ) : (
                selectedStation.trains.map(train => (
                  <div key={train.trainId} className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Train className="h-4 w-4 text-cyan-400" />
                        <span className="font-bold text-slate-200 text-sm">Train ID: {train.trainId}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 font-bold uppercase border border-cyan-800/40">
                          {train.direction}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        <User className="h-3 w-3 text-slate-500" />
                        <span>TO: {train.operator} ({train.empId})</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 font-bold uppercase">
                        Duty Link: {train.dutyId}
                      </div>
                    </div>
                    {train.delay > 0 && (
                      <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-1 rounded text-[10px] font-black tracking-wide uppercase">
                        +{train.delay}m Delay
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

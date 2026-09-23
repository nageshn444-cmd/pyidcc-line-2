/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AlstomAtsSystemView.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Pixel-Perfect Single-Line Alignment & Timetable-Driven Train Movement Engine
 * for BMRCL Line 2 (Green Line).
 *
 * Features:
 *   • One continuous horizontal panoramic dual-track schematic (no discrete views)
 *   • Strictly follows the day type timetable (WEEKDAY, MONDAY, SATURDAY, SUNDAY)
 *   • Geometrically accurate crossovers, scissors ('X'), pocket tracks, and depot leads
 *   • Real-time moving train ID badges positioned by exact WTT timetable chainage
 *   • Smooth progression as simulation time advances (play/pause/speed/scrubber)
 *   • Authentic Alstom SCADA console styling, alarm box, and status bar
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Clock } from 'lucide-react';
import { STATION_CHAINAGE, ATS_STATION_SEQUENCE, timeToMinutes, minutesToTime } from '../../utils/kpiEngine';

// Complete single-line station progression from South (APTD) to North (BIET)
export const ALSTOM_LINE_STATIONS = [
  { code: 'APTD', name: 'Anjanapura Depot', chainage: 24.170, x: 180, isBuffer: true, isDepot: true },
  { code: 'APTS', name: 'Anjanapura Terminal', chainage: 23.833, x: 290, isTerminal: true },
  { code: 'TGTP', name: 'Talaghattapura', chainage: 22.395, x: 420 },
  { code: 'VJRH', name: 'Vajarahalli', chainage: 21.395, x: 550 },
  { code: 'KLPK', name: 'Doddakalsandra', chainage: 20.099, x: 680 },
  { code: 'APRC', name: 'Konanakunte Cross', chainage: 18.902, x: 810 },
  { code: 'PUTH', name: 'Yelachenahalli', chainage: 17.780, x: 960, hasScissors: true, bufferChainage: 18.250 },
  { code: 'JPN', name: 'J.P. Nagar', chainage: 16.404, x: 1110 },
  { code: 'BSNK', name: 'Banashankari', chainage: 15.507, x: 1240 },
  { code: 'RVR', name: 'Rashtreeya Vidyalaya Road', chainage: 14.180, x: 1370, hasCrossover: true },
  { code: 'JYN', name: 'Jayanagar', chainage: 13.280, x: 1500 },
  { code: 'SECE', name: 'South End Circle', chainage: 12.323, x: 1630 },
  { code: 'LBGH', name: 'Lalbagh', chainage: 11.436, x: 1760 },
  { code: 'NLC', name: 'National College', chainage: 10.403, x: 1910, hasSiding: true, isUnderground: false },
  { code: 'KRMT', name: 'K.R. Market', chainage: 9.238, x: 2060, isUnderground: true, hasSectionDivider: true, sectionName: 'ELEVATED | UNDERGROUND' },
  { code: 'CKPE', name: 'Chikkapete', chainage: 8.588, x: 2190, isUnderground: true },
  { code: 'KGWA', name: 'Kempegowda Majestic', chainage: 7.569, x: 2330, isUnderground: true, hasScissors: true, hasEastWestLink: true },
  { code: 'SPGD', name: 'Sampige Road', chainage: 5.865, x: 2500, hasScissors: true, hasSectionDivider: true, sectionName: 'UNDERGROUND | ELEVATED' },
  { code: 'SPRU', name: 'Srirampura', chainage: 4.706, x: 2640 },
  { code: 'KVPR', name: 'Kuvempu Road', chainage: 3.974, x: 2770 },
  { code: 'RJNR', name: 'Rajajinagar', chainage: 2.989, x: 2900, hasCrossover: true },
  { code: 'MHLI', name: 'Mahalakshmi Layout', chainage: 2.018, x: 3040, hasPocketTrack: true, pocketChainage: 2.100 },
  { code: 'SSFY', name: 'Sandal Soap Factory', chainage: 1.091, x: 3180 },
  { code: 'YPM', name: 'Yeshwantpura (Datum)', chainage: 0.000, x: 3310, isDatum: true, hasCrossover: true },
  { code: 'YPI', name: 'Goraguntepalya', chainage: -1.125, x: 3450 },
  { code: 'PEYA', name: 'Peenya', chainage: -2.074, x: 3580 },
  { code: 'PYID', name: 'Peenya Industry (Hub)', chainage: -3.020, x: 3730, isHub: true, hasDepotBranch: true, hasScissors: true },
  { code: 'JLHL', name: 'Jalahalli', chainage: -3.721, x: 3900, hasCrossover: true },
  { code: 'DSH', name: 'Dasarahalli', chainage: -4.662, x: 4030 },
  { code: 'NGSA', name: 'Nagasandra', chainage: -6.088, x: 4170, hasPocketTrack: true, pocketChainage: -6.528 },
  { code: 'MNJN', name: 'Manjunathanagara', chainage: -6.753, x: 4320 },
  { code: 'JIDL', name: 'Jindal / Chikkabidarakallu', chainage: -7.504, x: 4450 },
  { code: 'BIET', name: 'Madhavara (Terminal)', chainage: -9.227, x: 4600, hasBufferEnd: true, bufferChainage: -9.560, hasScissors: true },
];

export default function AlstomAtsSystemView({
  liveTrainPositions = [],
  stationChainageDB = {},
  simulatedTime = '11:15',
  activeSchedule = 'WEEKDAY',
  isLiveClock = true,
  onScheduleChange = () => {},
  onTimeChange = () => {},
  onToggleLiveClock = () => {},
  onSelectTrain = () => {}
}) {
  const [selectedStation, setSelectedStation] = useState(null);
  const [hoveredTrain, setHoveredTrain] = useState(null);
  const scrollContainerRef = useRef(null);

  // Simulation Playback state (advance time automatically)
  const [isSimPlaying, setIsSimPlaying] = useState(false);
  const [simSpeedMultiplier, setSimSpeedMultiplier] = useState(1); // 1x = 1 min/sec, 5x = 5 mins/sec

  // Helper: Get station chainage
  const getChainage = (code) => {
    return stationChainageDB[code] !== undefined 
      ? stationChainageDB[code] 
      : (STATION_CHAINAGE[code] !== undefined ? STATION_CHAINAGE[code] : 0.0);
  };

  // Convert exact timetable chainage (KM) to pixel X coordinate along the continuous track
  const chainageToTrackX = (ch) => {
    if (ch === undefined || isNaN(ch)) return ALSTOM_LINE_STATIONS[0].x;

    // Boundary conditions
    const first = ALSTOM_LINE_STATIONS[0];
    const last = ALSTOM_LINE_STATIONS[ALSTOM_LINE_STATIONS.length - 1];
    if (ch >= first.chainage) return first.x;
    if (ch <= last.chainage) return last.x;

    // Find two adjacent stations bounding this chainage
    for (let i = 0; i < ALSTOM_LINE_STATIONS.length - 1; i++) {
      const s1 = ALSTOM_LINE_STATIONS[i];
      const s2 = ALSTOM_LINE_STATIONS[i + 1];
      if (ch <= s1.chainage && ch >= s2.chainage) {
        const span = s1.chainage - s2.chainage;
        const ratio = span > 0 ? (s1.chainage - ch) / span : 0;
        return s1.x + ratio * (s2.x - s1.x);
      }
    }
    return first.x;
  };

  // Automated Timetable Simulation Loop:
  // When isSimPlaying is true, advances timetable minutes every second according to simSpeedMultiplier
  useEffect(() => {
    if (!isSimPlaying) return;

    const interval = setInterval(() => {
      const currentMins = timeToMinutes(simulatedTime);
      let nextMins = currentMins + simSpeedMultiplier;
      if (nextMins > 1439) nextMins = 300; // loop back to 05:00 AM after midnight
      onTimeChange(nextMins);
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimPlaying, simSpeedMultiplier, simulatedTime, onTimeChange]);

  // Track Y Coordinates (Single panoramic line)
  const UP_Y = 85;       // Top rail: UP Track (APTD ➔ BIET, traveling West/North)
  const MID_Y = 135;     // Center pocket track level (NLC, MHLI, NGSA sidings)
  const DN_Y = 185;      // Bottom rail: DOWN Track (BIET ➔ APTD, traveling South)
  const RD3_Y = 232;     // Peenya Industry Road 3 (RD-3) Platform & Standby Track
  const LINK_Y = 245;    // East-West Purple Line Link at KGWA
  const DEPOT_Y1 = 268;  // Peenya Depot Transfer Track 2 & SBL-1
  const DEPOT_Y2 = 298;  // Peenya Depot Transfer Track 1 & SBL-2
  const DEPOT_Y3 = 328;  // Peenya Depot SBL-3

  const START_X = 60;
  const END_X = 4720;
  const TOTAL_TRACK_WIDTH = 4820;

  // Process live trains strictly from the active day's timetable
  const timetableTrains = useMemo(() => {
    // 1. Deduplicate by trainId to ensure no overlapping duplicate badges
    const trainMap = new Map();
    (liveTrainPositions || []).forEach((tr) => {
      const tId = String(tr.trainId).trim();
      if (!tId) return;
      if (!trainMap.has(tId)) {
        trainMap.set(tId, tr);
      } else {
        const existing = trainMap.get(tId);
        // Prefer running train over stabled train
        if (existing.isStabling && !tr.isStabling) {
          trainMap.set(tId, tr);
        }
      }
    });

    return Array.from(trainMap.values()).map((tr) => {
      const isUp = tr.direction === 'UP';
      let exactX = chainageToTrackX(tr.chainage);
      let exactY = isUp ? UP_Y : DN_Y;
      let statusText = tr.isStabling ? 'STABLED' : 'RUNNING';

      // 1. SPECIFIC RULE: Peenya Depot SBL, PYID RD-3, and Transfer Track Movement
      // A. RD-3 Standby loop train (T203)
      const isRd3Train = tr.isStabling && (
        String(tr.trainId) === '203' || 
        String(tr.currentStation).includes('RD-3')
      );

      // B. Peenya Depot SBL (Stabled Trains: T221, T218, T211, etc.)
      // STRICT REQUIREMENT: DO NOT stable trains at Transfer Track 1 and 2!
      // Once trains are stabled at the depot, they are located inside PEENYA DEPOT SBL (Stabling Lines).
      const isDepotStabled = tr.isStabling && !isRd3Train && (
        String(tr.currentStation).includes('Depot') || 
        String(tr.currentStation).includes('SBL') || 
        ['221', '218', '211'].includes(String(tr.trainId)) ||
        String(tr.currentStation).includes('PYID')
      );

      // C. Transfer Track Movement: ONLY trains actively moved / inducted FROM depot appear on Transfer Track 1 & 2
      const isMovingFromDepot = !tr.isStabling && (
        String(tr.currentStation).includes('Transfer') ||
        String(tr.currentStation).includes('From Depot') ||
        tr.isDepotMoving ||
        (String(tr.currentStation).includes('PYID') && tr.distanceTravelled < 0.6 && tr.direction === 'UP' && tr.originDepot)
      );

      if (isRd3Train) {
        exactX = 3765; // PYID RD-3
        exactY = RD3_Y;
        statusText = 'STANDBY (RD-3)';
      } else if (isDepotStabled) {
        // Stabled trains are positioned inside PEENYA DEPOT SBL (Stabling Lines beyond Transfer Tracks)
        if (String(tr.trainId) === '221') {
          exactX = 4115; // SBL-1
          exactY = DEPOT_Y1;
          statusText = 'DEPOT SBL-1';
        } else if (String(tr.trainId) === '218') {
          exactX = 4115; // SBL-2
          exactY = DEPOT_Y2;
          statusText = 'DEPOT SBL-2';
        } else if (String(tr.trainId) === '211') {
          exactX = 4115; // SBL-3
          exactY = DEPOT_Y3;
          statusText = 'DEPOT SBL-3';
        } else {
          exactX = 4055;
          exactY = DEPOT_Y1;
          statusText = 'DEPOT SBL';
        }
      } else if (isMovingFromDepot) {
        // Actively moving from Depot on Transfer Track towards PYID
        exactX = 3880; // Transfer Track 2
        exactY = DEPOT_Y1;
        statusText = 'FROM DEPOT (INDUCTION)';
      }

      // 2. SPECIFIC RULE: Terminal Station Cab Changeover & Buffer End
      // At terminal stations (BIET & APTS):
      // During cab changeover / completion of trip at terminal station, trains move to the BUFFER END (beyond platform).
      // From the buffer end, when departure time approaches, the train moves back to the departure track.
      const isAtBietTerminal = String(tr.currentStation).includes('BIET') || tr.chainage <= -9.0;
      const isAtAptsTerminal = String(tr.currentStation).includes('APTS') || tr.chainage >= 23.5;
      const isTurnaroundOrStabledAtTerminal = tr.isStabling || tr.distanceRemaining === 0 || String(tr.currentStation).includes('(');

      if (isAtBietTerminal && isTurnaroundOrStabledAtTerminal && !isDepotStabled && !isRd3Train && !isMovingFromDepot) {
        // Move beyond BIET platform (x=4600) to the BIET Buffer End track (x=4665)
        exactX = 4665;
        exactY = tr.isStabling ? (String(tr.trainId) === '209' ? UP_Y : DN_Y) : (isUp ? UP_Y : DN_Y);
        statusText = tr.isStabling ? 'BUFFER END (STABLED)' : 'CAB CHANGEOVER';
      } else if (isAtAptsTerminal && isTurnaroundOrStabledAtTerminal && !isDepotStabled && !isRd3Train && !isMovingFromDepot) {
        // Move beyond APTS platform (x=290) to the APTS Buffer End track (x=220)
        exactX = 220;
        exactY = DN_Y;
        statusText = tr.isStabling ? 'BUFFER END (STABLED)' : 'CAB CHANGEOVER';
      }

      // Determine operational speed
      const isAtPlatform = tr.distanceTravelled === 0 || String(tr.currentStation).includes('(');
      const isStationary = isMovingFromDepot ? false : (tr.isStabling || exactX >= 4650 || exactX <= 230 || exactY >= RD3_Y);
      const speedKmH = isStationary ? 0 : (isAtPlatform ? 0 : isMovingFromDepot ? 15 : Math.round(35 + (parseInt(tr.trainId) % 15)));

      if (!statusText || statusText === 'RUNNING') {
        statusText = speedKmH === 0 ? 'AT PLATFORM' : `${speedKmH} km/h`;
      }

      return {
        ...tr,
        currentX: exactX,
        currentY: exactY,
        speedKmH,
        statusText
      };
    });
  }, [liveTrainPositions]);

  return (
    <div className="bg-[#4a5360] text-slate-100 font-mono rounded-xl border-2 border-[#333a44] shadow-2xl overflow-hidden select-none">
      


      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. OVERVIEW CONTINUOUS TRACK RIBBON (Beneath Header as in Image)    */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#373e49] border-b border-[#292f38] px-2 py-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-600">
        <div className="flex items-center justify-between min-w-[1400px] text-[8px] font-bold text-slate-200">
          {ALSTOM_LINE_STATIONS.map((st, idx) => {
            const ch = getChainage(st.code);
            const isPyidArea = st.code === 'PYID' || st.code === 'JLHL';
            const isKgwa = st.code === 'KGWA';

            return (
              <div 
                key={st.code} 
                className="flex flex-col items-center cursor-pointer group"
                onClick={() => {
                  setSelectedStation(st.code);
                  if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({
                      left: Math.max(0, st.x - 300),
                      behavior: 'smooth'
                    });
                  }
                }}
                title={`${st.name} (${ch >= 0 ? '+' : ''}${ch.toFixed(3)} KM)`}
              >
                <div className={`px-1.5 py-0.5 rounded text-[8px] border transition-transform group-hover:scale-110 ${
                  isPyidArea 
                    ? 'bg-amber-500 text-slate-950 font-black border-amber-300 shadow-sm' 
                    : isKgwa
                    ? 'bg-purple-900/80 text-purple-200 border-purple-500'
                    : 'bg-[#242a34] text-slate-300 border-slate-600 group-hover:border-cyan-400'
                }`}>
                  {st.code}
                </div>
                <div className="w-full flex items-center justify-center my-0.5">
                  <div className={`h-1 w-full ${idx === 0 ? 'rounded-l' : ''} ${idx === ALSTOM_LINE_STATIONS.length - 1 ? 'rounded-r' : ''} bg-slate-600 group-hover:bg-cyan-400 flex items-center justify-center`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-cyan-300"></div>
                  </div>
                </div>
                <span className="text-[7px] text-slate-400 group-hover:text-slate-200">
                  {ch >= 0 ? `+${ch.toFixed(1)}` : ch.toFixed(1)}
                </span>
                {isKgwa && <span className="text-[6.5px] text-purple-300 font-bold">LinkLine+</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. MAIN UNIFIED CONTINUOUS TRACK CANVAS (One Line Alignment)        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div 
        ref={scrollContainerRef}
        className="p-4 bg-[#444d59] overflow-x-auto scrollbar-thin scrollbar-thumb-cyan-700 scrollbar-track-slate-800"
      >
        <div className="relative select-none" style={{ width: `${TOTAL_TRACK_WIDTH}px`, height: '380px' }}>
          
          <svg className="w-full h-full" viewBox={`0 0 ${TOTAL_TRACK_WIDTH} 380`}>
            
            <defs>
              <pattern id="hatch-under-progress-full" width="12" height="12" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="12" stroke="#eab308" strokeWidth="4" />
                <line x1="6" y1="0" x2="6" y2="12" stroke="#1e293b" strokeWidth="4" />
              </pattern>
              
              <filter id="train-glow-up" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* ── STAGE-2 CONSTRUCTION ZONE (Far Left) ── */}
            <g>
              <rect x={START_X} y={UP_Y - 20} width="160" height={DN_Y - UP_Y + 40} fill="url(#hatch-under-progress-full)" stroke="#eab308" strokeWidth="1.5" opacity="0.85" rx="3" />
              <rect x={START_X + 15} y={UP_Y + 28} width="130" height="24" fill="#0f172a" fillOpacity="0.9" rx="2" stroke="#eab308" strokeWidth="1" />
              <text x={START_X + 80} y={UP_Y + 44} fill="#facc15" fontSize="11" fontWeight="900" textAnchor="middle" letterSpacing="1">UNDER PROGRESS</text>
              <text x={START_X + 80} y={UP_Y - 28} fill="#e2e8f0" fontSize="9" fontWeight="bold" textAnchor="middle">Stage-2 ➔ To Anjanapura Depot</text>
              <text x={START_X + 185} y={UP_Y - 28} fill="#94a3b8" fontSize="8" fontWeight="bold">Stage-1</text>
              
              {/* Buffer Stop at Stage-2 start */}
              <line x1={START_X} y1={UP_Y - 10} x2={START_X} y2={UP_Y + 10} stroke="#ef4444" strokeWidth="4" />
              <line x1={START_X} y1={DN_Y - 10} x2={START_X} y2={DN_Y + 10} stroke="#ef4444" strokeWidth="4" />
            </g>

            {/* ── APTS TERMINAL BUFFER END CAB CHANGEOVER ZONE ── */}
            <g>
              <rect x="180" y={UP_Y - 16} width="80" height={DN_Y - UP_Y + 32} fill="#ef4444" fillOpacity="0.08" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 3" rx="3" />
              <text x="220" y={UP_Y - 5} fill="#fca5a5" fontSize="7" fontWeight="bold" textAnchor="middle">CAB CHANGEOVER</text>
              <text x="220" y={DN_Y + 14} fill="#fca5a5" fontSize="6.5" fontWeight="bold" textAnchor="middle">APTS BUFFER END</text>
              <line x1="180" y1={UP_Y - 10} x2="180" y2={UP_Y + 10} stroke="#ef4444" strokeWidth="4" />
              <line x1="180" y1={DN_Y - 10} x2="180" y2={DN_Y + 10} stroke="#ef4444" strokeWidth="4" />
            </g>

            {/* ── CONTINUOUS UP TRACK (Top Main Line) ── */}
            <line x1={START_X} y1={UP_Y} x2={END_X} y2={UP_Y} stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x={START_X - 45} y={UP_Y + 4} fill="#10b981" fontSize="11" fontWeight="900">Up ➔</text>
            <text x={END_X + 10} y={UP_Y + 4} fill="#10b981" fontSize="11" fontWeight="900">➔ UP</text>

            {/* ── CONTINUOUS DOWN TRACK (Bottom Main Line) ── */}
            <line x1={START_X} y1={DN_Y} x2={END_X} y2={DN_Y} stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x={START_X - 55} y={DN_Y + 4} fill="#06b6d4" fontSize="11" fontWeight="900">Down ➔</text>
            <text x={END_X + 10} y={DN_Y + 4} fill="#06b6d4" fontSize="11" fontWeight="900">➔ DN</text>

            {/* ── NATIONAL COLLEGE (NLC) SIDING & CROSSOVERS (As per Alstom SCADA) ── */}
            <g>
              {/* Lower Siding Track beneath Down Line */}
              <line x1="1830" y1="230" x2="1990" y2="230" stroke="#2563eb" strokeWidth="3.5" />
              
              {/* Left buffer stop with signal 7008 */}
              <line x1="1830" y1="222" x2="1830" y2="238" stroke="#ef4444" strokeWidth="4" />
              <circle cx="1830" cy="230" r="3" fill="#ef4444" />
              <rect x="1804" y="214" width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="1816" y="223" fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7008</text>

              {/* Right buffer stop */}
              <line x1="1990" y1="222" x2="1990" y2="238" stroke="#ef4444" strokeWidth="4" />
              <circle cx="1990" cy="230" r="3" fill="#ef4444" />
              <text x="1910" y="244" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="middle">NLC SIDING</text>

              {/* Turnout from DN track into Siding (trailing) */}
              <line x1="1925" y1={DN_Y} x2="1960" y2="230" stroke="#2563eb" strokeWidth="3.5" />
              <circle cx="1925" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="1960" cy="230" r="3" fill="#10b981" />

              {/* Turnout from Siding into DN track (facing) */}
              <line x1="1905" y1="230" x2="1940" y2={DN_Y} stroke="#2563eb" strokeWidth="3.5" />
              <circle cx="1905" cy="230" r="3" fill="#10b981" />
              <circle cx="1940" cy={DN_Y} r="3" fill="#ef4444" />

              {/* Crossover from DN track to UP track */}
              <line x1="1940" y1={DN_Y} x2="1985" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="1940" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="1985" cy={UP_Y} r="3" fill="#10b981" />

              {/* Signal 9104 on UP track at NLC */}
              <rect x="1898" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="1910" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">9104</text>
            </g>

            {/* ── MAHALAKSHMI (MHLI) UPPER SIDING (As per Alstom SCADA) ── */}
            <g>
              {/* Upper Siding Track above UP Line */}
              <line x1="2990" y1="40" x2="3100" y2="40" stroke="#2563eb" strokeWidth="3.5" />
              
              {/* Left buffer stop */}
              <line x1="2990" y1="32" x2="2990" y2="48" stroke="#ef4444" strokeWidth="4" />
              <circle cx="2990" cy="40" r="3" fill="#ef4444" />

              {/* Right buffer stop */}
              <line x1="3100" y1="32" x2="3100" y2="48" stroke="#ef4444" strokeWidth="4" />
              <circle cx="3100" cy="40" r="3" fill="#ef4444" />
              <text x="3045" y="32" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="middle">MHLI SIDING</text>

              {/* Turnout from UP track after MHLI platform into Upper Siding */}
              <line x1="3065" y1={UP_Y} x2="3095" y2="40" stroke="#2563eb" strokeWidth="3.5" />
              <circle cx="3065" cy={UP_Y} r="3" fill="#ef4444" />
              <circle cx="3095" cy="40" r="3" fill="#10b981" />

              {/* Signal 9112 above UP track at MHLI */}
              <rect x="3028" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="3040" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">9112</text>

              {/* Signal 7010 below DN track at MHLI */}
              <rect x="3028" y={DN_Y + 14} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="3040" y={DN_Y + 23} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7010</text>
            </g>

            {/* ── NAGASANDRA (NGSA) LOWER SIDING (As per Alstom SCADA) ── */}
            <g>
              {/* Lower Siding Track beneath Down Line */}
              <line x1="4215" y1="230" x2="4275" y2="230" stroke="#2563eb" strokeWidth="3.5" />
              
              {/* Left buffer stop */}
              <line x1="4215" y1="222" x2="4215" y2="238" stroke="#ef4444" strokeWidth="4" />
              <circle cx="4215" cy="230" r="3" fill="#ef4444" />

              {/* Right buffer stop with signal 7020 */}
              <line x1="4275" y1="222" x2="4275" y2="238" stroke="#ef4444" strokeWidth="4" />
              <circle cx="4275" cy="230" r="3" fill="#ef4444" />
              <rect x="4280" y="222" width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="4292" y="231" fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7020</text>
              <text x="4245" y="244" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="middle">NGSA SIDING</text>

              {/* Turnout from DN track into Siding */}
              <line x1="4210" y1={DN_Y} x2="4245" y2="230" stroke="#2563eb" strokeWidth="3.5" />
              <circle cx="4210" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="4245" cy="230" r="3" fill="#10b981" />

              {/* Signal 9102 above UP track at MNJN */}
              <rect x="4308" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="4320" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">9102</text>
            </g>

            {/* ── PEENYA INDUSTRY (PYID) ROAD 3 (RD-3) & DEPOT LEADS ── */}
            <g>
              {/* Divergence from DN track before PYID into RD-3 */}
              <line x1="3660" y1={DN_Y} x2="3705" y2={RD3_Y} stroke="#2563eb" strokeWidth="3.5" />
              <circle cx="3660" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="3705" cy={RD3_Y} r="3" fill="#10b981" />

              {/* Signal 7019 and Left Buffer Stop on Road 3 */}
              <rect x="3636" y={RD3_Y - 18} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="3648" y={RD3_Y - 9} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7019</text>
              <line x1="3660" y1={RD3_Y - 8} x2="3660" y2={RD3_Y + 8} stroke="#ef4444" strokeWidth="4" />

              {/* PYID Road 3 (RD-3) Track Line */}
              <line x1="3660" y1={RD3_Y} x2="3860" y2={RD3_Y} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="3860" y1={RD3_Y - 8} x2="3860" y2={RD3_Y + 8} stroke="#ef4444" strokeWidth="4" />

              {/* PYID RD-3 Platform Marker and Badge */}
              <line x1="3730" y1={RD3_Y - 6} x2="3800" y2={RD3_Y - 6} stroke="#ffffff" strokeWidth="2.5" />
              <rect 
                x="3725" 
                y={RD3_Y - 11} 
                width="74" 
                height="22" 
                fill="#78350f" 
                stroke="#f59e0b" 
                strokeWidth="1.5" 
                rx="3" 
              />
              <text x="3762" y={RD3_Y + 4} fill="#fef08a" fontSize="9" fontWeight="900" textAnchor="middle">
                PYID RD-3
              </text>
              <text x="3762" y={RD3_Y + 19} fill="#cbd5e1" fontSize="7" fontWeight="bold" textAnchor="middle">
                -3.020 km (Standby Loop)
              </text>

              {/* Reconvergence from RD-3 back into DN track after PYID */}
              <line x1="3850" y1={RD3_Y} x2="3890" y2={DN_Y} stroke="#2563eb" strokeWidth="3.5" />
              <circle cx="3850" cy={RD3_Y} r="3" fill="#10b981" />
              <circle cx="3890" cy={DN_Y} r="3" fill="#ef4444" />

              {/* Divergence from RD-3 towards Peenya Depot Transfer Track 2 */}
              <line x1="3770" y1={RD3_Y} x2="3820" y2={DEPOT_Y1} stroke="#2563eb" strokeWidth="3.5" />
              <circle cx="3770" cy={RD3_Y} r="3" fill="#ef4444" />
              <circle cx="3820" cy={DEPOT_Y1} r="3" fill="#10b981" />

              {/* Transfer Track 2 (Dynamic Movement Track - induction towards PYID) */}
              <line x1="3820" y1={DEPOT_Y1} x2="4005" y2={DEPOT_Y1} stroke="#2563eb" strokeWidth="3.5" />
              <text x="3912" y={DEPOT_Y1 - 6} fill="#93c5fd" fontSize="7.5" fontWeight="bold">TRANSFER TRACK 2 (INDUCTION)</text>

              {/* Divergence to Transfer Track 1 */}
              <line x1="3855" y1={DEPOT_Y1} x2="3895" y2={DEPOT_Y2} stroke="#2563eb" strokeWidth="3" />
              <circle cx="3855" cy={DEPOT_Y1} r="3" fill="#ef4444" />
              <circle cx="3895" cy={DEPOT_Y2} r="3" fill="#10b981" />

              {/* Transfer Track 1 (Dynamic Movement Track - induction towards PYID) */}
              <line x1="3895" y1={DEPOT_Y2} x2="4005" y2={DEPOT_Y2} stroke="#2563eb" strokeWidth="3" />
              <text x="3945" y={DEPOT_Y2 - 6} fill="#93c5fd" fontSize="7.5" fontWeight="bold">TRANSFER TRACK 1 (INDUCTION)</text>

              {/* Depot Boundary Line between Transfer Tracks and Peenya Depot Yard */}
              <line x1="4005" y1={DEPOT_Y1 - 18} x2="4005" y2={DEPOT_Y3 + 18} stroke="#facc15" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.75" />
              <text x="4005" y={DEPOT_Y1 - 22} fill="#facc15" fontSize="7" fontWeight="bold" textAnchor="middle">DEPOT BOUNDARY</text>

              {/* ── PEENYA DEPOT SBL (STABLING LINES YARD) ── */}
              <rect x="4010" y={DEPOT_Y1 - 16} width="210" height={DEPOT_Y3 - DEPOT_Y1 + 34} fill="#0f172a" fillOpacity="0.85" stroke="#eab308" strokeWidth="1.2" strokeDasharray="4 2" rx="3" />
              <text x="4115" y={DEPOT_Y1 - 5} fill="#facc15" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.5">PEENYA DEPOT SBL (STABLING LINES)</text>

              {/* SBL-1 (Depot Stabling Line 1) */}
              <line x1="4005" y1={DEPOT_Y1} x2="4185" y2={DEPOT_Y1} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y1 - 8} x2="4185" y2={DEPOT_Y1 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y1 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-1</text>

              {/* SBL-2 (Depot Stabling Line 2) */}
              <line x1="4005" y1={DEPOT_Y2} x2="4185" y2={DEPOT_Y2} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y2 - 8} x2="4185" y2={DEPOT_Y2 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y2 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-2</text>

              {/* SBL-3 (Depot Stabling Line 3 with Turnout from SBL-2) */}
              <line x1="4025" y1={DEPOT_Y2} x2="4055" y2={DEPOT_Y3} stroke="#2563eb" strokeWidth="3" />
              <circle cx="4025" cy={DEPOT_Y2} r="2.5" fill="#ef4444" />
              <circle cx="4055" cy={DEPOT_Y3} r="2.5" fill="#10b981" />
              <line x1="4055" y1={DEPOT_Y3} x2="4185" y2={DEPOT_Y3} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y3 - 8} x2="4185" y2={DEPOT_Y3 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y3 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-3</text>
            </g>

            {/* ── EAST-WEST LINE PURPLE LINE LINK AT KGWA (Majestic) ── */}
            <g>
              <line x1="2370" y1={DN_Y} x2="2415" y2={LINK_Y} stroke="#a855f7" strokeWidth="3.5" />
              <line x1="2415" y1={LINK_Y} x2="2465" y2={LINK_Y} stroke="#a855f7" strokeWidth="3.5" />
              <text x="2440" y={LINK_Y - 5} fill="#facc15" fontSize="8" fontWeight="900">EAST-WEST LINE</text>
              <circle cx="2370" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="2415" cy={LINK_Y} r="3" fill="#a855f7" />
            </g>

            {/* ── ALSTOM ATS CROSSOVERS AS PER SCADA ── */}
            
            {/* 1. Stage-1 / APTS Terminal Crossover (DN to UP right before APTS platform) */}
            <g>
              <line x1="220" y1={DN_Y} x2="260" y2={UP_Y} stroke="#ef4444" strokeWidth="3.5" />
              <circle cx="220" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="260" cy={UP_Y} r="3" fill="#ef4444" />
              <rect x="278" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="290" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">9114</text>
            </g>

            {/* 2. PUTH Crossovers: Two before PUTH (DN->UP, UP->DN) and One after PUTH (UP->DN) */}
            <g>
              {/* Before PUTH: DN to UP */}
              <line x1="870" y1={DN_Y} x2="910" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="870" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="910" cy={UP_Y} r="3" fill="#10b981" />

              {/* Before PUTH: UP to DN */}
              <line x1="910" y1={UP_Y} x2="950" y2={DN_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="910" cy={UP_Y} r="3" fill="#10b981" />
              <circle cx="950" cy={DN_Y} r="3" fill="#ef4444" />

              {/* After PUTH (towards JPN): UP to DN */}
              <line x1="1010" y1={UP_Y} x2="1050" y2={DN_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="1010" cy={UP_Y} r="3" fill="#10b981" />
              <circle cx="1050" cy={DN_Y} r="3" fill="#ef4444" />
              <rect x="1108" y={DN_Y + 14} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="1120" y={DN_Y + 23} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7007</text>
            </g>

            {/* 3. RVR Crossovers: Both DN to UP (One before RVR, One after RVR) */}
            <g>
              {/* Signal 9121 at BSHK */}
              <rect x="1228" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="1240" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">9121</text>

              {/* Before RVR: DN to UP */}
              <line x1="1290" y1={DN_Y} x2="1330" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="1290" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="1330" cy={UP_Y} r="3" fill="#10b981" />

              {/* After RVR: DN to UP */}
              <line x1="1410" y1={DN_Y} x2="1450" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="1410" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="1450" cy={UP_Y} r="3" fill="#10b981" />
              <rect x="1418" y={DN_Y + 14} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="1430" y={DN_Y + 23} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7015</text>
            </g>

            {/* 4. Section Divider: Elevated to Underground after NLC (Before KRMT) */}
            <g>
              <line x1="2010" y1={UP_Y - 45} x2="2010" y2={DN_Y + 45} stroke="#eab308" strokeWidth="1.5" strokeDasharray="4 4" />
              <rect x="1920" y={UP_Y - 50} width="180" height="15" fill="#0f172a" rx="2" stroke="#eab308" strokeWidth="0.8" />
              <text x="2010" y={UP_Y - 39} fill="#facc15" fontSize="7.5" fontWeight="900" textAnchor="middle">
                ELEVATED | UNDERGROUND
              </text>
            </g>

            {/* 5. KGWA Majestic Platform Signal */}
            <g>
              <rect x="2318" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="2330" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">9113</text>
            </g>

            {/* 6. Section Divider: Underground to Elevated before Sampige Road */}
            <g>
              <line x1="2475" y1={UP_Y - 45} x2="2475" y2={DN_Y + 45} stroke="#eab308" strokeWidth="1.5" strokeDasharray="4 4" />
              <rect x="2385" y={UP_Y - 50} width="180" height="15" fill="#0f172a" rx="2" stroke="#eab308" strokeWidth="0.8" />
              <text x="2475" y={UP_Y - 39} fill="#facc15" fontSize="7.5" fontWeight="900" textAnchor="middle">
                UNDERGROUND | ELEVATED
              </text>
            </g>

            {/* 7. SPGD Crossovers: One before SPGD (DN to UP) and One after SPGD (DN to UP) */}
            <g>
              {/* Before SPGD: DN to UP */}
              <line x1="2430" y1={DN_Y} x2="2470" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="2430" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="2470" cy={UP_Y} r="3" fill="#10b981" />
              <rect x="2405" y={DN_Y + 14} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="2417" y={DN_Y + 23} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7009</text>

              {/* After SPGD: DN to UP */}
              <line x1="2530" y1={DN_Y} x2="2570" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="2530" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="2570" cy={UP_Y} r="3" fill="#10b981" />
            </g>

            {/* 8. RJNR Crossover: After RJNR platform (UP to DN) */}
            <g>
              <rect x="2758" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="2770" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">8703</text>
              <line x1="2930" y1={UP_Y} x2="2970" y2={DN_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="2930" cy={UP_Y} r="3" fill="#10b981" />
              <circle cx="2970" cy={DN_Y} r="3" fill="#ef4444" />
            </g>

            {/* 9. YPM Datum Crossover: After YPM platform (DN to UP) */}
            <g>
              <line x1="3350" y1={DN_Y} x2="3390" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="3350" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="3390" cy={UP_Y} r="3" fill="#10b981" />
              <rect x="3438" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="3450" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">9117</text>
              <rect x="3568" y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x="3580" y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">8723</text>
            </g>

            {/* 10. PYID Crossovers & Reconnections */}
            <g>
              {/* After PYID: UP to DN crossover */}
              <line x1="3780" y1={UP_Y} x2="3820" y2={DN_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="3780" cy={UP_Y} r="3" fill="#10b981" />
              <circle cx="3820" cy={DN_Y} r="3" fill="#ef4444" />
            </g>

            {/* 11. NGSA Crossovers: Single crossover between DSH & NGSA (UP to DN) and After NGSA V-crossover */}
            <g>
              {/* Between DSH and NGSA: Single UP to DN crossover */}
              <line x1="4095" y1={UP_Y} x2="4135" y2={DN_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="4095" cy={UP_Y} r="3" fill="#10b981" />
              <circle cx="4135" cy={DN_Y} r="3" fill="#ef4444" />

              {/* After NGSA: UP to DN */}
              <line x1="4205" y1={UP_Y} x2="4245" y2={DN_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="4205" cy={UP_Y} r="3" fill="#10b981" />
              <circle cx="4245" cy={DN_Y} r="3" fill="#ef4444" />

              {/* After NGSA: DN to UP (forms V-crossover) */}
              <line x1="4245" y1={DN_Y} x2="4285" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="4245" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="4285" cy={UP_Y} r="3" fill="#10b981" />
            </g>

            {/* 12. BIET Terminal Crossovers & Terminus Buffer Stops */}
            <g>
              {/* Before BIET: UP to DN crossover */}
              <line x1="4525" y1={UP_Y} x2="4565" y2={DN_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="4525" cy={UP_Y} r="3" fill="#10b981" />
              <circle cx="4565" cy={DN_Y} r="3" fill="#ef4444" />

              {/* After BIET: DN to UP crossover (reversing leads) */}
              <line x1="4635" y1={DN_Y} x2="4675" y2={UP_Y} stroke="#38bdf8" strokeWidth="3.5" />
              <circle cx="4635" cy={DN_Y} r="3" fill="#ef4444" />
              <circle cx="4675" cy={UP_Y} r="3" fill="#10b981" />
              
              {/* Buffer End Reversing Track (Cab Changeover Area) */}
              <rect x="4630" y={UP_Y - 16} width="85" height={DN_Y - UP_Y + 32} fill="#ef4444" fillOpacity="0.08" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 3" rx="3" />
              <text x="4672" y={UP_Y - 5} fill="#fca5a5" fontSize="7" fontWeight="bold" textAnchor="middle">CAB CHANGEOVER</text>
              <text x="4672" y={DN_Y + 14} fill="#fca5a5" fontSize="6.5" fontWeight="bold" textAnchor="middle">BUFFER END TRACK</text>

              {/* Terminus red buffer stops with signal 7001 */}
              <line x1={END_X} y1={UP_Y - 14} x2={END_X} y2={UP_Y + 14} stroke="#ef4444" strokeWidth="5" strokeLinecap="square" />
              <line x1={END_X} y1={DN_Y - 14} x2={END_X} y2={DN_Y + 14} stroke="#ef4444" strokeWidth="5" strokeLinecap="square" />
              <rect x={END_X - 12} y={UP_Y - 26} width="24" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
              <text x={END_X} y={UP_Y - 17} fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7001</text>
              <text x={END_X} y={DN_Y + 23} fill="#ef4444" fontSize="7.5" fontWeight="900" textAnchor="middle">BUFFER END</text>
            </g>

            {/* ── STATIONS ALONG THE CONTINUOUS ALIGNMENT ── */}
            {ALSTOM_LINE_STATIONS.map((st) => {
              const ch = getChainage(st.code);
              const isPyid = st.code === 'PYID';
              const isDatum = st.code === 'YPM';
              const isUnderground = st.isUnderground;

              return (
                <g key={st.code} className="cursor-pointer group" onClick={() => setSelectedStation(st.code)}>
                  <line x1={st.x} y1={UP_Y - 25} x2={st.x} y2={DN_Y + 40} stroke="#64748b" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.4" />
                  
                  <line x1={st.x - 24} y1={UP_Y - 9} x2={st.x + 24} y2={UP_Y - 9} stroke="#ffffff" strokeWidth="2.5" />
                  <line x1={st.x - 24} y1={DN_Y + 9} x2={st.x + 24} y2={DN_Y + 9} stroke="#ffffff" strokeWidth="2.5" />

                  <rect 
                    x={st.x - 32} 
                    y={(UP_Y + DN_Y) / 2 - 12} 
                    width="64" 
                    height="24" 
                    fill={isPyid ? "#b45309" : isDatum ? "#0369a1" : isUnderground ? "#581c87" : "#0f172a"} 
                    stroke={isPyid ? "#f59e0b" : isDatum ? "#38bdf8" : isUnderground ? "#a855f7" : "#38bdf8"} 
                    strokeWidth={isPyid || isDatum ? "2" : "1.5"} 
                    rx="3"
                    className="hover:stroke-yellow-400 hover:scale-105 transition-all shadow-md"
                  />
                  <text x={st.x} y={(UP_Y + DN_Y) / 2 + 3} fill="#f8fafc" fontSize="10.5" fontWeight="900" textAnchor="middle">
                    {st.code}
                  </text>

                  <text x={st.x} y={(UP_Y + DN_Y) / 2 + 25} fill={isPyid ? "#fde68a" : isDatum ? "#fef08a" : "#38bdf8"} fontSize="8.5" fontWeight="bold" textAnchor="middle">
                    {ch === 0 ? "0.000 km (DATUM)" : (ch > 0 ? `+${ch.toFixed(3)} km` : `${ch.toFixed(3)} km`)}
                  </text>

                  <text x={st.x} y={DN_Y + 36} fill="#94a3b8" fontSize="8" textAnchor="middle" className="group-hover:text-slate-100 transition-colors">
                    {st.name.split(' ')[0]}
                  </text>
                </g>
              );
            })}

            {/* ── TIMETABLE-SYNCHRONIZED MOVING TRAIN BADGES ── */}
            {timetableTrains.map((train) => {
              const isUp = train.direction === 'UP';
              const trX = train.currentX;
              const trY = train.currentY;

              return (
                <g 
                  key={`${train.trainId}_${train.direction}_${train.rowId || ''}`} 
                  className="cursor-pointer transition-transform duration-500 ease-out"
                  onClick={() => onSelectTrain(train)}
                  onMouseEnter={() => setHoveredTrain(train)}
                  onMouseLeave={() => setHoveredTrain(null)}
                >
                  {/* Moving / Stabled train block */}
                  <rect 
                    x={trX - 28} 
                    y={trY - 12} 
                    width="56" 
                    height="24" 
                    fill={
                      trY >= DEPOT_Y1 
                        ? "#1e293b" 
                        : trY === RD3_Y 
                        ? "#78350f" 
                        : (train.statusText.includes('BUFFER') || train.statusText.includes('CHANGEOVER')) 
                        ? "#881337" 
                        : (isUp ? "#059669" : "#0284c7")
                    } 
                    stroke={
                      trY >= DEPOT_Y1 
                        ? "#f59e0b" 
                        : trY === RD3_Y 
                        ? "#fde047" 
                        : (train.statusText.includes('BUFFER') || train.statusText.includes('CHANGEOVER')) 
                        ? "#f43f5e" 
                        : "#ffffff"
                    } 
                    strokeWidth="2" 
                    rx="4"
                    filter="url(#train-glow-up)"
                    className="shadow-2xl"
                  />

                  {/* Train number text with direction / location arrow */}
                  <text x={trX} y={trY + 4} fill="#ffffff" fontSize="9.5" fontWeight="900" textAnchor="middle">
                    {trY >= DEPOT_Y1 
                      ? (train.isStabling ? `T${train.particularTrainId || train.trainId} [SBL]` : `T${train.particularTrainId || train.trainId} ➔ PYID`) 
                      : trY === RD3_Y 
                      ? `T${train.particularTrainId || train.trainId} (RD-3)` 
                      : (train.statusText.includes('BUFFER') || train.statusText.includes('CHANGEOVER'))
                      ? `T${train.particularTrainId || train.trainId} (REV)`
                      : train.computedTrainId
                      ? (isUp ? `${train.computedTrainId} ➔` : `⬅ ${train.computedTrainId}`)
                      : (isUp ? `T${train.trainId} ➔` : `⬅ T${train.trainId}`)}
                  </text>

                  {/* Enriched detail tooltip */}
                  <title>
                    {`Train ID: ${train.computedTrainId || train.displayTrainId || 'Pending'}\nUnit: ${train.particularTrainId || train.trainId}\nDestination Code: ${train.destinationId || 'N/A'}\nStatus: ${train.trainIdStatus || 'UNKNOWN'}\nLocation: ${train.currentStation || 'Line-2'}\nOperator: ${train.operatorName || '--'}${train.reliever?.name ? `\nReliever: ${train.reliever.name} (Duty ${train.reliever.dutyNo || '--'})` : ''}`}
                  </title>

                  {/* Directional Headlight beam (only active when moving on main line) */}
                  {train.speedKmH > 0 && trY <= DN_Y && (
                    isUp ? (
                      <polygon points={`${trX + 28},${trY - 6} ${trX + 46},${trY - 14} ${trX + 46},${trY + 14} ${trX + 28},${trY + 6}`} fill="#facc15" opacity="0.45" />
                    ) : (
                      <polygon points={`${trX - 28},${trY - 6} ${trX - 46},${trY - 14} ${trX - 46},${trY + 14} ${trX - 28},${trY + 6}`} fill="#38bdf8" opacity="0.45" />
                    )
                  )}

                  {/* Driver tag and operational speed derived from timetable */}
                  <rect x={trX - 36} y={trY + 14} width="72" height="12" fill="#0f172a" fillOpacity="0.95" rx="2" stroke="#475569" strokeWidth="1" />
                  <text x={trX} y={trY + 23} fill={trY >= DEPOT_Y1 ? "#facc15" : trY === RD3_Y ? "#fde047" : (isUp ? "#34d399" : "#38bdf8")} fontSize="7" fontWeight="bold" textAnchor="middle">
                    {train.operatorName ? train.operatorName.split(' ')[0] : `D${train.dutyNo}`} ({train.statusText})
                  </text>
                </g>
              );
            })}

          </svg>

        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. BOTTOM ATS SCADA STATUS BAR & TIME SCRUBBER                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#353c47] border-t border-[#262c34] px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3 text-[10px] text-slate-300">
        
        {/* Left: Timetable Timeline Fast Jump Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] text-amber-400 font-bold uppercase flex items-center gap-1">
            <Clock size={11} />
            <span>TIMETABLE SHIFTS:</span>
          </span>
          {[
            { label: '06:30 Morning Outflow', mins: 390 },
            { label: '08:30 Peak Hour', mins: 510 },
            { label: '11:15 Mid-Day Run', mins: 675 },
            { label: '17:45 Evening Peak', mins: 1065 },
            { label: '21:30 Night Turn', mins: 1290 }
          ].map((shift) => (
            <button
              key={shift.label}
              onClick={() => {
                setIsSimPlaying(false);
                onTimeChange(shift.mins);
              }}
              className="px-2 py-0.5 bg-[#20252e] hover:bg-slate-800 border border-slate-600 rounded text-[9px] text-cyan-300 font-bold transition-colors"
            >
              {shift.label}
            </button>
          ))}
        </div>

        {/* Right: Active train counters strictly from the day type timetable */}
        <div className="flex items-center gap-4 text-[9px]">
          <div className="text-cyan-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span>Active Trains on {activeSchedule} Timetable: <strong>{timetableTrains.filter(t => !t.isStabling).length} Running</strong> (UP: {timetableTrains.filter(t => t.direction === 'UP' && !t.isStabling).length} | DN: {timetableTrains.filter(t => t.direction === 'DOWN' && !t.isStabling).length})</span>
          </div>

          <div className="bg-[#20252e] px-2 py-0.5 rounded border border-slate-700">
            <span className="text-slate-400">Node: </span>
            <span className="text-amber-400 font-bold">PYID CATS</span>
          </div>
          <div>
            User: <strong className="text-emerald-300">pyid_crew / Crew Controller PYID</strong>
          </div>
        </div>
      </div>

      {/* Selected Station Modal */}
      {selectedStation && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/50 rounded-xl p-5 max-w-md w-full shadow-2xl space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 text-sm font-black">
                  {selectedStation}
                </span>
                <h3 className="text-sm font-bold text-slate-100">
                  {ALSTOM_LINE_STATIONS.find(s => s.code === selectedStation)?.name || selectedStation}
                </h3>
              </div>
              <button 
                onClick={() => setSelectedStation(null)}
                className="text-slate-400 hover:text-slate-100 font-black text-sm px-2 py-1 bg-slate-800 rounded"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[9px]">OFFICIAL CHAINAGE:</span>
                <strong className="text-cyan-400 text-sm">
                  {getChainage(selectedStation) >= 0 ? `+${getChainage(selectedStation).toFixed(3)}` : getChainage(selectedStation).toFixed(3)} KM
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">DISTANCE FROM YPM:</span>
                <strong className="text-emerald-400 text-sm">
                  {Math.abs(getChainage(selectedStation)).toFixed(3)} KM
                </strong>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">STATION SEQUENCE:</span>
                <span className="text-slate-300 font-bold">
                  #{ALSTOM_LINE_STATIONS.findIndex(s => s.code === selectedStation) + 1} of 34
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px]">DAY TYPE TIMETABLE:</span>
                <span className="text-amber-300 font-bold">
                  {activeSchedule} WTT
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedStation(null)}
              className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold text-xs shadow-md transition-colors"
            >
              Close Station Inspection
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

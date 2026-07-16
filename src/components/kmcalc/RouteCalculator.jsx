/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PREDEFINED_TRIPS } from '../../data/kmcalc/masterStations';
import { calculateDistance } from '../../utils/kmCalculator';
import { 
  Plus, 
  Trash2, 
  ArrowRight, 
  HelpCircle, 
  RotateCcw, 
  ShieldCheck, 
  MapPin, 
  Compass, 
  ArrowUpRight, 
  ArrowDownRight
} from 'lucide-react';

// 32 main passenger stations with matching serial order and coordinates for the serpentine layout
const MAP_STATIONS = [
  // Row 1 (Left to Right): y = 60
  { code: 'BIET_BE', displayCode: 'BIET BE', x: 20, y: 60, row: 1, labelPos: 'above' },
  { code: 'BIET', displayCode: 'BIET', x: 60, y: 60, row: 1, labelPos: 'above' },
  { code: 'JDHL', displayCode: 'JIDL', x: 150, y: 60, row: 1, labelPos: 'above' },
  { code: 'MNJN', displayCode: 'MNJN', x: 240, y: 60, row: 1, labelPos: 'above' },
  { code: 'NGSA_PT', displayCode: 'NGSA PKT', x: 270, y: 20, row: 1, labelPos: 'below' },
  { code: 'NGSA_BE', displayCode: 'NGSA BE', x: 300, y: 60, row: 1, labelPos: 'above' },
  { code: 'NGSA', displayCode: 'NGSA', x: 330, y: 60, row: 1, labelPos: 'above' },
  { code: 'DSH', displayCode: 'DSH', x: 420, y: 60, row: 1, labelPos: 'above' },
  { code: 'JLHL', displayCode: 'JLHL', x: 510, y: 60, row: 1, labelPos: 'above' },
  { code: 'DEPOT', displayCode: 'DEPOT', x: 555, y: 20, row: 1, labelPos: 'below' },
  { code: 'PYID', displayCode: 'PYID', x: 600, y: 60, row: 1, labelPos: 'above' },
  { code: 'PEYA', displayCode: 'PEYA', x: 690, y: 60, row: 1, labelPos: 'above' },
  { code: 'YPI', displayCode: 'YPI', x: 780, y: 60, row: 1, labelPos: 'above' },
  { code: 'YPM', displayCode: 'YPM', x: 870, y: 60, row: 1, labelPos: 'above' },
  { code: 'SSFY', displayCode: 'SSFY', x: 960, y: 60, row: 1, labelPos: 'above' },

  // Row 2 (Right to Left): y = 160
  { code: 'MHLI', displayCode: 'MHLI', x: 960, y: 160, row: 2, labelPos: 'above' },
  { code: 'MHLI_PT', displayCode: 'MHLI PKT', x: 915, y: 120, row: 2, labelPos: 'below' },
  { code: 'RJNR', displayCode: 'RJNR', x: 870, y: 160, row: 2, labelPos: 'above' },
  { code: 'KVPR', displayCode: 'KVPR', x: 780, y: 160, row: 2, labelPos: 'above' },
  { code: 'SPRU', displayCode: 'SPRU', x: 690, y: 160, row: 2, labelPos: 'above' },
  { code: 'SPGD', displayCode: 'SPGD', x: 600, y: 160, row: 2, labelPos: 'above' },
  { code: 'KGWA', displayCode: 'KGWA', x: 510, y: 160, row: 2, labelPos: 'above' },
  { code: 'CKPE', displayCode: 'CKPE', x: 420, y: 160, row: 2, labelPos: 'above' },
  { code: 'KRMT', displayCode: 'KRMT', x: 330, y: 160, row: 2, labelPos: 'above' },
  { code: 'NLC', displayCode: 'NLC', x: 240, y: 160, row: 2, labelPos: 'above' },
  { code: 'NLC_PT', displayCode: 'NLC PKT', x: 200, y: 120, row: 2, labelPos: 'below' },
  { code: 'LBGH', displayCode: 'LBGH', x: 150, y: 160, row: 2, labelPos: 'above' },
  { code: 'SECE', displayCode: 'SECE', x: 60, y: 160, row: 2, labelPos: 'above' },

  // Row 3 (Left to Right): y = 260
  { code: 'JYN', displayCode: 'JYN', x: 60, y: 260, row: 3, labelPos: 'above' },
  { code: 'RVR', displayCode: 'RVR', x: 160, y: 260, row: 3, labelPos: 'above' },
  { code: 'BSNK', displayCode: 'BSNK', x: 260, y: 260, row: 3, labelPos: 'above' },
  { code: 'JPN', displayCode: 'JPN', x: 360, y: 260, row: 3, labelPos: 'above' },
  { code: 'PUTH', displayCode: 'PUTH', x: 460, y: 260, row: 3, labelPos: 'above' },
  { code: 'PUTH_BE', displayCode: 'PUTH BE', x: 510, y: 260, row: 3, labelPos: 'above' },
  { code: 'APRC', displayCode: 'APRC', x: 560, y: 260, row: 3, labelPos: 'above' },
  { code: 'KLPK', displayCode: 'KLPK', x: 660, y: 260, row: 3, labelPos: 'above' },
  { code: 'VJRH', displayCode: 'VJRH', x: 760, y: 260, row: 3, labelPos: 'above' },
  { code: 'TGTP', displayCode: 'TGTP', x: 860, y: 260, row: 3, labelPos: 'above' },
  { code: 'APTS', displayCode: 'APTS', x: 960, y: 260, row: 3, labelPos: 'above' },
  { code: 'APTS_BE', displayCode: 'APTS BE', x: 1000, y: 260, row: 3, labelPos: 'above' }
];

export default function RouteCalculator({ stations, selectedSequence, setSelectedSequence }) {
  const [activeTab, setActiveTab] = useState('custom');
  const [hoveredStation, setHoveredStation] = useState(null);

  const addStationToSequence = () => {
    setSelectedSequence([...selectedSequence, '']);
  };

  const removeStationFromSequence = (index) => {
    if (selectedSequence.length <= 1) return;
    const nextSeq = [...selectedSequence];
    nextSeq.splice(index, 1);
    setSelectedSequence(nextSeq);
  };

  const updateStationInSequence = (index, code) => {
    const nextSeq = [...selectedSequence];
    nextSeq[index] = code;
    setSelectedSequence(nextSeq);
  };

  const clearSequence = () => {
    setSelectedSequence([]);
  };

  const handleStationClick = (code) => {
    // If we click a station, we append it to the current sequence
    // If the sequence contains empty slots, fill them first, otherwise append
    const emptyIndex = selectedSequence.indexOf('');
    if (emptyIndex !== -1) {
      const nextSeq = [...selectedSequence];
      nextSeq[emptyIndex] = code;
      setSelectedSequence(nextSeq);
    } else {
      setSelectedSequence([...selectedSequence, code]);
    }
  };

  // Compute segments and values
  const segments = [];
  let totalDistance = 0;

  for (let i = 0; i < selectedSequence.length - 1; i++) {
    const from = selectedSequence[i];
    const to = selectedSequence[i + 1];
    if (from && to) {
      const dist = calculateDistance(from, to);
      const fromStn = stations.find(s => s.code === from);
      const toStn = stations.find(s => s.code === to);
      
      let direction = 'Stationary';
      if (fromStn && toStn) {
        if (toStn.chainage > fromStn.chainage) {
          direction = 'DOWN';
        } else if (toStn.chainage < fromStn.chainage) {
          direction = 'UP';
        }
      }

      segments.push({ from, to, distance: dist, direction });
      totalDistance += dist;
    }
  }

  return (
    <div className="space-y-3.5" id="route-calculator-container">
      {/* Header and Mode Selector */}
      <div className="bg-slate-900 border border-slate-800 rounded p-3 px-4 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-tight text-emerald-400 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-emerald-500 animate-spin-slow" />
            Automatic Chainage Distance Engine
          </h2>
          <p className="text-slate-400 text-[10px] mt-0.5">
            Click on the interactive map nodes below to build sequence routes, or look up predetermined crew trips. Math is absolute difference in coordinates.
          </p>
        </div>
        
        {/* Tab Buttons */}
        <div className="bg-slate-950 p-0.5 rounded border border-slate-800 flex self-stretch md:self-auto">
          <button
            id="tab-btn-custom-calc"
            onClick={() => setActiveTab('custom')}
            className={`flex-1 md:flex-none px-3 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
              activeTab === 'custom' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Interactive Track Builder
          </button>
          <button
            id="tab-btn-predefined-lookup"
            onClick={() => setActiveTab('lookup')}
            className={`flex-1 md:flex-none px-3 py-1 rounded text-[10px] font-mono font-semibold transition-colors ${
              activeTab === 'lookup' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Predefined Trip Reference
          </button>
        </div>
      </div>

      {activeTab === 'custom' ? (
        <div className="space-y-3.5">
          {/* Interactive Serpentine Grid Map Card */}
          <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md" id="interactive-railway-tracks-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-slate-800/80">
              <div>
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Compass className="w-4 h-4 text-emerald-400 animate-pulse" />
                  BMRCL Green Line Dual Parallel Tracks
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Top track is UP Line (Northbound to BIET). Bottom track is DOWN Line (Southbound to APTS).
                </p>
              </div>

              {/* Status Indicator */}
              <div className="flex flex-wrap gap-2 text-[9px] font-mono">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  UP TRACK
                </span>
                <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                  DOWN TRACK
                </span>
                <button
                  id="btn-reset-selection"
                  onClick={clearSequence}
                  className="px-2 py-0.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
                >
                  CLEAR SELECTION
                </button>
              </div>
            </div>

            {/* Scrollable SVG Wrapper for Responsiveness */}
            <div className="w-full overflow-x-auto custom-scrollbar">
              <div className="min-w-[1020px] select-none py-1">
                <svg viewBox="0 0 1020 320" className="w-full h-auto bg-slate-950/40 rounded border border-slate-950 p-2">
                  <defs>
                    <filter id="glow-up-line" x="-10%" y="-10%" width="120%" height="120%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glow-dn-line" x="-10%" y="-10%" width="120%" height="120%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glow-active-halo" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="4" result="blur" />
                      <feColorMatrix type="matrix" values="0 0 0 0 0.06   0 0 0 0 0.71   0 0 0 0 0.84  0 0 0 1 0" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* Parallel Tracks Grid Lines in the background */}
                  <g stroke="#1e293b" strokeWidth="0.5" strokeDasharray="5 5">
                    <line x1="40" y1="60" x2="980" y2="60" />
                    <line x1="40" y1="160" x2="980" y2="160" />
                    <line x1="40" y1="260" x2="980" y2="260" />
                    {/* Depot guide line */}
                    <line x1="555" y1="20" x2="555" y2="60" />
                    {/* Pocket track guidelines */}
                    <line x1="270" y1="20" x2="270" y2="60" />
                    <line x1="915" y1="120" x2="915" y2="160" />
                    <line x1="200" y1="120" x2="200" y2="160" />
                  </g>

                  {/* DEPOT BRANCH BACKGROUND TRACKS (DOWN Track - Cyan) */}
                  <g>
                    <line x1="510" y1="66" x2="555" y2="26" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="555" y1="26" x2="600" y2="66" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="510" y1="66" x2="555" y2="26" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    <line x1="555" y1="26" x2="600" y2="66" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                  </g>

                  {/* DEPOT BRANCH BACKGROUND TRACKS (UP Track - Emerald) */}
                  <g>
                    <line x1="510" y1="54" x2="555" y2="14" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="555" y1="14" x2="600" y2="54" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="510" y1="54" x2="555" y2="14" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                    <line x1="555" y1="14" x2="600" y2="54" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* NGSA_PT (NGSA PKT) BRANCH SIDING TRACKS */}
                  <g>
                    {/* DOWN Track (Cyan) */}
                    <line x1="270" y1="26" x2="330" y2="66" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="270" y1="26" x2="330" y2="66" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    {/* UP Track (Emerald) */}
                    <line x1="270" y1="14" x2="330" y2="54" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="270" y1="14" x2="330" y2="54" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* MHLI_PT (MHLI PKT) BRANCH SIDING TRACKS */}
                  <g>
                    {/* DOWN Track (Cyan) */}
                    <line x1="960" y1="166" x2="915" y2="126" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="960" y1="166" x2="915" y2="126" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    {/* UP Track (Emerald) */}
                    <line x1="960" y1="154" x2="915" y2="114" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="960" y1="154" x2="915" y2="114" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* NLC_PT (NLC PKT) BRANCH SIDING TRACKS */}
                  <g>
                    {/* DOWN Track (Cyan) */}
                    <line x1="240" y1="166" x2="200" y2="126" stroke="#0284c7" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="240" y1="166" x2="200" y2="126" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-dn-line)' }} />
                    {/* UP Track (Emerald) */}
                    <line x1="240" y1="154" x2="200" y2="114" stroke="#047857" strokeWidth="3.5" strokeLinecap="round" className="opacity-40" />
                    <line x1="240" y1="154" x2="200" y2="114" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" style={{ filter: 'url(#glow-up-line)' }} />
                  </g>

                  {/* DOWN TRACK PATH (Offset +6px - cyan) */}
                  <path
                    d="M 54 66 H 966 A 50 50 0 0 1 966 166 H 54 A 50 50 0 0 0 54 266 H 966"
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="opacity-40"
                  />
                  <path
                    d="M 54 66 H 966 A 50 50 0 0 1 966 166 H 54 A 50 50 0 0 0 54 266 H 966"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    style={{ filter: 'url(#glow-dn-line)' }}
                  />

                  {/* UP TRACK PATH (Offset -6px - emerald) */}
                  <path
                    d="M 66 54 H 954 A 50 50 0 0 1 954 154 H 66 A 50 50 0 0 0 66 254 H 954"
                    fill="none"
                    stroke="#047857"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    className="opacity-40"
                  />
                  <path
                    d="M 66 54 H 954 A 50 50 0 0 1 954 154 H 66 A 50 50 0 0 0 66 254 H 954"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    style={{ filter: 'url(#glow-up-line)' }}
                  />

                  {/* Active Highlight Connection Paths */}
                  {selectedSequence.length >= 2 && selectedSequence.map((code, sIdx) => {
                    if (sIdx === selectedSequence.length - 1) return null;
                    const fromCode = selectedSequence[sIdx];
                    const toCode = selectedSequence[sIdx + 1];

                    const fromNode = MAP_STATIONS.find(n => n.code === fromCode);
                    const toNode = MAP_STATIONS.find(n => n.code === toCode);
                    if (!fromNode || !toNode) return null;

                    // Determine if travel is increasing chainage (DOWN) or decreasing (UP)
                    const fromStn = stations.find(s => s.code === fromCode);
                    const toStn = stations.find(s => s.code === toCode);
                    const isDown = fromStn && toStn ? toStn.chainage > fromStn.chainage : true;

                    // Depending on direction, we draw the path offset corresponding to UP (-6) or DOWN (+6) track line!
                    const yOffset = isDown ? 6 : -6;

                    return (
                      <line
                        key={`line-hl-${sIdx}`}
                        x1={fromNode.x}
                        y1={fromNode.y + yOffset}
                        x2={toNode.x}
                        y2={toNode.y + yOffset}
                        stroke={isDown ? '#06b6d4' : '#10b981'}
                        strokeWidth="4"
                        strokeDasharray="6 4"
                        className="animate-pulse"
                      />
                    );
                  })}

                  {/* Station Nodes & Text Labels */}
                  {MAP_STATIONS.map((stn, index) => {
                    const matchedStn = stations.find(s => s.code === stn.code);
                    const chainage = matchedStn?.chainage ?? 0.0;
                    
                    // Check if this station is selected in the sequence
                    const selectionIndices = [];
                    selectedSequence.forEach((code, idx) => {
                      if (code === stn.code) {
                        selectionIndices.push(idx);
                      }
                    });

                    const isSelected = selectionIndices.length > 0;
                    const isHovered = hoveredStation?.code === stn.code;

                    return (
                      <g
                        key={stn.code}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredStation({ ...stn, name: matchedStn?.name ?? 'Unknown', chainage })}
                        onMouseLeave={() => setHoveredStation(null)}
                        onClick={() => handleStationClick(stn.code)}
                      >
                        {/* Selected halo ring logic */}
                        {isSelected && (
                          <circle
                            cx={stn.x}
                            cy={stn.y}
                            r="16"
                            fill="none"
                            stroke="#06b6d4"
                            strokeWidth="2.5"
                            style={{ filter: 'url(#glow-active-halo)' }}
                            className="animate-ping opacity-60"
                          />
                        )}

                        {/* Outer interactive ring */}
                        <circle
                          cx={stn.x}
                          cy={stn.y}
                          r={isHovered ? '13' : '9'}
                          fill="#030712"
                          stroke={isHovered ? '#10b981' : isSelected ? '#06b6d4' : '#475569'}
                          strokeWidth="2.5"
                          className="transition-all duration-150"
                        />

                        {/* Center dot */}
                        <circle
                          cx={stn.x}
                          cy={stn.y}
                          r={isHovered ? '6' : '4'}
                          fill={isSelected ? '#06b6d4' : '#10b981'}
                          className="transition-all duration-150"
                        />

                        {/* Selection badges count overlay (e.g., ❶, ❷, ❸) */}
                        {isSelected && (
                          <g>
                            <circle
                              cx={stn.x + 8}
                              cy={stn.y - 8}
                              r="7"
                              fill="#06b6d4"
                            />
                            <text
                              x={stn.x + 8}
                              y={stn.y - 5.5}
                              textAnchor="middle"
                              fill="#030712"
                              fontSize="8"
                              fontWeight="black"
                              fontFamily="monospace"
                            >
                              {selectionIndices[0] + 1}
                            </text>
                          </g>
                        )}

                        {/* Station Text Label */}
                        <text
                          x={stn.x}
                          y={stn.labelPos === 'below' ? stn.y + 22 : stn.y - 15}
                          textAnchor="middle"
                          fill={isSelected ? '#38bdf8' : isHovered ? '#34d399' : '#cbd5e1'}
                          fontSize="9"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          {stn.displayCode}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Hover Tooltip Information bar inside SVG Card */}
            <div className="bg-slate-950/40 border border-slate-950 rounded p-2.5 mt-3 flex items-center justify-between text-[11px] font-mono min-h-[38px]">
              {hoveredStation ? (
                <div className="flex items-center gap-4 text-slate-300 w-full justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span>Station: <span className="text-slate-100 font-bold">{hoveredStation.name} ({hoveredStation.displayCode})</span></span>
                  </div>
                  <div>
                    <span>Chainage Coordinate: <span className="text-emerald-400 font-bold">{hoveredStation.chainage >= 0 ? `+${hoveredStation.chainage.toFixed(3)}` : hoveredStation.chainage.toFixed(3)} KM</span></span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 italic">Click to insert into route sheet</span>
                  </div>
                </div>
              ) : (
                <div className="text-slate-500 italic text-center w-full">
                  Hover over any station node on the serpentine grid to view coordinates. Click nodes to build a live routing path!
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* Sequence Selector Column */}
            <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded p-4 shadow-md space-y-3.5 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                    <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                    Trip Segment Station Sequence
                  </h3>
                  <button
                    id="btn-clear-calculator"
                    onClick={clearSequence}
                    className="text-[10px] font-mono text-slate-400 hover:text-red-400 transition-colors"
                  >
                    Clear All
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1.5 custom-scrollbar">
                  {selectedSequence.map((currentCode, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded bg-slate-950 border border-slate-800 flex items-center justify-center font-mono font-bold text-[10px] text-slate-400 shrink-0">
                        {index + 1}
                      </div>

                      <div className="flex-1">
                        <select
                          id={`select-sequence-${index}`}
                          value={currentCode}
                          onChange={e => updateStationInSequence(index, e.target.value)}
                          className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-slate-100 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">-- Choose Station / Point --</option>
                          {stations.map(stn => (
                            <option key={stn.id} value={stn.code}>
                              {stn.code} - {stn.name} ({stn.chainage >= 0 ? `+${stn.chainage.toFixed(3)}` : stn.chainage.toFixed(3)} KM)
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        id={`btn-remove-seq-${index}`}
                        disabled={selectedSequence.length <= 1}
                        onClick={() => removeStationFromSequence(index)}
                        className="p-1 hover:bg-slate-850 rounded text-slate-500 hover:text-red-400 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {selectedSequence.length === 0 && (
                    <div className="border border-dashed border-slate-800 rounded p-6 text-center text-slate-500 italic text-[11px]">
                      Your route sequence sheet is currently empty. Click on any station node on the map above to select at least 3 stations!
                    </div>
                  )}
                </div>

                <button
                  id="btn-add-station-seq"
                  onClick={addStationToSequence}
                  className="mt-3 w-full py-1.5 border border-dashed border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 rounded text-[11px] font-mono font-semibold text-slate-400 hover:text-emerald-400 transition flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Route Stop
                </button>
              </div>

              {/* Validation Warning */}
              <div className="bg-slate-950 border border-slate-800/80 rounded p-3 flex items-start gap-2.5 text-[10px] font-mono text-slate-400">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-300 uppercase tracking-wider text-[9px]">Station Integrity Protocol</p>
                  <p className="mt-0.5 leading-relaxed text-slate-500">
                    Calculations are absolute differences between chainages. Ensure sequence follows logical physical crossovers.
                  </p>
                </div>
              </div>
            </div>

            {/* Results Sheet Column */}
            <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded p-4 shadow-md flex flex-col justify-between">
              <div className="space-y-3.5">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                  Distance Calculation Sheet
                </h3>

                {/* Segments list */}
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {segments.map((seg, idx) => {
                    const fromStn = stations.find(s => s.code === seg.from);
                    const toStn = stations.find(s => s.code === seg.to);

                    return (
                      <div key={idx} className="bg-slate-950 rounded p-2.5 border border-slate-850 flex justify-between items-center text-[11px] font-mono">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                            <span>{seg.from}</span>
                            <ArrowRight className="w-3 h-3 text-emerald-500" />
                            <span>{seg.to}</span>
                          </div>
                          
                          {/* Live Direction Engine Indicator */}
                          <div className="flex items-center gap-1.5">
                            {seg.direction === 'DOWN' ? (
                              <span className="px-1.5 py-0.2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded text-[8px] font-bold flex items-center gap-0.5">
                                <ArrowDownRight className="w-2.5 h-2.5" />
                                DOWN LINE (Southbound)
                              </span>
                            ) : seg.direction === 'UP' ? (
                              <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[8px] font-bold flex items-center gap-0.5">
                                <ArrowUpRight className="w-2.5 h-2.5" />
                                UP LINE (Northbound)
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 bg-slate-800 text-slate-500 rounded text-[8px] font-bold">
                                STATIONARY BUFFER
                              </span>
                            )}
                          </div>

                          <div className="text-[9px] text-slate-600">
                            |{toStn?.chainage ?? 0} - {fromStn?.chainage ?? 0}|
                          </div>
                        </div>
                        <div className="font-mono text-emerald-400 font-bold text-xs">{seg.distance.toFixed(3)} KM</div>
                      </div>
                    );
                  })}
                  {segments.length === 0 && (
                    <p className="text-[11px] font-mono text-slate-500 italic text-center py-8">
                      Select at least two stations on the map to evaluate segments and directions.
                    </p>
                  )}
                </div>
              </div>

              {/* Grand Totals */}
              <div className="mt-4 border-t border-slate-850 pt-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-400 font-mono text-[10px] uppercase">Precise Actual Kms:</span>
                  <span className="font-mono text-base font-bold text-slate-200">{totalDistance.toFixed(3)} KM</span>
                </div>
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-400 font-mono text-[10px] uppercase">Round Off Kms:</span>
                  <span className="font-mono text-2xl font-extrabold text-emerald-400">{Math.round(totalDistance)} KM</span>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-500/20 rounded p-2 text-[10px] font-mono text-emerald-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>BMRCL OCC distance parameters applied.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Predefined Reference Table */
        <div className="bg-slate-900 border border-slate-800 rounded p-4 shadow-md">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 font-mono">
            BMRCL Standard Pre-calculated Trips List
          </h3>
          <div className="overflow-x-auto border border-slate-850 rounded">
            <table className="w-full text-left text-[11px] border-collapse font-mono">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider sticky top-0 text-[10px]">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-800">Trip Pattern / Description</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Actual Kms</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Round Off Kms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {PREDEFINED_TRIPS.map((pt, idx) => (
                  <tr key={idx} className="hover:bg-slate-850/40 transition-colors">
                    <td className="px-3 py-2 text-slate-300 font-medium font-sans">{pt.description}</td>
                    <td className="px-3 py-2 text-right text-slate-400">
                      {pt.actualKms ? `${pt.actualKms.toFixed(3)} KM` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-400">
                      {pt.roundedKms} KM
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

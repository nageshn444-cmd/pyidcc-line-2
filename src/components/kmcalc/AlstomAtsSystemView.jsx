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
import { Clock, Train, User, ArrowRight, Shield, Zap, ChevronRight, Eye, Sparkles, Search, X, LocateFixed, Filter, MapPin, Grid, Layers, Activity } from 'lucide-react';
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

// Official 4-Tier Station Architecture matching OCC Alstom ATS physical monitor (Images 2 & 4)
export const OCC_TIERS = {
  1: {
    id: 1,
    name: 'TIER 1 • APTD ➔ APTS ➔ PUTH ➔ JPN (SOUTH TERMINAL SECTION)',
    upY: 75,
    dnY: 125,
    stations: [
      { code: 'APTD', name: 'Anjanapura Depot', chainage: 24.170, x: 160, isBuffer: true },
      { code: 'APTS', name: 'Anjanapura Terminal', chainage: 23.833, x: 300, isTerminal: true, hasCrossover: true },
      { code: 'TGTP', name: 'Talaghattapura', chainage: 22.395, x: 460 },
      { code: 'VJRH', name: 'Vajarahalli', chainage: 21.395, x: 620 },
      { code: 'KLPK', name: 'Doddakallasandra', chainage: 20.099, x: 780 },
      { code: 'APRC', name: 'Konanakunte Cross', chainage: 18.902, x: 940 },
      { code: 'PUTH', name: 'Yelachenahalli', chainage: 17.780, x: 1120, hasScissors: true },
      { code: 'JPN',  name: 'JP Nagar', chainage: 16.404, x: 1360 }
    ]
  },
  2: {
    id: 2,
    name: 'TIER 2 • BSNK ➔ RVR ➔ NLC ➔ KGWA (SOUTH-CENTRAL SECTION)',
    upY: 225,
    sidingY: 250,
    dnY: 275,
    stations: [
      { code: 'BSNK', name: 'Banashankari', chainage: 15.507, x: 140 },
      { code: 'RVR',  name: 'RV Road', chainage: 14.180, x: 280, hasCrossover: true },
      { code: 'JYN',  name: 'Jayanagar', chainage: 13.280, x: 430 },
      { code: 'SECE', name: 'South End Circle', chainage: 12.323, x: 580 },
      { code: 'LBGH', name: 'Lalbagh', chainage: 11.436, x: 730 },
      { code: 'NLC',  name: 'National College', chainage: 10.403, x: 890, hasSiding: true },
      { code: 'KRMT', name: 'KR Market', chainage: 9.238, x: 1060, isUnderground: true },
      { code: 'CKPE', name: 'Chikpete', chainage: 8.588, x: 1220, isUnderground: true },
      { code: 'KGWA', name: 'Majestic Kempegowda', chainage: 7.569, x: 1410, isUnderground: true, hasScissors: true }
    ]
  },
  3: {
    id: 3,
    name: 'TIER 3 • SPGD ➔ RJNR ➔ MHLI ➔ YPM ➔ PEYA (NORTH-CENTRAL SECTION)',
    upY: 375,
    sidingY: 400,
    dnY: 425,
    stations: [
      { code: 'SPGD', name: 'Sampige Road', chainage: 5.865, x: 140, isUnderground: true, hasScissors: true },
      { code: 'SPRU', name: 'Srirampura', chainage: 4.706, x: 300 },
      { code: 'KVPR', name: 'Kuvempu Road', chainage: 3.974, x: 460 },
      { code: 'RJNR', name: 'Rajajinagar', chainage: 2.989, x: 620, hasCrossover: true },
      { code: 'MHLI', name: 'Mahalakshmi', chainage: 2.018, x: 780, hasPocketTrack: true },
      { code: 'SSFY', name: 'Sandal Soap Factory', chainage: 1.091, x: 940 },
      { code: 'YPM',  name: 'Yeshwanthpur', chainage: 0.000, x: 1100, isDatum: true, hasCrossover: true },
      { code: 'YPI',  name: 'Goraguntepalya', chainage: -1.125, x: 1260 },
      { code: 'PEYA', name: 'Peenya', chainage: -2.074, x: 1420 }
    ]
  },
  4: {
    id: 4,
    name: 'TIER 4 • PYID ➔ JLHL ➔ NGSA ➔ MNJN ➔ BIET (NORTH & DEPOT HUB)',
    upY: 525,
    dnY: 575,
    stations: [
      { code: 'PYID', name: 'Peenya Industry (Hub)', chainage: -3.020, x: 140, isHub: true, hasDepotBranch: true, hasScissors: true },
      { code: 'JLHL', name: 'Jalahalli', chainage: -3.721, x: 340, hasCrossover: true },
      { code: 'DSH',  name: 'Dasarahalli', chainage: -4.662, x: 520 },
      { code: 'NGSA', name: 'Nagasandra', chainage: -6.088, x: 700, hasPocketTrack: true },
      { code: 'PNYD', name: 'Peenya Depot Conn', chainage: -6.500, x: 860 },
      { code: 'MNJN', name: 'Manjunathanagara', chainage: -6.753, x: 1020 },
      { code: 'JIDL', name: 'Jindal / Chikkabidarakallu', chainage: -7.504, x: 1180 },
      { code: 'BIET', name: 'Madhavara (Terminal)', chainage: -9.227, x: 1380, isTerminal: true, hasBufferEnd: true, hasScissors: true }
    ]
  }
};

export const getTierStationX = (tierNum, ch) => {
  const tier = OCC_TIERS[tierNum];
  if (!tier) return 140;
  const sts = tier.stations;
  if (ch >= sts[0].chainage) return sts[0].x;
  if (ch <= sts[sts.length - 1].chainage) return sts[sts.length - 1].x;
  for (let i = 0; i < sts.length - 1; i++) {
    const s1 = sts[i];
    const s2 = sts[i + 1];
    if (ch <= s1.chainage && ch >= s2.chainage) {
      const span = s1.chainage - s2.chainage;
      const ratio = span > 0 ? (s1.chainage - ch) / span : 0;
      return s1.x + ratio * (s2.x - s1.x);
    }
  }
  return sts[0].x;
};

// Official 4-Tier SCADA ATS System View Monitor Canvas (matching OCC physical monitor in Images 2 & 4)
function Occ4TierMonitorCanvas({
  timetableTrains,
  selectedStation,
  onSelectStation,
  selectedTrain,
  onSelectTrain,
  hoveredTrain,
  setHoveredTrain,
  activeSearch,
  isTrainMatchingSearch,
  getChainage
}) {
  return (
    <div className="p-3 bg-[#3e4753] overflow-x-auto select-none border-b border-[#292f38]">
      <div className="min-w-[1240px] max-w-full mx-auto relative" style={{ height: '780px' }}>
        <svg className="w-full h-full" viewBox="0 0 1600 780">
          <defs>
            <pattern id="hatch-stage2-occ" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="0" y2="10" stroke="#eab308" strokeWidth="3.5" />
              <line x1="5" y1="0" x2="5" y2="10" stroke="#1e293b" strokeWidth="3.5" />
            </pattern>
          </defs>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* TIER 1: APTD ➔ APTS ➔ PUTH ➔ JPN (SOUTH SECTION)                  */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <g>
            <text x="70" y="30" fill="#94a3b8" fontSize="10" fontWeight="bold">
              TIER 1 • APTD ➔ APTS ➔ TGTP ➔ VJRH ➔ KLPK ➔ APRC ➔ PUTH ➔ JPN (SOUTH TERMINAL SECTION)
            </text>

            {/* Stage-2 Under Progress */}
            <rect x="70" y="52" width="140" height="96" fill="url(#hatch-stage2-occ)" stroke="#eab308" strokeWidth="1.5" opacity="0.85" rx="3" />
            <rect x="80" y="90" width="120" height="20" fill="#0f172a" fillOpacity="0.9" rx="2" stroke="#eab308" strokeWidth="1" />
            <text x="140" y="104" fill="#facc15" fontSize="9" fontWeight="900" textAnchor="middle">UNDER PROGRESS</text>
            <text x="140" y="48" fill="#e2e8f0" fontSize="8" fontWeight="bold" textAnchor="middle">Stage-2 ➔ To Anjanapura Depot</text>
            <line x1="70" y1="65" x2="70" y2="85" stroke="#ef4444" strokeWidth="4" />
            <line x1="70" y1="115" x2="70" y2="135" stroke="#ef4444" strokeWidth="4" />

            {/* APTS Buffer End Track */}
            <rect x="210" y="60" width="60" height="80" fill="#ef4444" fillOpacity="0.08" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 3" rx="2" />
            <text x="240" y="70" fill="#fca5a5" fontSize="6.5" fontWeight="bold" textAnchor="middle">CAB CHANGEOVER</text>
            <text x="240" y="132" fill="#fca5a5" fontSize="6.5" fontWeight="bold" textAnchor="middle">APTS BUFFER</text>

            {/* Main Rails */}
            <line x1="70" y1="75" x2="1530" y2="75" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="45" y="79" fill="#10b981" fontSize="10" fontWeight="900">Up ➔</text>
            <text x="1538" y="79" fill="#10b981" fontSize="10" fontWeight="900">➔ UP</text>

            <line x1="70" y1="125" x2="1530" y2="125" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="35" y="129" fill="#06b6d4" fontSize="10" fontWeight="900">Down ➔</text>
            <text x="1538" y="129" fill="#06b6d4" fontSize="10" fontWeight="900">➔ DN</text>

            {/* Crossovers & Scissors */}
            <line x1="330" y1="75" x2="380" y2="125" stroke="#2563eb" strokeWidth="3" />
            <line x1="1150" y1="75" x2="1200" y2="125" stroke="#2563eb" strokeWidth="3" />
            <line x1="1150" y1="125" x2="1200" y2="75" stroke="#2563eb" strokeWidth="3" />
            <line x1="1390" y1="75" x2="1440" y2="125" stroke="#2563eb" strokeWidth="3" />

            {/* Circuit Labels matching OCC photo */}
            <text x="210" y="60" fill="#cbd5e1" fontSize="7" textAnchor="middle">9232</text>
            <text x="300" y="60" fill="#cbd5e1" fontSize="7" textAnchor="middle">9114</text>
            <text x="460" y="60" fill="#cbd5e1" fontSize="7" textAnchor="middle">9105</text>
            <text x="780" y="142" fill="#cbd5e1" fontSize="7" textAnchor="middle">7006</text>
            <text x="1360" y="142" fill="#cbd5e1" fontSize="7" textAnchor="middle">7007</text>
            <text x="620" y="46" fill="#94a3b8" fontSize="7" textAnchor="middle">ASCV U | ASCV T</text>

            {/* Stations */}
            {OCC_TIERS[1].stations.map((st) => {
              const ch = getChainage(st.code);
              return (
                <g key={st.code} className="cursor-pointer group" onClick={() => onSelectStation(st.code)}>
                  <line x1={st.x} y1="55" x2={st.x} y2="145" stroke="#64748b" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.4" />
                  <line x1={st.x - 18} y1="67" x2={st.x + 18} y2="67" stroke="#ffffff" strokeWidth="2.5" />
                  <line x1={st.x - 18} y1="133" x2={st.x + 18} y2="133" stroke="#ffffff" strokeWidth="2.5" />
                  <rect x={st.x - 22} y="90" width="44" height="20" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" rx="3" className="hover:stroke-yellow-400 transition-all shadow-md" />
                  <text x={st.x} y="104" fill="#f8fafc" fontSize="9" fontWeight="900" textAnchor="middle">{st.code}</text>
                  <text x={st.x} y="156" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="middle">{ch >= 0 ? `+${ch.toFixed(1)}` : ch.toFixed(1)}</text>
                </g>
              );
            })}
          </g>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* TIER 2: BSNK ➔ RVR ➔ NLC ➔ KGWA (SOUTH-CENTRAL SECTION)           */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <g>
            <text x="70" y="180" fill="#94a3b8" fontSize="10" fontWeight="bold">
              TIER 2 • BSNK ➔ RVR ➔ JYN ➔ SECE ➔ LBGH ➔ NLC ➔ KRMT ➔ CKPE ➔ KGWA (SOUTH-CENTRAL SECTION)
            </text>

            {/* Rails */}
            <line x1="70" y1="225" x2="1530" y2="225" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="45" y="229" fill="#10b981" fontSize="10" fontWeight="900">Up ➔</text>
            <text x="1538" y="229" fill="#10b981" fontSize="10" fontWeight="900">➔ UP</text>

            <line x1="70" y1="275" x2="1530" y2="275" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="35" y="279" fill="#06b6d4" fontSize="10" fontWeight="900">Down ➔</text>
            <text x="1538" y="279" fill="#06b6d4" fontSize="10" fontWeight="900">➔ DN</text>

            {/* Center Siding at NLC */}
            <line x1="830" y1="250" x2="950" y2="250" stroke="#2563eb" strokeWidth="3" />
            <line x1="810" y1="225" x2="830" y2="250" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="810" y1="275" x2="830" y2="250" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="950" y1="250" x2="970" y2="225" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="950" y1="250" x2="970" y2="275" stroke="#2563eb" strokeWidth="2.5" />

            {/* Crossovers */}
            <line x1="290" y1="225" x2="340" y2="275" stroke="#2563eb" strokeWidth="3" />
            <line x1="1440" y1="225" x2="1490" y2="275" stroke="#2563eb" strokeWidth="3" />
            <line x1="1440" y1="275" x2="1490" y2="225" stroke="#2563eb" strokeWidth="3" />

            {/* Section Divider (Elevated | Underground) */}
            <line x1="990" y1="195" x2="990" y2="305" stroke="#eab308" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x="920" y="200" fill="#facc15" fontSize="7.5" fontWeight="900" textAnchor="end">ELEVATED SECTION</text>
            <text x="1060" y="200" fill="#facc15" fontSize="7.5" fontWeight="900" textAnchor="start">UNDERGROUND SECTION</text>

            {/* Circuit Labels */}
            <text x="140" y="210" fill="#cbd5e1" fontSize="7" textAnchor="middle">9121</text>
            <text x="430" y="292" fill="#cbd5e1" fontSize="7" textAnchor="middle">7015</text>
            <text x="890" y="210" fill="#cbd5e1" fontSize="7" textAnchor="middle">9104</text>
            <text x="820" y="292" fill="#cbd5e1" fontSize="7" textAnchor="middle">7008</text>
            <text x="1410" y="210" fill="#cbd5e1" fontSize="7" textAnchor="middle">9113</text>
            <text x="730" y="196" fill="#94a3b8" fontSize="7" textAnchor="middle">ASCV T | ASCV R</text>

            {/* Stations */}
            {OCC_TIERS[2].stations.map((st) => {
              const ch = getChainage(st.code);
              return (
                <g key={st.code} className="cursor-pointer group" onClick={() => onSelectStation(st.code)}>
                  <line x1={st.x} y1="205" x2={st.x} y2="295" stroke="#64748b" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.4" />
                  <line x1={st.x - 18} y1="217" x2={st.x + 18} y2="217" stroke="#ffffff" strokeWidth="2.5" />
                  <line x1={st.x - 18} y1="283" x2={st.x + 18} y2="283" stroke="#ffffff" strokeWidth="2.5" />
                  <rect x={st.x - 22} y="240" width="44" height="20" fill={st.isUnderground ? "#3b0764" : "#0f172a"} stroke={st.isUnderground ? "#c084fc" : "#38bdf8"} strokeWidth="1.5" rx="3" className="hover:stroke-yellow-400 transition-all shadow-md" />
                  <text x={st.x} y="254" fill="#f8fafc" fontSize="9" fontWeight="900" textAnchor="middle">{st.code}</text>
                  <text x={st.x} y="306" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="middle">{ch >= 0 ? `+${ch.toFixed(1)}` : ch.toFixed(1)}</text>
                </g>
              );
            })}
          </g>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* TIER 3: SPGD ➔ RJNR ➔ MHLI ➔ YPM ➔ PEYA (NORTH-CENTRAL SECTION)    */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <g>
            <text x="70" y="330" fill="#94a3b8" fontSize="10" fontWeight="bold">
              TIER 3 • SPGD ➔ SPRU ➔ KVPR ➔ RJNR ➔ MHLI ➔ SSFY ➔ YPM ➔ YPI ➔ PEYA (NORTH-CENTRAL SECTION)
            </text>

            {/* Rails */}
            <line x1="70" y1="375" x2="1530" y2="375" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="45" y="379" fill="#10b981" fontSize="10" fontWeight="900">Up ➔</text>
            <text x="1538" y="379" fill="#10b981" fontSize="10" fontWeight="900">➔ UP</text>

            <line x1="70" y1="425" x2="1530" y2="425" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="35" y="429" fill="#06b6d4" fontSize="10" fontWeight="900">Down ➔</text>
            <text x="1538" y="429" fill="#06b6d4" fontSize="10" fontWeight="900">➔ DN</text>

            {/* Scissors at SPGD */}
            <line x1="170" y1="375" x2="220" y2="425" stroke="#2563eb" strokeWidth="3" />
            <line x1="170" y1="425" x2="220" y2="375" stroke="#2563eb" strokeWidth="3" />

            {/* Section Divider (Underground | Elevated) */}
            <line x1="225" y1="345" x2="225" y2="455" stroke="#eab308" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x="175" y="350" fill="#facc15" fontSize="7" fontWeight="900" textAnchor="end">UNDERGROUND</text>
            <text x="275" y="350" fill="#facc15" fontSize="7" fontWeight="900" textAnchor="start">ELEVATED</text>

            {/* RJNR Crossover */}
            <line x1="640" y1="375" x2="690" y2="425" stroke="#2563eb" strokeWidth="3" />

            {/* MHLI Pocket Track */}
            <line x1="730" y1="400" x2="830" y2="400" stroke="#2563eb" strokeWidth="3" />
            <line x1="710" y1="375" x2="730" y2="400" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="710" y1="425" x2="730" y2="400" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="830" y1="400" x2="850" y2="375" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="830" y1="400" x2="850" y2="425" stroke="#2563eb" strokeWidth="2.5" />

            {/* East-West Purple Line Connection */}
            <line x1="1260" y1="425" x2="1340" y2="375" stroke="#9333ea" strokeWidth="3" strokeDasharray="4 2" />
            <text x="1300" y="365" fill="#c084fc" fontSize="7.5" fontWeight="900">EAST-WEST LINE</text>

            {/* YPM Crossover */}
            <line x1="1130" y1="375" x2="1180" y2="425" stroke="#2563eb" strokeWidth="3" />

            {/* Circuit Labels */}
            <text x="140" y="360" fill="#cbd5e1" fontSize="7" textAnchor="middle">7005</text>
            <text x="460" y="360" fill="#cbd5e1" fontSize="7" textAnchor="middle">8703</text>
            <text x="620" y="360" fill="#cbd5e1" fontSize="7" textAnchor="middle">9112</text>
            <text x="680" y="442" fill="#cbd5e1" fontSize="7" textAnchor="middle">7010</text>
            <text x="1260" y="360" fill="#cbd5e1" fontSize="7" textAnchor="middle">9117</text>
            <text x="1420" y="360" fill="#cbd5e1" fontSize="7" textAnchor="middle">8723</text>
            <text x="460" y="346" fill="#94a3b8" fontSize="7" textAnchor="middle">ASCV Q | ASCV P</text>

            {/* Stations */}
            {OCC_TIERS[3].stations.map((st) => {
              const ch = getChainage(st.code);
              return (
                <g key={st.code} className="cursor-pointer group" onClick={() => onSelectStation(st.code)}>
                  <line x1={st.x} y1="355" x2={st.x} y2="445" stroke="#64748b" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.4" />
                  <line x1={st.x - 18} y1="367" x2={st.x + 18} y2="367" stroke="#ffffff" strokeWidth="2.5" />
                  <line x1={st.x - 18} y1="433" x2={st.x + 18} y2="433" stroke="#ffffff" strokeWidth="2.5" />
                  <rect x={st.x - 22} y="390" width="44" height="20" fill={st.isDatum ? "#0369a1" : st.isUnderground ? "#3b0764" : "#0f172a"} stroke={st.isDatum ? "#38bdf8" : st.isUnderground ? "#c084fc" : "#38bdf8"} strokeWidth="1.5" rx="3" className="hover:stroke-yellow-400 transition-all shadow-md" />
                  <text x={st.x} y="404" fill="#f8fafc" fontSize="9" fontWeight="900" textAnchor="middle">{st.code}</text>
                  <text x={st.x} y="456" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="middle">{ch >= 0 ? `+${ch.toFixed(1)}` : ch.toFixed(1)}</text>
                </g>
              );
            })}
          </g>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* TIER 4: PYID ➔ JLHL ➔ NGSA ➔ MNJN ➔ BIET (+ PEENYA DEPOT)          */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <g>
            <text x="70" y="480" fill="#94a3b8" fontSize="10" fontWeight="bold">
              TIER 4 • PYID ➔ JLHL ➔ DSH ➔ NGSA ➔ PNYD ➔ MNJN ➔ JIDL ➔ BIET (PEENYA DEPOT & NORTH TERMINUS)
            </text>

            {/* Rails */}
            <line x1="70" y1="525" x2="1490" y2="525" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="45" y="529" fill="#10b981" fontSize="10" fontWeight="900">Up ➔</text>
            <text x="1500" y="529" fill="#10b981" fontSize="10" fontWeight="900">➔ UP</text>

            <line x1="70" y1="575" x2="1490" y2="575" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            <text x="35" y="579" fill="#06b6d4" fontSize="10" fontWeight="900">Down ➔</text>
            <text x="1500" y="579" fill="#06b6d4" fontSize="10" fontWeight="900">➔ DN</text>

            {/* PYID Scissors */}
            <line x1="180" y1="525" x2="230" y2="575" stroke="#2563eb" strokeWidth="3" />
            <line x1="180" y1="575" x2="230" y2="525" stroke="#2563eb" strokeWidth="3" />

            {/* Peenya Depot Transfer Tracks */}
            <path d="M 230 575 Q 260 635 340 635 L 480 635" fill="none" stroke="#2563eb" strokeWidth="3" />
            <text x="390" y="628" fill="#93c5fd" fontSize="7" fontWeight="bold">TRANSFER TRACK 2</text>

            <path d="M 270 575 Q 310 665 410 665 L 530 665" fill="none" stroke="#2563eb" strokeWidth="3" />
            <text x="450" y="658" fill="#93c5fd" fontSize="7" fontWeight="bold">TRANSFER TRACK 1</text>

            <path d="M 330 635 Q 380 695 440 695 L 640 695" fill="none" stroke="#2563eb" strokeWidth="3" />
            <text x="510" y="688" fill="#fde047" fontSize="7.5" fontWeight="900">TO DEPOT • PEENYA DEPOT SBL (STABLING 1-8)</text>

            {/* Stabling rail lines */}
            <line x1="440" y1="715" x2="640" y2="715" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="6 3" />
            <line x1="440" y1="735" x2="640" y2="735" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="6 3" />

            {/* RD-3 Standby Track */}
            <line x1="90" y1="605" x2="210" y2="605" stroke="#2563eb" strokeWidth="3" />
            <line x1="70" y1="575" x2="90" y2="605" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="210" y1="605" x2="230" y2="575" stroke="#2563eb" strokeWidth="2.5" />
            <text x="150" y="618" fill="#fde047" fontSize="6.5" fontWeight="bold" textAnchor="middle">RD-3 STANDBY</text>

            {/* JLHL Crossover */}
            <line x1="360" y1="525" x2="410" y2="575" stroke="#2563eb" strokeWidth="3" />

            {/* NGSA Pocket Siding */}
            <line x1="650" y1="550" x2="750" y2="550" stroke="#2563eb" strokeWidth="3" />
            <line x1="630" y1="525" x2="650" y2="550" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="630" y1="575" x2="650" y2="550" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="750" y1="550" x2="770" y2="525" stroke="#2563eb" strokeWidth="2.5" />
            <line x1="750" y1="550" x2="770" y2="575" stroke="#2563eb" strokeWidth="2.5" />

            {/* BIET Scissors */}
            <line x1="1420" y1="525" x2="1470" y2="575" stroke="#2563eb" strokeWidth="3" />
            <line x1="1420" y1="575" x2="1470" y2="525" stroke="#2563eb" strokeWidth="3" />

            {/* Terminus Red Buffer Stops at BIET */}
            <line x1="1490" y1="515" x2="1490" y2="535" stroke="#ef4444" strokeWidth="5" />
            <line x1="1490" y1="565" x2="1490" y2="585" stroke="#ef4444" strokeWidth="5" />
            <rect x="1480" y="500" width="22" height="12" fill="#0f172a" stroke="#cbd5e1" strokeWidth="0.8" rx="1" />
            <text x="1491" y="509" fill="#f8fafc" fontSize="7" fontWeight="bold" textAnchor="middle">7001</text>
            <text x="1490" y="600" fill="#ef4444" fontSize="7" fontWeight="900" textAnchor="middle">BUFFER END</text>

            {/* Circuit Labels */}
            <text x="140" y="510" fill="#cbd5e1" fontSize="7" textAnchor="middle">7019</text>
            <text x="340" y="510" fill="#cbd5e1" fontSize="7" textAnchor="middle">9102</text>
            <text x="700" y="592" fill="#cbd5e1" fontSize="7" textAnchor="middle">7020</text>
            <text x="1380" y="510" fill="#cbd5e1" fontSize="7" textAnchor="middle">7001</text>
            <text x="520" y="496" fill="#94a3b8" fontSize="7" textAnchor="middle">ASCV M | ASCV L</text>

            {/* Stations */}
            {OCC_TIERS[4].stations.map((st) => {
              const ch = getChainage(st.code);
              const isPyid = st.code === 'PYID';
              return (
                <g key={st.code} className="cursor-pointer group" onClick={() => onSelectStation(st.code)}>
                  <line x1={st.x} y1="505" x2={st.x} y2="595" stroke="#64748b" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.4" />
                  <line x1={st.x - 18} y1="517" x2={st.x + 18} y2="517" stroke="#ffffff" strokeWidth="2.5" />
                  <line x1={st.x - 18} y1="583" x2={st.x + 18} y2="583" stroke="#ffffff" strokeWidth="2.5" />
                  <rect x={st.x - 22} y="540" width="44" height="20" fill={isPyid ? "#b45309" : "#0f172a"} stroke={isPyid ? "#f59e0b" : "#38bdf8"} strokeWidth={isPyid ? "2" : "1.5"} rx="3" className="hover:stroke-yellow-400 transition-all shadow-md" />
                  <text x={st.x} y="554" fill="#f8fafc" fontSize="9" fontWeight="900" textAnchor="middle">{st.code}</text>
                  <text x={st.x} y="606" fill={isPyid ? "#fde68a" : "#94a3b8"} fontSize="7" fontWeight="bold" textAnchor="middle">{ch >= 0 ? `+${ch.toFixed(1)}` : ch.toFixed(1)}</text>
                </g>
              );
            })}
          </g>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* ACTIVE TIMETABLE TRAINS ON 4-TIER MONITOR                         */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          {timetableTrains.map((train) => {
            const isUp = train.direction === 'UP';
            const trX = train.tierX;
            const trY = train.tierY;
            const isMatched = isTrainMatchingSearch(train, activeSearch);
            const isDimmed = activeSearch && !isMatched;
            const isSelected = selectedTrain && (String(selectedTrain.trainId) === String(train.trainId) || String(selectedTrain.particularTrainId) === String(train.particularTrainId));
            const isHighlighted = (isMatched && activeSearch) || isSelected;

            return (
              <g
                key={`occ_${train.trainId}_${train.direction}_${train.rowId || ''}`}
                className={`cursor-pointer transition-all duration-300 ease-out ${isDimmed ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
                onClick={() => onSelectTrain(train)}
                onMouseEnter={() => setHoveredTrain(train)}
                onMouseLeave={() => setHoveredTrain(null)}
              >
                {/* Highlight Halo & Location Tag */}
                {isHighlighted && (
                  <g>
                    <rect x={trX - 26} y={trY - 14} width="52" height="28" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="3 2" rx="4" className="animate-pulse" />
                    <rect x={trX - 50} y={trY - 32} width="100" height="15" fill="#082f49" stroke="#38bdf8" strokeWidth="1" rx="3" />
                    <text x={trX} y={trY - 22} fill="#fde047" fontSize="7" fontWeight="900" textAnchor="middle">
                      📍 {train.currentStation ? train.currentStation.replace(' (Stabled)', '').replace(' (Stabling)', '') : (train.isStabling ? 'STABLED' : 'RUNNING')}
                    </text>
                  </g>
                )}

                {/* Directional Headlight beam for active mainline trains */}
                {!train.isStabling && (
                  isUp ? (
                    <polygon points={`${trX + 22},${trY - 5} ${trX + 38},${trY - 10} ${trX + 38},${trY + 10} ${trX + 22},${trY + 5}`} fill="#facc15" opacity="0.45" />
                  ) : (
                    <polygon points={`${trX - 22},${trY - 5} ${trX - 38},${trY - 10} ${trX - 38},${trY + 10} ${trX - 22},${trY + 5}`} fill="#38bdf8" opacity="0.45" />
                  )
                )}

                {/* Train Block Rectangle */}
                <rect
                  x={trX - 22}
                  y={trY - 10}
                  width="44"
                  height="20"
                  fill={
                    train.isStabling
                      ? (train.statusText.includes('BUFFER') ? "#881337" : "#1e293b")
                      : (isUp ? "#064e3b" : "#0c4a6e")
                  }
                  stroke={
                    isHighlighted
                      ? "#38bdf8"
                      : train.isStabling
                      ? (train.statusText.includes('BUFFER') ? "#f43f5e" : "#f59e0b")
                      : (isUp ? "#10b981" : "#06b6d4")
                  }
                  strokeWidth={isHighlighted ? "2" : "1.5"}
                  rx="3"
                  className="hover:stroke-yellow-400 hover:scale-110 transition-transform shadow-lg"
                />

                {/* Train ID */}
                <text x={trX} y={trY + 2} fill="#ffffff" fontSize="7.5" fontWeight="900" textAnchor="middle">
                  {train.isStabling 
                    ? `T-${train.particularTrainId || train.trainId}`
                    : (train.computedTrainId 
                      ? `${train.computedTrainId}` 
                      : `T-${train.particularTrainId || train.trainId}`)}
                </text>
                {/* Mode / Direction Indicator & Speed */}
                <text x={trX} y={trY + 8} fill={train.isStabling ? "#fde047" : (isUp ? "#6ee7b7" : "#67e8f9")} fontSize="5.5" fontWeight="bold" textAnchor="middle">
                  {train.isStabling 
                    ? 'STB' 
                    : (isUp 
                      ? (train.speedKmH > 0 ? `▲ ${train.speedKmH}k` : '▲ UP') 
                      : (train.speedKmH > 0 ? `▼ ${train.speedKmH}k` : '▼ DN'))}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating SCADA Live Telemetry HUD Card for Hovered Train in 4-Tier View */}
        {hoveredTrain && (
          <div 
            className="absolute z-30 pointer-events-none bg-slate-950/95 border border-cyan-500/80 rounded-xl p-3 shadow-2xl text-[10px] font-mono text-slate-200 backdrop-blur-md transition-all duration-150"
            style={{
              left: Math.max(10, Math.min(1300, (hoveredTrain.tierX || 300) - 145)),
              top: (hoveredTrain.tierY || 200) > 300 ? (hoveredTrain.tierY || 200) - 150 : (hoveredTrain.tierY || 200) + 30,
              width: '290px'
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
              <span className="font-black text-cyan-300">
                T-{hoveredTrain.particularTrainId || hoveredTrain.trainId} ({hoveredTrain.direction || 'LINE-2'})
              </span>
              <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-200 text-[8.5px] font-bold border border-cyan-800">
                {hoveredTrain.statusText || 'IN SERVICE'}
              </span>
            </div>
            
            <div className="space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span>Prev Relieved TO:</span>
                <strong className="text-slate-300">
                  {hoveredTrain.previousOperator?.name ? `${hoveredTrain.previousOperator.name} (D${hoveredTrain.previousOperator.dutyNo || '--'})` : 'Shift Start / First Leg'}
                </strong>
              </div>
              <div className="flex items-center justify-between text-emerald-400 font-bold">
                <span>Current Driving TO:</span>
                <strong className="text-emerald-300">
                  {hoveredTrain.operatorName || '--'} (D{hoveredTrain.dutyNo || '--'})
                </strong>
              </div>
              <div className="flex items-center justify-between text-amber-300">
                <span>Next Reliever (Matrix):</span>
                <strong className="text-amber-200">
                  {hoveredTrain.reliever?.name ? `${hoveredTrain.reliever.name} (D${hoveredTrain.reliever.dutyNo || '--'} @ ${hoveredTrain.reliever.takeoverTime || '--'})` : 'None Assigned'}
                </strong>
              </div>
            </div>
            
            <div className="mt-1.5 pt-1 border-t border-slate-850 flex items-center justify-between text-[9px] text-slate-400">
              <span>Loc: <strong className="text-slate-200">{hoveredTrain.currentStation || '--'}</strong></span>
              <span>Speed: <strong className="text-cyan-400">{hoveredTrain.speedKmH || 0} km/h</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AlstomAtsSystemView({
  liveTrainPositions = [],
  stationChainageDB = {},
  simulatedTime = '11:15',
  activeSchedule = 'WEEKDAY',
  isLiveClock = true,
  selectedTrain = null,
  externalSearchQuery = '',
  onSearchChange = null,
  onScheduleChange = () => {},
  onTimeChange = () => {},
  onToggleLiveClock = () => {},
  onSelectTrain = () => {},
  isSimPlaying: propIsSimPlaying,
  onToggleSimPlay = null,
  simSpeedMultiplier: propSimSpeedMultiplier,
  onSpeedChange = null
}) {
  const [selectedStation, setSelectedStation] = useState(null);
  const [hoveredTrain, setHoveredTrain] = useState(null);
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const [viewLayout, setViewLayout] = useState('occ4tier'); // 'occ4tier' (Official OCC Monitor, Images 2 & 4) | 'panoramic' (Continuous 4800px track)
  const scrollContainerRef = useRef(null);
  const hasAutoScrolledRef = useRef(false);

  // Sync internal search with optional externalSearchQuery
  const activeSearch = externalSearchQuery !== undefined && externalSearchQuery !== ''
    ? externalSearchQuery
    : internalSearchQuery;

  const handleSearchChange = (val) => {
    setInternalSearchQuery(val);
    if (typeof onSearchChange === 'function') {
      onSearchChange(val);
    }
  };

  // Simulation Playback state (advance time automatically)
  const [internalSimPlaying, setInternalSimPlaying] = useState(false);
  const [internalSpeedMultiplier, setInternalSpeedMultiplier] = useState(1); // 1x = 1 min/sec, 5x = 5 mins/sec

  const isSimPlaying = propIsSimPlaying !== undefined ? propIsSimPlaying : internalSimPlaying;
  const simSpeedMultiplier = propSimSpeedMultiplier !== undefined ? propSimSpeedMultiplier : internalSpeedMultiplier;

  const handleToggleSim = () => {
    if (typeof onToggleSimPlay === 'function') {
      onToggleSimPlay();
    } else {
      setInternalSimPlaying(prev => !prev);
    }
  };

  const handleSpeedChange = (speed) => {
    if (typeof onSpeedChange === 'function') {
      onSpeedChange(speed);
    } else {
      setInternalSpeedMultiplier(speed);
    }
  };

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
  // When isSimPlaying is true and parent isn't managing it, advance time every second
  useEffect(() => {
    if (!isSimPlaying || typeof onToggleSimPlay === 'function') return;

    const interval = setInterval(() => {
      const currentMins = timeToMinutes(simulatedTime);
      let nextMins = currentMins + simSpeedMultiplier;
      if (nextMins > 1439) nextMins = 240; // loop back to 04:00 AM after midnight
      onTimeChange(nextMins);
    }, 1000);

    return () => clearInterval(interval);
  }, [isSimPlaying, simSpeedMultiplier, simulatedTime, onTimeChange, onToggleSimPlay]);

  // Track Y Coordinates (Single panoramic line)
  const UP_Y = 85;       // Top rail: UP Track (APTD ➔ BIET, traveling West/North)
  const MID_Y = 135;     // Center pocket track level (NLC, MHLI, NGSA sidings)
  const DN_Y = 185;      // Bottom rail: DOWN Track (BIET ➔ APTD, traveling South)
  const RD3_Y = 232;     // Peenya Industry Road 3 (RD-3) Platform & Standby Track
  const LINK_Y = 245;    // East-West Purple Line Link at KGWA
  const DEPOT_Y1 = 268;  // Peenya Depot Transfer Track 2 & SBL-1
  const DEPOT_Y2 = 294;  // Peenya Depot Transfer Track 1 & SBL-2
  const DEPOT_Y3 = 320;  // Peenya Depot SBL-3
  const DEPOT_Y4 = 346;  // Peenya Depot SBL-4
  const DEPOT_Y5 = 372;  // Peenya Depot SBL-5
  const DEPOT_Y6 = 398;  // Peenya Depot SBL-6
  const DEPOT_Y7 = 424;  // Peenya Depot SBL-7
  const DEPOT_Y8 = 450;  // Peenya Depot SBL-8

  const START_X = 60;
  const END_X = 4720;
  const TOTAL_TRACK_WIDTH = 4820;

  // Process live trains strictly from the active day's timetable
  const timetableTrains = useMemo(() => {
    // 1. Deduplicate by train unit ID to ensure each physical train has 1 canonical badge
    const trainMap = new Map();
    (liveTrainPositions || []).forEach((tr) => {
      const unitKey = String(tr.particularTrainId || tr.legacyTrainId || tr.trainId).trim();
      if (!unitKey) return;
      if (!trainMap.has(unitKey)) {
        trainMap.set(unitKey, tr);
      } else {
        const existing = trainMap.get(unitKey);
        // Prefer running train over stabled train
        if (existing.isStabling && !tr.isStabling) {
          trainMap.set(unitKey, tr);
        }
      }
    });

    return Array.from(trainMap.values()).map((tr) => {
      const isUp = tr.direction === 'UP';
      let exactX = chainageToTrackX(tr.chainage);
      let exactY = isUp ? UP_Y : DN_Y;
      let statusText = tr.isStabling ? 'STABLED' : 'RUNNING';

      // 1. SPECIFIC RULE: Peenya Depot SBL, PYID RD-3, and Transfer Track Movement
      const unitStr = String(tr.particularTrainId || tr.legacyTrainId || tr.trainId);
      // A. RD-3 Standby loop train (T203)
      const isRd3Train = tr.isStabling && (
        unitStr === '203' || 
        String(tr.currentStation).includes('RD-3')
      );

      // 2. Terminal Station Cab Changeover & Buffer End
      const isAtBietTerminal = String(tr.currentStation).includes('BIET') || tr.chainage <= -9.0;
      const isAtAptsTerminal = String(tr.currentStation).includes('APTS') || tr.chainage >= 23.5;
      const isTurnaroundOrStabledAtTerminal = tr.isStabling || tr.distanceRemaining === 0 || String(tr.currentStation).includes('(');

      // B. Peenya Depot SBL: ONLY for trains specifically at Peenya Depot (NOT APTS, BIET, PUTH, or NLC!)
      const isDepotStabled = tr.isStabling && !isRd3Train && !isAtBietTerminal && !isAtAptsTerminal && !String(tr.currentStation).includes('PUTH') && !String(tr.currentStation).includes('NLC') && (
        String(tr.currentStation).includes('Depot') || 
        String(tr.currentStation).includes('SBL') || 
        String(tr.currentStation).includes('PYID')
      );

      // C. Transfer Track Movement: ONLY trains actively moved / inducted FROM depot appear on Transfer Track 1 & 2
      const isMovingFromDepot = !tr.isStabling && (
        String(tr.currentStation).includes('Transfer') ||
        String(tr.currentStation).includes('From Depot') ||
        tr.isDepotMoving ||
        (String(tr.currentStation).includes('PYID') && tr.distanceTravelled < 0.6 && tr.direction === 'UP' && tr.originDepot)
      );

      const tIdStr = String(tr.particularTrainId || tr.trainId);
      let sblIndex = 1;
      if (tIdStr === '221') sblIndex = 1;
      else if (tIdStr === '218') sblIndex = 2;
      else if (tIdStr === '211') sblIndex = 3;
      else if (tIdStr === '216' || tIdStr === '206') sblIndex = 4;
      else if (tIdStr === '212' || tIdStr === '202') sblIndex = 5;
      else if (tIdStr === '205' || tIdStr === '215') sblIndex = 6;
      else if (tIdStr === '204' || tIdStr === '214') sblIndex = 7;
      else if (tIdStr === '207' || tIdStr === '217') sblIndex = 8;
      else {
        const match = String(tr.currentStation).match(/SBL-?([1-8])/i);
        if (match) {
          sblIndex = parseInt(match[1]);
        } else {
          const num = parseInt(tIdStr.replace(/\D/g, '')) || 1;
          sblIndex = ((num - 1) % 8) + 1;
        }
      }

      if (isRd3Train) {
        exactX = 3765; // PYID RD-3
        exactY = RD3_Y;
        statusText = 'STANDBY (RD-3)';
      } else if (isDepotStabled) {
        const sblYMap = {
          1: DEPOT_Y1,
          2: DEPOT_Y2,
          3: DEPOT_Y3,
          4: DEPOT_Y4,
          5: DEPOT_Y5,
          6: DEPOT_Y6,
          7: DEPOT_Y7,
          8: DEPOT_Y8
        };
        exactX = 4135;
        exactY = sblYMap[sblIndex] || DEPOT_Y1;
        statusText = `DEPOT SBL-${sblIndex}`;
      } else if (isMovingFromDepot) {
        exactX = 3880; // Transfer Track 2
        exactY = DEPOT_Y1;
        statusText = 'FROM DEPOT (INDUCTION)';
      } else if (isAtBietTerminal && isTurnaroundOrStabledAtTerminal) {
        exactX = 4665;
        exactY = tr.isStabling ? (String(tr.trainId) === '209' ? UP_Y : DN_Y) : (isUp ? UP_Y : DN_Y);
        statusText = tr.isStabling ? 'TERMINAL (STABLED)' : 'CAB CHANGEOVER';
      } else if (isAtAptsTerminal && isTurnaroundOrStabledAtTerminal) {
        exactX = 220;
        exactY = DN_Y;
        statusText = tr.isStabling ? 'BUFFER END (STABLED)' : 'CAB CHANGEOVER';
      } else if (String(tr.currentStation).includes('PUTH') && tr.isStabling) {
        exactX = chainageToTrackX(16.273);
        exactY = String(tr.currentStation).includes('UP') ? UP_Y : DN_Y;
        statusText = 'PUTH (STABLED)';
      } else if (String(tr.currentStation).includes('NLC') && tr.isStabling) {
        exactX = chainageToTrackX(10.825);
        exactY = DN_Y;
        statusText = 'NLC POCKET (STABLED)';
      }

      // 3. Compute 4-Tier OCC Monitor Coordinates (Images 2 & 4)
      let tier = 4;
      let tierX = 140;
      let tierY = isUp ? 525 : 575;

      if (isRd3Train) {
        tier = 4;
        tierX = 160;
        tierY = 605;
      } else if (isDepotStabled) {
        tier = 4;
        tierX = 380 + ((sblIndex - 1) % 4) * 55;
        tierY = 695 + Math.floor((sblIndex - 1) / 4) * 25;
      } else if (isMovingFromDepot) {
        tier = 4;
        tierX = 280;
        tierY = 635;
      } else if (isAtBietTerminal && isTurnaroundOrStabledAtTerminal) {
        tier = 4;
        tierX = 1485;
        tierY = isUp ? 525 : 575;
      } else if (isAtAptsTerminal && isTurnaroundOrStabledAtTerminal) {
        tier = 1;
        tierX = 240;
        tierY = 125;
      } else if (String(tr.currentStation).includes('PUTH') && tr.isStabling) {
        tier = 1;
        tierX = 1350;
        tierY = String(tr.currentStation).includes('UP') ? 75 : 125;
      } else if (String(tr.currentStation).includes('NLC') && tr.isStabling) {
        tier = 2;
        tierX = 890;
        tierY = 275;
      } else {
        const ch = tr.chainage !== undefined ? tr.chainage : 0;
        if (ch >= 15.955) {
          tier = 1;
          tierX = Math.round(getTierStationX(1, ch));
          tierY = isUp ? 75 : 125;
        } else if (ch >= 6.717) {
          tier = 2;
          tierX = Math.round(getTierStationX(2, ch));
          tierY = isUp ? 225 : 275;
        } else if (ch >= -2.547) {
          tier = 3;
          tierX = Math.round(getTierStationX(3, ch));
          tierY = isUp ? 375 : 425;
        } else {
          tier = 4;
          tierX = Math.round(getTierStationX(4, ch));
          tierY = isUp ? 525 : 575;
        }
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
        tier,
        tierX,
        tierY,
        speedKmH,
        statusText
      };
    });
  }, [liveTrainPositions]);

  // Match search filter against train ID, operator name, duty number, or station
  const isTrainMatchingSearch = (tr, query) => {
    if (!query || !query.trim()) return true;
    const q = query.toLowerCase().trim();
    const qClean = q.replace(/^train\s*[-#]?/i, '').replace(/^t[-#]?\s*/i, '').trim();

    // Train ID & Variations (e.g. "201", "T201", "T-201", "Train 201")
    const tId = String(tr.trainId || '').toLowerCase();
    const partTId = String(tr.particularTrainId || '').toLowerCase();
    const compTId = String(tr.computedTrainId || '').toLowerCase();
    const legTId = String(tr.legacyTrainId || '').toLowerCase();
    const dispTId = String(tr.displayTrainId || '').toLowerCase();

    if (
      tId.includes(q) || `t${tId}`.includes(q) || `t-${tId}`.includes(q) || `train ${tId}`.includes(q) ||
      partTId.includes(q) || compTId.includes(q) || legTId.includes(q) || dispTId.includes(q)
    ) return true;

    if (qClean) {
      if (
        tId === qClean || tId.includes(qClean) || `t${tId}`.includes(qClean) ||
        partTId === qClean || partTId.includes(qClean) ||
        compTId === qClean || compTId.includes(qClean) ||
        legTId === qClean || legTId.includes(qClean)
      ) return true;
    }

    // Train Operator Name & ID
    const opName = String(tr.operatorName || '').toLowerCase();
    const opId = String(tr.operatorId || '').toLowerCase();
    if (opName.includes(q) || opId.includes(q)) return true;

    // Reliever Name & ID
    const relName = String(tr.reliever?.name || '').toLowerCase();
    const relId = String(tr.reliever?.id || '').toLowerCase();
    if (relName.includes(q) || relId.includes(q)) return true;

    // Duty Number (e.g. "1", "D1", "D14", "14")
    const dNo = String(tr.dutyNo || '').toLowerCase();
    const relDNo = String(tr.reliever?.dutyNo || '').toLowerCase();
    const cleanQ = q.replace(/^d/i, '').trim();
    if (dNo === q || `d${dNo}` === q || (cleanQ && dNo === cleanQ)) return true;
    if (relDNo === q || `d${relDNo}` === q || (cleanQ && relDNo === cleanQ)) return true;

    // Station (currentStation, scheduledHandoverStation, previousStation, nextStation, statusText)
    const curSt = String(tr.currentStation || '').toLowerCase();
    const hOver = String(tr.scheduledHandoverStation || '').toLowerCase();
    const prevSt = String(tr.previousStation || '').toLowerCase();
    const nextSt = String(tr.nextStation || '').toLowerCase();
    const status = String(tr.statusText || '').toLowerCase();
    if (curSt.includes(q) || hOver.includes(q) || prevSt.includes(q) || nextSt.includes(q) || status.includes(q)) return true;

    return false;
  };

  const filteredTimetableTrains = useMemo(() => {
    return timetableTrains.filter(tr => isTrainMatchingSearch(tr, activeSearch));
  }, [timetableTrains, activeSearch]);

  // Auto-scroll track canvas to center on the active operational zone (PYID / active trains) on initial load
  useEffect(() => {
    if (!hasAutoScrolledRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const cWidth = container.clientWidth || 900;
      let targetX = 3600; // Center on PYID (x: 3730) area
      const runningNearPyid = timetableTrains.filter(t => !t.isStabling && t.currentX >= 2800 && t.currentX <= 4400);
      if (runningNearPyid.length > 0) {
        const avgX = runningNearPyid.reduce((sum, t) => sum + t.currentX, 0) / runningNearPyid.length;
        targetX = avgX;
      }
      container.scrollTo({
        left: Math.max(0, targetX - cWidth / 2),
        behavior: 'smooth'
      });
      if (timetableTrains.length > 0) {
        hasAutoScrolledRef.current = true;
      }
    }
  }, [timetableTrains]);

  // Auto-scroll track canvas to center the searched train
  useEffect(() => {
    if (activeSearch && activeSearch.trim() && filteredTimetableTrains.length > 0) {
      const firstMatched = filteredTimetableTrains[0];
      if (scrollContainerRef.current) {
        const cWidth = scrollContainerRef.current.clientWidth || 900;
        scrollContainerRef.current.scrollTo({
          left: Math.max(0, firstMatched.currentX - cWidth / 2),
          behavior: 'smooth'
        });
      }
    }
  }, [activeSearch, filteredTimetableTrains]);

  return (
    <div className="bg-[#4a5360] text-slate-100 font-mono rounded-xl border-2 border-[#333a44] shadow-2xl overflow-hidden select-none">
      
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 0. AUTHENTIC ALSTOM OCC SYSTEM VIEW SCADA HEADER BAR (Images 2 & 4) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#242b35] border-b-2 border-[#181d24] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: BMRCL Logo + Workstation Buttons + Signal LED */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a2027] border border-emerald-500/50 rounded shadow-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse"></span>
              <span className="text-[10px] font-black text-emerald-400 tracking-wider">ನಮ್ಮ ಮೆಟ್ರೋ BMRCL</span>
            </div>
            
            <div className="flex items-center gap-1">
              <span className="px-2 py-0.5 bg-[#141a22] border border-slate-600 rounded text-[9px] font-bold text-slate-300">
                PYID_WKS03
              </span>
              <span className="px-2 py-0.5 bg-[#141a22] border border-slate-700 rounded text-[9px] font-bold text-slate-400">
                OCC_SER04
              </span>
            </div>

            {/* SCADA Alarm Ticker Window */}
            <div className="hidden lg:flex flex-col bg-[#0f141c] border border-slate-700/80 rounded px-2 py-0.5 text-[7.5px] text-slate-300 font-mono leading-tight">
              <span className="text-amber-400 font-bold">{simulatedTime}:15 Train031 Normal</span>
              <span className="text-slate-400">{simulatedTime}:19 ATC_24 Connected</span>
              <span className="text-cyan-400">{simulatedTime}:22 IconisBLR-ExtRSMModule:OK</span>
            </div>
          </div>

          {/* Center: Large Official Title & Alarm Broadcast Box */}
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black tracking-widest text-slate-100 uppercase">
                SYSTEM VIEW
              </h2>
              {/* View Layout Toggle */}
              <div className="flex items-center bg-[#131922] p-0.5 rounded border border-cyan-800/80">
                <button
                  type="button"
                  onClick={() => setViewLayout('occ4tier')}
                  className={`px-2 py-0.5 rounded text-[8.5px] font-bold transition-all cursor-pointer ${
                    viewLayout === 'occ4tier'
                      ? 'bg-cyan-600 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Official 4-Tier OCC Monitor Layout (Images 2 & 4) - All 34 stations visible without scrolling"
                >
                  ▦ OCC 4-Tier Monitor
                </button>
                <button
                  type="button"
                  onClick={() => setViewLayout('panoramic')}
                  className={`px-2 py-0.5 rounded text-[8.5px] font-bold transition-all cursor-pointer ${
                    viewLayout === 'panoramic'
                      ? 'bg-cyan-600 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Single Continuous 4800px Panoramic Track"
                >
                  ↔ Panoramic Single-Line
                </button>
              </div>
            </div>

            {/* OCC Real-Time Status Notification */}
            <div className="mt-0.5 px-2.5 py-0.5 bg-[#0b0f15] border border-amber-600/40 rounded text-[8px] text-amber-300 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
              <span>
                {timetableTrains.filter(t => !t.isStabling).length} trains running in revenue service
                {timetableTrains.filter(t => t.isStabling).length > 0 && ` • ${timetableTrains.filter(t => t.isStabling).length} stabled at terminals/depot`}
                {' • '}Live Line-2 Position Tracking
              </span>
            </div>
          </div>

          {/* Right: Alstom Logo + Date & Live Time */}
          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-[12px] font-black tracking-widest text-white">ALSTOM</div>
              <div className="text-[9px] font-bold text-cyan-300 flex items-center gap-1 justify-end">
                <Clock size={10} className="text-cyan-400 animate-spin" />
                <span>{simulatedTime}{isLiveClock ? `:${String(new Date().getSeconds()).padStart(2, '0')}` : ''}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      


      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. MOBILE & DESKTOP ACTIVE TRAIN QUICK-SELECT CAROUSEL              */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#2e353f] border-b border-[#232931] px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-200">
              <Train className="h-3.5 w-3.5 text-cyan-400" />
              <span className="uppercase tracking-wider">
                Live Line-2 Active Fleet ({filteredTimetableTrains.length}{activeSearch ? `/${timetableTrains.length}` : ''})
              </span>
              <span className="text-[8px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                Synced to Live Relief Matrix
              </span>
            </div>

            {/* Quick Active Fleet Search Box */}
            <div className="relative flex items-center min-w-[210px] sm:min-w-[290px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cyan-400" />
              <input
                type="text"
                value={activeSearch}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="🔍 Search Train ID (e.g. 201, 209), Operator, Duty, Station..."
                className="w-full pl-8 pr-7 py-1 bg-[#1a2028] border border-cyan-700/80 focus:border-cyan-400 rounded-md text-[9.5px] text-white placeholder-slate-400 focus:outline-none font-mono transition-colors"
              />
              {activeSearch && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  title="Clear Search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <span className="text-[8px] text-slate-400 font-mono">
            Tap train card to center on track & inspect driving details
          </span>
        </div>

        {/* Real-time Current Location HUD banner for searched train */}
        {activeSearch && filteredTimetableTrains.length > 0 && (
          <div className="mt-1.5 mb-2.5 bg-[#0c131d] border-2 border-cyan-400/80 rounded-xl p-2.5 shadow-2xl flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 border-b border-cyan-900/60 pb-1.5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500 text-[10px] font-black uppercase tracking-wider shadow-sm">
                  <MapPin className="h-3.5 w-3.5 text-cyan-400 animate-bounce" />
                  <span>Current Location Radar</span>
                </span>
                <span className="text-[9px] text-slate-300 font-mono">
                  Found <strong className="text-amber-300 font-bold">{filteredTimetableTrains.length}</strong> matching train{filteredTimetableTrains.length > 1 ? 's' : ''} for &ldquo;<span className="text-cyan-300 font-bold">{activeSearch}</span>&rdquo;
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="text-[8.5px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700"
              >
                Clear Search
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {filteredTimetableTrains.map(tr => {
                const isUp = tr.direction === 'UP';
                const isSelected = selectedTrain && String(selectedTrain.trainId) === String(tr.trainId);

                return (
                  <div 
                    key={`hud_tr_${tr.trainId}`} 
                    className={`flex flex-col gap-1.5 p-2 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-cyan-950/90 border-cyan-400 shadow-md ring-1 ring-cyan-400'
                        : 'bg-[#151c27] border-cyan-800/60 hover:border-cyan-500/80'
                    }`}
                  >
                    {/* Header: Train ID & Status */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black tracking-wide">
                        TRAIN {tr.particularTrainId || tr.trainId}
                      </span>
                      <span className={`px-1.5 py-0.2 rounded text-[8px] font-black uppercase ${
                        tr.isStabling 
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : isUp 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      }`}>
                        {tr.isStabling ? tr.statusText : (isUp ? 'UP ➔ BIET' : 'DN ➔ APTD')}
                      </span>
                    </div>

                    {/* PROMINENT CURRENT LOCATION */}
                    <div className="bg-[#0b1017] border border-cyan-500/40 rounded p-1.5 flex items-start gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5 animate-pulse" />
                      <div className="flex flex-col">
                        <span className="text-[7px] text-cyan-400 font-bold uppercase tracking-wider">Current Location</span>
                        <span className="text-[10px] font-black text-white leading-tight">
                          {tr.currentStation || (tr.isStabling ? 'Peenya Depot Stabling' : 'Line-2 Mainline Track')}
                        </span>
                      </div>
                    </div>

                    {/* Operational Details */}
                    <div className="grid grid-cols-2 gap-1 text-[8px] text-slate-300">
                      <div>
                        <span className="text-slate-500">Speed: </span>
                        <strong className="text-emerald-400 font-bold">{tr.speedKmH ? `${tr.speedKmH} km/h` : '0 km/h (Stabled)'}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Chainage: </span>
                        <strong className="text-cyan-300 font-bold">{tr.chainage >= 0 ? `+${tr.chainage.toFixed(3)}` : tr.chainage?.toFixed(3)} KM</strong>
                      </div>
                    </div>

                    {/* Driver & Reliever */}
                    <div className="text-[8px] text-slate-300 border-t border-slate-800/80 pt-1 flex flex-col gap-0.5">
                      <div className="truncate flex items-center gap-1">
                        <span className="text-slate-500">Driver:</span>
                        <strong className="text-white truncate">{tr.operatorName || '--'}</strong>
                        {tr.dutyNo && tr.dutyNo !== '--' && (
                          <span className="text-slate-400">({tr.dutyNo.startsWith('D') ? tr.dutyNo : `D${tr.dutyNo}`})</span>
                        )}
                      </div>
                      <div className="truncate flex items-center gap-1">
                        <span className="text-amber-500 font-bold">Reliever:</span>
                        <strong className={tr.reliever?.name ? "text-amber-300 truncate font-mono" : "text-slate-500 italic"}>
                          {tr.reliever?.name || 'None Assigned'}
                        </strong>
                        {tr.reliever?.dutyNo && tr.reliever.dutyNo !== '--' && (
                          <span className="text-amber-400">({tr.reliever.dutyNo.startsWith('D') ? tr.reliever.dutyNo : `D${tr.reliever.dutyNo}`})</span>
                        )}
                        {tr.scheduledHandoverStation && (
                          <span className="text-slate-400 text-[7.5px]">@{tr.scheduledHandoverStation}</span>
                        )}
                      </div>
                    </div>

                    {/* Locate on Diagram Action Button */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTrain(tr);
                        if (scrollContainerRef.current) {
                          const cWidth = scrollContainerRef.current.clientWidth || 900;
                          scrollContainerRef.current.scrollTo({
                            left: Math.max(0, tr.currentX - cWidth / 2),
                            behavior: 'smooth'
                          });
                        }
                      }}
                      className="mt-0.5 w-full py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black rounded text-[8.5px] flex items-center justify-center gap-1 shadow-sm transition-all"
                    >
                      <LocateFixed size={11} />
                      <span>Locate & Spotlight on Track</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Horizontal scrollable train cards ribbon */}
        {filteredTimetableTrains.length === 0 ? (
          <div className="py-2.5 px-3 text-center w-full text-[9px] text-slate-400 flex items-center justify-center gap-2 bg-[#1b2027] rounded-lg border border-slate-750">
            <Search className="h-3.5 w-3.5 text-amber-400" />
            <span>No trains matching &ldquo;<strong className="text-white">{activeSearch}</strong>&rdquo; across Train ID, Driver, Duty, or Station.</span>
            <button 
              type="button"
              onClick={() => handleSearchChange('')} 
              className="text-cyan-400 underline font-bold ml-1 hover:text-cyan-300"
            >
              Clear Search
            </button>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-600">
            {filteredTimetableTrains.map(tr => {
              const isUp = tr.direction === 'UP';
              const isSelected = selectedTrain && String(selectedTrain.trainId) === String(tr.trainId);
              const has3mRelief = tr.shouldAnnounceReliever;

              return (
                <button
                  key={`ats_chip_${tr.trainId}_${tr.direction}`}
                  onClick={() => {
                    onSelectTrain(tr);
                    if (scrollContainerRef.current) {
                      scrollContainerRef.current.scrollTo({
                        left: Math.max(0, tr.currentX - 350),
                        behavior: 'smooth'
                      });
                    }
                  }}
                className={`flex-shrink-0 text-left px-2.5 py-1.5 rounded-lg border text-[9px] transition-all font-mono min-w-[220px] max-w-[260px] ${
                  isSelected 
                    ? 'bg-cyan-950/90 border-cyan-400 shadow-lg shadow-cyan-900/50 ring-1 ring-cyan-400' 
                    : has3mRelief
                      ? 'bg-emerald-950/60 border-emerald-400/80 shadow-md shadow-emerald-950/40'
                      : 'bg-[#1b2027] hover:bg-[#232932] border-slate-700/80'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1 border-b border-slate-750 pb-1">
                  <span className="font-black text-slate-100 flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${tr.isStabling ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`}></span>
                    TRAIN {tr.particularTrainId || tr.trainId}
                  </span>
                  <span className={`px-1.5 py-0.2 rounded text-[7.5px] font-black uppercase ${
                    isUp ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  }`}>
                    {isUp ? 'UP ➔' : '⬅ DN'} {tr.statusText}
                  </span>
                </div>

                {/* Current Driving Operator */}
                <div className="text-[8.5px] text-emerald-300 font-bold truncate flex items-center gap-1">
                  <span className="text-slate-400 font-normal">Driving TO:</span>
                  <strong className="text-white">{tr.operatorName || '--'}</strong>
                  {tr.dutyNo && tr.dutyNo !== '--' && (
                    <span className="text-slate-400 font-normal text-[7.5px]">({tr.dutyNo.startsWith('D') ? tr.dutyNo : `D${tr.dutyNo}`})</span>
                  )}
                </div>

                {/* Next Reliever from Relief Matrix */}
                <div className="text-[8.5px] text-amber-300 font-bold truncate flex items-center justify-between mt-0.5">
                  <div className="truncate flex items-center gap-1">
                    <span className="text-slate-400 font-normal">Reliever:</span>
                    <strong className={has3mRelief ? 'text-emerald-400 animate-pulse' : 'text-amber-200'}>
                      {tr.reliever?.name ? tr.reliever.name : 'None Assigned'}
                    </strong>
                    {tr.reliever?.dutyNo && tr.reliever.dutyNo !== '--' && (
                      <span className="text-slate-400 font-normal text-[7.5px]">({tr.reliever.dutyNo.startsWith('D') ? tr.reliever.dutyNo : `D${tr.reliever.dutyNo}`})</span>
                    )}
                  </div>
                  {has3mRelief && (
                    <span className="px-1 py-0.2 bg-emerald-500/20 text-emerald-300 rounded text-[7px] font-black border border-emerald-500/30">
                      3m ALERT
                    </span>
                  )}
                </div>

                <div className={`mt-1.5 pt-1 border-t flex flex-col gap-0.5 rounded px-1.5 py-1 ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-900/40 text-cyan-200'
                    : activeSearch
                    ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
                    : 'border-slate-800/80 bg-slate-900/40 text-slate-300'
                }`}>
                  <div className="flex items-center justify-between gap-1 text-[8.5px]">
                    <span className="font-bold flex items-center gap-1 text-amber-300 truncate">
                      <MapPin size={10} className="text-cyan-400 shrink-0 animate-bounce" />
                      <span className="text-slate-400 font-normal">LOC:</span>
                      <strong className="text-white truncate">{tr.currentStation || (tr.isStabling ? 'Peenya Depot' : 'Line-2 Track')}</strong>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[7.5px] text-slate-400 font-mono">
                    <span className="text-slate-300 font-semibold">{tr.isStabling ? tr.statusText : (isUp ? 'UP Line' : 'DN Line')}</span>
                    <span className="text-cyan-300 font-bold">
                      {tr.chainage >= 0 ? `+${tr.chainage.toFixed(2)}` : tr.chainage?.toFixed(2)} km
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      </div>

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
      {/* 3. TRACK DISPLAY CANVAS (OCC 4-TIER SYSTEM VIEW OR PANORAMIC)       */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {viewLayout === 'occ4tier' ? (
        <Occ4TierMonitorCanvas
          timetableTrains={filteredTimetableTrains}
          selectedStation={selectedStation}
          onSelectStation={setSelectedStation}
          selectedTrain={selectedTrain}
          onSelectTrain={onSelectTrain}
          hoveredTrain={hoveredTrain}
          setHoveredTrain={setHoveredTrain}
          activeSearch={activeSearch}
          isTrainMatchingSearch={isTrainMatchingSearch}
          getChainage={getChainage}
        />
      ) : (
        <div 
          ref={scrollContainerRef}
          className="p-4 bg-[#444d59] overflow-x-auto scrollbar-thin scrollbar-thumb-cyan-700 scrollbar-track-slate-800"
        >
        <div className="relative select-none" style={{ width: `${TOTAL_TRACK_WIDTH}px`, height: '520px' }}>
          
          <svg className="w-full h-full" viewBox={`0 0 ${TOTAL_TRACK_WIDTH} 520`}>
            
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
              <line x1="4005" y1={DEPOT_Y1 - 18} x2="4005" y2={DEPOT_Y8 + 18} stroke="#facc15" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.75" />
              <text x="4005" y={DEPOT_Y1 - 22} fill="#facc15" fontSize="7" fontWeight="bold" textAnchor="middle">DEPOT BOUNDARY</text>

              {/* ── PEENYA DEPOT SBL (STABLING LINES 1 TO 8) ── */}
              <rect x="4010" y={DEPOT_Y1 - 16} width="210" height={DEPOT_Y8 - DEPOT_Y1 + 34} fill="#0f172a" fillOpacity="0.85" stroke="#eab308" strokeWidth="1.2" strokeDasharray="4 2" rx="3" />
              <text x="4115" y={DEPOT_Y1 - 5} fill="#facc15" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.5">PEENYA DEPOT SBL (STABLING LINES 1 TO 8)</text>

              {/* SBL-1 (Depot Stabling Line 1) */}
              <line x1="4005" y1={DEPOT_Y1} x2="4185" y2={DEPOT_Y1} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y1 - 8} x2="4185" y2={DEPOT_Y1 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y1 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-1</text>

              {/* SBL-2 (Depot Stabling Line 2) */}
              <line x1="4005" y1={DEPOT_Y2} x2="4185" y2={DEPOT_Y2} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y2 - 8} x2="4185" y2={DEPOT_Y2 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y2 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-2</text>

              {/* SBL-3 (Depot Stabling Line 3 with Turnout from SBL-2) */}
              <line x1="4020" y1={DEPOT_Y2} x2="4045" y2={DEPOT_Y3} stroke="#2563eb" strokeWidth="3" />
              <circle cx="4020" cy={DEPOT_Y2} r="2.5" fill="#ef4444" />
              <circle cx="4045" cy={DEPOT_Y3} r="2.5" fill="#10b981" />
              <line x1="4045" y1={DEPOT_Y3} x2="4185" y2={DEPOT_Y3} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y3 - 8} x2="4185" y2={DEPOT_Y3 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y3 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-3</text>

              {/* SBL-4 (Depot Stabling Line 4 with Turnout from ladder) */}
              <line x1="4035" y1={DEPOT_Y3} x2="4060" y2={DEPOT_Y4} stroke="#2563eb" strokeWidth="3" />
              <circle cx="4035" cy={DEPOT_Y3} r="2.5" fill="#ef4444" />
              <circle cx="4060" cy={DEPOT_Y4} r="2.5" fill="#10b981" />
              <line x1="4060" y1={DEPOT_Y4} x2="4185" y2={DEPOT_Y4} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y4 - 8} x2="4185" y2={DEPOT_Y4 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y4 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-4</text>

              {/* SBL-5 (Depot Stabling Line 5 with Turnout from ladder) */}
              <line x1="4050" y1={DEPOT_Y4} x2="4075" y2={DEPOT_Y5} stroke="#2563eb" strokeWidth="3" />
              <circle cx="4050" cy={DEPOT_Y4} r="2.5" fill="#ef4444" />
              <circle cx="4075" cy={DEPOT_Y5} r="2.5" fill="#10b981" />
              <line x1="4075" y1={DEPOT_Y5} x2="4185" y2={DEPOT_Y5} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y5 - 8} x2="4185" y2={DEPOT_Y5 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y5 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-5</text>

              {/* SBL-6 (Depot Stabling Line 6 with Turnout from ladder) */}
              <line x1="4065" y1={DEPOT_Y5} x2="4090" y2={DEPOT_Y6} stroke="#2563eb" strokeWidth="3" />
              <circle cx="4065" cy={DEPOT_Y5} r="2.5" fill="#ef4444" />
              <circle cx="4090" cy={DEPOT_Y6} r="2.5" fill="#10b981" />
              <line x1="4090" y1={DEPOT_Y6} x2="4185" y2={DEPOT_Y6} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y6 - 8} x2="4185" y2={DEPOT_Y6 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y6 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-6</text>

              {/* SBL-7 (Depot Stabling Line 7 with Turnout from ladder) */}
              <line x1="4080" y1={DEPOT_Y6} x2="4105" y2={DEPOT_Y7} stroke="#2563eb" strokeWidth="3" />
              <circle cx="4080" cy={DEPOT_Y6} r="2.5" fill="#ef4444" />
              <circle cx="4105" cy={DEPOT_Y7} r="2.5" fill="#10b981" />
              <line x1="4105" y1={DEPOT_Y7} x2="4185" y2={DEPOT_Y7} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y7 - 8} x2="4185" y2={DEPOT_Y7 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y7 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-7</text>

              {/* SBL-8 (Depot Stabling Line 8 with Turnout from ladder) */}
              <line x1="4095" y1={DEPOT_Y7} x2="4120" y2={DEPOT_Y8} stroke="#2563eb" strokeWidth="3" />
              <circle cx="4095" cy={DEPOT_Y7} r="2.5" fill="#ef4444" />
              <circle cx="4120" cy={DEPOT_Y8} r="2.5" fill="#10b981" />
              <line x1="4120" y1={DEPOT_Y8} x2="4185" y2={DEPOT_Y8} stroke="#2563eb" strokeWidth="3.5" />
              <line x1="4185" y1={DEPOT_Y8 - 8} x2="4185" y2={DEPOT_Y8 + 8} stroke="#ef4444" strokeWidth="4" />
              <text x="4192" y={DEPOT_Y8 + 3} fill="#cbd5e1" fontSize="7" fontWeight="bold">SBL-8</text>
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
              const isMatched = isTrainMatchingSearch(train, activeSearch);
              const isDimmed = activeSearch && !isMatched;
              const isSelected = selectedTrain && (String(selectedTrain.trainId) === String(train.trainId) || String(selectedTrain.particularTrainId) === String(train.particularTrainId));
              const isHighlighted = (isMatched && activeSearch) || isSelected;

              return (
                <g 
                  key={`${train.trainId}_${train.direction}_${train.rowId || ''}`} 
                  className={`cursor-pointer transition-all duration-300 ease-out ${isDimmed ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
                  onClick={() => onSelectTrain(train)}
                  onMouseEnter={() => setHoveredTrain(train)}
                  onMouseLeave={() => setHoveredTrain(null)}
                >
                  {/* Glowing match locator halo & Location Callout Tag when search is active or train selected */}
                  {isHighlighted && (
                    <g>
                      {/* Vertical beacon guide line */}
                      <line 
                        x1={trX} 
                        y1={trY >= DEPOT_Y1 ? trY - 32 : trY - 38} 
                        x2={trX} 
                        y2={trY - 14} 
                        stroke="#38bdf8" 
                        strokeWidth="2" 
                        strokeDasharray="3 2" 
                      />

                      {/* Halo around train */}
                      <rect 
                        x={trX - 34} 
                        y={trY - 18} 
                        width="68" 
                        height="36" 
                        fill="none" 
                        stroke="#38bdf8" 
                        strokeWidth="2.5" 
                        strokeDasharray="4 2" 
                        rx="6" 
                        className="animate-pulse"
                      />

                      {/* Location Spotlight Callout Box directly above train */}
                      <g>
                        <rect 
                          x={trX - 75} 
                          y={trY >= DEPOT_Y1 ? trY - 48 : trY - 56} 
                          width="150" 
                          height="18" 
                          rx="4" 
                          fill="#082f49" 
                          stroke="#38bdf8" 
                          strokeWidth="1.6" 
                          filter="drop-shadow(0 4px 10px rgba(0,0,0,0.9))" 
                        />
                        <text 
                          x={trX} 
                          y={trY >= DEPOT_Y1 ? trY - 36 : trY - 44} 
                          fill="#fde047" 
                          fontSize="8" 
                          fontWeight="900" 
                          textAnchor="middle"
                        >
                          📍 LOC: {train.currentStation ? train.currentStation.replace(' (Stabled)', '').replace(' (Stabling)', '') : (train.isStabling ? 'DEPOT' : 'LINE-2 TRACK')}
                        </text>
                        {/* Downward pointer triangle */}
                        <polygon 
                          points={`${trX - 4},${trY >= DEPOT_Y1 ? trY - 30 : trY - 38} ${trX + 4},${trY >= DEPOT_Y1 ? trY - 30 : trY - 38} ${trX},${trY >= DEPOT_Y1 ? trY - 26 : trY - 34}`} 
                          fill="#38bdf8" 
                        />
                      </g>
                    </g>
                  )}

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
                      isHighlighted
                        ? "#38bdf8"
                        : trY >= DEPOT_Y1 
                        ? "#f59e0b" 
                        : trY === RD3_Y 
                        ? "#fde047" 
                        : (train.statusText.includes('BUFFER') || train.statusText.includes('CHANGEOVER')) 
                        ? "#f43f5e" 
                        : "#ffffff"
                    } 
                    strokeWidth={isHighlighted ? "3" : "2"} 
                    rx="4"
                    filter="url(#train-glow-up)"
                    className="shadow-2xl"
                  />

                  {/* Train number text with direction / location arrow */}
                  <text x={trX} y={trY + 4} fill="#ffffff" fontSize="9.5" fontWeight="900" textAnchor="middle">
                    {trY >= DEPOT_Y1 
                      ? (train.isStabling ? `T${train.particularTrainId || train.trainId} [${(train.statusText || 'SBL').replace('DEPOT ', '')}]` : `T${train.particularTrainId || train.trainId} ➔ PYID`) 
                      : trY === RD3_Y 
                      ? `T${train.particularTrainId || train.trainId} (RD-3)` 
                      : (train.statusText.includes('BUFFER') || train.statusText.includes('CHANGEOVER'))
                      ? `T${train.particularTrainId || train.trainId} (REV)`
                      : train.computedTrainId
                      ? (isUp ? `${train.computedTrainId} ➔` : `⬅ ${train.computedTrainId}`)
                      : (isUp ? `T${train.particularTrainId || train.trainId} ➔` : `⬅ T${train.particularTrainId || train.trainId}`)}
                  </text>

                  {/* Reliever tag derived strictly from Live Train Operator Relief Matrix */}
                  <rect 
                    x={trX - 44} 
                    y={trY - 26} 
                    width="88" 
                    height="12" 
                    fill="#0f172a" 
                    fillOpacity="0.95" 
                    rx="2" 
                    stroke={train.shouldAnnounceReliever ? "#38bdf8" : train.reliever?.name ? "#f59e0b" : "#475569"} 
                    strokeWidth={train.shouldAnnounceReliever ? "1.5" : "0.8"} 
                  />
                  <text 
                    x={trX} 
                    y={trY - 17} 
                    fill={train.shouldAnnounceReliever ? "#38bdf8" : train.reliever?.name ? "#fde047" : "#94a3b8"} 
                    fontSize="6.5" 
                    fontWeight="900" 
                    textAnchor="middle"
                  >
                    {train.reliever?.name 
                      ? `${train.shouldAnnounceReliever ? '📢 3m RLV' : 'RLV'}: ${train.reliever.name.split(' ')[0]} (D${train.reliever.dutyNo || '--'})` 
                      : 'RLV: NONE'}
                  </text>

                  {/* Enriched detail tooltip */}
                  <title>
                    {`Train ID: ${train.computedTrainId || train.displayTrainId || 'Pending'} (Unit ${train.particularTrainId || train.trainId})\n` +
                     `Current Driving Operator: ${train.operatorName || '--'} (${train.operatorId || '--'}) • Duty ${train.dutyNo || '--'}\n` +
                     `Previous Relieved Operator: ${train.previousOperator?.name || 'Shift Start / First Leg'} (${train.previousOperator?.id || '--'}) • Duty ${train.previousOperator?.dutyNo || '--'} (Relieved: ${train.previousOperator?.relievedTime || '--'})\n` +
                     `Next Reliever (Relief Matrix): ${train.reliever?.name || 'None Assigned'} (${train.reliever?.id || '--'}) • Duty ${train.reliever?.dutyNo || '--'}\n` +
                     `Scheduled Handover Station: ${train.scheduledHandoverStation || 'PYID'}\n` +
                     `Handover Time: ${train.reliever?.takeoverTime || '--'}\n` +
                     `Location: ${train.currentStation || 'Line-2'} (${train.chainage >= 0 ? `+${train.chainage.toFixed(3)}` : train.chainage?.toFixed(3)} KM)\n` +
                     `Status: ${train.statusText || 'RUNNING'} (${train.speedKmH || 0} km/h)`}
                  </title>

                  {/* Directional Headlight beam (only active when moving on main line) */}
                  {train.speedKmH > 0 && trY <= DN_Y && (
                    isUp ? (
                      <polygon points={`${trX + 28},${trY - 6} ${trX + 46},${trY - 14} ${trX + 46},${trY + 14} ${trX + 28},${trY + 6}`} fill="#facc15" opacity="0.45" />
                    ) : (
                      <polygon points={`${trX - 28},${trY - 6} ${trX - 46},${trY - 14} ${trX - 46},${trY + 14} ${trX - 28},${trY + 6}`} fill="#38bdf8" opacity="0.45" />
                    )
                  )}

                  {/* Driver tag and previous operator derived from timetable & Handover Cards */}
                  <rect x={trX - 48} y={trY + 14} width="96" height="21" fill="#0f172a" fillOpacity="0.95" rx="3" stroke="#475569" strokeWidth="0.8" />
                  <text x={trX} y={trY + 23} fill={trY >= DEPOT_Y1 ? "#facc15" : trY === RD3_Y ? "#fde047" : (isUp ? "#34d399" : "#38bdf8")} fontSize="6" fontWeight="bold" textAnchor="middle">
                    TO: {train.operatorName ? train.operatorName.split(' ')[0] : (train.dutyNo ? `D${train.dutyNo}` : '--')} ({train.statusText})
                  </text>
                  <text x={trX} y={trY + 31} fill="#94a3b8" fontSize="5.5" fontWeight="semibold" textAnchor="middle">
                    PREV: {train.previousOperator?.name ? `${train.previousOperator.name.split(' ')[0]} (D${train.previousOperator.dutyNo || '--'})` : 'ORIGIN'}
                  </text>
                </g>
              );
            })}

          </svg>

          {/* Floating SCADA Live Telemetry HUD Card for Hovered Train */}
          {hoveredTrain && (
            <div 
              className="absolute z-30 pointer-events-none bg-slate-950/95 border border-cyan-500/80 rounded-xl p-3 shadow-2xl text-[10px] font-mono text-slate-200 backdrop-blur-md transition-all duration-150"
              style={{
                left: Math.max(10, Math.min(TOTAL_TRACK_WIDTH - 290, hoveredTrain.currentX - 145)),
                top: hoveredTrain.currentY > 200 ? hoveredTrain.currentY - 150 : hoveredTrain.currentY + 45,
                width: '290px'
              }}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-1 mb-1.5">
                <span className="font-black text-cyan-300">
                  T-{hoveredTrain.particularTrainId || hoveredTrain.trainId} ({hoveredTrain.direction || 'LINE-2'})
                </span>
                <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-200 text-[8.5px] font-bold border border-cyan-800">
                  {hoveredTrain.statusText || 'IN SERVICE'}
                </span>
              </div>
              
              {/* 3 Operators: Previous, Current, Next Reliever */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Prev Relieved TO:</span>
                  <strong className="text-slate-300">
                    {hoveredTrain.previousOperator?.name ? `${hoveredTrain.previousOperator.name} (D${hoveredTrain.previousOperator.dutyNo || '--'})` : 'Shift Start / First Leg'}
                  </strong>
                </div>
                <div className="flex items-center justify-between text-emerald-400 font-bold">
                  <span>Current Driving TO:</span>
                  <strong className="text-emerald-300">
                    {hoveredTrain.operatorName || '--'} (D{hoveredTrain.dutyNo || '--'})
                  </strong>
                </div>
                <div className="flex items-center justify-between text-amber-300">
                  <span>Next Reliever (Matrix):</span>
                  <strong className="text-amber-200">
                    {hoveredTrain.reliever?.name ? `${hoveredTrain.reliever.name} (D${hoveredTrain.reliever.dutyNo || '--'} @ ${hoveredTrain.reliever.takeoverTime || '--'})` : 'None Assigned'}
                  </strong>
                </div>
              </div>
              
              <div className="mt-1.5 pt-1 border-t border-slate-850 flex items-center justify-between text-[9px] text-slate-400">
                <span>Loc: <strong className="text-slate-200">{hoveredTrain.currentStation || '--'}</strong></span>
                <span>Speed: <strong className="text-cyan-400">{hoveredTrain.speedKmH || 0} km/h</strong></span>
              </div>
            </div>
          )}

        </div>
      </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. BOTTOM ATS SCADA STATUS BAR & TIME SCRUBBER                      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="bg-[#353c47] border-t border-[#262c34] px-4 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3 text-[10px] text-slate-300">
        
        {/* Left: Timetable Timeline Fast Jump Buttons & Simulation Run Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Simulation Playback & Speed Controls */}
          <div className="flex items-center gap-1.5 bg-[#20252e] p-1 rounded border border-slate-700">
            <button
              onClick={handleToggleSim}
              className={`flex items-center gap-1 px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition cursor-pointer ${
                isSimPlaying
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold'
              }`}
              title={isSimPlaying ? "Pause Timetable Simulation" : "Run Timetable Simulation as per Chronological Matrix"}
            >
              {isSimPlaying ? '⏸ PAUSE SIM' : '▶ RUN SIM'}
            </button>
            {[1, 2, 5, 10].map(speed => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition cursor-pointer ${
                  simSpeedMultiplier === speed
                    ? 'bg-cyan-500 text-slate-950 font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Set Simulation Speed to ${speed}x`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <span className="text-[9px] text-amber-400 font-bold uppercase flex items-center gap-1 pl-1 border-l border-slate-700">
            <Clock size={11} />
            <span>SHIFTS:</span>
          </span>
          {[
            { label: '06:30 Morning', mins: 390 },
            { label: '08:30 Peak', mins: 510 },
            { label: '11:15 Mid-Day', mins: 675 },
            { label: '17:45 Evening', mins: 1065 },
            { label: '21:30 Night', mins: 1290 },
            { label: '23:27 Late Night', mins: 1407 }
          ].map((shift) => (
            <button
              key={shift.label}
              onClick={() => {
                setIsSimPlaying(false);
                onTimeChange(shift.mins);
              }}
              className="px-2 py-0.5 bg-[#20252e] hover:bg-slate-800 border border-slate-600 rounded text-[9px] text-cyan-300 font-bold transition-colors cursor-pointer"
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

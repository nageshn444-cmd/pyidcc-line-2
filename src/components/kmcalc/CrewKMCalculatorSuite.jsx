/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { MASTER_STATIONS } from '../../data/kmcalc/masterStations';
import { PRELOADED_DUTIES } from '../../data/kmcalc/preloadedDuties';
import { enhanceRosterDuties } from '../../utils/kmCalculator';

// Importing components
import MasterStationsView from './MasterStationsView';
import RouteCalculator from './RouteCalculator';
import AIRouteCopilot from './AIRouteCopilot';

// Lucide icon imports
import { 
  MapPin, 
  Compass,
  Sparkles
} from 'lucide-react';

export default function CrewKMCalculatorSuite() {
  const [activeTab, setActiveTab] = useState('calculator');
  
  // Master states
  const [stations, setStations] = useState(MASTER_STATIONS);
  const [duties, setDuties] = useState(() => enhanceRosterDuties(PRELOADED_DUTIES));
  const [assignments, setAssignments] = useState([]);
  const [selectedSequence, setSelectedSequence] = useState(['PYID', 'BIET', 'APTS']);

  // Clock state
  const [timeStr, setTimeStr] = useState('2026-06-26 | 11:00:07');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const dy = String(now.getDate()).padStart(2, '0');
      const hr = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const sec = String(now.getSeconds()).padStart(2, '0');
      setTimeStr(`${yr}-${mo}-${dy} | ${hr}:${min}:${sec}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate high-level stats
  const totalKms = duties.reduce((acc, d) => acc + d.kms, 0);
  const averageKms = duties.length > 0 ? Math.round(totalKms / duties.length) : 0;

  const handleUpdateStations = (updated) => {
    setStations(updated);
  };

  const handleUpdateDuties = (updated) => {
    setDuties(enhanceRosterDuties(updated));
  };

  const handleImportDuties = (imported) => {
    const enhanced = enhanceRosterDuties(imported);
    setDuties(prev => {
      const filtered = prev.filter(d => !enhanced.some(imp => imp.dutyNo === d.dutyNo));
      return [...enhanced, ...filtered];
    });
  };

  const handleUpdateAssignments = (updated) => {
    setAssignments(updated);
  };

  return (
    <div className="bg-slate-950 text-slate-200 border border-slate-800 rounded-xl flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300 overflow-hidden shadow-2xl" id="kmcalc-suite-root">
      
      {/* Top Suite Telemetry Header */}
      <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-6 shrink-0 z-30">
        <div className="flex items-center gap-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-600 font-bold text-white shadow-lg shadow-emerald-900/20 font-mono">
            KM
          </div>
          <div className="flex flex-col">
            <h1 className="text-xs font-bold uppercase tracking-wider text-white">BMRCL Crew Kilometer Calculation Suite</h1>
            <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest">
              Green Line Track Math Integrated Engine
            </span>
          </div>
        </div>

        {/* System telemetry or parameters */}
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tight hidden sm:inline">STATUS: LOGICAL CORE CONNECTED</span>
          </div>
          <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
            <span>PRELOADED: <strong className="text-emerald-400">{duties.length}</strong> DUTIES</span>
          </div>
          <div className="hidden lg:flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
            <span>AVG: <strong className="text-emerald-400">{averageKms} KM</strong></span>
          </div>
          <div className="flex h-7 items-center rounded border border-slate-700 bg-slate-800 px-2 py-0.5">
            <span className="text-[10px] font-mono text-slate-300">{timeStr}</span>
          </div>
        </div>
      </header>

      {/* Responsive Grid Layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-[500px]">
        
        {/* Left Navigation Rail */}
        <aside className="w-full lg:w-56 bg-slate-900/40 lg:border-r border-slate-800/80 p-3 space-y-1 shrink-0 flex flex-row lg:flex-col overflow-x-auto lg:overflow-x-visible">
          <div className="hidden lg:block text-[9px] font-bold text-slate-500 uppercase tracking-widest px-2.5 mb-1.5">Suite Modules</div>
          
          <button
            id="nav-btn-ai-copilot"
            onClick={() => setActiveTab('ai-copilot')}
            className={`whitespace-nowrap lg:w-full text-left px-2.5 py-1.5 rounded text-[11px] font-mono font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'ai-copilot' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            AI Route Copilot
          </button>
          

          <button
            id="nav-btn-calculator"
            onClick={() => setActiveTab('calculator')}
            className={`whitespace-nowrap lg:w-full text-left px-2.5 py-1.5 rounded text-[11px] font-mono font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'calculator' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Distance Tracker
          </button>

          <button
            id="nav-btn-stations"
            onClick={() => setActiveTab('stations')}
            className={`whitespace-nowrap lg:w-full text-left px-2.5 py-1.5 rounded text-[11px] font-mono font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'stations' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            Station Chainages
          </button>

        </aside>

        {/* Right Active Panel Content Viewport */}
        <main className="flex-1 p-4 md:p-5 overflow-y-auto w-full transition-all bg-slate-950 flex flex-col gap-4">
          

          {activeTab === 'calculator' && (
            <div className="animate-fadeIn flex-1">
              <RouteCalculator 
                stations={stations} 
                selectedSequence={selectedSequence} 
                setSelectedSequence={setSelectedSequence} 
                duties={duties}
                setDuties={setDuties}
                onImportDuties={handleImportDuties}
              />
            </div>
          )}

          {activeTab === 'stations' && (
            <div className="animate-fadeIn flex-1">
              <MasterStationsView 
                stations={stations} 
                onUpdateStations={handleUpdateStations} 
              />
            </div>
          )}



          {activeTab === 'ai-copilot' && (
            <div className="animate-fadeIn flex-1">
              <AIRouteCopilot 
                stations={stations} 
                onApplySequence={(seq) => {
                  setSelectedSequence(seq);
                  setActiveTab('calculator');
                }}
              />
            </div>
          )}

        </main>
      </div>

      {/* Footer System Credits */}
      <footer className="bg-slate-900 border-t border-slate-800/80 px-6 py-2.5 flex flex-col sm:flex-row justify-between items-center text-[10px] font-mono text-slate-500 shrink-0">
        <div>BMRCL Green Line Operations & Crew Management System</div>
        <div className="mt-1 sm:mt-0 text-emerald-500/60">[Calculation Engine Validated 23 nodes • Secure Sandbox Core]</div>
      </footer>
    </div>
  );
}

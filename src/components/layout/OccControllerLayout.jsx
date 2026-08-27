import React, { useState, Suspense } from 'react';
import { 
  Activity, Train, AlertOctagon, HelpCircle, ShieldAlert, Sparkles, 
  MapPin, Clock, Maximize2, Minimize2, Radio 
} from 'lucide-react';
import MetroMapNavigation from '../MetroMapNavigation';
import ReliefTracking from '../ReliefTracking';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const EmergencyReliefEngine = lazyWithRetry(() => import('../EmergencyReliefEngine'));
const AiAssistantSidebar    = lazyWithRetry(() => import('../AiAssistantSidebar'));

const MiniLoader = () => (
  <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent" />
  </div>
);


export default function OccControllerLayout({
  liveTrainTrackingMap,
  unifiedRows,
  liveIncidents,
  deployments,
  attendanceLogs,
  loading,
  fetchLiveData,
  activeDay
}) {
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('DASHBOARD');
  const { theme, setTheme, accessibility, setAccessibility, emergencyMode } = useTheme();
  const { userProfile, logout } = useAuth();


  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  return (
    <div className={`min-h-screen flex flex-col font-mono text-slate-200 transition-colors ${emergencyMode ? 'theme-emergency' : theme}`}>
      
      {/* 1. OCC Workstation Top Bar */}
      <header className="h-16 bg-[var(--header-bg)] backdrop-blur-md border-b border-[var(--border-color)] px-6 flex items-center justify-between sticky top-0 z-30 select-none shadow-sm">
        <div className="flex items-center gap-3">
          <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
          <div>
            <h1 className="text-xs font-black text-slate-100 tracking-wider">BMRCL OCC OPERATIONS COMMAND</h1>
            <span className="text-[9px] text-slate-500 uppercase">Peenya Industry Depot (PYID) | Station Controller Desk</span>
          </div>
        </div>

        {/* Emergency Alert Indicator */}
        {emergencyMode && (
          <div className="bg-rose-950/80 border border-rose-600 text-rose-300 text-[10px] font-black px-4 py-1.5 rounded-full animate-flash-emergency uppercase tracking-widest flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 animate-bounce" />
            <span>Incident Mode Activated - Running High-Vis Emergency Overrides</span>
          </div>
        )}

        <div className="flex items-center gap-4">
          {/* Local theme switch */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[10px]">
            <span className="text-slate-500 px-1 font-bold">THEME:</span>
            <select id="occcontrollerlayout-i1" name="occcontrollerlayout-i1" 
              value={theme} 
              onChange={(e) => setTheme(e.target.value)}
              className="bg-transparent border-none text-emerald-400 font-bold outline-none cursor-pointer"
            >
              <option value="theme-occ-dark">Metro OCC Dark</option>
              <option value="theme-occ-light">Metro OCC Light</option>
              <option value="theme-night-ops">Night Operations</option>
              <option value="theme-comfort-day">Eye Comfort Day</option>
              <option value="theme-comfort-night">Eye Comfort Night</option>
              <option value="theme-contrast">High Contrast</option>
              <option value="theme-emerald-ops">Emerald Operations</option>
              <option value="theme-bmrcl">BMRCL Classic</option>
              <option value="theme-auto">Auto Theme</option>
            </select>
          </div>

          <button 
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>


          {/* AI Advisor Panel Button */}
          <button 
            onClick={() => setIsAiOpen(true)}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-slate-950 font-black text-[10px] px-3.5 py-1.5 rounded-lg transition shadow-lg shadow-cyan-900/10 uppercase tracking-widest"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Dispatch Assistant</span>
          </button>


          <button 
            onClick={logout}
            className="bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-350 text-[10px] font-bold px-3 py-1.5 rounded-lg transition uppercase"
          >
            Sign-Off
          </button>
        </div>
      </header>

      {/* 2. Multi-Screen Layout Console */}
      (
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 p-6">
          
          {/* Left Column: Live Grid & Incident Propagation (4/12 width) */}
          <div className="xl:col-span-4 space-y-6 flex flex-col justify-start">
            
            {/* Train Operator Handovers Status */}
            <ReliefTracking 
              liveTrainTrackingMap={liveTrainTrackingMap}
              filteredTrackingKeys={Object.keys(liveTrainTrackingMap)}
            />
          </div>

          {/* Center Column: Live Green Line SVG Map (5/12 width) */}
          <div className="xl:col-span-5 space-y-6">
            <MetroMapNavigation 
              liveTrainTrackingMap={liveTrainTrackingMap}
              unifiedRows={unifiedRows}
              liveIncidents={liveIncidents}
              deployments={deployments}
            />

            {/* Quick incident ticker */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
              <h4 className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Live OCC Announcements Stream
              </h4>
              <div className="max-h-[140px] overflow-y-auto space-y-2.5 pr-1">
                {liveIncidents.length === 0 ? (
                  <div className="text-[10px] text-slate-650 italic text-center py-4">No active line delays or blockages reported.</div>
                ) : (
                  liveIncidents.map(inc => (
                    <div key={inc.id} className="text-xs border-l-2 border-rose-500 bg-slate-950/40 p-2.5 rounded-r flex justify-between items-center">
                      <div>
                        <span className="font-bold text-rose-400 uppercase">[Train ID {inc.trainId}]</span>
                        <span className="text-slate-300 ml-1.5">{inc.reason || 'Variance Delay'}</span>
                      </div>
                      <span className="text-[9px] text-slate-500 font-bold">{inc.delayMinutes || inc.delay} mins ago</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Emergency Standby reserves & reliefs (3/12 width) */}
          <div className="xl:col-span-3">
            <Suspense fallback={<MiniLoader />}>
              <EmergencyReliefEngine />
            </Suspense>
          </div>
        </div>
      )

      {/* AI Assistant Sidebar */}
      <Suspense fallback={null}>
        <AiAssistantSidebar 
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          liveIncidents={liveIncidents}
          deployments={deployments}
          liveTrainTrackingMap={liveTrainTrackingMap}
        />
      </Suspense>

    </div>
  );
}

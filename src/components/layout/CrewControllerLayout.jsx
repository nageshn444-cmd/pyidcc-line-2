import React, { useState, useEffect } from 'react';
import { 
  Users, UserCheck, ShieldAlert, Award, FileSpreadsheet, 
  HelpCircle, Compass, ClipboardList, LogOut, RefreshCw, Sparkles, Calculator, Clock 
} from 'lucide-react';
import AutomatedDispatchGate from '../AutomatedDispatchGate';
import EmergencyReliefEngine from '../EmergencyReliefEngine';
import CrewDirectory from '../CrewDirectory';
import ShiftExchange from '../ShiftExchange';
import CrewKMCalculatorSuite from '../kmcalc/CrewKMCalculatorSuite';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { BMRCL_CREW_REGISTRY } from '../../data/bmrclCrewRegistry';
import AIALSCabInspectionPlanner from '../ai/AIALSCabInspectionPlanner';
import JmdDrivingHours from '../JmdDrivingHours';

export default function CrewControllerLayout({
  liveTrainTrackingMap,
  unifiedRows,
  liveIncidents,
  deployments,
  attendanceLogs,
  loading,
  fetchLiveData,
  activeDay,
  setActiveDay,
  onOneClickAuthorize
}) {
  const { theme, accessibility, setAccessibility } = useTheme();
  const { userProfile, logout, hasPermission, permissions } = useAuth();

  const menuItems = [
    { id: 'DISPATCH', label: 'Crew Dispatch Desk', icon: FileSpreadsheet, module: 'Automated Dispatch Gate' },
    { id: 'RELIEF', label: 'Emergency Relief Reserves', icon: ShieldAlert, module: 'Emergency Relief Module' },
    { id: 'CREW', label: 'Operator Directory', icon: Users, module: 'Crew Registry' },
    { id: 'EXCHANGE', label: 'Shift Exchange Swap Desk', icon: RefreshCw, module: 'Shift Exchange' },
    { id: 'ALS_PLANNER', label: 'AI ALS Cab Inspection', icon: Sparkles, module: 'AI ALS Cab Inspection' },
    { id: 'KM_CALC_SUITE', label: 'KM Calculator Suite', icon: Calculator, module: 'KM Calculator Suite' },
    { id: 'JMD_DRIVING_HOURS', label: "JMD TO's Driving Hours", icon: Clock, module: 'KM Calculator Suite' }
  ];

  const allowedMenuItems = menuItems.filter(item => {
    return hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own');
  });

  const [activeTab, setActiveTab] = useState(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    return visible.length > 0 ? visible[0].id : 'DISPATCH';
  });

  useEffect(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    if (visible.length > 0 && !visible.some(item => item.id === activeTab)) {
      setActiveTab(visible[0].id);
    }
  }, [permissions, activeTab]);

  return (
    <div className={`min-h-screen flex bg-slate-900 font-mono text-slate-100 transition-colors ${theme}`}>
      
      {/* Sidebar navigation */}
      <aside className="w-64 bg-slate-955 border-r border-slate-800 flex flex-col justify-between p-4 sticky top-0 h-screen select-none z-40">
        <div>
          <div className="flex items-center gap-2.5 pb-5 mb-5 border-b border-slate-800">
            <div className="h-8 w-8 bg-lime-600 rounded flex items-center justify-center font-black text-slate-950 shadow-[0_0_15px_rgba(132,204,22,0.3)]">
              CC
            </div>
            <div>
              <h2 className="text-xs font-black text-slate-100 tracking-wider">PYIDCC PLATFORM</h2>
              <span className="text-[9px] text-lime-400 font-bold uppercase tracking-widest">Crew Controller Console</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {allowedMenuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-xs font-bold transition-all ${activeTab === item.id ? 'bg-lime-500/10 text-lime-400 border border-lime-500/25 font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'}`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-850 pt-4 space-y-3">
          <div className="text-[9px] text-slate-500 uppercase">
            Controller: {userProfile?.employeeName || 'CrewController'}
          </div>
          <button 
            onClick={logout}
            className="w-full bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-350 text-xs font-bold py-2 rounded-lg transition-colors uppercase tracking-wider text-center"
          >
            Terminal logout
          </button>
        </div>
      </aside>

      {/* Main Workstation Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Control Bar */}
        <header className="h-16 bg-[var(--header-bg)] backdrop-blur-md border-b border-[var(--border-color)] px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-lime-400" />
            <span className="text-xs font-bold uppercase text-slate-400">GCC Crew Dispatch Station Controller Matrix</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Accessibility scale */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1 text-[10px]">
              <span className="text-slate-500 px-1 font-bold">FONT:</span>
              <select 
                value={accessibility.fontSize} 
                onChange={(e) => setAccessibility({ fontSize: e.target.value })}
                className="bg-transparent border-none text-lime-400 font-bold outline-none cursor-pointer"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
            
            <button 
              onClick={fetchLiveData}
              className="p-1.5 rounded-lg border border-slate-850 bg-slate-900 hover:bg-slate-800 text-slate-400 transition"
              title="Refresh live operational states"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'DISPATCH' ? (
            <div className="space-y-6">
              <AutomatedDispatchGate 
                deployments={deployments}
                loading={loading}
                activeDay={activeDay}
                setActiveDay={setActiveDay}
                runningFleetCount={Object.keys(liveTrainTrackingMap).length}
                onAuthorize={onOneClickAuthorize}
                onImportComplete={fetchLiveData}
              />
            </div>
          ) : activeTab === 'RELIEF' ? (
            <EmergencyReliefEngine />
          ) : activeTab === 'CREW' ? (
            <CrewDirectory crewData={BMRCL_CREW_REGISTRY} isAdmin={userProfile?.role === 'CREW_CONTROLLER'} />
          ) : activeTab === 'EXCHANGE' ? (
            <ShiftExchange />
          ) : activeTab === 'KM_CALC_SUITE' ? (
            <CrewKMCalculatorSuite />
          ) : activeTab === 'JMD_DRIVING_HOURS' ? (
            <JmdDrivingHours />
          ) : activeTab === 'ALS_PLANNER' ? (
            <AIALSCabInspectionPlanner />
          ) : null}
        </main>
      </div>

    </div>
  );
}

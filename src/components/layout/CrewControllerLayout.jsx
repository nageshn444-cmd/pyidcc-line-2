import React, { useState, useEffect, Suspense } from 'react';
import { 
  Users, UserCheck, ShieldAlert, Award, FileSpreadsheet, 
  HelpCircle, Compass, ClipboardList, LogOut, RefreshCw, Sparkles, Calculator, Clock, Send, Eye
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { BMRCL_CREW_REGISTRY } from '../../data/bmrclCrewRegistry';
import { lazyWithRetry } from '../../utils/lazyWithRetry';

const AutomatedDispatchGate      = lazyWithRetry(() => import('../AutomatedDispatchGate'));
const EmergencyReliefEngine      = lazyWithRetry(() => import('../EmergencyReliefEngine'));
const CrewDirectory              = lazyWithRetry(() => import('../CrewDirectory'));
const ShiftExchange              = lazyWithRetry(() => import('../ShiftExchange'));
const CrewKMCalculatorSuite      = lazyWithRetry(() => import('../kmcalc/CrewKMCalculatorSuite'));
const RosterPublisherBoard       = lazyWithRetry(() => import('../RosterPublisherBoard'));
const AIALSCabInspectionPlanner  = lazyWithRetry(() => import('../ai/AIALSCabInspectionPlanner'));
const JmdDrivingHours            = lazyWithRetry(() => import('../JmdDrivingHours'));
const DailyDutyGeneratorSuite    = lazyWithRetry(() => import('../dutyGenerator/DailyDutyGeneratorSuite'));

const TabLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
    <div className="animate-spin rounded-full h-10 w-10 border-4 border-lime-500 border-t-transparent" />
    <p className="text-xs text-slate-500 animate-pulse tracking-widest uppercase font-mono">Loading Panel...</p>
  </div>
);

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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const menuItems = [
    { id: 'DISPATCH', label: 'Crew Dispatch Desk', icon: FileSpreadsheet, module: 'Automated Dispatch Gate' },
    { id: 'DUTY_GENERATOR', label: 'Auto Duty Generator', icon: Sparkles, module: 'Automated Dispatch Gate' },
    { id: 'PUBLISHER', label: 'Enterprise Excel Sheet', icon: FileSpreadsheet, module: 'Automated Dispatch Gate' },
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
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar navigation */}
      <aside className={`fixed lg:static top-0 left-0 h-screen w-64 bg-slate-955 border-r border-slate-800 flex flex-col justify-between p-4 select-none z-50 overflow-y-auto transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
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
                onClick={() => { setActiveTab(item.id); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-xs font-bold transition-all ${activeTab === item.id ? 'bg-lime-500/10 text-lime-400 border border-lime-500/25 font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'}`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-855 pt-4 space-y-3">
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
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        
        {/* Top Control Bar */}
        <header className="h-16 bg-[var(--header-bg)] backdrop-blur-md border-b border-[var(--border-color)] px-3 lg:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-2">
            {/* Mobile Hamburger */}
            <button
              onClick={() => setIsSidebarOpen(prev => !prev)}
              className="lg:hidden p-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title="Toggle navigation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <UserCheck className="h-4 w-4 text-lime-400 hidden sm:block" />
            <span className="text-xs font-bold uppercase text-slate-400 hidden sm:block">GCC Crew Dispatch Station Controller Matrix</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Accessibility scale */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-1 text-[10px]">
              <span className="text-slate-500 px-1 font-bold">FONT:</span>
              <select id="crewcontrollerlayout-i1" name="crewcontrollerlayout-i1" 
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
        <main className="flex-1 p-3 lg:p-6 overflow-y-auto">
          <Suspense fallback={<TabLoader />}>
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
            ) : activeTab === 'PUBLISHER' ? (
              <RosterPublisherBoard userRole="CONTROLLER" />
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
            ) : activeTab === 'DUTY_GENERATOR' ? (
              <DailyDutyGeneratorSuite />
            ) : null}
          </Suspense>
        </main>
      </div>

    </div>
  );
}

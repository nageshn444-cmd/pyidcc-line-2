import React, { useState, useEffect } from 'react';
import { 
  FileText, CheckSquare, Award, Clock, Calendar, ShieldAlert, 
  ChevronRight, BarChart3, Users, RefreshCw, LogOut, Sparkles 
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import LeaveRequestManager from '../LeaveRequestManager';
import GCCControl from '../GCCControl';
import ShiftExchange from '../ShiftExchange';
import TrainOperatorPerformance from '../TrainOperatorPerformance';
import ReportsCenter from '../ReportsCenter';
import PerformanceMetrics from '../PerformanceMetrics';
import JmdDrivingHours from '../JmdDrivingHours';

export default function AdminSSLayout({
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
  const { theme, setTheme, accessibility, setAccessibility } = useTheme();
  const { userProfile, logout, hasPermission, permissions } = useAuth();

  const menuItems = [
    { id: 'KPI', label: 'Management KPIs', icon: BarChart3, module: 'Dashboard' },
    { id: 'LEAVES', label: 'Leave Approvals', icon: Calendar, module: 'Leave Requests' },
    { id: 'SWAPS', label: 'Swaps & Exchanges', icon: RefreshCw, module: 'Shift Exchange' },
    { id: 'JMD_DRIVING_HOURS', label: "JMD TO's Driving Hours", icon: Clock, module: 'KM Calculator Suite' },
    { id: 'REPORTS', label: 'Operational Reports', icon: FileText, module: 'Reports Center' }
  ];

  const allowedMenuItems = menuItems.filter(item => {
    return hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own');
  });

  const [activeTab, setActiveTab] = useState(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    return visible.length > 0 ? visible[0].id : 'KPI';
  });

  useEffect(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    if (visible.length > 0 && !visible.some(item => item.id === activeTab)) {
      setActiveTab(visible[0].id);
    }
  }, [permissions, activeTab]);

  return (
    <div className={`min-h-screen flex bg-slate-950 font-mono text-slate-100 transition-colors ${theme}`}>
      
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 sticky top-0 h-screen select-none z-40 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5 pb-5 mb-5 border-b border-slate-800">
            <div className="h-8 w-8 bg-blue-600 rounded flex items-center justify-center font-black text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]">
              SS
            </div>
            <div>
              <h2 className="text-xs font-black text-slate-150 tracking-wider">PYIDCC PLATFORM</h2>
              <span className="text-[9px] text-blue-400 font-bold uppercase tracking-widest">Station Superintendent</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {allowedMenuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-xs font-bold transition-all ${activeTab === item.id ? 'bg-blue-50 text-blue-600 border border-blue-100 font-bold' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="text-[9px] text-slate-400 uppercase">
            Supervisor: {userProfile?.employeeName || 'StationSuperintendent'}
          </div>
          <button 
            onClick={logout}
            className="w-full bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-650 text-xs font-bold py-2 rounded-lg transition-colors uppercase tracking-wider text-center"
          >
            Terminal Logout
          </button>
        </div>
      </aside>

      {/* Main Workstation */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Control Bar */}
        <header className="h-16 bg-[var(--header-bg)] backdrop-blur-md border-b border-[var(--border-color)] px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-bold uppercase text-slate-500">Peenya Depot Station Superintendent Panel</span>
          </div>

          <div className="flex items-center gap-4">
            
            {/* Theme Override Selector */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[10px]">
              <span className="text-slate-400 px-1 font-bold">THEME:</span>
              <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="bg-transparent border-none text-blue-400 font-bold outline-none cursor-pointer"
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

            {/* Accessibility scale */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[10px]">
              <span className="text-slate-400 px-1 font-bold">FONT:</span>
              <select 
                value={accessibility.fontSize} 
                onChange={(e) => setAccessibility({ fontSize: e.target.value })}
                className="bg-transparent border-none text-cyan-600 font-bold outline-none cursor-pointer"
              >
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
              </select>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'KPI' ? (
            <div className="space-y-6">
              
              {/* Quick statistics cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Today's Fleet Count</span>
                  <div className="text-3xl font-black text-blue-600 mt-2">{Object.keys(liveTrainTrackingMap).length} Active</div>
                  <span className="text-[9px] text-slate-500 mt-1 uppercase">Operating on Green Line link</span>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Standby Crew Reserves</span>
                  <div className="text-3xl font-black text-emerald-600 mt-2">
                    {deployments.filter(d => d.status === 'STANDBY').length} Operators
                  </div>
                  <span className="text-[9px] text-slate-500 mt-1 uppercase">Ready for immediate relief</span>
                </div>
                <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Active System Delays</span>
                  <div className="text-3xl font-black text-rose-500 mt-2">
                    {liveIncidents.filter(i => i.status !== 'RESOLVED').length} Incidents
                  </div>
                  <span className="text-[9px] text-slate-500 mt-1 uppercase">OCC propagates live updates</span>
                </div>
              </div>

              {/* Performance Metrics Summary */}
              <TrainOperatorPerformance />
              <PerformanceMetrics incidents={liveIncidents} />
            </div>
          ) : activeTab === 'LEAVES' ? (
            <div className="space-y-6">
              <GCCControl onOpenWindow={(d) => console.log(d)} />
              <LeaveRequestManager userRole="ADMIN_SS" />
            </div>
          ) : activeTab === 'SWAPS' ? (
            <div className="space-y-6">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-2">Shift Swaps & Exchanges Desk</h3>
              <ShiftExchange />
            </div>
          ) : activeTab === 'REPORTS' ? (
            <div className="space-y-6">
              <ReportsCenter />
            </div>
          ) : activeTab === 'JMD_DRIVING_HOURS' ? (
            <JmdDrivingHours />
          ) : null}
        </main>
      </div>

    </div>
  );
}

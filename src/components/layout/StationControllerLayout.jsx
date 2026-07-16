import React, { useState, useEffect } from 'react';
import { 
  Shield, ClipboardCheck, MessageSquare, AlertTriangle, 
  MapPin, Clock, LogOut, Train 
} from 'lucide-react';
import StationSafetyChecklist from '../StationSafetyChecklist';
import Safety from '../Safety';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function StationControllerLayout({
  liveTrainTrackingMap,
  unifiedRows,
  liveIncidents,
  deployments,
  attendanceLogs,
  loading,
  fetchLiveData,
  activeDay
}) {
  const { theme, setTheme, accessibility, setAccessibility } = useTheme();
  const { userProfile, logout, hasPermission, permissions } = useAuth();

  const menuItems = [
    { id: 'CHECKLIST', label: 'Safety Checklist', icon: ClipboardCheck, module: 'Shift Handovers' },
    { id: 'TRAINS', label: 'Local Platform Runs', icon: Train, module: 'Duty Roster' },
    { id: 'SAFETY', label: 'Safety Logbook', icon: Shield, module: 'Shift Handovers' }
  ];

  const allowedMenuItems = menuItems.filter(item => {
    return hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own');
  });

  const [activeTab, setActiveTab] = useState(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    return visible.length > 0 ? visible[0].id : 'CHECKLIST';
  });

  useEffect(() => {
    const visible = menuItems.filter(item => hasPermission(item.module, 'View') || hasPermission(item.module, 'Request') || hasPermission(item.module, 'Own'));
    if (visible.length > 0 && !visible.some(item => item.id === activeTab)) {
      setActiveTab(visible[0].id);
    }
  }, [permissions, activeTab]);

  // Get current station or filter by station (default to PYID since this is the Peenya Industry Depot Crew Control app)
  const stationCode = userProfile?.stationCode || 'PYID';

  // Filter deployments that sign on or sign off at this station
  const localDeployments = deployments.filter(d => 
    String(d.signOnLocation).toUpperCase() === stationCode || 
    String(d.signOffLocation).toUpperCase() === stationCode
  );

  return (
    <div className={`min-h-screen flex bg-slate-950 font-mono text-slate-200 ${theme}`}>
      
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4 sticky top-0 h-screen select-none z-40">
        <div>
          <div className="flex items-center gap-2.5 pb-5 mb-5 border-b border-slate-800">
            <div className="h-8 w-8 bg-purple-600 rounded flex items-center justify-center font-black text-slate-100 shadow-[0_0_15px_rgba(147,51,234,0.3)]">
              SC
            </div>
            <div>
              <h2 className="text-xs font-black text-slate-100 tracking-wider">PYIDCC PLATFORM</h2>
              <span className="text-[9px] text-purple-400 font-bold uppercase tracking-widest">Station Controller ({stationCode})</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {allowedMenuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-left text-xs font-bold transition-all ${activeTab === item.id ? 'bg-purple-600/15 text-purple-400 border border-purple-800/40 font-bold' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="border-t border-slate-850 pt-4 space-y-3">
          <div className="text-[9px] text-slate-500 uppercase">
            Station: {userProfile?.employeeName || 'StationController'}
          </div>
          <button 
            onClick={logout}
            className="w-full bg-slate-800 border border-slate-700 hover:bg-slate-750 text-slate-350 text-xs font-bold py-2 rounded-lg transition-colors uppercase tracking-wider text-center"
          >
            Terminal logout
          </button>
        </div>
      </aside>

      {/* Main Workstation */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Control Bar */}
        <header className="h-16 bg-[var(--header-bg)] backdrop-blur-md border-b border-[var(--border-color)] px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-purple-400" />
            <span className="text-xs font-bold uppercase text-slate-400">Local Station Operations Terminal | {stationCode}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Accessibility scale */}
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1 text-[10px]">
              <span className="text-slate-500 px-1 font-bold">FONT:</span>
              <select 
                value={accessibility.fontSize} 
                onChange={(e) => setAccessibility({ fontSize: e.target.value })}
                className="bg-transparent border-none text-purple-400 font-bold outline-none cursor-pointer"
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
          {activeTab === 'CHECKLIST' ? (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest border-b border-slate-850 pb-2 mb-4">Safety Checklist Dashboard</h3>
                <StationSafetyChecklist />
              </div>
            </div>
          ) : activeTab === 'TRAINS' ? (
            <div className="space-y-6">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
                <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest border-b border-slate-850 pb-2.5 mb-4">
                  Incoming / Outgoing Operator Handover Runs ({stationCode})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs font-bold font-mono">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-3">Duty ID</th>
                        <th className="py-2.5 px-3">Train ID</th>
                        <th className="py-2.5 px-3">Operator Name</th>
                        <th className="py-2.5 px-3">Sign-On Time</th>
                        <th className="py-2.5 px-3">Sign-On Location</th>
                        <th className="py-2.5 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-slate-350">
                      {localDeployments.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="py-5 text-center text-slate-500 italic">No local handovers scheduled at this platform today.</td>
                        </tr>
                      ) : (
                        localDeployments.map(d => (
                          <tr key={d.id} className="hover:bg-slate-850/30">
                            <td className="py-2.5 px-3 text-purple-400">{d.dutyId}</td>
                            <td className="py-2.5 px-3 text-slate-100">{d.trainId}</td>
                            <td className="py-2.5 px-3">{d.empName}</td>
                            <td className="py-2.5 px-3">{d.signOnTime}</td>
                            <td className="py-2.5 px-3">{d.signOnLocation}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${d.isSignedOn ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'}`}>
                                {d.isSignedOn ? 'On Duty' : 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : activeTab === 'SAFETY' ? (
            <div className="space-y-6">
              <Safety />
            </div>
          ) : null}
        </main>
      </div>

    </div>
  );
}

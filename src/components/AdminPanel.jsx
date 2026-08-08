import React, { useState, useEffect } from 'react';
import { Settings, Users, Shield, Terminal, Fingerprint, Cpu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

import UserControlCenter from './UserControlCenter';
import CategoryRules from './CategoryRules';
import UserManagement from './UserManagement';
import RoleManagement from './RoleManagement';
import AuditLogs from './AuditLogs';
import ThemeSettings from './ThemeSettings';

export default function AdminPanel() {
  const { hasPermission, userProfile } = useAuth();
  
  const subTabs = [
    { id: 'UCC', label: 'User Control Center', icon: Fingerprint, show: userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN_Station_Superintendent' || userProfile?.role === 'ADMIN_SS' },
    { id: 'CATEGORY_RULES', label: 'Category Rules', icon: Cpu, show: userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN_Station_Superintendent' || userProfile?.role === 'ADMIN_SS' },
    { id: 'THEME', label: 'Theme & Comfort', icon: Settings, show: true },
    { id: 'USER_MGMT', label: 'User Management', icon: Users, show: hasPermission('User Management', 'Full') },
    { id: 'ROLE_MGMT', label: 'Role Management', icon: Shield, show: hasPermission('Role Management', 'Full') },
    { id: 'AUDIT_LOGS', label: 'Audit Logs', icon: Terminal, show: userProfile?.role === 'SUPER_ADMIN' }
  ];

  const allowedSubTabs = subTabs.filter(tab => tab.show);
  const [activeSubTab, setActiveSubTab] = useState('');

  useEffect(() => {
    if (allowedSubTabs.length > 0 && !allowedSubTabs.some(t => t.id === activeSubTab)) {
      setActiveSubTab(allowedSubTabs[0].id);
    }
  }, [allowedSubTabs, activeSubTab]);

  return (
    <div className='bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden min-h-[600px] flex flex-col font-mono text-slate-200'>
      
      {/* Sub-tab Navigation */}
      <div className='bg-slate-955 px-6 py-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4'>
        <div className='flex items-center gap-2'>
          <Settings className="text-emerald-400" />
          <h2 className='text-slate-100 font-bold tracking-wider uppercase text-sm'>
            Administrator Controls Panel
          </h2>
        </div>
        
        <div className='flex flex-wrap gap-2'>
          {allowedSubTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all font-bold ${
                  activeSubTab === tab.id 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                    : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <Icon size={14} />
                {tab.label.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel Content Area */}
      <div className='p-6 flex-1 bg-slate-900/50'>
        {activeSubTab === 'UCC' && <UserControlCenter />}
        {activeSubTab === 'CATEGORY_RULES' && <CategoryRules />}
        {activeSubTab === 'THEME' && <ThemeSettings />}
        {activeSubTab === 'USER_MGMT' && <UserManagement />}
        {activeSubTab === 'ROLE_MGMT' && <RoleManagement />}
        {activeSubTab === 'AUDIT_LOGS' && <AuditLogs />}
      </div>
    </div>
  );
}
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Users, ShieldAlert, FileText, Settings } from 'lucide-react';

const NavItem = ({ label, moduleName, permissionLevel = 'View', icon: Icon, to = "#", onClick }) => {
  const { hasPermission } = useAuth();

  // Hide item if role does not match permissions
  if (moduleName && !hasPermission(moduleName, permissionLevel)) {
    return null;
  }

  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 p-3 w-full transition-colors ${
          isActive 
            ? 'bg-slate-800 text-white border-r-4 border-amber-500' 
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
};

export default function Sidebar() {
  return (
    <div className="w-64 bg-slate-900 h-screen border-r border-slate-800 flex flex-col shadow-xl">
      <div className="p-6 text-xl font-bold text-amber-500 tracking-wider">
        BMRCL PYIDCC
      </div>
      
      <nav className="flex-1 mt-4">
        <NavItem label="Dashboard" to="/dashboard" moduleName="Dashboard" icon={LayoutDashboard} />
        <NavItem 
          label="Manual Override" 
          to="/override" 
          moduleName="Manual Override" 
          permissionLevel="Full"
          icon={ShieldAlert} 
        />
        <NavItem 
          label="Reports" 
          to="/reports" 
          moduleName="Reports"
          icon={FileText} 
        />
        <NavItem 
          label="User Management" 
          to="/users" 
          moduleName="User Management" 
          permissionLevel="Full"
          icon={Users} 
        />
        <NavItem 
          label="Settings" 
          to="/settings" 
          moduleName="Settings" 
          permissionLevel="Full"
          icon={Settings} 
        />
      </nav>

      <div className="p-4 border-t border-slate-800 text-xs text-slate-500 text-center">
        v1.0.0
      </div>
    </div>
  );
}
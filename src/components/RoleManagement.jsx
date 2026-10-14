import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { useAuth, isOwnerUser } from '../context/AuthContext';
import { Shield, ShieldAlert, Check, X, RefreshCw, Search, CheckCircle2 } from 'lucide-react';

const MODULES = [
  "Dashboard",
  "Crew Registry",
  "Duty Roster",
  "Shift Exchange",
  "Duty Swap",
  "Automated Dispatch Gate",
  "Live Relief Tracking",
  "Emergency Relief Module",
  "Reports Center",
  "User Control Center",
  "KM Calculator Suite",
  "Rake Registry",
  "Leave Requests",
  "AI ALS Cab Inspection"
];

const PERMISSION_OPTIONS = ["Full", "View", "Own", "Request", "No"];

export default function RoleManagement() {
  const { userProfile, logAudit, currentUser } = useAuth();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSaved, setLastSaved] = useState(null);
  const [moduleFilter, setModuleFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'roles'), (snap) => {
      setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.warn("Roles snapshot error:", err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handlePermissionChange = async (roleId, moduleName, newValue) => {
    if (roleId === 'SUPER_ADMIN') {
      return alert("SUPER_ADMIN role permissions cannot be modified to prevent system lockout.");
    }

    const targetRole = roles.find(r => r.id === roleId);
    if (!targetRole) return;

    const updatedPermissions = {
      ...targetRole.permissions,
      [moduleName]: newValue
    };

    // 1. INSTANT 0ms Optimistic UI Update: dropdown updates without any delay or disabled state
    setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: updatedPermissions } : r));
    setLastSaved(new Date().toLocaleTimeString());

    // 2. Parallel Background Sync
    Promise.all([
      setDoc(doc(db, 'roles', roleId), { permissions: updatedPermissions }, { merge: true }),
      setDoc(doc(db, 'role_permissions', roleId), { permissions: updatedPermissions }, { merge: true })
    ]).then(() => {
      logAudit("ROLE_PERMISSIONS_CHANGE", userProfile?.employeeId || 'admin', userProfile?.employeeName || 'Super Admin', 
        `Updated role ${roleId} module ${moduleName} permission to ${newValue}`).catch(() => {});
    }).catch(err => {
      console.error("Role permission save failed:", err);
      // Revert if write fails
      setRoles(prev => prev.map(r => r.id === roleId ? targetRole : r));
      alert("Failed to save changes: " + err.message);
    });
  };

  const isOwner = isOwnerUser(currentUser, userProfile) || 
                  userProfile?.role === 'SUPER_ADMIN' || 
                  String(userProfile?.employeeId) === '20726';

  const isAuthorized = isOwner ||
                       userProfile?.role === 'SUPER_ADMIN' || 
                       userProfile?.role === 'ADMIN_Station_Superintendent' || 
                       userProfile?.role === 'ADMIN_SS' || 
                       userProfile?.role === 'ADMIN' || 
                       userProfile?.role === 'CREW_CONTROLLER' || 
                       userProfile?.role === 'ALS' || 
                       userProfile?.role === 'GCC' || 
                       userProfile?.role === 'co ordinators' ||
                       userProfile?.role === 'COORDINATOR';

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="space-y-6 font-mono text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-amber-500" />
          <div>
            <h2 className="text-lg font-black tracking-wider uppercase">System Access Control Matrix</h2>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Adjust role authorizations dynamically across operational modules (0ms instant updates)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 bg-emerald-950/30 border border-emerald-800/40 px-2.5 py-1 rounded">
              <CheckCircle2 size={12} />
              <span>Synced {lastSaved}</span>
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Filter modules..."
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl relative shadow-2xl">
        
        {loading ? (
          <div className="text-center py-12 text-slate-500 font-bold uppercase tracking-wider animate-pulse">Loading Matrix...</div>
        ) : (
          <div className="overflow-x-auto bg-slate-950 border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-900 text-slate-500 uppercase tracking-widest text-[9px] border-b border-slate-800">
                <tr>
                  <th className="p-3 w-48 font-black">Role / Module</th>
                  {MODULES.filter(m => !moduleFilter.trim() || m.toLowerCase().includes(moduleFilter.toLowerCase())).map(mod => (
                    <th key={mod} className="p-3 text-center font-black">{mod}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {roles.map(role => (
                  <tr key={role.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="p-3 font-bold text-amber-400 border-r border-slate-800/50 bg-slate-900/20">
                      {role.roleName}
                      {role.id === 'SUPER_ADMIN' && (
                        <span className="block text-[8px] text-red-400 font-black mt-0.5 uppercase tracking-wider">LOCKED SYSTEM ROLE</span>
                      )}
                    </td>
                    {MODULES.filter(m => !moduleFilter.trim() || m.toLowerCase().includes(moduleFilter.toLowerCase())).map(mod => {
                      const currentVal = role.permissions?.[mod] || 'No';
                      const isSuper = role.id === 'SUPER_ADMIN';

                      return (
                        <td key={mod} className="p-3 text-center">
                          {isSuper ? (
                            <span className="text-emerald-500 font-black uppercase text-[10px] tracking-wider">Full</span>
                          ) : (
                            <select id={`role-perm-${role.id}-${mod.toLowerCase().replace(/[^a-z0-9]/g, '-')}`} name={`role_perm_${role.id}_${mod.toLowerCase().replace(/[^a-z0-9]/g, '_')}`} aria-label={`Permission for ${role.roleName} in ${mod}`}
                              value={currentVal}
                              onChange={(e) => handlePermissionChange(role.id, mod, e.target.value)}
                              className={`bg-slate-900 border border-slate-800 rounded px-1.5 py-1 text-[10px] font-bold text-center w-24 focus:outline-none focus:border-amber-500 cursor-pointer ${
                                currentVal === 'Full' ? 'text-emerald-400 bg-emerald-950/20' : 
                                currentVal === 'View' ? 'text-blue-400 bg-blue-950/20' : 
                                currentVal === 'Own' ? 'text-cyan-400 bg-cyan-950/20' : 
                                currentVal === 'Request' ? 'text-amber-400 bg-amber-950/20' : 'text-slate-500'
                              }`}
                            >
                              {PERMISSION_OPTIONS.map(opt => (
                                <option key={opt} value={opt} className="bg-slate-950 text-slate-200">{opt}</option>
                              ))}
                            </select>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

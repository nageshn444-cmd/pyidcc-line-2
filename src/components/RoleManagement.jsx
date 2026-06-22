import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Shield, ShieldAlert, Check, X, RefreshCw } from 'lucide-react';

const MODULES = [
  "Dashboard",
  "Crew Registry",
  "Duty Roster",
  "Shift Exchange",
  "Duty Swap",
  "Manual Override",
  "Reports",
  "User Management",
  "Role Management",
  "Settings"
];

const PERMISSION_OPTIONS = ["Full", "View", "Own", "Request", "No"];

export default function RoleManagement() {
  const { userProfile, logAudit } = useAuth();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const rolesSnap = await getDocs(collection(db, 'roles'));
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handlePermissionChange = async (roleId, moduleName, newValue) => {
    if (roleId === 'SUPER_ADMIN') {
      return alert("SUPER_ADMIN role permissions cannot be modified to prevent system lockout.");
    }

    try {
      setSaving(true);
      const targetRole = roles.find(r => r.id === roleId);
      if (!targetRole) return;

      const updatedPermissions = {
        ...targetRole.permissions,
        [moduleName]: newValue
      };

      await updateDoc(doc(db, 'roles', roleId), {
        permissions: updatedPermissions
      });

      await logAudit("ROLE_PERMISSIONS_CHANGE", userProfile.employeeId, userProfile.employeeName, 
        `Updated role ${roleId} module ${moduleName} permission to ${newValue}`);

      // Update local state
      setRoles(prev => prev.map(r => r.id === roleId ? { ...r, permissions: updatedPermissions } : r));
    } catch (err) {
      alert("Failed to save changes: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-mono text-slate-100">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <Shield className="h-6 w-6 text-amber-500" />
        <div>
          <h2 className="text-lg font-black tracking-wider uppercase">System Access Control Matrix</h2>
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Adjust role authorizations dynamically across operational modules</p>
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
                  {MODULES.map(mod => (
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
                    {MODULES.map(mod => {
                      const currentVal = role.permissions?.[mod] || 'No';
                      const isSuper = role.id === 'SUPER_ADMIN';

                      return (
                        <td key={mod} className="p-3 text-center">
                          {isSuper ? (
                            <span className="text-emerald-500 font-black uppercase text-[10px] tracking-wider">Full</span>
                          ) : (
                            <select 
                              value={currentVal}
                              onChange={(e) => handlePermissionChange(role.id, mod, e.target.value)}
                              disabled={saving}
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

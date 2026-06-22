import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  setDoc, 
  query, 
  where, 
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Users, UserCheck, UserX, Shield, Edit2, RotateCcw, AlertTriangle, Check, X, ShieldAlert } from 'lucide-react';

export default function UserManagement() {
  const { userProfile, logAudit } = useAuth();
  const [users, setUsers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modals / Actions
  const [selectedUser, setSelectedUser] = useState(null);
  const [newRole, setNewRole] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [approveReq, setApproveReq] = useState(null);
  const [reqEmpId, setReqEmpId] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [manualEmpId, setManualEmpId] = useState('');
  const [manualPassword, setManualPassword] = useState('');
  const [showManualModal, setShowManualModal] = useState(false);

  const fetchUsersData = async () => {
    try {
      setLoading(true);
      
      // Load users
      const usersSnap = await getDocs(collection(db, 'system_users'));
      setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Load pending requests
      const reqQuery = query(collection(db, 'registrationRequests'), where('status', '==', 'PENDING'));
      const reqSnap = await getDocs(reqQuery);
      setRequests(reqSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      // Load registry
      const regSnap = await getDocs(collection(db, 'crewRegistry'));
      setRegistry(regSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersData();
  }, []);

  const handleToggleActive = async (user) => {
    if (user.employeeId === '20726') {
      return alert("SUPER_ADMIN (NAGESHA N) cannot be deactivated.");
    }
    const newStatus = !user.active;
    try {
      await updateDoc(doc(db, 'system_users', user.id), { active: newStatus });
      await logAudit("USER_STATUS_CHANGE", userProfile.employeeId, userProfile.employeeName, 
        `${newStatus ? 'Activated' : 'Deactivated'} user ${user.employeeName} (${user.employeeId})`);
      fetchUsersData();
      alert(`User ${user.employeeName} has been ${newStatus ? 'activated' : 'deactivated'}.`);
    } catch (err) {
      alert("Failed to toggle status: " + err.message);
    }
  };

  const handleRoleChange = async () => {
    if (!selectedUser || !newRole) return;
    if (selectedUser.employeeId === '20726') {
      return alert("SUPER_ADMIN (NAGESHA N) role cannot be modified.");
    }
    
    try {
      await updateDoc(doc(db, 'system_users', selectedUser.id), { role: newRole });
      await logAudit("USER_ROLE_CHANGE", userProfile.employeeId, userProfile.employeeName, 
        `Changed role of ${selectedUser.employeeName} (${selectedUser.employeeId}) to ${newRole}`);
      setShowRoleModal(false);
      setSelectedUser(null);
      fetchUsersData();
      alert("Role updated successfully.");
    } catch (err) {
      alert("Failed to update role: " + err.message);
    }
  };

  const handleApproveRequest = async () => {
    if (!approveReq || !reqEmpId) return;

    // Verify employee ID exists in registry
    const regEmp = registry.find(r => String(r.employeeId) === String(reqEmpId));
    if (!regEmp) {
      return alert("Employee ID not found in Crew Registry.");
    }

    try {
      // Create user profile in Firestore
      const isSuperAdmin = String(reqEmpId) === '20726';
      let role = 'TRAIN_OPERATOR';
      if (isSuperAdmin) {
        role = 'SUPER_ADMIN';
      } else if (regEmp.designation === 'Station Superintendent') {
        role = 'ADMIN_SS';
      } else if (regEmp.designation === 'CREW_CONTROLLER') {
        role = 'CREW_CONTROLLER';
      }

      // Check if user already exists
      const userExist = users.find(u => String(u.employeeId) === String(reqEmpId));
      if (userExist) {
        return alert("This Employee ID is already registered under another account.");
      }

      // Create a temporary user link or user in Users (Wait, Google user is authenticated, we write their doc in users with their auth UID)
      // Since Google Auth returns their Google UID, we should query Auth to get their UID if possible, but the request holds their email.
      // Firebase doesn't let us easily query UIDs from email on client. 
      // Instead, we mark the request as APPROVED and store the approved employeeId in registrationRequests.
      // When the user logs in again via Google, the AuthContext Google sign-in flow will detect the approved request, create their user profile automatically!
      await updateDoc(doc(db, 'registrationRequests', approveReq.id), {
        status: 'APPROVED',
        employeeId: reqEmpId,
        approvedBy: userProfile.employeeName,
        approvedAt: serverTimestamp()
      });

      // Update registry document with Google email
      await updateDoc(doc(db, 'crewRegistry', reqEmpId), { email: approveReq.email });

      await logAudit("REGISTRATION_APPROVE", userProfile.employeeId, userProfile.employeeName, 
        `Approved registration request for ${approveReq.email} as Employee ID ${reqEmpId}`);
      
      setShowApproveModal(false);
      setApproveReq(null);
      setReqEmpId('');
      fetchUsersData();
      alert("Request approved. The operator can now log in using Google.");
    } catch (err) {
      alert("Failed to approve request: " + err.message);
    }
  };

  const handleRejectRequest = async (req) => {
    if (!window.confirm(`Reject Google registration request for ${req.name} (${req.email})?`)) return;
    try {
      await updateDoc(doc(db, 'registrationRequests', req.id), {
        status: 'REJECTED',
        rejectedBy: userProfile.employeeName,
        rejectedAt: serverTimestamp()
      });
      await logAudit("REGISTRATION_REJECT", userProfile.employeeId, userProfile.employeeName, 
        `Rejected Google registration request for ${req.email}`);
      fetchUsersData();
    } catch (err) {
      alert("Failed to reject request: " + err.message);
    }
  };

  const handleManualCreate = async (e) => {
    e.preventDefault();
    if (!manualEmpId || !manualPassword) return;

    // Validate registry
    const regEmp = registry.find(r => String(r.employeeId) === String(manualEmpId));
    if (!regEmp) {
      return alert("Employee ID not found in Crew Registry.");
    }

    try {
      // We will add a document in users pending their email login, or register them in auth
      // Note: Admin registering other users in Firebase Auth client-side is not directly supported because it signs the Admin out.
      // Instead, we store a record in 'pendingRegistrations' or allow the user to register themselves (which is supported in our Login.jsx screen!).
      // Here, the Admin can pre-approve an employee and pre-set their role in crewRegistry so when they self-register, they get that exact role.
      await updateDoc(doc(db, 'crewRegistry', manualEmpId), {
        preassignedRole: 'TRAIN_OPERATOR' // or let admin choose
      });

      alert(`Employee ID ${manualEmpId} is pre-assigned. Instruct the user to click 'Register' on the Login Screen and set their password.`);
      setShowManualModal(false);
      setManualEmpId('');
      setManualPassword('');
    } catch (err) {
      alert("Failed to register employee: " + err.message);
    }
  };

  return (
    <div className="space-y-6 font-mono text-slate-100">
      {/* Top Header */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <Users className="h-6 w-6 text-amber-500" />
        <div>
          <h2 className="text-lg font-black tracking-wider uppercase">User Directory & Account Controls</h2>
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Enforce credentials, lock accounts, modify authorization matrices</p>
        </div>
      </div>

      {/* Google Registration Requests */}
      {requests.length > 0 && (
        <div className="bg-slate-900 border-2 border-amber-500/50 rounded-xl p-5 shadow-lg">
          <h3 className="text-xs font-bold text-amber-400 flex items-center gap-2 mb-4 uppercase tracking-widest">
            <AlertTriangle className="h-4 w-4 animate-pulse" /> Pending Google Registration Approvals ({requests.length})
          </h3>
          
          <div className="overflow-x-auto bg-slate-950 border border-slate-800 rounded-lg">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-900 text-slate-500 uppercase tracking-widest text-[9px]">
                <tr>
                  <th className="p-3">Google Name</th>
                  <th className="p-3">Email Address</th>
                  <th className="p-3">Request Date</th>
                  <th className="p-3 text-right">Approval Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {requests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-900/30">
                    <td className="p-3 font-bold">{req.name}</td>
                    <td className="p-3 text-slate-400">{req.email}</td>
                    <td className="p-3 text-slate-500 text-[10px]">
                      {req.requestedAt?.toDate() ? req.requestedAt.toDate().toLocaleString() : 'Just now'}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button 
                        onClick={() => { setApproveReq(req); setShowApproveModal(true); }}
                        className="bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-500/30 text-emerald-400 font-bold px-3 py-1 rounded text-[10px] uppercase transition-colors"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleRejectRequest(req)}
                        className="bg-rose-950/40 hover:bg-rose-900/30 border border-rose-900/30 text-rose-400 font-bold px-3 py-1 rounded text-[10px] uppercase transition-colors"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Registered Users List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Registered System Accounts</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px]">
              <tr>
                <th className="p-4">Emp ID / Name</th>
                <th className="p-4">Designation</th>
                <th className="p-4">Assigned Role</th>
                <th className="p-4">Last Login Time</th>
                <th className="p-4">Account Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-slate-800/30 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="p-4">
                    <div className="font-bold text-slate-200">{u.employeeName}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">ID: {u.employeeId} | {u.email}</div>
                  </td>
                  <td className="p-4 text-slate-300 font-semibold">{u.designation}</td>
                  <td className="p-4">
                    <span className="bg-slate-950 border border-slate-800 text-amber-400 font-bold px-2 py-0.5 rounded text-[10px]">
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4 text-slate-500 text-[10px]">
                    {u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : '--'}
                  </td>
                  <td className="p-4">
                    {u.active ? (
                      <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span> ACTIVE
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold text-[10px] flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span> DEACTIVATED
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right space-x-2">
                    <button 
                      onClick={() => { setSelectedUser(u); setNewRole(u.role); setShowRoleModal(true); }}
                      disabled={u.employeeId === '20726'}
                      className="bg-slate-850 hover:bg-slate-800 border border-slate-700 disabled:opacity-40 text-slate-300 font-bold p-1.5 rounded transition-colors"
                      title="Change User Role"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => handleToggleActive(u)}
                      disabled={u.employeeId === '20726'}
                      className={`p-1.5 rounded border disabled:opacity-40 transition-colors ${u.active ? 'bg-rose-950/40 border-rose-900/30 text-rose-400 hover:bg-rose-900/30' : 'bg-emerald-950/40 border-emerald-900/30 text-emerald-400 hover:bg-emerald-800/30'}`}
                      title={u.active ? "Deactivate Account" : "Activate Account"}
                    >
                      {u.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role Assignment Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-500">
              <Shield size={20} />
              <h3 className="text-sm font-black uppercase tracking-wider">Change User Role</h3>
            </div>
            
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
              User: <span className="text-white font-bold">{selectedUser?.employeeName}</span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Select Role</label>
              <select 
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                <option value="ADMIN_SS">ADMIN_SS</option>
                <option value="CREW_CONTROLLER">CREW_CONTROLLER</option>
                <option value="STATION_CONTROLLER">STATION_CONTROLLER</option>
                <option value="TRAIN_OPERATOR">TRAIN_OPERATOR</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 text-[9px] font-black tracking-widest pt-2">
              <button 
                onClick={() => { setShowRoleModal(false); setSelectedUser(null); }}
                className="bg-slate-850 hover:bg-slate-800 text-white px-3 py-2 rounded uppercase"
              >
                Cancel
              </button>
              <button 
                onClick={handleRoleChange}
                className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-3 py-2 rounded uppercase"
              >
                Apply Role Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Approval ID Prompt Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-500">
              <UserCheck size={20} />
              <h3 className="text-sm font-black uppercase tracking-wider">Approve Google Request</h3>
            </div>
            
            <p className="text-[10px] text-slate-400 uppercase tracking-widest leading-relaxed">
              Google Account: <span className="text-white font-bold">{approveReq?.email}</span>. 
              Assign their numeric BMRCL Employee ID to synchronize details.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Employee ID</label>
              <input 
                type="number"
                value={reqEmpId}
                onChange={(e) => setReqEmpId(e.target.value)}
                placeholder="e.g. 21430"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 text-[9px] font-black tracking-widest pt-2">
              <button 
                onClick={() => { setShowApproveModal(false); setApproveReq(null); setReqEmpId(''); }}
                className="bg-slate-850 hover:bg-slate-800 text-white px-3 py-2 rounded uppercase"
              >
                Cancel
              </button>
              <button 
                onClick={handleApproveRequest}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-3 py-2 rounded uppercase"
              >
                Approve & Link ID
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

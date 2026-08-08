import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp,
  addDoc,
  onSnapshot,
  getDocs,
  getDoc,
  deleteDoc,
  limit,
  orderBy
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { provisioningService } from '../services/ProvisioningService';
import { getRoleDefaultPermissions } from '../utils/dbSeeder';
import { 
  Users, UserCheck, UserX, Shield, Edit2, RotateCcw, AlertTriangle, 
  Check, X, ShieldAlert, Key, Clock, Laptop, Eye, Trash2, Search, 
  Settings, Filter, ShieldCheck, FileText, CheckSquare, Sparkles, CheckCircle
} from 'lucide-react';

export default function UserManagement() {
  const { userProfile, logAudit } = useAuth();
  
  // Data States
  const [users, setUsers] = useState([]);
  const [loginRequests, setLoginRequests] = useState([]);
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [roleRequests, setRoleRequests] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');

  // Modals & Action States
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Modals visibility
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [newRole, setNewRole] = useState('');

  const [showPermsModal, setShowPermsModal] = useState(false);
  const [selectedUserPerms, setSelectedUserPerms] = useState({});

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyType, setHistoryType] = useState('LOGIN'); // 'LOGIN' | 'AUDIT' | 'DEVICE'
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('Not Operational Crew');
  const [customRejectionReason, setCustomRejectionReason] = useState('');

  const handleBulkReset = async () => {
    const confirmReset = window.confirm(
      "WARNING: This will immediately send password reset emails to ALL registered users (excluding Nagesha N) and flag their active sessions to force a fresh login. Are you sure you want to proceed?"
    );
    if (!confirmReset) return;

    try {
      let count = 0;
      for (const u of users) {
        if (String(u.email).toLowerCase() === 'nageshn444@gmail.com' || u.employeeId === '20726') {
          continue;
        }

        // Set forceLogout flag in Firestore
        await updateDoc(doc(db, 'system_users', u.id), {
          forceLogout: true
        });

        // Trigger password reset email
        if (u.email) {
          try {
            await sendPasswordResetEmail(auth, u.email);
            count++;
          } catch (e) {
            console.warn(`Could not dispatch reset email to ${u.email}:`, e);
          }
        }
      }

      alert(`Successfully triggered bulk logout and dispatched password reset emails to ${count} users.`);
      await logAudit("BULK_SESSION_RESET", userProfile?.uid || "admin", userProfile?.employeeName || "Admin", `Sent password reset links & forced sign out for all users.`);
    } catch (err) {
      console.error("Bulk reset error:", err);
      alert("Error performing bulk reset: " + err.message);
    }
  };

  // 1. Listen to real-time collections
  useEffect(() => {
    setLoading(true);
    
    const handleErr = (name, err) => {
      if (err.code !== 'permission-denied') {
        console.error(`${name} err:`, err);
      }
    };

    // Listen to system_users (master accounts list)
    const unsubUsers = onSnapshot(collection(db, 'system_users'), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => handleErr("Error listening to system_users", err));

    // Listen to real-time login_requests
    const unsubLoginRequests = onSnapshot(collection(db, 'login_requests'), (snap) => {
      setLoginRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleErr("Error listening to login_requests", err));

    // Listen to legacy registrationRequests
    const unsubRegs = onSnapshot(collection(db, 'registrationRequests'), (snap) => {
      setRegistrationRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleErr("Error listening to registrationRequests", err));

    // Listen to crewRegistry
    const unsubRegistry = onSnapshot(collection(db, 'crewRegistry'), (snap) => {
      setRegistry(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => handleErr("Error listening to crewRegistry", err));

    // Listen to role_requests
    const unsubRoleRequests = onSnapshot(collection(db, 'role_requests'), (snap) => {
      setRoleRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      if (err.code !== 'permission-denied') {
        setRoleRequests([]);
      }
    });

    return () => {
      unsubUsers();
      unsubLoginRequests();
      unsubRegs();
      unsubRegistry();
      unsubRoleRequests();
    };
  }, []);

  // 2. Approval & Rejection Logic
  const handleApproveRequest = async (req) => {
    try {
      // 1. Run full provisioning service check/creation
      await provisioningService.approveLoginRequest(req, userProfile.employeeName);

      // Get the user's UID to update system_users status to 'approved'
      let uid = req.firebaseUid || '';
      if (!uid) {
        const q = query(collection(db, 'system_users'), where('employeeId', '==', String(req.employeeId)));
        const qSnap = await getDocs(q);
        if (!qSnap.empty) {
          uid = qSnap.docs[0].id;
        }
      }

      if (uid) {
        const userRef = doc(db, 'system_users', uid);
        const userSnap = await getDoc(userRef);
        const pendingUser = userSnap.exists() ? userSnap.data() : {
          uid: uid,
          employeeId: req.employeeId,
          employeeName: req.employeeName,
          email: req.email,
          designation: req.designation,
          role: req.requestedRole || 'Train Operator',
          depot: req.depot,
          department: 'Operations'
        };

        await setDoc(doc(db, 'system_users', pendingUser.uid), {
           ...pendingUser,
           status: 'ACTIVE',
           approved: true,
           loginEnabled: true,
           active: true
        });
      }

      // 2. Delete the pending request
      const requestRef = doc(db, 'login_requests', req.requestId);
      await deleteDoc(requestRef); 

      alert("User Approved. Access granted.");
    } catch (err) {
      console.error("Error approving:", err);
      alert("Failed to approve request: " + err.message);
    }
  };

  const handleOpenRejectModal = (req) => {
    setSelectedRequest(req);
    setRejectionReason('Not Operational Crew');
    setCustomRejectionReason('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequest) return;
    const reason = rejectionReason === 'Others' ? customRejectionReason : rejectionReason;
    try {
      await provisioningService.rejectLoginRequest(selectedRequest, userProfile.employeeName, reason);
      alert("Login Request rejected.");
      setShowRejectModal(false);
      setSelectedRequest(null);
    } catch (err) {
      alert("Failed to reject request: " + err.message);
    }
  };

  // 3. User Account Actions
  const handleSetUserStatus = async (user, newStatus) => {
    if (user.employeeId === '20726') {
      return alert("SUPER_ADMIN (NAGESHA N) status cannot be modified.");
    }
    try {
      const empId = String(user.employeeId);
      const isActive = newStatus === 'ACTIVE';
      const docId = user.id || user.uid;

      const statusValue = isActive ? 'ACTIVE' : 'INACTIVE';

      if (docId) {
        await updateDoc(doc(db, 'system_users', docId), {
          status: statusValue,
          active: isActive,
          approved: isActive,
          loginEnabled: isActive,
          updatedAt: new Date().toISOString(),
          updatedBy: userProfile.employeeName
        });
      }

      try {
        await updateDoc(doc(db, 'users', empId), {
          status: newStatus,
          active: isActive,
          updatedAt: new Date().toISOString(),
          updatedBy: userProfile.employeeName
        });
      } catch (err) {
        console.warn("Skipping legacy users collection update:", err);
      }

      try {
        await updateDoc(doc(db, 'userAccessControl', empId), {
          canLogin: isActive,
          active: isActive,
          deviceStatus: newStatus
        });
      } catch (err) {
        console.warn("Skipping userAccessControl update:", err);
      }

      await logAudit("USER_STATUS_CHANGE", userProfile.employeeId, userProfile.employeeName, `Changed status of ${user.employeeName} (${empId}) to ${newStatus}`);
      alert(`User status changed to ${newStatus}`);
    } catch (err) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handlePermanentDeleteUser = async (userItem) => {
    const empId = String(userItem.employeeId || userItem.id || '').trim();
    const empName = userItem.employeeName || userItem.name || 'Unknown User';
    const userEmail = String(userItem.email || '').trim().toLowerCase();

    if (empId === '20726' || userItem.role === 'SUPER_ADMIN') {
      alert("SUPER_ADMIN (NAGESHA N) permanent owner account cannot be deleted under any circumstances.");
      return;
    }

    if (!window.confirm(`⛔ PERMANENT DELETE CONFIRMATION:\n\nAre you sure you want to PERMANENTLY DELETE user "${empName}" (ID: ${empId}) from the entire system database?\n\nThis action will completely delete their account profile, access controls, permissions, and registration requests from Firestore. THIS ACTION IS IRREVERSIBLE!`)) return;

    try {
      const sEmpId = String(empId).trim();
      const nEmpId = Number(empId);
      const targetNameStr = String(empName || '').trim().toLowerCase();

      const collectionsToScan = [
        'users',
        'system_users',
        'crewRegistry',
        'userAccessControl',
        'userPermissions',
        'login_requests',
        'loginRequests',
        'registrationRequests',
        'crew_extra_operators',
        'missed_trips'
      ];

      let totalDeletedCount = 0;
      const errorLog = [];

      for (const colName of collectionsToScan) {
        try {
          const snap = await getDocs(collection(db, colName));
          const docsToDelete = snap.docs.filter(d => {
            const data = d.data();
            const dId = String(d.id || '').trim();
            const dEmpId = String(data.employeeId || data.empId || data.id || '').trim();
            const dName = String(data.employeeName || data.name || '').trim().toLowerCase();
            const dEmail = String(data.email || '').trim().toLowerCase();

            const isIdMatch = dId === sEmpId || dId === `user_${sEmpId}` || dId === `extra_op_${sEmpId}`;
            const isEmpIdMatch = dEmpId === sEmpId || (!isNaN(nEmpId) && Number(dEmpId) === nEmpId);
            const isNameMatch = targetNameStr.length > 2 && (dName === targetNameStr || dName.includes(targetNameStr));
            const isEmailMatch = userEmail.length > 3 && (dEmail === userEmail);

            return isIdMatch || isEmpIdMatch || isNameMatch || isEmailMatch;
          });

          for (const docSnap of docsToDelete) {
            try {
              await deleteDoc(doc(db, colName, docSnap.id));
              totalDeletedCount++;
            } catch (err) {
              console.error(`Failed deleting ${colName}/${docSnap.id}:`, err);
              errorLog.push(`${colName}/${docSnap.id}: ${err.message}`);
            }
          }
        } catch (err) {
          console.error(`Failed scanning collection ${colName}:`, err);
          errorLog.push(`Scan ${colName}: ${err.message}`);
        }
      }

      // Direct delete if document ID passed
      if (userItem.id) {
        try { await deleteDoc(doc(db, 'system_users', userItem.id)); } catch (e) {}
        try { await deleteDoc(doc(db, 'users', userItem.id)); } catch (e) {}
        try { await deleteDoc(doc(db, 'crewRegistry', userItem.id)); } catch (e) {}
      }

      await logAudit("PERMANENT_DELETE_USER", userProfile.employeeId, userProfile.employeeName, `Permanently deleted user ${empName} (${empId}) from database.`);
      
      if (errorLog.length > 0) {
        alert(`⚠️ Permanent deletion completed with warnings (${totalDeletedCount} documents deleted).\nLog:\n${errorLog.join("\n")}`);
      } else {
        alert(`✅ User ${empName} (${empId}) has been PERMANENTLY deleted (${totalDeletedCount} document records removed across all collections).`);
      }
    } catch (err) {
      alert("Failed to permanently delete user: " + err.message);
    }
  };

  const handleForceResetPassword = async (user) => {
    try {
      await provisioningService.resetPasswordForce(user.employeeId, userProfile.employeeName);
      alert(`Password reset forced for ${user.employeeName}. They will be prompted to reset on next login.`);
    } catch (err) {
      alert("Failed to reset password: " + err.message);
    }
  };

  const handleOpenRoleModal = (user) => {
    setSelectedUser(user);
    setNewRole(user.role || 'Train Operator');
    setShowRoleModal(true);
  };

  const handleRoleChangeSubmit = async () => {
    if (!selectedUser) return;
    if (selectedUser.employeeId === '20726') {
      return alert("SUPER_ADMIN (NAGESHA N) role cannot be modified.");
    }
    try {
      const empId = String(selectedUser.employeeId);
      const docId = selectedUser.id || selectedUser.uid;

      if (docId) {
        await updateDoc(doc(db, 'system_users', docId), {
          role: newRole,
          updatedAt: new Date().toISOString(),
          updatedBy: userProfile.employeeName
        });
      }
      
      try {
        await updateDoc(doc(db, 'users', empId), {
          role: newRole,
          updatedAt: new Date().toISOString(),
          updatedBy: userProfile.employeeName
        });
      } catch (err) {
        console.warn("Skipping legacy users update:", err);
      }

      try {
        await setDoc(doc(db, 'userPermissions', empId), {
          employeeId: empId,
          permissions: getRoleDefaultPermissions(newRole)
        }, { merge: true });
      } catch (err) {
        console.warn("Skipping userPermissions update:", err);
      }

      try {
        await updateDoc(doc(db, 'userAccessControl', empId), {
          canApproveRequests: ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS', 'CREW_CONTROLLER'].includes(newRole),
          canAccessAdminModules: ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(newRole),
          canManageUsers: ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(newRole)
        });
      } catch (err) {
        console.warn("Skipping userAccessControl update:", err);
      }

      await logAudit("USER_ROLE_CHANGE", userProfile.employeeId, userProfile.employeeName, `Assigned role ${newRole} to ${selectedUser.employeeName} (${empId})`);
      alert(`Role updated successfully to ${newRole}`);
      setShowRoleModal(false);
      setSelectedUser(null);
    } catch (err) {
      alert("Failed to update role: " + err.message);
    }
  };

  const handleOpenPermsModal = async (user) => {
    setSelectedUser(user);
    try {
      const permDoc = await getDoc(doc(db, 'userPermissions', String(user.employeeId)));
      if (permDoc.exists()) {
        setSelectedUserPerms(permDoc.data().permissions || {});
      } else {
        setSelectedUserPerms(getRoleDefaultPermissions(user.role));
      }
      setShowPermsModal(true);
    } catch (err) {
      alert("Failed to load permissions: " + err.message);
    }
  };

  const handleSavePermissions = async () => {
    if (!selectedUser) return;
    try {
      await setDoc(doc(db, 'userPermissions', String(selectedUser.employeeId)), {
        employeeId: String(selectedUser.employeeId),
        permissions: selectedUserPerms,
        custom: true
      }, { merge: true });
      alert("Custom permissions saved successfully.");
      setShowPermsModal(false);
      setSelectedUser(null);
    } catch (err) {
      alert("Failed to save permissions: " + err.message);
    }
  };

  // 4. History Queries
  const handleOpenHistoryModal = async (user, type) => {
    setSelectedUser(user);
    setHistoryType(type);
    setHistoryLoading(true);
    setShowHistoryModal(true);
    setHistoryData([]);

    try {
      let data = [];
      const empIdStr = String(user.employeeId);

      if (type === 'LOGIN') {
        const q = query(
          collection(db, 'login_history'),
          where('employeeId', '==', empIdStr),
          orderBy('timestamp', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        data = snap.docs.map(doc => doc.data());
      } else if (type === 'AUDIT') {
        const q = query(
          collection(db, 'auditLogs'),
          where('employeeId', '==', empIdStr),
          orderBy('timestamp', 'desc'),
          limit(20)
        );
        const snap = await getDocs(q);
        data = snap.docs.map(doc => doc.data());
      } else if (type === 'DEVICE') {
        const q = query(
          collection(db, 'login_history'),
          where('employeeId', '==', empIdStr),
          orderBy('timestamp', 'desc'),
          limit(50)
        );
        const snap = await getDocs(q);
        const allLogins = snap.docs.map(doc => doc.data());
        const uniqueDevices = {};
        allLogins.forEach(log => {
          if (log.device) {
            uniqueDevices[log.device] = {
              device: log.device,
              lastUsed: log.timestamp,
              status: log.status
            };
          }
        });
        data = Object.values(uniqueDevices);
      }

      setHistoryData(data);
    } catch (err) {
      console.error("Failed to query history logs:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Filter Users
  const filteredUsers = users.filter(u => {
    const matchesSearch = 
      String(u.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(u.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(u.designation || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter;
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;

    return matchesSearch && matchesStatus && matchesRole;
  });

  const modulesList = [
    'Dashboard', 'Automated Dispatch Gate', 'Duty Roster', 'Crew Registry', 
    'Shift Exchange', 'Reports Center', 'KM Calculator Suite', 'Rake Registry', 
    'Leave Requests', 'Emergency Relief Module', 'AI ALS Cab Inspection', 'User Control Center'
  ];

  const permLevels = ['NO_ACCESS', 'VIEW', 'REQUEST', 'OWN', 'EDIT', 'FULL'];

  // Pending counts
  const pendingLoginsCount = loginRequests.filter(r => r.requestStatus === 'Pending').length;
  const pendingGoogleCount = registrationRequests.filter(r => r.status === 'PENDING').length;
  const pendingPasswordResetsCount = users.filter(u => u.passwordResetRequired === true).length;
  const pendingRoleRequestsCount = roleRequests.filter(r => r.status === 'PENDING').length;

  const isAuthorized = userProfile?.role === 'SUPER_ADMIN' || 
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
      
      {/* Header Banner */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-amber-500" />
          <div>
            <h2 className="text-lg font-black tracking-wider uppercase">User Access Control Center</h2>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-widest">Enforce credentials, view device history, sync roles, audit system</p>
          </div>
        </div>
      </div>

      {/* ── SECURITY MAINTENANCE PANEL ── */}
      <div className="bg-red-950/20 border-2 border-red-500/30 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-black text-red-400 uppercase tracking-wider">Global Security Operations</h4>
            <p className="text-[9px] text-slate-400 mt-0.5 uppercase tracking-widest leading-relaxed">
              Force a bulk password reset email to all system users and immediately clear active sessions to force fresh logins.
            </p>
          </div>
        </div>
        <button
          onClick={handleBulkReset}
          className="bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-400 font-black px-4 py-2 rounded-lg text-[10px] uppercase tracking-widest transition-all"
        >
          Bulk Password Reset & Force Logout
        </button>
      </div>

      {/* ── REAL-TIME STATS BANNER ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden group">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Pending Logins</span>
          <div className="text-2xl font-black text-amber-500 mt-1">{pendingLoginsCount}</div>
          <span className="text-[9px] text-slate-400 uppercase mt-1">Live Employee Requests</span>
          {pendingLoginsCount > 0 && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-amber-500 animate-ping"></span>}
        </div>
        
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Pending Google Link</span>
          <div className="text-2xl font-black text-cyan-400 mt-1">{pendingGoogleCount}</div>
          <span className="text-[9px] text-slate-400 uppercase mt-1">External Registrations</span>
          {pendingGoogleCount > 0 && <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-cyan-400 animate-ping"></span>}
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Forced Password Resets</span>
          <div className="text-2xl font-black text-rose-500 mt-1">{pendingPasswordResetsCount}</div>
          <span className="text-[9px] text-slate-400 uppercase mt-1">Requires Credentials Update</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col justify-between relative overflow-hidden">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Role Modification Requests</span>
          <div className="text-2xl font-black text-indigo-400 mt-1">{pendingRoleRequestsCount}</div>
          <span className="text-[9px] text-slate-400 uppercase mt-1">Requires Authorization Change</span>
        </div>
      </div>

      {/* ── REAL-TIME PENDING LOGIN REQUESTS LIST ── */}
      {loginRequests.filter(r => r.requestStatus === 'Pending').length > 0 && (
        <div className="bg-slate-900 border-2 border-amber-500/40 rounded-xl p-5 shadow-2xl space-y-4">
          <h3 className="text-xs font-black text-amber-400 flex items-center gap-2 uppercase tracking-widest">
            <AlertTriangle className="h-4 w-4 animate-pulse text-amber-500" /> Pending Real-Time Login Approvals
          </h3>
          <div className="overflow-x-auto bg-slate-955 border border-slate-850 rounded-lg">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-900 text-slate-400 uppercase tracking-widest text-[9px]">
                <tr>
                  <th className="p-3">Employee ID & Name</th>
                  <th className="p-3">Designation & Depot</th>
                  <th className="p-3">Method / Requested Role</th>
                  <th className="p-3">Request Time</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {loginRequests.filter(r => r.requestStatus === 'Pending').map(req => (
                  <tr key={req.requestId} className="hover:bg-slate-900/40">
                    <td className="p-3 font-bold text-slate-200">
                      <div>{req.employeeName}</div>
                      <div className="text-[9px] text-slate-500 font-bold font-mono">ID: {req.employeeId} | {req.email}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-slate-300 font-semibold">{req.designation}</div>
                      <div className="text-[10px] text-slate-500 uppercase">{req.depot}</div>
                    </td>
                    <td className="p-3">
                      <span className="bg-cyan-955 border border-cyan-800 text-cyan-400 font-bold px-1.5 py-0.5 rounded text-[10px] mr-1.5 uppercase">{req.loginMethod}</span>
                      <span className="bg-amber-955 border border-amber-800 text-amber-400 font-bold px-1.5 py-0.5 rounded text-[10px] uppercase">{req.requestedRole}</span>
                    </td>
                    <td className="p-3 text-[10px] text-slate-500">
                      {req.requestDate} {req.requestTime}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button 
                        onClick={() => handleApproveRequest(req)}
                        className="bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/50 text-emerald-405 font-black px-2.5 py-1 rounded text-[10px] uppercase transition-all"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleOpenRejectModal(req)}
                        className="bg-rose-955/60 hover:bg-rose-900/60 border border-rose-900/50 text-rose-455 font-black px-2.5 py-1 rounded text-[10px] uppercase transition-all"
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

      {/* ── REAL-TIME PENDING GOOGLE LINK REQUESTS ── */}
      {registrationRequests.filter(r => r.status === 'PENDING').length > 0 && (
        <div className="bg-slate-900 border-2 border-cyan-500/40 rounded-xl p-5 shadow-2xl space-y-4">
          <h3 className="text-xs font-black text-cyan-400 flex items-center gap-2 uppercase tracking-widest">
            <AlertTriangle className="h-4 w-4 animate-pulse text-cyan-500" /> Pending Google Link Requests
          </h3>
          <div className="overflow-x-auto bg-slate-950 border border-slate-850 rounded-lg">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-slate-900 text-slate-400 uppercase tracking-widest text-[9px]">
                <tr>
                  <th className="p-3">Google Account</th>
                  <th className="p-3">Google Email</th>
                  <th className="p-3">Request Time</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {registrationRequests.filter(r => r.status === 'PENDING').map(req => (
                  <tr key={req.id} className="hover:bg-slate-900/40">
                    <td className="p-3 font-bold text-slate-200">{req.name}</td>
                    <td className="p-3 text-slate-400 font-mono">{req.email}</td>
                    <td className="p-3 text-[10px] text-slate-500">
                      {req.requestedAt?.toDate ? req.requestedAt.toDate().toLocaleString() : 'Just now'}
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button 
                        onClick={() => {
                          const registryMatch = registry.find(r => r.email === req.email);
                          if (registryMatch) {
                            handleApproveRequest({
                              requestId: req.id,
                              employeeId: registryMatch.employeeId,
                              employeeName: registryMatch.employeeName || registryMatch.name,
                              designation: registryMatch.designation,
                              depot: registryMatch.depot,
                              email: req.email,
                              requestedRole: registryMatch.role || 'Train Operator',
                              loginMethod: 'Google',
                              firebaseUid: ''
                            });
                          } else {
                            alert("This Google account is not mapped in Crew Registry yet. Assigning role: VIEWER.");
                            handleApproveRequest({
                              requestId: req.id,
                              employeeId: `G-${req.id.substring(0, 5)}`,
                              employeeName: req.name,
                              designation: 'Station Controller / Train Operator',
                              depot: 'Peenya Depot (PYID)',
                              email: req.email,
                              requestedRole: 'VIEWER',
                              loginMethod: 'Google',
                              firebaseUid: ''
                            });
                          }
                        }}
                        className="bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-800/50 text-cyan-400 font-black px-2.5 py-1 rounded text-[10px] uppercase transition-all"
                      >
                        Approve & Link
                      </button>
                      <button 
                        onClick={() => handleOpenRejectModal({
                          requestId: req.id,
                          employeeId: 'Google Link',
                          employeeName: req.name,
                          email: req.email
                        })}
                        className="bg-rose-955/60 hover:bg-rose-900/60 border border-rose-900/50 text-rose-455 font-black px-2.5 py-1 rounded text-[10px] uppercase transition-all"
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

      {/* ── ENTERPRISE DIRECTORY & SEARCH BAR ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        
        {/* Search Ribbon */}
        <div className="p-4 bg-slate-950 border-b border-slate-850 flex flex-col md:flex-row gap-4 items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-350">Enterprise Registered Users</span>
          
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
              <input id="usermanagement-i1" name="usermanagement-i1" 
                type="text" 
                placeholder="Search Emp ID / Name / Designation..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* Filter Status */}
            <select id="usermanagement-i2" name="usermanagement-i2" 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Status: All</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>

            {/* Filter Role */}
            <select id="usermanagement-i3" name="usermanagement-i3" 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">Role: All</option>
              <option value="SUPER_ADMIN">SUPER ADMIN</option>
              <option value="ADMIN_Station_Superintendent">STATION SUPERINTENDENT</option>
              <option value="CREW_CONTROLLER">CREW CONTROLLER</option>
              <option value="TRAIN_OPERATOR">TRAIN OPERATOR</option>
              <option value="STATION_CONTROLLER">STATION CONTROLLER</option>
              <option value="VIEWER">VIEWER</option>
            </select>
          </div>
        </div>

        {/* Directory Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-950 text-slate-500 uppercase tracking-widest text-[9px] border-b border-slate-850">
              <tr>
                <th className="p-4">Employee ID & Name</th>
                <th className="p-4">Designation & Depot</th>
                <th className="p-4">Department & Role</th>
                <th className="p-4">Status & Crew</th>
                <th className="p-4">Credentials & Security</th>
                <th className="p-4">Last Login</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-805/60">
              {filteredUsers.map(u => (
                <tr key={u.id} className={`hover:bg-slate-850/20 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="p-4">
                    <div className="font-bold text-slate-200">{u.employeeName}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-mono">ID: {u.employeeId} | {u.email}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-300 font-semibold">{u.designation}</div>
                    <div className="text-[9px] text-slate-500 uppercase">{u.depot}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-300 font-semibold">{u.department || 'Operations'}</div>
                    <div className="mt-0.5">
                      <span className="bg-slate-950 border border-slate-800 text-amber-400 font-black px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider">
                        {u.role}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-emerald-450' : u.status === 'SUSPENDED' ? 'bg-orange-500' : 'bg-rose-500'}`}></span>
                      <span className={`font-bold text-[10px] ${u.status === 'ACTIVE' ? 'text-emerald-450' : u.status === 'SUSPENDED' ? 'text-orange-400' : 'text-rose-455'}`}>{u.status || 'INACTIVE'}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Operational: <span className={u.operationalCrew === 'YES' ? 'text-emerald-400 font-bold' : 'text-slate-400'}>{u.operationalCrew || 'NO'}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-0.5 text-[9px] font-bold text-slate-450 uppercase">
                      <div>Google: <span className={u.email?.includes('gmail') ? 'text-cyan-405' : 'text-slate-500'}>{u.email?.includes('gmail') ? 'LINKED' : 'UNLINKED'}</span></div>
                      <div>Password Reset: <span className={u.passwordResetRequired ? 'text-amber-500 animate-pulse' : 'text-emerald-500'}>{u.passwordResetRequired ? 'FORCED' : 'COMPLETED'}</span></div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-400">{u.lastLogin?.toDate ? u.lastLogin.toDate().toLocaleString() : u.lastLogin || '--'}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 uppercase">Device: {u.lastLoginDevice ? u.lastLoginDevice.substring(0, 15) + '...' : 'Unknown'}</div>
                  </td>
                  <td className="p-4 text-right space-x-1.5">
                    {u.status === 'ACTIVE' ? (
                      <button 
                        onClick={() => handleSetUserStatus(u, 'SUSPENDED')}
                        className="bg-amber-950/30 hover:bg-amber-900/30 border border-amber-900/30 text-amber-500 font-bold p-1 rounded transition-colors text-[10px] uppercase"
                        title="Suspend user access"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleSetUserStatus(u, 'ACTIVE')}
                        className="bg-emerald-955/35 hover:bg-emerald-900/30 border border-emerald-900/30 text-emerald-400 font-bold p-1 rounded transition-colors text-[10px] uppercase"
                        title="Activate user access"
                      >
                        Activate
                      </button>
                    )}
                    {u.status !== 'INACTIVE' && (
                      <button 
                        onClick={() => handleSetUserStatus(u, 'INACTIVE')}
                        className="bg-rose-955/30 hover:bg-rose-900/30 border border-rose-900/30 text-rose-455 font-bold p-1 rounded transition-colors text-[10px] uppercase"
                        title="Deactivate user access"
                      >
                        Deactivate
                      </button>
                    )}

                    <button 
                      onClick={() => handleOpenRoleModal(u)}
                      className="bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold p-1 rounded text-[10px] uppercase"
                      title="Assign User Role"
                    >
                      Role
                    </button>
                    <button 
                      onClick={() => handleOpenPermsModal(u)}
                      className="bg-slate-800 hover:bg-slate-750 text-cyan-400 font-bold p-1 rounded text-[10px] uppercase"
                      title="Edit Custom Permissions Matrix"
                    >
                      Perms
                    </button>
                    
                    <button 
                      onClick={() => handleForceResetPassword(u)}
                      className="bg-slate-800 hover:bg-slate-750 text-amber-400 font-bold p-1 rounded text-[10px] uppercase"
                      title="Force credential reset on next login"
                    >
                      Reset Pwd
                    </button>

                    <button 
                      onClick={() => handlePermanentDeleteUser(u)}
                      className="bg-rose-955/60 hover:bg-rose-900/60 border border-rose-900/50 text-rose-455 font-extrabold p-1 rounded text-[10px] uppercase"
                      title="Permanently Delete User Account from Database"
                    >
                      Delete
                    </button>

                    <div className="inline-block relative group/more">
                      <button className="bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-450 hover:text-white p-1 rounded text-[10px] font-black uppercase">
                        Logs
                      </button>
                      <div className="absolute right-0 mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl py-1 w-32 hidden group-hover/more:block z-20 text-left font-mono">
                        <button onClick={() => handleOpenHistoryModal(u, 'LOGIN')} className="w-full px-3 py-1.5 hover:bg-slate-900 text-slate-300 text-[10px] text-left font-bold uppercase">Login History</button>
                        <button onClick={() => handleOpenHistoryModal(u, 'AUDIT')} className="w-full px-3 py-1.5 hover:bg-slate-900 text-slate-300 text-[10px] text-left font-bold uppercase">Audit Trail</button>
                        <button onClick={() => handleOpenHistoryModal(u, 'DEVICE')} className="w-full px-3 py-1.5 hover:bg-slate-900 text-slate-300 text-[10px] text-left font-bold uppercase">Device Logs</button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── ROLE SELECTION MODAL ── */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex justify-center items-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-amber-500 border-b border-slate-850 pb-2.5">
              <Shield size={20} />
              <h3 className="text-xs font-black uppercase tracking-wider">Change User Role</h3>
            </div>
            
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">
              User: <span className="text-white font-bold">{selectedUser.employeeName}</span> ({selectedUser.employeeId})
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5" htmlFor="usermanagement-l1">Select Role</label>
              <select id="usermanagement-i4" name="usermanagement-i4" 
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
              >
                <option value="SUPER_ADMIN">SUPER ADMIN</option>
                <option value="ADMIN_Station_Superintendent">STATION SUPERINTENDENT (ADMIN)</option>
                <option value="CREW_CONTROLLER">CREW CONTROLLER</option>
                <option value="TRAIN_OPERATOR">TRAIN OPERATOR</option>
                <option value="STATION_CONTROLLER">STATION CONTROLLER</option>
                <option value="VIEWER">SYSTEM VIEWER</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 text-[9px] font-black tracking-widest pt-2 border-t border-slate-850">
              <button 
                onClick={() => { setShowRoleModal(false); setSelectedUser(null); }}
                className="bg-slate-800 hover:bg-slate-750 text-white px-3 py-2 rounded-lg uppercase"
              >
                Cancel
              </button>
              <button 
                onClick={handleRoleChangeSubmit}
                className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-3 py-2 rounded-lg uppercase"
              >
                Apply Role Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REJECTION REASON MODAL ── */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-500 border-b border-slate-850 pb-2.5">
              <ShieldAlert size={20} />
              <h3 className="text-xs font-black uppercase tracking-wider font-mono">Reject Login request</h3>
            </div>

            <p className="text-[11px] text-slate-450 leading-relaxed font-mono">
              Provide reason for rejecting the request from <span className="text-slate-200 font-bold">{selectedRequest.employeeName}</span> ({selectedRequest.employeeId}):
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono" htmlFor="usermanagement-l2">Select Rejection Reason</label>
                <select id="usermanagement-i5" name="usermanagement-i5" 
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-805 rounded-lg p-2 text-xs text-slate-250 focus:outline-none font-mono"
                >
                  <option value="Not Operational Crew">Not Operational Crew</option>
                  <option value="Wrong Employee">Wrong Employee</option>
                  <option value="Transferred">Transferred</option>
                  <option value="Retired">Retired</option>
                  <option value="Duplicate Request">Duplicate Request</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              {rejectionReason === 'Others' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 font-mono" htmlFor="usermanagement-l3">Custom Reason</label>
                  <input id="usermanagement-i6" name="usermanagement-i6"
                    type="text"
                    required
                    placeholder="Enter custom reason..."
                    value={customRejectionReason}
                    onChange={(e) => setCustomRejectionReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 text-[9px] font-black tracking-widest pt-2 border-t border-slate-850 font-mono">
              <button 
                onClick={() => { setShowRejectModal(false); setSelectedRequest(null); }}
                className="bg-slate-800 hover:bg-slate-750 text-white px-3 py-2 rounded uppercase"
              >
                Cancel
              </button>
              <button 
                onClick={handleRejectSubmit}
                className="bg-rose-600 hover:bg-rose-500 text-slate-950 px-3 py-2 rounded uppercase"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CUSTOM PERMISSIONS MATRIX MODAL ── */}
      {showPermsModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex justify-center items-center p-4">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-cyan-400">
                <ShieldCheck size={22} />
                <h3 className="text-xs font-black uppercase tracking-wider">Custom Permissions Authorization Matrix</h3>
              </div>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                User: <span className="text-white font-black">{selectedUser.employeeName}</span> ({selectedUser.role})
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {modulesList.map(modName => {
                const viewVal = selectedUserPerms[modName]?.View || false;
                const editVal = selectedUserPerms[modName]?.Edit || false;
                const createVal = selectedUserPerms[modName]?.Create || false;
                const approveVal = selectedUserPerms[modName]?.Approve || false;
                const deleteVal = selectedUserPerms[modName]?.Delete || false;

                return (
                  <div key={modName} className="bg-slate-955 border border-slate-850 p-4 rounded-xl space-y-3 flex flex-col justify-between">
                    <span className="text-xs font-black text-slate-200 uppercase tracking-wide block">{modName} Module</span>
                    
                    <div className="flex flex-wrap gap-4 pt-1">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-350 cursor-pointer" htmlFor="usermanagement-l4">
                        <input id="usermanagement-i7" name="usermanagement-i7" 
                          type="checkbox" 
                          checked={viewVal}
                          onChange={(e) => {
                            setSelectedUserPerms(prev => ({
                              ...prev,
                              [modName]: {
                                ...prev[modName],
                                View: e.target.checked
                              }
                            }));
                          }}
                          className="rounded border-slate-750 bg-slate-900 text-cyan-500 focus:ring-cyan-500 h-4.5 w-4.5"
                        />
                        View
                      </label>

                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-350 cursor-pointer" htmlFor="usermanagement-l5">
                        <input id="usermanagement-i8" name="usermanagement-i8" 
                          type="checkbox" 
                          checked={editVal}
                          onChange={(e) => {
                            setSelectedUserPerms(prev => ({
                              ...prev,
                              [modName]: {
                                ...prev[modName],
                                Edit: e.target.checked
                              }
                            }));
                          }}
                          className="rounded border-slate-750 bg-slate-900 text-cyan-500 focus:ring-cyan-500 h-4.5 w-4.5"
                        />
                        Edit
                      </label>

                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-350 cursor-pointer" htmlFor="usermanagement-l6">
                        <input id="usermanagement-i9" name="usermanagement-i9" 
                          type="checkbox" 
                          checked={createVal}
                          onChange={(e) => {
                            setSelectedUserPerms(prev => ({
                              ...prev,
                              [modName]: {
                                ...prev[modName],
                                Create: e.target.checked
                              }
                            }));
                          }}
                          className="rounded border-slate-750 bg-slate-900 text-cyan-500 focus:ring-cyan-500 h-4.5 w-4.5"
                        />
                        Create
                      </label>

                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-350 cursor-pointer" htmlFor="usermanagement-l7">
                        <input id="usermanagement-i10" name="usermanagement-i10" 
                          type="checkbox" 
                          checked={approveVal}
                          onChange={(e) => {
                            setSelectedUserPerms(prev => ({
                              ...prev,
                              [modName]: {
                                ...prev[modName],
                                Approve: e.target.checked
                              }
                            }));
                          }}
                          className="rounded border-slate-750 bg-slate-900 text-cyan-500 focus:ring-cyan-500 h-4.5 w-4.5"
                        />
                        Approve
                      </label>

                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-350 cursor-pointer" htmlFor="usermanagement-l8">
                        <input id="usermanagement-i11" name="usermanagement-i11" 
                          type="checkbox" 
                          checked={deleteVal}
                          onChange={(e) => {
                            setSelectedUserPerms(prev => ({
                              ...prev,
                              [modName]: {
                                ...prev[modName],
                                Delete: e.target.checked
                              }
                            }));
                          }}
                          className="rounded border-slate-750 bg-slate-900 text-cyan-500 focus:ring-cyan-500 h-4.5 w-4.5"
                        />
                        Delete
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 text-[9px] font-black tracking-widest pt-4 border-t border-slate-800">
              <button 
                onClick={() => { setShowPermsModal(false); setSelectedUser(null); }}
                className="bg-slate-850 hover:bg-slate-800 text-white px-3 py-2 rounded-lg uppercase"
              >
                Cancel
              </button>
              <button 
                onClick={handleSavePermissions}
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 px-3 py-2 rounded-lg uppercase"
              >
                Save Matrix Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOGS & AUDIT TRAIL HISTORY MODAL ── */}
      {showHistoryModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400">
                <Clock size={20} />
                <h3 className="text-xs font-black uppercase tracking-wider font-mono">
                  {historyType === 'LOGIN' ? 'User Login Session History' : historyType === 'AUDIT' ? 'User Security Audit Trail' : 'Registered Device History'}
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider font-mono">
                Employee: <span className="text-white font-bold">{selectedUser.employeeName}</span> ({selectedUser.employeeId})
              </span>
            </div>

            {historyLoading ? (
              <div className="py-20 text-center text-slate-500 font-bold font-mono">Loading dynamic log stream...</div>
            ) : historyData.length === 0 ? (
              <div className="py-20 text-center text-slate-500 font-bold font-mono">No log entries found for this operator.</div>
            ) : (
              <div className="overflow-x-auto bg-slate-950 border border-slate-850 rounded-lg">
                {historyType === 'LOGIN' ? (
                  <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                    <thead className="bg-slate-900 text-slate-500 uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="p-3">Time & Date</th>
                        <th className="p-3">Login Status</th>
                        <th className="p-3">Device Agent</th>
                        <th className="p-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {historyData.map((log, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="p-3 font-semibold text-slate-300">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : log.timestamp || 'unknown'}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${log.status === 'SUCCESS' ? 'bg-emerald-950/40 text-emerald-450 border border-emerald-900/30' : 'bg-rose-955/40 text-rose-455 border border-rose-900/30'}`}>
                              {log.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400 text-[10px] truncate max-w-xs" title={log.device}>{log.device || '--'}</td>
                          <td className="p-3 text-slate-455 italic">{log.reason || 'None'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : historyType === 'AUDIT' ? (
                  <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                    <thead className="bg-slate-900 text-slate-500 uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="p-3">Time & Date</th>
                        <th className="p-3">Action Type</th>
                        <th className="p-3">Details / Change Log</th>
                        <th className="p-3">Changed By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {historyData.map((log, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="p-3 font-semibold text-slate-300">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : log.timestamp || 'unknown'}
                          </td>
                          <td className="p-3">
                            <span className="bg-indigo-955 border border-indigo-850 text-indigo-400 font-bold px-1.5 py-0.5 rounded text-[10px] uppercase">
                              {log.action}
                            </span>
                          </td>
                          <td className="p-3 text-slate-400 text-[10px] truncate max-w-sm" title={log.details}>{log.details || '--'}</td>
                          <td className="p-3 text-slate-350 font-bold">{log.changedBy || log.performedByName || 'System'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-left text-xs whitespace-nowrap font-mono">
                    <thead className="bg-slate-900 text-slate-500 uppercase tracking-widest text-[9px]">
                      <tr>
                        <th className="p-3">Registered Browser Agent</th>
                        <th className="p-3">Telemetry Verification Status</th>
                        <th className="p-3">Last Verified Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {historyData.map((log, i) => (
                        <tr key={i} className="hover:bg-slate-900/40">
                          <td className="p-3 font-semibold text-slate-300 flex items-center gap-2">
                            <Laptop size={14} className="text-slate-500" />
                            <span className="truncate max-w-md" title={log.device}>{log.device}</span>
                          </td>
                          <td className="p-3">
                            <span className="bg-emerald-955 border border-emerald-900 text-emerald-450 text-[10px] px-1.5 py-0.5 rounded font-black uppercase">Verified Secure</span>
                          </td>
                          <td className="p-3 text-slate-500 text-[10px]">
                            {log.lastUsed?.toDate ? log.lastUsed.toDate().toLocaleString() : log.lastUsed || 'unknown'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-slate-850">
              <button 
                onClick={() => { setShowHistoryModal(false); setSelectedUser(null); }}
                className="bg-slate-800 hover:bg-slate-750 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider font-mono"
              >
                Close Logs Window
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

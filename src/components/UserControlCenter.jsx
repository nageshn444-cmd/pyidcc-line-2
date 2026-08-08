import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { useOperationalEngine } from '../context/OperationalEngine';
import { getRoleDefaultPermissions } from '../utils/dbSeeder';
import { 
  Search, Shield, ShieldAlert, ShieldCheck, User, Users, Lock, Unlock, 
  RefreshCw, Power, Smartphone, Laptop, Globe, Ban, CheckCircle, 
  AlertTriangle, Filter, List, Activity, Settings, UserMinus, Trash2
} from 'lucide-react';

const MODULE_PERMISSIONS_MAP = {
  'Dashboard': ['View', 'Edit', 'Admin Access'],
  'Crew Registry': ['View', 'Create', 'Edit', 'Delete', 'Approve'],
  'Duty Roster': ['View', 'Create', 'Edit', 'Delete', 'Approve'],
  'Shift Exchange': ['View', 'Create Request', 'Approve Request', 'Reject Request', 'Full Control'],
  'Duty Swap': ['View', 'Create Request', 'Approve Request', 'Reject Request', 'Full Control'],
  'Automated Dispatch Gate': ['View', 'Dispatch', 'Override Dispatch', 'Full Control'],
  'Live Relief Tracking': ['View', 'Update', 'Approve'],
  'Emergency Relief Module': ['View', 'Generate Relief', 'Approve Relief', 'Full Control'],
  'Reports Center': ['View', 'Export Excel', 'Export CSV', 'Export PDF', 'Print Reports'],
  'User Control Center': ['View', 'Manage Users', 'Assign Permissions', 'Assign Roles', 'Delete Users'],
  'KM Calculator Suite': ['View', 'Calculate', 'Export', 'Full Control'],
  'Rake Registry': ['View', 'Register Rake', 'Edit', 'Full Control'],
  'Leave Requests': ['View', 'Submit Request', 'Approve Request', 'Full Control'],
  'AI ALS Cab Inspection': ['View', 'Generate Plan', 'Optimize', 'Full Control']
};

const DEPLOYMENT_DEPOTS = ['Peenya Industry Depot', 'Baiyappanahalli Depot', 'Kengeri Depot', 'Silk Institute Depot'];

export default function UserControlCenter() {
  const { userProfile, logAudit } = useAuth();
  const opEngine = useOperationalEngine();
  
  // Selection & Search States
  const [employees, setEmployees] = useState([]);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [selectedEmpId, setSelectedEmpId] = useState(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDesignation, setFilterDesignation] = useState('');
  const [filterDepot, setFilterDepot] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Selected Employee Data (synced in real-time)
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedAccess, setSelectedAccess] = useState(null);
  const [selectedPermissions, setSelectedPermissions] = useState(null);
  const [selectedAuditLogs, setSelectedAuditLogs] = useState([]);

  const [selectedEmpIds, setSelectedEmpIds] = useState([]);

  // Load master employee registry and sync employee lists
  useEffect(() => {
    const q = collection(db, 'users');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const empList = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      setEmployees(empList);
      
      // Auto-select first employee if none selected
      if (empList.length > 0 && !selectedEmpId) {
        setSelectedEmpId(empList[0].employeeId);
        setSelectedEmpIds([empList[0].employeeId]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Filter Logic
  useEffect(() => {
    let result = [...employees];

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(emp => 
        String(emp.employeeId).includes(q) || 
        String(emp.employeeName).toLowerCase().includes(q)
      );
    }

    if (filterDesignation) {
      result = result.filter(emp => emp.designation === filterDesignation);
    }

    if (filterDepot) {
      result = result.filter(emp => emp.depot === filterDepot);
    }

    if (filterRole) {
      result = result.filter(emp => emp.role === filterRole);
    }

    if (filterStatus) {
      result = result.filter(emp => emp.status === filterStatus);
    }

    // Sort selected crew first, then by ID (Permanent owner 20726 at the top is helpful)
    result.sort((a, b) => {
      const aSelected = selectedEmpIds.includes(a.employeeId);
      const bSelected = selectedEmpIds.includes(b.employeeId);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      if (a.employeeId === '20726') return -1;
      if (b.employeeId === '20726') return 1;
      return String(a.employeeId).localeCompare(String(b.employeeId), undefined, { numeric: true });
    });

    setFilteredEmployees(result);
  }, [employees, searchQuery, filterDesignation, filterDepot, filterRole, filterStatus, selectedEmpIds]);

  const handleCheckboxToggle = (e, employeeId) => {
    e.stopPropagation();
    if (selectedEmpIds.includes(employeeId)) {
      const updated = selectedEmpIds.filter(id => id !== employeeId);
      setSelectedEmpIds(updated);
      if (updated.length > 0) {
        setSelectedEmpId(updated[updated.length - 1]);
      } else {
        setSelectedEmpId(null);
      }
    } else {
      const updated = [...selectedEmpIds, employeeId];
      setSelectedEmpIds(updated);
      setSelectedEmpId(employeeId);
    }
  };

  const handleSelectAllFiltered = () => {
    if (selectedEmpIds.length === filteredEmployees.length) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(filteredEmployees.map(emp => emp.employeeId));
    }
  };

  const handleBulkRoleChange = async (newRole) => {
    if (selectedEmpIds.length === 0) return;
    
    const containsOwner = selectedEmpIds.includes('20726');
    const idsToUpdate = containsOwner ? selectedEmpIds.filter(id => id !== '20726') : selectedEmpIds;
    
    if (containsOwner && idsToUpdate.length === 0) {
      alert("SUPER_ADMIN (NAGESHA N) role is permanent and cannot be downgraded.");
      return;
    }

    if (!window.confirm(`Are you sure you want to change the role of ${idsToUpdate.length} selected operator(s) to ${newRole}? Permissions will reset to the template defaults.`)) return;

    try {
      const templatePerms = getRoleDefaultPermissions(newRole);
      const batch = writeBatch(db);
      
      for (const empId of idsToUpdate) {
        const emp = employees.find(e => e.employeeId === empId);
        const oldRole = emp?.role || 'Unknown';

        batch.update(doc(db, 'users', empId), { role: newRole });
        batch.update(doc(db, 'userPermissions', empId), { permissions: templatePerms });

        const isManagement = ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS', 'CREW_CONTROLLER'].includes(newRole);
        const isSuper = newRole === 'SUPER_ADMIN';
        const isSS = ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(newRole);
        
        batch.update(doc(db, 'userAccessControl', empId), {
          canApproveRequests: isManagement,
          canAccessAdminModules: isSS,
          canManageUsers: isSuper
        });

        await addDoc(collection(db, 'auditLogs'), {
          employeeId: empId,
          employeeName: emp?.employeeName || 'Unknown',
          action: 'BULK_ROLE_CHANGE',
          module: 'Role Management',
          oldValue: oldRole,
          newValue: newRole,
          changedBy: userProfile?.employeeName || 'System Admin',
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();

      for (const empId of idsToUpdate) {
        let systemUserDocId = null;
        const qSystemStr = query(collection(db, 'system_users'), where('employeeId', '==', String(empId)));
        const snapSystemStr = await getDocs(qSystemStr);
        if (!snapSystemStr.empty) {
          systemUserDocId = snapSystemStr.docs[0].id;
        } else {
          const qSystemNum = query(collection(db, 'system_users'), where('employeeId', '==', Number(empId)));
          const snapSystemNum = await getDocs(qSystemNum);
          if (!snapSystemNum.empty) {
            systemUserDocId = snapSystemNum.docs[0].id;
          }
        }
        if (systemUserDocId) {
          await updateDoc(doc(db, 'system_users', systemUserDocId), { role: newRole });
        }
      }

      await logAudit("UCC_BULK_CHANGE", userProfile.employeeId, userProfile.employeeName, 
        `Updated role in bulk for ${idsToUpdate.length} operators to ${newRole}`);

      alert(`Successfully changed role to ${newRole} for ${idsToUpdate.length} operator(s).`);
      setSelectedEmpIds([]);
    } catch (err) {
      alert("Failed to update roles in bulk: " + err.message);
    }
  };

  const handleBulkApplyTemplate = async (templateRole) => {
    if (selectedEmpIds.length === 0) return;
    
    const containsOwner = selectedEmpIds.includes('20726');
    const idsToUpdate = containsOwner ? selectedEmpIds.filter(id => id !== '20726') : selectedEmpIds;

    if (containsOwner && idsToUpdate.length === 0) {
      alert("SUPER_ADMIN (NAGESHA N) permissions are permanent and cannot be modified.");
      return;
    }

    if (!window.confirm(`Apply default template for "${templateRole}" to ${idsToUpdate.length} selected operator(s)? This will reset all current module toggles.`)) return;

    try {
      const templatePerms = getRoleDefaultPermissions(templateRole);
      const batch = writeBatch(db);

      for (const empId of idsToUpdate) {
        const emp = employees.find(e => e.employeeId === empId);
        batch.update(doc(db, 'userPermissions', empId), { permissions: templatePerms });

        await addDoc(collection(db, 'auditLogs'), {
          employeeId: empId,
          employeeName: emp?.employeeName || 'Unknown',
          action: 'BULK_APPLY_TEMPLATE',
          module: 'Permission Templates',
          oldValue: emp?.role || 'Unknown',
          newValue: templateRole,
          changedBy: userProfile?.employeeName || 'System Admin',
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();

      alert(`Applied "${templateRole}" template successfully to ${idsToUpdate.length} operator(s).`);
      setSelectedEmpIds([]);
    } catch (err) {
      alert("Failed to apply bulk template: " + err.message);
    }
  };

  // Real-time listener for the selected employee's documents
  useEffect(() => {
    if (!selectedEmpId) return;

    // A. Sync user document
    const unsubUser = onSnapshot(doc(db, 'users', selectedEmpId), (snap) => {
      if (snap.exists()) setSelectedUser(snap.data());
    });

    // B. Sync userAccessControl document
    const unsubAccess = onSnapshot(doc(db, 'userAccessControl', selectedEmpId), (snap) => {
      if (snap.exists()) setSelectedAccess(snap.data());
    });

    // C. Sync userPermissions document
    const unsubPerms = onSnapshot(doc(db, 'userPermissions', selectedEmpId), (snap) => {
      if (snap.exists()) setSelectedPermissions(snap.data().permissions || {});
    });

    // D. Sync auditLogs for this employee
    const auditQuery = query(
      collection(db, 'auditLogs'),
      where('employeeId', '==', selectedEmpId),
      orderBy('timestamp', 'desc')
    );
    const unsubAudit = onSnapshot(auditQuery, (snap) => {
      setSelectedAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Audit logs ordered retrieval failed (requires index). Falling back to client-side sort.", err);
      // Fallback query without orderBy to avoid index requirement crash
      const fallbackQuery = query(collection(db, 'auditLogs'), where('employeeId', '==', selectedEmpId));
      onSnapshot(fallbackQuery, (fallbackSnap) => {
        const sorted = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        sorted.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
        setSelectedAuditLogs(sorted);
      });
    });

    return () => {
      unsubUser();
      unsubAccess();
      unsubPerms();
      unsubAudit();
    };
  }, [selectedEmpId]);

  // Helper to log changes to the audit collection
  const writeUccAuditLog = async (action, moduleName, oldValue, newValue) => {
    if (!selectedUser) return;
    try {
      await addDoc(collection(db, 'auditLogs'), {
        employeeId: selectedUser.employeeId,
        employeeName: selectedUser.employeeName,
        action,
        module: moduleName,
        oldValue: String(oldValue),
        newValue: String(newValue),
        changedBy: userProfile?.employeeName || 'System Admin',
        timestamp: serverTimestamp()
      });
      await logAudit("UCC_CHANGE", userProfile.employeeId, userProfile.employeeName, 
        `Updated ${moduleName} for ${selectedUser.employeeName} (${selectedUser.employeeId}): ${action} from "${oldValue}" to "${newValue}"`);
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }
  };

  // Check if selected employee is NAGESHA N (20726)
  const isSelectedOwner = selectedEmpId === '20726';

  // Toggle module permissions
  const handlePermissionToggle = async (moduleName, permissionType) => {
    if (isSelectedOwner) {
      alert("SUPER_ADMIN (NAGESHA N) permissions are permanent and cannot be modified.");
      return;
    }
    if (!selectedPermissions) return;

    const currentVal = !!selectedPermissions[moduleName]?.[permissionType];
    const newVal = !currentVal;

    const updatedPermissions = {
      ...selectedPermissions,
      [moduleName]: {
        ...selectedPermissions[moduleName],
        [permissionType]: newVal
      }
    };

    try {
      await updateDoc(doc(db, 'userPermissions', selectedEmpId), {
        permissions: updatedPermissions
      });
      await writeUccAuditLog(
        `TOGGLE_PERMISSION`,
        moduleName,
        `${permissionType}:${currentVal}`,
        `${permissionType}:${newVal}`
      );
    } catch (err) {
      alert("Failed to update permission: " + err.message);
    }
  };

  // Role changes update permissions automatically
  const handleRoleChange = async (newRole) => {
    if (isSelectedOwner) {
      alert("SUPER_ADMIN (NAGESHA N) role is permanent and cannot be downgraded.");
      return;
    }
    if (!selectedUser) return;

    const oldRole = selectedUser.role;
    if (oldRole === newRole) return;

    if (!window.confirm(`Are you sure you want to change the role of ${selectedUser.employeeName} from ${oldRole} to ${newRole}?`)) return;

    // Ask if they want to reset permissions or preserve them
    const resetPerms = window.confirm(`Apply default permission templates for ${newRole}? Click Cancel to keep current custom permissions.`);

    try {
      // Update users collection
      await updateDoc(doc(db, 'users', selectedEmpId), { role: newRole });
      
      // Update system_users collection if they exist there (checking both string and number types)
      let systemUserDocId = null;
      const qSystemStr = query(collection(db, 'system_users'), where('employeeId', '==', String(selectedEmpId)));
      const snapSystemStr = await getDocs(qSystemStr);
      if (!snapSystemStr.empty) {
        systemUserDocId = snapSystemStr.docs[0].id;
      } else {
        const qSystemNum = query(collection(db, 'system_users'), where('employeeId', '==', Number(selectedEmpId)));
        const snapSystemNum = await getDocs(qSystemNum);
        if (!snapSystemNum.empty) {
          systemUserDocId = snapSystemNum.docs[0].id;
        }
      }

      if (systemUserDocId) {
        await updateDoc(doc(db, 'system_users', systemUserDocId), { role: newRole });
      }

      // Update userPermissions collection ONLY if resetting permissions is requested
      if (resetPerms) {
        const templatePerms = getRoleDefaultPermissions(newRole);
        await updateDoc(doc(db, 'userPermissions', selectedEmpId), { permissions: templatePerms });
      }

      // Update access control flags based on role defaults
      const isManagement = ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS', 'CREW_CONTROLLER'].includes(newRole);
      const isSuper = newRole === 'SUPER_ADMIN';
      const isSS = ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(newRole);

      await updateDoc(doc(db, 'userAccessControl', selectedEmpId), {
        canApproveRequests: isManagement,
        canAccessAdminModules: isSS,
        canManageUsers: isSuper
      });

      await writeUccAuditLog("ROLE_CHANGE", "Role Management", oldRole, newRole);
      alert(`Role successfully changed to ${newRole}.${resetPerms ? ' Template permissions applied.' : ' Existing permissions preserved.'}`);
    } catch (err) {
      alert("Failed to update role: " + err.message);
    }
  };

  // Apply one-click permission template
  const handleApplyTemplate = async (templateRole) => {
    if (isSelectedOwner) {
      alert("SUPER_ADMIN (NAGESHA N) permissions are permanent and cannot be modified.");
      return;
    }
    if (!selectedUser) return;

    if (!window.confirm(`Apply default template for "${templateRole}" to ${selectedUser.employeeName}? This will reset all current module toggles.`)) return;

    try {
      const templatePerms = getRoleDefaultPermissions(templateRole);
      await updateDoc(doc(db, 'userPermissions', selectedEmpId), { permissions: templatePerms });
      await writeUccAuditLog("APPLY_TEMPLATE", "Permission Templates", selectedUser.role, templateRole);
      alert(`Applied "${templateRole}" permission template successfully.`);
    } catch (err) {
      alert("Failed to apply template: " + err.message);
    }
  };

  // Toggle general access controls
  const handleAccessControlToggle = async (fieldName) => {
    if (isSelectedOwner && ['canLogin', 'canAccessWebApp', 'canAccessMobileApp', 'canManageUsers', 'canAccessAdminModules', 'canApproveRequests'].includes(fieldName)) {
      alert("SUPER_ADMIN (NAGESHA N) access controls are permanent and cannot be modified.");
      return;
    }
    if (!selectedAccess) return;

    const oldVal = !!selectedAccess[fieldName];
    const newVal = !oldVal;

    try {
      await updateDoc(doc(db, 'userAccessControl', selectedEmpId), { [fieldName]: newVal });
      
      // If toggling canLogin or active flag, update user's active status in users collection too
      if (fieldName === 'canLogin') {
        await updateDoc(doc(db, 'users', selectedEmpId), { active: newVal, status: newVal ? "ACTIVE" : "INACTIVE" });
        
        // Sync with system_users if registered
        let systemUserDocId = null;
        const qSystemStr = query(collection(db, 'system_users'), where('employeeId', '==', String(selectedEmpId)));
        const snapSystemStr = await getDocs(qSystemStr);
        if (!snapSystemStr.empty) {
          systemUserDocId = snapSystemStr.docs[0].id;
        } else {
          const qSystemNum = query(collection(db, 'system_users'), where('employeeId', '==', Number(selectedEmpId)));
          const snapSystemNum = await getDocs(qSystemNum);
          if (!snapSystemNum.empty) {
            systemUserDocId = snapSystemNum.docs[0].id;
          }
        }
        if (systemUserDocId) {
          await updateDoc(doc(db, 'system_users', systemUserDocId), { active: newVal });
        }
      }

      await writeUccAuditLog("TOGGLE_ACCESS_CONTROL", "Login Control", `${fieldName}:${oldVal}`, `${fieldName}:${newVal}`);
    } catch (err) {
      alert("Failed to update access control: " + err.message);
    }
  };

  // Terminate All Sessions / Force Logout
  const handleForceLogout = async () => {
    if (isSelectedOwner) {
      alert("SUPER_ADMIN (NAGESHA N) session cannot be terminated from this panel.");
      return;
    }
    if (!selectedUser) return;

    if (!window.confirm(`Force immediate logout for ${selectedUser.employeeName}? They will be kicked out of all active web/mobile sessions.`)) return;

    try {
      await updateDoc(doc(db, 'userAccessControl', selectedEmpId), { forceLogout: true });
      await writeUccAuditLog("FORCE_LOGOUT", "Session Management", "Active", "Logged Out");
      alert("Force logout command sent. The user's active sessions will terminate within seconds.");
    } catch (err) {
      alert("Failed to execute force logout: " + err.message);
    }
  };

  // Block Device User Agent
  const handleBlockDevice = async () => {
    if (isSelectedOwner) {
      alert("SUPER_ADMIN (NAGESHA N) devices cannot be blocked.");
      return;
    }
    if (!selectedUser || !selectedAccess) return;

    const deviceAgent = selectedUser.lastLoginDevice || selectedAccess.lastLoginDevice || navigator.userAgent;
    if (!deviceAgent) return alert("No active session device found to block.");

    if (!window.confirm(`Block the last active device/browser for ${selectedUser.employeeName}? User Agent: ${deviceAgent}`)) return;

    try {
      const currentBlocked = selectedAccess.blockedDevices || [];
      if (currentBlocked.includes(deviceAgent)) {
        return alert("This device is already blocked.");
      }
      
      const newBlocked = [...currentBlocked, deviceAgent];
      await updateDoc(doc(db, 'userAccessControl', selectedEmpId), { 
        blockedDevices: newBlocked,
        deviceStatus: "BLOCKED" 
      });

      await writeUccAuditLog("BLOCK_DEVICE", "Device Management", "ACTIVE", `BLOCKED:${deviceAgent}`);
      alert("Device blocked successfully.");
    } catch (err) {
      alert("Failed to block device: " + err.message);
    }
  };

  // Unblock All Devices
  const handleUnblockDevices = async () => {
    if (!selectedAccess) return;

    try {
      await updateDoc(doc(db, 'userAccessControl', selectedEmpId), { 
        blockedDevices: [],
        deviceStatus: "ACTIVE" 
      });

      await writeUccAuditLog("UNBLOCK_DEVICES", "Device Management", "BLOCKED", "ACTIVE");
      alert("All devices for this user have been unblocked.");
    } catch (err) {
      alert("Failed to unblock devices: " + err.message);
    }
  };

  // Delete User from System Accounts (Soft Deactivation)
  const handleDeleteUser = async () => {
    if (isSelectedOwner) {
      alert("SUPER_ADMIN (NAGESHA N) cannot be deleted under any circumstances.");
      return;
    }
    if (!selectedUser) return;

    if (!window.confirm(`⛔ DEACTIVATE CONFIRMATION: Are you sure you want to deactivate ${selectedUser.employeeName} (${selectedUser.employeeId})? This resets them to inactive status.`)) return;

    try {
      // Deactivate them in the master users collection
      await updateDoc(doc(db, 'users', selectedEmpId), {
        active: false,
        status: "INACTIVE",
        role: "VIEWER"
      });

      // Clear custom permissions
      const templatePerms = getRoleDefaultPermissions("VIEWER");
      await updateDoc(doc(db, 'userPermissions', selectedEmpId), { permissions: templatePerms });

      // Block access controls
      await updateDoc(doc(db, 'userAccessControl', selectedEmpId), {
        canLogin: false,
        canAccessWebApp: false,
        canAccessMobileApp: false,
        canManageUsers: false,
        canAccessAdminModules: false,
        canApproveRequests: false
      });

      // Remove from system_users collection if they have a registered UID
      const qSystem = query(collection(db, 'system_users'), where('employeeId', '==', selectedEmpId));
      const snapSystem = await getDocs(qSystem);
      if (!snapSystem.empty) {
        await updateDoc(doc(db, 'system_users', snapSystem.docs[0].id), { 
          active: false,
          role: "VIEWER" 
        });
      }

      await writeUccAuditLog("DELETE_USER", "Account Management", selectedUser.role, "VIEWER (DEACTIVATED)");
      alert(`User profile for ${selectedUser.employeeName} has been locked and reset to deactivated VIEWER status.`);
    } catch (err) {
      alert("Failed to deactivate user: " + err.message);
    }
  };

  // Permanent Delete User Account from Database
  const handlePermanentDeleteUser = async () => {
    if (isSelectedOwner) {
      alert("SUPER_ADMIN (NAGESHA N) permanent owner account cannot be deleted under any circumstances.");
      return;
    }
    if (!selectedUser) return;

    const empId = selectedUser.employeeId || selectedUser.id;
    const empName = selectedUser.employeeName || selectedUser.name || '';

    if (!window.confirm(`⛔ PERMANENT DELETE CONFIRMATION:\n\nAre you sure you want to PERMANENTLY DELETE user "${empName}" (ID: ${empId}) from the entire system database?\n\nThis will completely remove their user profile, permissions, and access controls from Firestore. THIS ACTION IS IRREVERSIBLE!`)) return;

    try {
      const sEmpId = String(empId).trim();
      const nEmpId = Number(empId);
      const userEmail = String(selectedUser.email || '').trim().toLowerCase();
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

      // Also directly attempt deleting selectedUser.docId if present
      if (selectedUser.docId) {
        try { await deleteDoc(doc(db, 'users', selectedUser.docId)); } catch (e) {}
      }

      // Instant UI purge
      setEmployees(prev => prev.filter(e => 
        String(e.employeeId) !== sEmpId && 
        String(e.id) !== sEmpId && 
        (!targetNameStr || !String(e.employeeName || e.name || '').toLowerCase().includes(targetNameStr))
      ));
      setSelectedEmpId(null);
      setSelectedEmpIds([]);
      setSelectedUser(null);

      await writeUccAuditLog("PERMANENT_DELETE_USER", "Account Management", selectedUser.role, "DELETED_PERMANENTLY");

      if (errorLog.length > 0) {
        alert(`⚠️ Permanent deletion completed with warnings (${totalDeletedCount} documents deleted).\nLog:\n${errorLog.join("\n")}`);
      } else {
        alert(`✅ User ${empName} (${empId}) has been PERMANENTLY deleted (${totalDeletedCount} document records removed across all collections).`);
      }
    } catch (err) {
      alert("Failed to permanently delete user: " + err.message);
    }
  };

  // Status Badge Class Selector
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'INACTIVE': return 'bg-slate-800 text-slate-400 border border-slate-700';
      case 'SUSPENDED': return 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse';
      case 'BLOCKED': return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default: return 'bg-slate-800 text-slate-400 border border-slate-700';
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 font-mono text-slate-100 max-w-[100vw] overflow-x-hidden p-2">
      
      {/* 1. EMPLOYEE SELECTION & FILTER SIDEBAR (1 Column) */}
      <div className="xl:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4 text-emerald-400">
          <Users size={18} />
          <span className="font-bold text-xs uppercase tracking-wider">Crew Registry Filter</span>
        </div>

        {/* Filter inputs */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input id="usercontrolcenter-i1" name="usercontrolcenter-i1" 
              type="text" 
              placeholder="Search ID / Name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-[11px] text-slate-300 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400">
            <div>
              <label className="block mb-1 font-bold uppercase" htmlFor="usercontrolcenter-l1">Designation</label>
              <select id="usercontrolcenter-i2" name="usercontrolcenter-i2" 
                value={filterDesignation}
                onChange={(e) => setFilterDesignation(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-[9px] focus:outline-none"
              >
                <option value="">ALL</option>
                <option value="Train Operator">Train Operator</option>
                <option value="Station Controller">Station Controller</option>
                <option value="Station Controller / Train Operator">SC / TO</option>
                <option value="Crew Controller">Crew Controller</option>
                <option value="Station Superintendent">Station Superintendent</option>
                <option value="OCC Controller">OCC Controller</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-bold uppercase" htmlFor="usercontrolcenter-l2">Depot</label>
              <select id="usercontrolcenter-i3" name="usercontrolcenter-i3" 
                value={filterDepot}
                onChange={(e) => setFilterDepot(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-[9px] focus:outline-none"
              >
                <option value="">ALL</option>
                {DEPLOYMENT_DEPOTS.map(d => <option key={d} value={d}>{d.split(' ')[0]}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400">
            <div>
              <label className="block mb-1 font-bold uppercase" htmlFor="usercontrolcenter-l3">Assigned Role</label>
              <select id="usercontrolcenter-i4" name="usercontrolcenter-i4" 
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-[9px] focus:outline-none"
              >
                <option value="">ALL</option>
                <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                <option value="ADMIN_Station_Superintendent">ADMIN_SS</option>
                <option value="CREW_CONTROLLER">CREW_CONTROLLER</option>
                <option value="STATION_CONTROLLER">STATION_CONTROLLER</option>
                <option value="TRAIN_OPERATOR">TRAIN_OPERATOR</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 font-bold uppercase" htmlFor="usercontrolcenter-l4">Status</label>
              <select id="usercontrolcenter-i5" name="usercontrolcenter-i5" 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-1 text-[9px] focus:outline-none"
              >
                <option value="">ALL</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </div>
          </div>
        </div>

        {/* Select All Toggle */}
        <div className="flex items-center justify-between mb-2 px-1 text-[10px] text-slate-500 border-b border-slate-800/40 pb-2">
          <button 
            onClick={handleSelectAllFiltered}
            className="text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
          >
            {selectedEmpIds.length === filteredEmployees.length ? 'Deselect All' : 'Select All (' + filteredEmployees.length + ')'}
          </button>
          <span className="font-bold">{selectedEmpIds.length} Selected</span>
        </div>

        {/* Dynamic List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 border-t border-slate-800/80 pt-3">
          {filteredEmployees.length === 0 ? (
            <div className="text-[10px] text-slate-500 text-center py-10">NO MATCHING CREW RECORDS</div>
          ) : (
            filteredEmployees.map(emp => {
              const isSelected = selectedEmpId === emp.employeeId;
              const isOwner = emp.employeeId === '20726';
              return (
                <div
                  key={emp.employeeId}
                  className={`w-full text-left p-2 rounded-lg border text-xs flex items-center justify-between transition-all ${
                    isSelected 
                      ? 'bg-slate-800 border-emerald-500/50 shadow-md' 
                      : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input id="usercontrolcenter-i6" name="usercontrolcenter-i6" 
                      type="checkbox"
                      checked={selectedEmpIds.includes(emp.employeeId)}
                      onChange={(e) => handleCheckboxToggle(e, emp.employeeId)}
                      className="accent-emerald-500 h-3.5 w-3.5 rounded cursor-pointer"
                    />
                    <div 
                      onClick={() => {
                        setSelectedEmpId(emp.employeeId);
                        setSelectedEmpIds([emp.employeeId]);
                      }}
                      className="flex-1 min-w-0 cursor-pointer py-1"
                    >
                      <div className="font-bold flex items-center gap-1">
                        {isOwner && <Shield className="h-3 w-3 text-amber-400 fill-amber-400/20" />}
                        <span className={isSelected ? 'text-emerald-400' : 'text-slate-200'}>{emp.employeeName}</span>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-0.5">ID: {emp.employeeId} | {emp.designation}</div>
                    </div>
                  </div>
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    emp.status === 'ACTIVE' ? 'text-emerald-400 bg-emerald-500/10' :
                    emp.status === 'BLOCKED' ? 'text-rose-400 bg-rose-500/10' :
                    emp.status === 'SUSPENDED' ? 'text-amber-400 bg-amber-500/10' :
                    'text-slate-400 bg-slate-800'
                  }`}>
                    {emp.status || 'ACTIVE'}
                  </span>
                </div>
              );
            })
          )}
        </div>
        <div className="text-[9px] text-slate-500 text-center pt-2 mt-2 border-t border-slate-800/60 uppercase">
          Total Sync Count: {filteredEmployees.length} / {employees.length}
        </div>
      </div>

      {/* 2. DYNAMIC MAIN DASHBOARD (3 Columns) */}
      <div className="xl:col-span-3 space-y-6 h-[calc(100vh-140px)] overflow-y-auto pr-1">
        {selectedEmpIds.length > 1 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <Users className="text-emerald-400 h-6 w-6" />
                <div>
                  <h2 className="text-lg font-black text-slate-100 uppercase tracking-wider">Bulk Operation Panel</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Apply roles or permission templates to <span className="text-emerald-400 font-bold font-mono">{selectedEmpIds.length}</span> selected operators in one shot.
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEmpIds([])}
                className="text-xs bg-slate-850 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded text-slate-400 font-bold uppercase transition-colors cursor-pointer"
              >
                Clear Selection
              </button>
            </div>

            {/* Selected Operators Names */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4 space-y-2">
              <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-widest">Selected Operators ({selectedEmpIds.length})</span>
              <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto py-1">
                {selectedEmpIds.map(id => {
                  const emp = employees.find(e => e.employeeId === id);
                  return (
                    <span key={`bulk-badge-${id}`} className="bg-slate-900 border border-slate-800 text-slate-300 px-2.5 py-1 rounded text-[10px] font-bold font-mono flex items-center gap-1">
                      {emp?.employeeName || id} <span className="text-[8px] text-slate-500 font-normal">({id})</span>
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Bulk Role Assignment Option */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 border-b border-slate-900 pb-2 flex items-center gap-2">
                <Shield size={16} className="text-cyan-400" /> Assign Role In Bulk
              </h3>
              <p className="text-xs text-slate-400">
                Updating the role will apply the default permission template and adjust system module access settings.
              </p>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <select id="usercontrolcenter-i7" name="usercontrolcenter-i7"
                  defaultValue=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      handleBulkRoleChange(val);
                      e.target.value = ""; // Reset
                    }
                  }}
                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs font-bold text-slate-200 focus:outline-none cursor-pointer sm:w-64"
                >
                  <option value="" disabled>-- Select Role to Assign --</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="ADMIN_Station_Superintendent">ADMIN_Station_Superintendent</option>
                  <option value="CREW_CONTROLLER">CREW_CONTROLLER</option>
                  <option value="STATION_CONTROLLER">STATION_CONTROLLER</option>
                  <option value="TRAIN_OPERATOR">TRAIN_OPERATOR</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
                <span className="text-[10px] text-slate-500 self-center uppercase font-bold">Or apply preset template below</span>
              </div>
            </div>

            {/* Bulk Permission Templates */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 border-b border-slate-900 pb-2 flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-400" /> Apply Permission Presets In Bulk
              </h3>
              <p className="text-xs text-slate-400">
                Resets granular feature access toggles to standard system-defined defaults for the selected profile.
              </p>

              <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                <button 
                  onClick={() => handleBulkApplyTemplate('SUPER_ADMIN')} 
                  className="bg-amber-600/15 hover:bg-amber-600 hover:text-slate-950 text-amber-500 px-4 py-2.5 rounded-lg border border-amber-550/20 transition-all font-bold cursor-pointer"
                >
                  Super Admin (SA)
                </button>
                <button 
                  onClick={() => handleBulkApplyTemplate('ADMIN_Station_Superintendent')} 
                  className="bg-emerald-600/15 hover:bg-emerald-600 hover:text-slate-950 text-emerald-400 px-4 py-2.5 rounded-lg border border-emerald-550/20 transition-all font-bold cursor-pointer"
                >
                  Station SS (Admin)
                </button>
                <button 
                  onClick={() => handleBulkApplyTemplate('CREW_CONTROLLER')} 
                  className="bg-blue-600/15 hover:bg-blue-600 hover:text-white text-blue-400 px-4 py-2.5 rounded-lg border border-blue-550/20 transition-all font-bold cursor-pointer"
                >
                  Crew Controller (CC)
                </button>
                <button 
                  onClick={() => handleBulkApplyTemplate('TRAIN_OPERATOR')} 
                  className="bg-indigo-600/15 hover:bg-indigo-600 hover:text-white text-indigo-400 px-4 py-2.5 rounded-lg border border-indigo-550/20 transition-all font-bold cursor-pointer"
                >
                  Train Operator (TO)
                </button>
                <button 
                  onClick={() => handleBulkApplyTemplate('VIEWER')} 
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-lg border border-slate-700 transition-all font-bold cursor-pointer"
                >
                  Viewer
                </button>
              </div>
            </div>

          </div>
        ) : selectedUser ? (
          <>
            {/* PANEL A: EMPLOYEE GENERAL INFO & QUICK ACTIONS */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl relative overflow-hidden">
              {isSelectedOwner && (
                <div className="absolute top-0 right-0 bg-amber-500/15 border-b border-l border-amber-500/30 text-[9px] font-bold text-amber-400 px-4 py-1.5 rounded-bl-lg uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                  <ShieldCheck size={12} /> System Permanent Owner Account
                </div>
              )}
              
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-5 border-b border-slate-800">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 bg-slate-950 border border-slate-700 rounded-xl flex items-center justify-center text-slate-400 shadow-inner">
                    <User size={28} />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
                      {selectedUser.employeeName}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${getStatusBadgeClass(selectedUser.status)}`}>
                        {selectedUser.status || 'ACTIVE'}
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 flex items-center flex-wrap gap-1.5">
                      <span>ID: <span className="text-emerald-400 font-bold">{selectedUser.employeeId}</span> | {selectedUser.designation} | {selectedUser.depot}</span>
                      <button
                        onClick={() => {
                          if (opEngine?.setSelectedEmployee) {
                            opEngine.setSelectedEmployee({ employeeId: selectedUser.employeeId, employeeName: selectedUser.employeeName });
                          }
                          if (opEngine?.setActiveTab) {
                            opEngine.setActiveTab('DRIVING_HOURS');
                          }
                        }}
                        className="bg-cyan-950/80 border border-cyan-800/80 hover:bg-cyan-900/60 text-cyan-300 px-2 py-0.5 rounded text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm"
                        title="View 31-Day JMD Driving Hours & KM Table for this operator"
                      >
                        <Activity size={11} /> View JMD Driving Hours
                      </button>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                  {/* Template quick-select list */}
                  <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg p-1.5">
                    <span className="text-slate-500 px-2 text-[9px] tracking-widest font-bold">Apply Preset:</span>
                    <button 
                      onClick={() => handleApplyTemplate('SUPER_ADMIN')} 
                      disabled={isSelectedOwner}
                      className="bg-amber-600/15 hover:bg-amber-600 hover:text-slate-950 text-amber-500 px-2.5 py-1 rounded transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      SA
                    </button>
                    <button 
                      onClick={() => handleApplyTemplate('ADMIN_Station_Superintendent')} 
                      disabled={isSelectedOwner}
                      className="bg-emerald-600/15 hover:bg-emerald-600 hover:text-slate-950 text-emerald-400 px-2.5 py-1 rounded transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      Admin
                    </button>
                    <button 
                      onClick={() => handleApplyTemplate('CREW_CONTROLLER')} 
                      disabled={isSelectedOwner}
                      className="bg-blue-600/15 hover:bg-blue-600 hover:text-white text-blue-400 px-2.5 py-1 rounded transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      CC
                    </button>
                    <button 
                      onClick={() => handleApplyTemplate('TRAIN_OPERATOR')} 
                      disabled={isSelectedOwner}
                      className="bg-indigo-600/15 hover:bg-indigo-600 hover:text-white text-indigo-400 px-2.5 py-1 rounded transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      TO
                    </button>
                    <button 
                      onClick={() => handleApplyTemplate('VIEWER')} 
                      disabled={isSelectedOwner}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      Viewer
                    </button>
                  </div>
                  
                  {/* Role dropdown */}
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-1">
                    <span className="text-slate-500 mr-2 text-[9px] tracking-wider">Role:</span>
                    <select id="usercontrolcenter-i8" name="usercontrolcenter-i8"
                      value={selectedUser.role || ''}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      disabled={isSelectedOwner}
                      className="bg-transparent border-none text-slate-200 text-xs font-bold focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                    >
                      <option className="bg-slate-900" value="SUPER_ADMIN">SUPER_ADMIN</option>
                      <option className="bg-slate-900" value="ADMIN_Station_Superintendent">ADMIN_Station_Superintendent</option>
                      <option className="bg-slate-900" value="CREW_CONTROLLER">CREW_CONTROLLER</option>
                      <option className="bg-slate-900" value="STATION_CONTROLLER">STATION_CONTROLLER</option>
                      <option className="bg-slate-900" value="TRAIN_OPERATOR">TRAIN_OPERATOR</option>
                      <option className="bg-slate-900" value="VIEWER">VIEWER</option>
                    </select>
                  </div>

                  {/* Deactivate Account Button */}
                  <button 
                    onClick={handleDeleteUser}
                    disabled={isSelectedOwner}
                    className="bg-amber-955/40 border border-amber-900/50 hover:bg-amber-900/30 text-amber-400 p-2.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:hover:bg-transparent font-bold"
                    title="Lock/Deactivate Account Profile"
                  >
                    <UserMinus size={14} /> Deactivate Account
                  </button>

                  {/* Permanent Delete User Account Button */}
                  <button 
                    onClick={handlePermanentDeleteUser}
                    disabled={isSelectedOwner}
                    className="bg-rose-900/80 hover:bg-rose-700 text-white font-black p-2.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-30 disabled:hover:bg-transparent shadow-lg shadow-rose-900/30"
                    title="Permanently remove user from system database"
                  >
                    <Trash2 size={14} /> Delete Permanently
                  </button>
                </div>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-5 text-[11px]">
                <div className="space-y-1">
                  <span className="text-slate-500 font-bold block uppercase tracking-widest text-[9px]">Mobile Number</span>
                  <span className="text-slate-200">{selectedUser.mobileNumber || selectedUser.contact || '--'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 font-bold block uppercase tracking-widest text-[9px]">Email Address</span>
                  <span className="text-slate-200 truncate block">{selectedUser.email || '--'}</span>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 font-bold block uppercase tracking-widest text-[9px]">Last Login Time</span>
                  <span className="text-slate-300 font-mono">
                    {selectedUser.lastLogin?.toDate ? selectedUser.lastLogin.toDate().toLocaleString() : '--'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-slate-500 font-bold block uppercase tracking-widest text-[9px]">Last Access Device</span>
                  <span className="text-slate-300 truncate block" title={selectedUser.lastLoginDevice || '--'}>
                    {selectedUser.lastLoginDevice ? selectedUser.lastLoginDevice.substring(0, 30) + '...' : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* PANEL B: GRANULAR FEATURE ACCESS CONTROL & LOGIN CONTROLS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Feature permission toggles (2 Columns) */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Shield size={18} />
                    <span className="font-bold text-xs uppercase tracking-wider">Feature Access Permissions</span>
                  </div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-widest">Double click label to reset preset</span>
                </div>

                {selectedPermissions ? (
                  <div className="space-y-4 overflow-y-auto max-h-[400px] pr-2">
                    {Object.keys(MODULE_PERMISSIONS_MAP).map(modName => {
                      const allowedPerms = MODULE_PERMISSIONS_MAP[modName];
                      const userModPerms = selectedPermissions[modName] || {};
                      
                      return (
                        <div key={modName} className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="w-full md:w-1/3">
                            <span className="font-bold text-[11px] text-slate-200 uppercase tracking-wider block">{modName}</span>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 md:w-2/3 md:justify-end">
                            {allowedPerms.map(perm => {
                              const isActive = !!userModPerms[perm];
                              return (
                                <button
                                  key={perm}
                                  onClick={() => handlePermissionToggle(modName, perm)}
                                  disabled={isSelectedOwner}
                                  className={`text-[9px] px-2.5 py-1.5 rounded-md font-bold uppercase tracking-wider border transition-all select-none ${
                                    isActive 
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.05)]' 
                                      : 'bg-slate-900/60 border-slate-800/80 text-slate-500 hover:text-slate-400 hover:border-slate-700'
                                  }`}
                                >
                                  {perm}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center font-bold text-xs text-slate-600 py-20 animate-pulse uppercase tracking-wider">
                    Loading Module Permissions...
                  </div>
                )}
              </div>

              {/* Login & Session controls (1 Column) */}
              <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col gap-6">
                
                {/* 1. Login Controls */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-3">
                    <Lock size={18} />
                    <span className="font-bold text-xs uppercase tracking-wider">Gate Login Control</span>
                  </div>

                  {selectedAccess ? (
                    <div className="space-y-3 text-[11px] uppercase font-bold text-slate-300">
                      {[
                        { key: 'canLogin', label: 'Can Login' },
                        { key: 'canAccessWebApp', label: 'Access Web App' },
                        { key: 'canAccessMobileApp', label: 'Access Mobile App' },
                        { key: 'canExportReports', label: 'Export Reports' },
                        { key: 'canApproveRequests', label: 'Approve Requests' },
                        { key: 'canAccessAdminModules', label: 'Access Admin Panel' },
                        { key: 'canManageUsers', label: 'Manage System Users' }
                      ].map(ctrl => {
                        const isGranted = !!selectedAccess[ctrl.key];
                        return (
                          <div key={ctrl.key} className="flex justify-between items-center bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 px-3">
                            <span className="text-slate-400 tracking-wider text-[10px]">{ctrl.label}</span>
                            <button
                              onClick={() => handleAccessControlToggle(ctrl.key)}
                              disabled={isSelectedOwner}
                              className={`px-3 py-1 rounded text-[9px] uppercase tracking-widest font-black transition-all border ${
                                isGranted 
                                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                              }`}
                            >
                              {isGranted ? 'GRANTED' : 'REVOKED'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center font-bold text-[10px] text-slate-600 py-10 uppercase tracking-widest animate-pulse">
                      Syncing Access Controls...
                    </div>
                  )}
                </div>

                {/* 2. Device & Session Actions */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-3">
                    <Laptop size={18} />
                    <span className="font-bold text-xs uppercase tracking-wider">Device & Session Control</span>
                  </div>

                  {selectedAccess ? (
                    <div className="space-y-2 text-[10px] uppercase font-bold">
                      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 space-y-1 text-slate-400">
                        <div className="flex justify-between">
                          <span>Device ID Status:</span>
                          <span className={selectedAccess.deviceStatus === 'BLOCKED' ? 'text-rose-400' : 'text-emerald-400'}>
                            {selectedAccess.deviceStatus || 'ACTIVE'}
                          </span>
                        </div>
                        <div className="flex justify-between text-[9px]">
                          <span>Blocked Devices:</span>
                          <span className="text-slate-500">
                            {selectedAccess.blockedDevices?.length || 0} Blocked
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 pt-2">
                        <button 
                          onClick={handleForceLogout}
                          disabled={isSelectedOwner}
                          className="bg-amber-600/10 hover:bg-amber-600 hover:text-slate-950 border border-amber-500/20 text-amber-500 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Power size={14} /> Force Logout User
                        </button>
                        <button 
                          onClick={handleBlockDevice}
                          disabled={isSelectedOwner}
                          className="bg-rose-600/10 hover:bg-rose-600 hover:text-slate-950 border border-rose-500/20 text-rose-400 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Ban size={14} /> Block Active Device
                        </button>
                        <button 
                          onClick={handleUnblockDevices}
                          className="bg-slate-850 hover:bg-slate-800 border border-slate-700 text-slate-300 py-2 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={14} /> Unblock All Devices
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center font-bold text-[10px] text-slate-600 py-10 uppercase tracking-widest animate-pulse">
                      Retrieving Session Matrix...
                    </div>
                  )}
                </div>

              </div>

            </div>

            {/* PANEL C: USER CHANGE AUDIT LOG TABLE */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
              <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-3 mb-4">
                <Activity size={18} />
                <span className="font-bold text-xs uppercase tracking-wider">User Modification Logs</span>
              </div>

              <div className="overflow-x-auto bg-slate-950 border border-slate-850 rounded-lg max-h-[300px]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-900 text-slate-500 uppercase tracking-widest text-[9px] sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Module/Section</th>
                      <th className="p-3">Previous Value</th>
                      <th className="p-3">New Value</th>
                      <th className="p-3">Changed By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-[11px] text-slate-300">
                    {selectedAuditLogs.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-slate-500 uppercase font-bold tracking-widest">
                          No modification logs recorded for this crew account
                        </td>
                      </tr>
                    ) : (
                      selectedAuditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-900/30 font-mono">
                          <td className="p-3 text-slate-500 text-[10px]">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Just now'}
                          </td>
                          <td className="p-3">
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
                              log.action === 'ROLE_CHANGE' ? 'text-indigo-400 bg-indigo-500/10' :
                              log.action === 'APPLY_TEMPLATE' ? 'text-amber-400 bg-amber-500/10' :
                              log.action === 'DELETE_USER' ? 'text-rose-400 bg-rose-500/10' :
                              'text-emerald-400 bg-emerald-500/10'
                            }`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-slate-400">{log.module}</td>
                          <td className="p-3 text-slate-500 font-mono truncate max-w-[150px]" title={log.oldValue}>{log.oldValue || '--'}</td>
                          <td className="p-3 text-emerald-400 font-mono truncate max-w-[150px]" title={log.newValue}>{log.newValue || '--'}</td>
                          <td className="p-3 text-slate-400 font-bold">{log.changedBy}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 shadow-xl flex flex-col items-center justify-center py-40 gap-4 text-center">
            <ShieldAlert size={48} className="text-slate-700" />
            <div>
              <h3 className="text-slate-300 font-bold text-sm uppercase">No Employee Selected</h3>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Select a crew registry record from the filter panel to adjust parameters</p>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, onSnapshot, doc, updateDoc, 
  setDoc, writeBatch, serverTimestamp, addDoc, getDocs, deleteDoc, where, getDoc
} from 'firebase/firestore';
import { 
  Search, ShieldAlert, Check, X, Download, UploadCloud, Users, 
  Trash2, PlusCircle, CheckSquare, Square, RefreshCw, BarChart2, 
  ShieldCheck, AlertTriangle, ArrowUpDown, ChevronLeft, ChevronRight, 
  HelpCircle, Sliders, LayoutGrid, FileSpreadsheet, Lock, Edit, Eye, RotateCcw, Save
} from 'lucide-react';
import { BMRCL_CREW_MASTER_BACKUP } from '../data/bmrclCrewRegistry';
import * as XLSX from 'xlsx';
import { provisioningService } from '../services/ProvisioningService';
import { getRoleDefaultPermissions } from '../utils/dbSeeder';
import { useAuth } from '../context/AuthContext';

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
  'Shift Handovers': ['View', 'Create Note', 'Approve', 'Full Control'],
  'KM Calculator Suite': ['View', 'Calculate', 'Export', 'Full Control'],
  'Rake Registry': ['View', 'Register Rake', 'Edit', 'Full Control'],
  'Leave Requests': ['View', 'Submit Request', 'Approve Request', 'Full Control'],
  'AI ALS Cab Inspection': ['View', 'Generate Plan', 'Optimize', 'Full Control']
};

export default function ActiveCrewRegistry({ userRole = 'SUPER_ADMIN', currentUser = { displayName: 'Administrator', email: 'admin@bmrc.co.in' } }) {
  const { userProfile } = useAuth();
  const isTrainOperator = userRole === 'TRAIN_OPERATOR' || 
                          userRole === 'STATION_CONTROLLER' || 
                          userRole === 'VIEWER' ||
                          String(userRole || '').toLowerCase().includes('operator') ||
                          String(userRole || '').toLowerCase().includes('controller') ||
                          String(userRole || '').toLowerCase().includes('viewer') ||
                          String(userProfile?.role || '').toLowerCase().includes('operator') ||
                          String(userProfile?.role || '').toLowerCase().includes('controller') ||
                          String(userProfile?.designation || '').toLowerCase().includes('operator') ||
                          String(userProfile?.designation || '').toLowerCase().includes('controller') ||
                          String(userProfile?.designation || '').toLowerCase().includes('viewer');

  // Master state driven by Firestore
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [auditLogs, setAuditLogs] = useState([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(1000);

  // Advanced Filters State
  const [filters, setFilters] = useState({
    id: '',
    name: '',
    designation: 'ALL',
    department: 'ALL',
    depot: 'ALL',
    role: 'ALL',
    competency: 'ALL',
    medical: 'ALL',
    operationalCrew: 'ALL',
    currentStatus: 'ALL',
    deleted: 'NO', // 'ALL', 'YES', 'NO'
    activeUser: 'ALL'
  });

  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showRegistryAuditModal, setShowRegistryAuditModal] = useState(false);
  const [registryEmpPermissions, setRegistryEmpPermissions] = useState({});
  const [registryAuditLogs, setRegistryAuditLogs] = useState([]);
  const [activeAuditEmpId, setActiveAuditEmpId] = useState('');
  const [activeAuditEmpName, setActiveAuditEmpName] = useState('');

  const [sortConfig, setSortConfig] = useState({ key: 'employeeId', direction: 'asc' });
  const [selectedIds, setSelectedIds] = useState([]);
  
  // UI Panel Toggle States
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  
  // CRUD Modals States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [modalTab, setModalTab] = useState('personal'); // 'personal', 'operational', 'system'

  // Excel Import States
  const [importPreview, setImportPreview] = useState(null); // { newDocs: [], updateDocs: [], duplicateCount: 0, deleteDocs: [] }
  const [showImportPreview, setShowImportPreview] = useState(false);
  const importFileRef = useRef(null);

  // Form states for Add/Edit
  const [formFields, setFormFields] = useState({
    employeeId: '',
    employeeName: '',
    mobileNumber: '',
    email: '',
    designation: 'Station Controller / Train Operator',
    department: 'Operations',
    role: 'Train Operator',
    depot: 'Peenya Depot (PYID)',
    badgeNumber: '',
    competencyNumber: '',
    competencyValidTill: '',
    medicalValidTill: '',
    doj: '',
    retirementDate: '',
    bloodGroup: 'O+',
    emergencyContact: '',
    currentStatus: 'DUTY',
    operationalCrew: 'YES',
    activeUser: false,
    systemUser: false,
    photo: '',
    remarks: ''
  });

  // Bulk Panel fields state
  const [bulkFields, setBulkFields] = useState({
    depot: '',
    role: '',
    designation: '',
    department: '',
    mobileNumber: '',
    email: '',
    action: '' // 'ACTIVATE', 'DEACTIVATE', 'DELETE', 'RESTORE', 'UPDATE_DEPOT', 'UPDATE_ROLE', 'UPDATE_DESIGNATION', 'UPDATE_DEPARTMENT', 'UPDATE_MOBILE', 'UPDATE_EMAIL'
  });

  // Access control checks
  const isAdminRole = userRole === 'SUPER_ADMIN' || 
                      userRole === 'ADMIN_Station_Superintendent' || 
                      userRole === 'ADMIN_SS' || 
                      userRole === 'ADMIN' || 
                      userRole === 'CREW_CONTROLLER' || 
                      userRole === 'ALS' || 
                      userRole === 'GCC' || 
                      userRole === 'co ordinators' ||
                      userRole === 'CO_ORDINATOR' ||
                      userRole === 'COORDINATOR';

  const canWrite = isAdminRole;
  const canBulk = isAdminRole;

  const loggedInEmpId = currentUser.email?.split('@')[0] || '';
  const isEditingSelf = !isAdminRole && String(formFields.employeeId) === String(loggedInEmpId);
  const isFieldDisabled = (fieldName) => {
    if (canWrite) return false;
    if (isEditingSelf) {
      const allowedSelfFields = [
        'competencyValidTill',
        'competencyNumber',
        'mobileNumber',
        'email',
        'medicalValidTill'
      ];
      return !allowedSelfFields.includes(fieldName);
    }
    return true;
  };

  // 1. Audit Logger Utility
  const logAudit = async (action, empId, empName, oldValue, newValue, reason = '') => {
    try {
      const today = new Date();
      await addDoc(collection(db, 'crewAuditLogs'), {
        action: action,
        employeeId: String(empId),
        employeeName: empName || '',
        oldValue: oldValue || '',
        newValue: newValue || '',
        changedBy: currentUser.displayName || currentUser.email || 'Administrator',
        date: today.toISOString().split('T')[0],
        time: today.toTimeString().split(' ')[0],
        device: navigator.userAgent,
        reason: reason || 'Database registry update',
        ipAddress: '192.168.1.100', // Mocked IP
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error("Audit logging failed:", err);
    }
  };

  // 2. Real-Time Synchronization & Seeding from Master Backup
  useEffect(() => {
    const unsubEmployees = onSnapshot(collection(db, 'crewRegistry'), async (snapshot) => {
      // If collection is empty, auto-seed from local memory backup
      if (snapshot.empty) {
        console.log("Firestore crewRegistry collection is empty. Auto-seeding from backup...");
        setLoading(true);
        try {
          const batch = writeBatch(db);
          BMRCL_CREW_MASTER_BACKUP.forEach(m => {
            const docRef = doc(db, 'crewRegistry', String(m.id));
            const payload = {
              id: String(m.id),
              employeeId: String(m.id),
              employeeName: m.name || '',
              mobileNumber: m.contact || '',
              email: m.email || '',
              designation: m.designation || 'Station Controller / Train Operator',
              department: m.department || 'Operations',
              role: m.role || 'Train Operator',
              depot: m.depot || 'Peenya Depot (PYID)',
              badgeNumber: m.badgeNumber || `B-${m.id}`,
              competencyNumber: m.competencyNumber || `C-${m.id}`,
              competencyValidTill: m.competencyValidTill || '2028-12-31',
              medicalValidTill: m.medicalValidTill || '2027-12-31',
              doj: m.doj || '2018-01-01',
              retirementDate: m.retirementDate || '2045-12-31',
              bloodGroup: m.bloodGroup || 'O+',
              emergencyContact: m.emergencyContact || '',
              currentStatus: m.currentStatus || 'DUTY',
              operationalCrew: m.activeCrew === true ? 'YES' : 'NO',
              activeUser: m.activeLogin || false,
              systemUser: m.systemUser || false,
              photo: m.photo || '',
              remarks: m.remarks || 'Initial Master Data Import',
              createdAt: new Date().toISOString(),
              createdBy: 'SYSTEM',
              updatedAt: new Date().toISOString(),
              updatedBy: 'SYSTEM',
              deleted: false,
              deletedAt: null,
              deletedBy: null
            };
            batch.set(docRef, payload);
          });
          await batch.commit();
          console.log("✓ Successfully seeded Firestore crewRegistry.");
        } catch (err) {
          console.error("Error seeding registry: ", err);
        }
        setLoading(false);
        return;
      }

      const list = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          ...data,
          id: String(data.id || docSnap.id),
          activeCrew: data.operationalCrew === 'YES' || data.operationalCrew === true // compatibility helper
        };
      });
      setEmployees(list);
      setLoading(false);
    }, (err) => {
      if (err.code !== 'permission-denied') console.error("Error fetching crewRegistry:", err);
    });

    const qLogs = query(collection(db, 'crewAuditLogs'), orderBy('timestamp', 'desc'));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 100)); // limit to 100 logs in list
    }, (err) => {
      if (err.code !== 'permission-denied') console.error("Error fetching crewAuditLogs:", err);
    });

    return () => {
      unsubEmployees();
      unsubLogs();
    };
  }, []);

  // 3. Validation Helpers
  const validateForm = (fields, isEditing = false) => {
    const errors = [];
    const todayStr = new Date().toISOString().split('T')[0];

    if (!fields.employeeId || !fields.employeeId.trim()) errors.push("Employee ID is required.");
    else if (!/^\d+$/.test(fields.employeeId)) errors.push("Employee ID must be digits only.");

    if (!fields.employeeName || !fields.employeeName.trim()) errors.push("Employee Name is required.");
    
    if (!fields.mobileNumber || !fields.mobileNumber.trim()) errors.push("Mobile Contact Number is required.");
    else if (!/^\d{10}$/.test(fields.mobileNumber)) errors.push("Mobile Number must be a valid 10-digit number.");

    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      errors.push("Email Address format is invalid.");
    }

    // Expiry activations checks
    if (fields.operationalCrew === 'YES') {
      if (fields.medicalValidTill && fields.medicalValidTill < todayStr) {
        errors.push(`Activation Blocked: Medical Validity has expired (${fields.medicalValidTill}).`);
      }
      if (fields.competencyValidTill && fields.competencyValidTill < todayStr) {
        errors.push(`Activation Blocked: Competency Validity has expired (${fields.competencyValidTill}).`);
      }
    }

    // Uniqueness checks locally against active records
    const checkId = String(fields.employeeId).trim();
    const checkMobile = String(fields.mobileNumber).trim();
    const checkEmail = String(fields.email || '').trim().toLowerCase();

    employees.forEach(emp => {
      if (emp.deleted) return; // skip deleted records in uniqueness check
      if (isEditing && String(emp.employeeId) === String(selectedEmployee?.employeeId)) return; // skip self when editing

      if (String(emp.employeeId) === checkId) {
        errors.push(`Duplicate ID: Employee ID #${checkId} is already in use.`);
      }
      if (checkMobile && String(emp.mobileNumber) === checkMobile) {
        errors.push(`Duplicate Mobile: Contact number ${checkMobile} is already assigned to ${emp.employeeName}.`);
      }
      if (checkEmail && emp.email && String(emp.email).toLowerCase() === checkEmail) {
        errors.push(`Duplicate Email: Email ${checkEmail} is already assigned to ${emp.employeeName}.`);
      }
    });

    return errors;
  };

  // 4. Save Operations (Add & Edit)
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!canWrite) return alert("Unauthorized access.");

    const errors = validateForm(formFields, false);
    if (errors.length > 0) {
      alert(`⚠️ Validation Errors:\n\n${errors.join("\n")}`);
      return;
    }

    try {
      const docRef = doc(db, 'crewRegistry', String(formFields.employeeId));
      const roleMapping = {
        'Station Controller / Train Operator': 'Train Operator',
        'Station Superintendent': 'Station Superintendent',
        'Crew Controller': 'Crew Controller'
      };
      const resolvedRole = roleMapping[formFields.designation] || 'Train Operator';

      const payload = {
        id: String(formFields.employeeId),
        employeeId: String(formFields.employeeId),
        employeeName: formFields.employeeName.trim(),
        mobileNumber: formFields.mobileNumber.trim(),
        email: formFields.email.trim() || '',
        designation: formFields.designation,
        department: formFields.department || 'Operations',
        role: resolvedRole,
        depot: formFields.depot,
        badgeNumber: formFields.badgeNumber || `B-${formFields.employeeId}`,
        competencyNumber: formFields.competencyNumber || `C-${formFields.employeeId}`,
        competencyValidTill: formFields.competencyValidTill || '',
        medicalValidTill: formFields.medicalValidTill || '',
        doj: formFields.doj || new Date().toISOString().split('T')[0],
        retirementDate: formFields.retirementDate || '2045-12-31',
        bloodGroup: formFields.bloodGroup || 'O+',
        emergencyContact: formFields.emergencyContact || '',
        currentStatus: formFields.currentStatus || 'DUTY',
        operationalCrew: formFields.operationalCrew,
        activeUser: formFields.activeUser,
        systemUser: formFields.systemUser,
        photo: formFields.photo || '',
        remarks: formFields.remarks || 'Manually Created',
        createdAt: new Date().toISOString(),
        createdBy: currentUser.displayName || currentUser.email || 'Admin',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin',
        deleted: false,
        deletedAt: null,
        deletedBy: null
      };

      await setDoc(docRef, payload);

      // Automatic Provisioning
      if (payload.operationalCrew === 'YES') {
        await provisioningService.provisionEmployee(payload, currentUser.displayName || currentUser.email);
      }

      // Audit Log
      await logAudit(
        'CREATE', 
        payload.employeeId, 
        payload.employeeName, 
        null, 
        `ID: ${payload.employeeId}, Name: ${payload.employeeName}, Depot: ${payload.depot}, Operational: ${payload.operationalCrew}`,
        'Manual Employee Registration'
      );

      alert("Employee Added Successfully");
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to add employee: " + err.message);
    }
  };

  const handleEditEmployee = async (e) => {
    e.preventDefault();
    const isSelfEdit = userRole === 'TRAIN_OPERATOR' && String(selectedEmployee.employeeId) === String(currentUser.email?.split('@')[0] || '');
    if (!canWrite && !isSelfEdit) return alert("Unauthorized access.");

    const errors = validateForm(formFields, true);
    if (errors.length > 0) {
      alert(`⚠️ Validation Errors:\n\n${errors.join("\n")}`);
      return;
    }

    try {
      const docRef = doc(db, 'crewRegistry', String(selectedEmployee.employeeId));
      let resolvedRole = selectedEmployee.role || 'Train Operator';
      if (!isSelfEdit) {
        const roleMapping = {
          'Station Controller / Train Operator': 'Train Operator',
          'Station Superintendent': 'Station Superintendent',
          'Crew Controller': 'Crew Controller'
        };
        resolvedRole = roleMapping[formFields.designation] || 'Train Operator';
      }

      const oldValueDesc = `Name: ${selectedEmployee.employeeName}, Role: ${selectedEmployee.role}, Depot: ${selectedEmployee.depot}, Operational: ${selectedEmployee.operationalCrew}`;
      const newValueDesc = isSelfEdit 
        ? `Self Update: Competency: ${formFields.competencyValidTill}, Mobile: ${formFields.mobileNumber}, Email: ${formFields.email}`
        : `Name: ${formFields.employeeName}, Role: ${resolvedRole}, Depot: ${formFields.depot}, Operational: ${formFields.operationalCrew}`;

      const payload = isSelfEdit ? {
        mobileNumber: formFields.mobileNumber.trim(),
        email: formFields.email.trim() || '',
        competencyNumber: formFields.competencyNumber || `C-${selectedEmployee.employeeId}`,
        competencyValidTill: formFields.competencyValidTill || '',
        medicalValidTill: formFields.medicalValidTill || '',
        photo: formFields.photo || '',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.email || 'Self'
      } : {
        employeeName: formFields.employeeName.trim(),
        mobileNumber: formFields.mobileNumber.trim(),
        email: formFields.email.trim() || '',
        designation: formFields.designation,
        department: formFields.department || 'Operations',
        role: resolvedRole,
        depot: formFields.depot,
        badgeNumber: formFields.badgeNumber || `B-${selectedEmployee.employeeId}`,
        competencyNumber: formFields.competencyNumber || `C-${selectedEmployee.employeeId}`,
        competencyValidTill: formFields.competencyValidTill || '',
        medicalValidTill: formFields.medicalValidTill || '',
        doj: formFields.doj || '',
        retirementDate: formFields.retirementDate || '',
        bloodGroup: formFields.bloodGroup || 'O+',
        emergencyContact: formFields.emergencyContact || '',
        currentStatus: formFields.currentStatus || 'DUTY',
        operationalCrew: formFields.operationalCrew,
        activeUser: formFields.activeUser,
        systemUser: formFields.systemUser,
        photo: formFields.photo || '',
        remarks: formFields.remarks || 'Updated via UI',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin'
      };

      await updateDoc(docRef, payload);

      // Automatic Provisioning Sync
      await provisioningService.provisionEmployee({
        ...selectedEmployee,
        ...payload,
        employeeId: selectedEmployee.employeeId
      }, currentUser.displayName || currentUser.email);

      // Audit Log
      await logAudit(
        'UPDATE',
        selectedEmployee.employeeId,
        formFields.employeeName,
        oldValueDesc,
        newValueDesc,
        'Employee details updated manually'
      );

      alert("Employee Updated Successfully");
      setShowEditModal(false);
    } catch (err) {
      console.error(err);
      alert("Failed to update employee: " + err.message);
    }
  };

  // 5. Active Crew Checkbox Toggle (Real-time in row)
  const toggleActiveCheckbox = async (emp, checked) => {
    if (!canWrite) return alert("Permission Denied: Read-only access.");
    const todayStr = new Date().toISOString().split('T')[0];

    if (checked) {
      // Expiry validations
      if (emp.medicalValidTill && emp.medicalValidTill < todayStr) {
        return alert(`⚠️ ACTIVATION BLOCKED: Medical validity expired on ${emp.medicalValidTill}.`);
      }
      if (emp.competencyValidTill && emp.competencyValidTill < todayStr) {
        return alert(`⚠️ ACTIVATION BLOCKED: Competency validity expired on ${emp.competencyValidTill}.`);
      }
    }

    try {
      const docRef = doc(db, 'crewRegistry', String(emp.employeeId));
      await updateDoc(docRef, {
        operationalCrew: checked ? 'YES' : 'NO',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin'
      });

      // Automatic Provisioning Sync
      await provisioningService.provisionEmployee({
        ...emp,
        operationalCrew: checked ? 'YES' : 'NO'
      }, currentUser.displayName || currentUser.email || 'Admin');

      await logAudit(
        'TOGGLE_ACTIVE',
        emp.employeeId,
        emp.employeeName,
        `Active: ${emp.operationalCrew}`,
        `Active: ${checked ? 'YES' : 'NO'}`,
        checked ? 'Operational crew activation' : 'Deactivation from operational duties'
      );
    } catch (err) {
      console.error(err);
      alert("Failed to toggle status: " + err.message);
    }
  };

  // 6. Delete (Soft Delete) and Restore logic
  const handleDeleteEmployee = async (emp) => {
    if (!canWrite) return alert("Unauthorized access.");
    if (!window.confirm(`Are you sure you want to SOFT DELETE crew member #${emp.employeeId} (${emp.employeeName})?\nThey will be removed from active rosters but preserved in archive.`)) return;

    try {
      const docRef = doc(db, 'crewRegistry', String(emp.employeeId));
      await updateDoc(docRef, {
        deleted: true,
        deletedAt: new Date().toISOString(),
        deletedBy: currentUser.displayName || currentUser.email || 'Admin',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin'
      });

      // Automatic Provisioning Sync - deactivates login
      await provisioningService.provisionEmployee({
        ...emp,
        operationalCrew: 'NO',
        deleted: true
      }, currentUser.displayName || currentUser.email || 'Admin');

      await logAudit(
        'SOFT_DELETE',
        emp.employeeId,
        emp.employeeName,
        'Active status',
        'Soft deleted = true',
        'Soft deleted from Active Roster'
      );

      alert("Employee Soft Deleted Successfully");
    } catch (err) {
      console.error(err);
      alert("Delete failed: " + err.message);
    }
  };

  const handleRestoreEmployee = async (emp) => {
    if (!canWrite) return alert("Unauthorized access.");
    try {
      const docRef = doc(db, 'crewRegistry', String(emp.employeeId));
      await updateDoc(docRef, {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin'
      });

      // Automatic Provisioning Sync - restores if active crew
      if (emp.operationalCrew === 'YES') {
        await provisioningService.provisionEmployee({
          ...emp,
          deleted: false
        }, currentUser.displayName || currentUser.email || 'Admin');
      }

      await logAudit(
        'RESTORE',
        emp.employeeId,
        emp.employeeName,
        'Soft deleted = true',
        'Soft deleted = false',
        'Employee restored to active database'
      );

      alert("Employee Restored Successfully");
    } catch (err) {
      console.error(err);
      alert("Restore failed: " + err.message);
    }
  };

  // 7. Bulk Actions Logic
  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!canBulk) return alert("Unauthorized access.");
    if (selectedIds.length === 0) return alert("No employees selected.");
    if (!bulkFields.action) return alert("Please select a bulk action.");

    const batch = writeBatch(db);
    const todayStr = new Date().toISOString().split('T')[0];
    let count = 0;
    let skipped = 0;

    for (const id of selectedIds) {
      const emp = employees.find(x => String(x.employeeId) === String(id));
      if (!emp) continue;

      const docRef = doc(db, 'crewRegistry', String(id));
      const payload = {
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName || currentUser.email || 'Admin'
      };

      if (bulkFields.action === 'ACTIVATE') {
        // Expiry checks
        if ((emp.medicalValidTill && emp.medicalValidTill < todayStr) || 
            (emp.competencyValidTill && emp.competencyValidTill < todayStr)) {
          skipped++;
          continue;
        }
        payload.operationalCrew = 'YES';
      } 
      else if (bulkFields.action === 'DEACTIVATE') {
        payload.operationalCrew = 'NO';
      } 
      else if (bulkFields.action === 'DELETE') {
        payload.deleted = true;
        payload.deletedAt = new Date().toISOString();
        payload.deletedBy = currentUser.displayName || currentUser.email || 'Admin';
      } 
      else if (bulkFields.action === 'RESTORE') {
        payload.deleted = false;
        payload.deletedAt = null;
        payload.deletedBy = null;
      } 
      else if (bulkFields.action === 'UPDATE_DEPOT' && bulkFields.depot) {
        payload.depot = bulkFields.depot;
      } 
      else if (bulkFields.action === 'UPDATE_ROLE' && bulkFields.role) {
        payload.role = bulkFields.role;
      } 
      else if (bulkFields.action === 'UPDATE_DESIGNATION' && bulkFields.designation) {
        payload.designation = bulkFields.designation;
        const roleMapping = {
          'Station Controller / Train Operator': 'Train Operator',
          'Station Superintendent': 'Station Superintendent',
          'Crew Controller': 'Crew Controller'
        };
        payload.role = roleMapping[bulkFields.designation] || 'Train Operator';
      } 
      else if (bulkFields.action === 'UPDATE_DEPARTMENT' && bulkFields.department) {
        payload.department = bulkFields.department;
      }
      else if (bulkFields.action === 'UPDATE_MOBILE' && bulkFields.mobileNumber) {
        if (selectedIds.length > 1) {
          alert("Bulk Update Mobile Number blocked: Mobile numbers must remain unique per employee.");
          return;
        }
        if (!/^\d{10}$/.test(bulkFields.mobileNumber)) {
          alert("Invalid Mobile Format: Must be 10 digits.");
          return;
        }
        payload.mobileNumber = bulkFields.mobileNumber;
      }
      else if (bulkFields.action === 'UPDATE_EMAIL' && bulkFields.email) {
        if (selectedIds.length > 1) {
          alert("Bulk Update Email blocked: Email addresses must remain unique per employee.");
          return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bulkFields.email)) {
          alert("Invalid Email Format.");
          return;
        }
        payload.email = bulkFields.email;
      }
      else {
        // invalid params
        continue;
      }

      batch.update(docRef, payload);
      
      // Audit log (in background loop)
      await logAudit(
        `BULK_${bulkFields.action}`,
        id,
        emp.employeeName,
        `Field: ${bulkFields.action}`,
        `Payload: ${JSON.stringify(payload)}`,
        'Bulk database modification'
      );
      count++;
    }

    try {
      await batch.commit();
      setSelectedIds([]);
      let msg = `Bulk updated ${count} employees successfully.`;
      if (skipped > 0) msg += ` (Skipped ${skipped} due to expired competency/medical validity)`;
      alert(msg);
      setShowBulkPanel(false);
    } catch (err) {
      console.error(err);
      alert("Bulk operation failed: " + err.message);
    }
  };

  // 8. Excel Import with Preview Dialog
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

        if (rows.length === 0) return alert("Selected spreadsheet file is empty.");

        const newDocs = [];
        const updateDocs = [];
        const duplicateDocs = [];
        const deleteDocs = []; // missing in import but in local db
        
        const importedIds = new Set();

        rows.forEach((row) => {
          const empId = String(row["Employee ID"] || row["id"] || row["employeeId"] || "");
          if (!empId) return;
          importedIds.add(empId);

          const existing = employees.find(e => String(e.employeeId) === empId && !e.deleted);
          
          const mappedRow = {
            id: empId,
            employeeId: empId,
            employeeName: row["Employee Name"] || row["name"] || row["employeeName"] || "",
            mobileNumber: String(row["Mobile Number"] || row["contact"] || row["mobileNumber"] || ""),
            email: row["Email"] || row["email"] || "",
            designation: row["Designation"] || row["designation"] || "Station Controller / Train Operator",
            department: row["Department"] || row["department"] || "Operations",
            role: row["Role"] || row["role"] || "Train Operator",
            depot: row["Depot"] || row["depot"] || "Peenya Depot (PYID)",
            badgeNumber: row["Badge Number"] || row["badgeNumber"] || `B-${empId}`,
            competencyNumber: row["Competency Number"] || row["competencyNumber"] || `C-${empId}`,
            competencyValidTill: row["Competency Valid Till"] || row["competencyValidTill"] || "",
            medicalValidTill: row["Medical Valid Till"] || row["medicalValidTill"] || "",
            doj: row["Date of Joining"] || row["doj"] || "2018-01-01",
            retirementDate: row["Retirement Date"] || row["retirementDate"] || "2045-12-31",
            bloodGroup: row["Blood Group"] || row["bloodGroup"] || "O+",
            emergencyContact: row["Emergency Contact"] || row["emergencyContact"] || "",
            currentStatus: row["Current Status"] || row["currentStatus"] || "DUTY",
            operationalCrew: row["Operational Crew"] || row["operationalCrew"] || "YES",
            activeUser: row["activeUser"] === true || String(row["activeUser"]).toLowerCase() === 'true',
            systemUser: row["systemUser"] === true || String(row["systemUser"]).toLowerCase() === 'true',
            photo: row["Photo"] || row["photo"] || "",
            remarks: row["Remarks"] || row["remarks"] || "Spreadsheet Import"
          };

          if (existing) {
            // Check if details differ
            const differ = 
              existing.employeeName !== mappedRow.employeeName ||
              existing.mobileNumber !== mappedRow.mobileNumber ||
              existing.depot !== mappedRow.depot ||
              existing.designation !== mappedRow.designation;

            if (differ) {
              updateDocs.push(mappedRow);
            } else {
              duplicateDocs.push(mappedRow);
            }
          } else {
            newDocs.push(mappedRow);
          }
        });

        // Find missing employees to soft-delete
        employees.forEach(emp => {
          if (!emp.deleted && !importedIds.has(String(emp.employeeId))) {
            deleteDocs.push(emp);
          }
        });

        setImportPreview({
          newDocs,
          updateDocs,
          duplicateCount: duplicateDocs.length,
          deleteDocs
        });
        setShowImportPreview(true);
      } catch (err) {
        console.error(err);
        alert("Spreadsheet parsing failed: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmExcelImport = async () => {
    if (!importPreview) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);

      // Create new ones
      importPreview.newDocs.forEach(docData => {
        const docRef = doc(db, 'crewRegistry', String(docData.employeeId));
        batch.set(docRef, {
          ...docData,
          createdAt: new Date().toISOString(),
          createdBy: currentUser.displayName || currentUser.email || 'Admin',
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.displayName || currentUser.email || 'Admin',
          deleted: false,
          deletedAt: null,
          deletedBy: null
        });
      });

      // Update existing ones
      importPreview.updateDocs.forEach(docData => {
        const docRef = doc(db, 'crewRegistry', String(docData.employeeId));
        batch.update(docRef, {
          ...docData,
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.displayName || currentUser.email || 'Admin'
        });
      });

      // Soft delete missing ones
      importPreview.deleteDocs.forEach(docData => {
        const docRef = doc(db, 'crewRegistry', String(docData.employeeId));
        batch.update(docRef, {
          deleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: currentUser.displayName || currentUser.email || 'Admin'
        });
      });

      await batch.commit();

      // Log general Audit Log
      await logAudit(
        'EXCEL_IMPORT',
        'SYSTEM',
        'Registry Excel Import',
        `New: ${importPreview.newDocs.length}, Updates: ${importPreview.updateDocs.length}`,
        `Deleted: ${importPreview.deleteDocs.length}`,
        'Excel database import synchronization'
      );

      alert("Import Completed Successfully!");
      setShowImportPreview(false);
      setImportPreview(null);
    } catch (err) {
      console.error(err);
      alert("Import transaction failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 9. Dynamic Export functionality
  const handleExport = (format) => {
    // Determine export targets
    let listToExport = employees;
    
    // Checkboxes first preference
    if (selectedIds.length > 0) {
      listToExport = employees.filter(e => selectedIds.includes(e.employeeId));
    } else if (searchTerm || Object.values(filters).some(v => v !== 'ALL' && v !== 'NO')) {
      // Filtered records
      listToExport = sortedFilteredEmployees;
    }

    if (listToExport.length === 0) {
      alert("No matching employees found to export.");
      return;
    }

    const headers = [
      "Employee ID", "Employee Name", "Mobile Number", "Email", "Designation", 
      "Department", "Role", "Depot", "Badge Number", "Competency Number", 
      "Competency Validity", "Medical Validity", "Date of Joining", "Retirement Date", 
      "Blood Group", "Emergency Contact", "Current Status", "Operational Crew"
    ];

    const formattedData = listToExport.map(emp => ({
      "Employee ID": emp.employeeId,
      "Employee Name": emp.employeeName,
      "Mobile Number": emp.mobileNumber,
      "Email": emp.email || '',
      "Designation": emp.designation,
      "Department": emp.department,
      "Role": emp.role,
      "Depot": emp.depot,
      "Badge Number": emp.badgeNumber,
      "Competency Number": emp.competencyNumber,
      "Competency Validity": emp.competencyValidTill,
      "Medical Validity": emp.medicalValidTill,
      "Date of Joining": emp.doj,
      "Retirement Date": emp.retirementDate,
      "Blood Group": emp.bloodGroup,
      "Emergency Contact": emp.emergencyContact,
      "Current Status": emp.currentStatus,
      "Operational Crew": emp.operationalCrew
    }));

    if (format === 'JSON') {
      const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `BMRCL_Crew_Registry_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
    } 
    else if (format === 'CSV') {
      let csvContent = headers.join(",") + "\n";
      formattedData.forEach(row => {
        const line = headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(",");
        csvContent += line + "\n";
      });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `BMRCL_Crew_Registry_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } 
    else if (format === 'EXCEL') {
      const ws = XLSX.utils.json_to_sheet(formattedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Crew Registry");
      XLSX.writeFile(wb, `BMRCL_Crew_Registry_${new Date().toISOString().split('T')[0]}.xlsx`);
    } 
    else if (format === 'PDF') {
      const printWindow = window.open('', '_blank');
      const tableRows = listToExport.map(e => `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 6px;">#${e.employeeId}</td>
          <td style="padding: 6px; font-weight: bold;">${e.employeeName}</td>
          <td style="padding: 6px;">${e.designation}</td>
          <td style="padding: 6px;">${e.mobileNumber || '--'}</td>
          <td style="padding: 6px;">${e.email || '--'}</td>
          <td style="padding: 6px;">${e.competencyValidTill || 'N/A'}</td>
          <td style="padding: 6px;">${e.medicalValidTill || 'N/A'}</td>
        </tr>
      `).join('');

      printWindow.document.write(`
        <html>
          <head>
            <title>BMRCL Crew Registry Report</title>
            <style>
              body { font-family: monospace; padding: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th { background-color: #f2f2f2; text-align: left; padding: 8px; }
            </style>
          </head>
          <body>
            <h2>BMRCL OPERATIONAL CREW REGISTRY REPORT</h2>
            <p>Generated: ${new Date().toLocaleString()} | Total Records: ${listToExport.length}</p>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Designation</th>
                  <th>Mobile Number</th>
                  <th>Email ID</th>
                  <th>Competency</th>
                  <th>Medical</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>
            <script>
              window.onload = function() { window.print(); window.close(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // 10. Open Add/Edit forms
  const openAddDialog = () => {
    setFormFields({
      employeeId: '',
      employeeName: '',
      mobileNumber: '',
      email: '',
      designation: 'Station Controller / Train Operator',
      department: 'Operations',
      role: 'Train Operator',
      depot: 'Peenya Depot (PYID)',
      badgeNumber: '',
      competencyNumber: '',
      competencyValidTill: '',
      medicalValidTill: '',
      doj: '',
      retirementDate: '',
      bloodGroup: 'O+',
      emergencyContact: '',
      currentStatus: 'DUTY',
      operationalCrew: 'YES',
      activeUser: false,
      systemUser: false,
      photo: '',
      remarks: ''
    });
    setModalTab('personal');
    setShowAddModal(true);
  };

  const openEditDialog = (emp = null) => {
    const target = emp || employees.find(e => selectedIds.includes(e.employeeId));
    if (!target) return alert("Select an employee to edit.");
    
    setSelectedEmployee(target);
    setFormFields({
      employeeId: target.employeeId,
      employeeName: target.employeeName,
      mobileNumber: target.mobileNumber,
      email: target.email || '',
      designation: target.designation || 'Station Controller / Train Operator',
      department: target.department || 'Operations',
      role: target.role || 'Train Operator',
      depot: target.depot || 'Peenya Depot (PYID)',
      badgeNumber: target.badgeNumber || '',
      competencyNumber: target.competencyNumber || '',
      competencyValidTill: target.competencyValidTill || '',
      medicalValidTill: target.medicalValidTill || '',
      doj: target.doj || '',
      retirementDate: target.retirementDate || '',
      bloodGroup: target.bloodGroup || 'O+',
      emergencyContact: target.emergencyContact || '',
      currentStatus: target.currentStatus || 'DUTY',
      operationalCrew: target.operationalCrew || 'YES',
      activeUser: target.activeUser || false,
      systemUser: target.systemUser || false,
      photo: target.photo || '',
      remarks: target.remarks || ''
    });
    setModalTab('personal');
    setShowEditModal(true);
  };

  const openViewDialog = (emp = null) => {
    const target = emp || employees.find(e => selectedIds.includes(e.employeeId));
    if (!target) return alert("Select an employee to view.");
    setSelectedEmployee(target);
    setShowViewModal(true);
  };

  // 11. Sorting helper
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // 12. Search & Filter Processing
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      // Role Isolation for Train Operator
      if (userRole === 'TRAIN_OPERATOR') {
        const userEmpId = currentUser.email?.split('@')[0] || '';
        if (String(emp.employeeId) !== String(userEmpId)) return false;
      }

      // Soft delete visibility filter
      if (filters.deleted === 'YES' && !emp.deleted) return false;
      if (filters.deleted === 'NO' && emp.deleted) return false;

      // Instant text search matches
      const text = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || 
        emp.employeeName?.toLowerCase().includes(text) || 
        String(emp.employeeId).includes(text) || 
        emp.mobileNumber?.includes(text) ||
        emp.designation?.toLowerCase().includes(text) ||
        emp.depot?.toLowerCase().includes(text) ||
        emp.badgeNumber?.toLowerCase().includes(text);

      const matchId = !filters.id || String(emp.employeeId).includes(filters.id);
      const matchName = !filters.name || emp.employeeName?.toLowerCase().includes(filters.name.toLowerCase());
      const matchDesig = filters.designation === 'ALL' || emp.designation === filters.designation;
      const matchDept = filters.department === 'ALL' || emp.department === filters.department;
      const matchDepot = filters.depot === 'ALL' || emp.depot === filters.depot;
      const matchRole = filters.role === 'ALL' || emp.role === filters.role;

      // Date status logic
      const todayStr = new Date().toISOString().split('T')[0];
      const matchComp = filters.competency === 'ALL' || 
        (filters.competency === 'EXPIRED' && emp.competencyValidTill && emp.competencyValidTill < todayStr) ||
        (filters.competency === 'VALID' && (!emp.competencyValidTill || emp.competencyValidTill >= todayStr));
      const matchMed = filters.medical === 'ALL' || 
        (filters.medical === 'EXPIRED' && emp.medicalValidTill && emp.medicalValidTill < todayStr) ||
        (filters.medical === 'VALID' && (!emp.medicalValidTill || emp.medicalValidTill >= todayStr));

      const matchActive = filters.operationalCrew === 'ALL' || 
        (filters.operationalCrew === 'ACTIVE' && emp.operationalCrew === 'YES') ||
        (filters.operationalCrew === 'INACTIVE' && emp.operationalCrew === 'NO');

      const matchStatus = filters.currentStatus === 'ALL' || emp.currentStatus === filters.currentStatus;
      const matchActiveUser = filters.activeUser === 'ALL' || 
        (filters.activeUser === 'YES' && emp.activeUser) ||
        (filters.activeUser === 'NO' && !emp.activeUser);

      return matchSearch && matchId && matchName && matchDesig && matchDept && matchDepot && matchRole && matchComp && matchMed && matchActive && matchStatus && matchActiveUser;
    });
  }, [employees, searchTerm, filters, userRole, currentUser]);

  const sortedFilteredEmployees = useMemo(() => {
    const items = [...filteredEmployees];
    items.sort((a, b) => {
      // 1. Sort by operationalCrew: active crew ('YES') first, inactive crew ('NO' etc.) below
      const aActive = a.operationalCrew === 'YES' ? 1 : 0;
      const bActive = b.operationalCrew === 'YES' ? 1 : 0;
      if (aActive !== bActive) {
        return bActive - aActive;
      }

      // 2. Sort by selection status
      const aSelected = selectedIds.includes(a.employeeId);
      const bSelected = selectedIds.includes(b.employeeId);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      // 3. Sort by configured column
      const aVal = String(a[sortConfig.key] || '');
      const bVal = String(b[sortConfig.key] || '');
      return sortConfig.direction === 'asc' 
        ? aVal.localeCompare(bVal, undefined, { numeric: true }) 
        : bVal.localeCompare(aVal, undefined, { numeric: true });
    });
    return items;
  }, [filteredEmployees, sortConfig, selectedIds]);

  // Pagination helper
  const paginatedEmployees = useMemo(() => {
    const startIdx = (currentPage - 1) * rowsPerPage;
    return sortedFilteredEmployees.slice(startIdx, startIdx + rowsPerPage);
  }, [sortedFilteredEmployees, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(sortedFilteredEmployees.length / rowsPerPage);

  // 13. Dashboard Statistics
  const dashboardStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let total = 0, operational = 0, inactive = 0, deleted = 0, medExp = 0, compExp = 0, avail = 0, activeUsers = 0;

    employees.forEach(e => {
      if (e.deleted) {
        deleted++;
      } else {
        total++;
        if (e.operationalCrew === 'YES') {
          operational++;
          // Mock available if not CL/EL/Absent/Rest
          if (!['CL', 'EL', 'ML', 'ABSENT (AB)', 'NOT REPORTING (NR)', 'REST'].includes(e.currentStatus)) {
            avail++;
          }
        } else {
          inactive++;
        }
        if (e.medicalValidTill && e.medicalValidTill < todayStr) medExp++;
        if (e.competencyValidTill && e.competencyValidTill < todayStr) compExp++;
        if (e.activeUser) activeUsers++;
      }
    });

    return {
      total,
      operational,
      inactive,
      deleted,
      medExp,
      compExp,
      avail,
      unavail: operational - avail,
      activeUsers
    };
  }, [employees]);

  return (
    <div className="font-mono text-slate-200 space-y-6">
      
      {/* 1. Master Stats Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
        {[
          { label: 'Total Database', val: dashboardStats.total, color: 'text-slate-300' },
          { label: '☑ Active Crew', val: dashboardStats.operational, color: 'text-emerald-400' },
          { label: '☐ Inactive', val: dashboardStats.inactive, color: 'text-slate-500' },
          { label: '🗑 Deleted', val: dashboardStats.deleted, color: 'text-rose-500' },
          { label: 'Medical Exp', val: dashboardStats.medExp, color: 'text-rose-400' },
          { label: 'Competency Exp', val: dashboardStats.compExp, color: 'text-orange-400' },
          { label: 'Relief Ready', val: dashboardStats.avail, color: 'text-cyan-400' },
          { label: 'On Leave/Off', val: dashboardStats.unavail, color: 'text-amber-500' },
          { label: 'Active Users', val: dashboardStats.activeUsers, color: 'text-indigo-400' }
        ].map((card, idx) => (
          <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col items-center justify-center text-center">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">{card.label}</span>
            <span className={`text-xl font-black ${card.color}`}>{card.val}</span>
          </div>
        ))}
      </div>

      {/* 2. Enterprise Data Management Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-950 p-2.5 rounded-lg border border-cyan-800/40 text-cyan-400">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-100">Enterprise Registry Commander</h2>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Firestore Project ID: pyidline2crew-41022</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* CRUD Commands */}
          <button
            onClick={openAddDialog}
            disabled={!canWrite}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-black px-3.5 py-2 rounded flex items-center gap-1.5 transition-colors"
          >
            <PlusCircle size={15} /> Add Employee
          </button>
          
           <button
            onClick={() => openEditDialog()}
            disabled={selectedIds.length !== 1 || (!canWrite && !(userRole === 'TRAIN_OPERATOR' && selectedIds.includes(currentUser.email?.split('@')[0] || '')))}
            className="bg-slate-800 hover:bg-slate-750 disabled:opacity-40 border border-slate-700 text-slate-200 font-bold px-3 py-2 rounded flex items-center gap-1.5 transition-colors"
          >
            <Edit size={14} /> Edit
          </button>

          <button
            onClick={() => {
              const target = employees.find(e => selectedIds.includes(e.employeeId));
              if (target) handleDeleteEmployee(target);
            }}
            disabled={selectedIds.length !== 1 || !canWrite}
            className="bg-rose-950 hover:bg-rose-900 disabled:opacity-40 border border-rose-800 text-rose-300 font-bold px-3 py-2 rounded flex items-center gap-1.5 transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>

          <button
            onClick={() => openViewDialog()}
            disabled={selectedIds.length !== 1}
            className="bg-slate-800 hover:bg-slate-750 disabled:opacity-40 border border-slate-700 text-slate-200 font-bold px-3 py-2 rounded flex items-center gap-1.5 transition-colors"
          >
            <Eye size={14} /> View
          </button>

          {/* Import/Export */}
          {canWrite && (
            <label className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold px-3 py-2 rounded flex items-center gap-1.5 cursor-pointer transition-colors" htmlFor="activecrewregistry-l1">
              <UploadCloud size={14} className="text-emerald-400" /> Import
              <input id="activecrewregistry-i1" name="activecrewregistry-i1" 
                type="file" 
                ref={importFileRef}
                accept=".xlsx, .xls"
                onChange={handleExcelUpload}
                className="hidden"
              />
            </label>
          )}

          <div className="relative group">
            <button className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-bold px-3 py-2 rounded flex items-center gap-1.5 transition-colors">
              <Download size={14} className="text-cyan-400" /> Export
            </button>
            <div className="absolute right-0 mt-1 bg-slate-900 border border-slate-800 rounded-lg shadow-2xl py-1 w-32 hidden group-hover:block z-20">
              {['EXCEL', 'CSV', 'PDF', 'JSON'].map(format => (
                <button
                  key={format}
                  onClick={() => handleExport(format)}
                  className="w-full text-left px-4 py-2 hover:bg-slate-800 text-slate-300 font-bold"
                >
                  {format} Format
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              setLoading(true);
              // reset filters
              setFilters({
                id: '',
                name: '',
                designation: 'ALL',
                department: 'ALL',
                depot: 'ALL',
                role: 'ALL',
                competency: 'ALL',
                medical: 'ALL',
                operationalCrew: 'ALL',
                currentStatus: 'ALL',
                deleted: 'NO',
                activeUser: 'ALL'
              });
              setSearchTerm('');
            }}
            className="p-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded text-slate-400 hover:text-slate-200"
            title="Refresh list"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
            className={`p-2 border rounded transition-colors ${showAdvancedSearch ? 'bg-cyan-950 border-cyan-800 text-cyan-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}
            title="Advanced Search & Filters"
          >
            <Search size={14} />
          </button>

          <button
            onClick={() => setShowBulkPanel(!showBulkPanel)}
            disabled={!canBulk}
            className={`p-2 border rounded transition-colors ${showBulkPanel ? 'bg-indigo-950 border-indigo-800 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 disabled:opacity-40'}`}
            title="Bulk Operations Deck"
          >
            <Sliders size={14} />
          </button>
        </div>
      </div>

      {/* 3. Advanced Search & Filters Panel */}
      {showAdvancedSearch && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l2">Employee ID</label>
            <input id="activecrewregistry-i2" name="activecrewregistry-i2"
              type="text"
              placeholder="Filter by ID..."
              value={filters.id}
              onChange={e => setFilters({ ...filters, id: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 focus:border-cyan-500 outline-none text-slate-300"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l3">Employee Name</label>
            <input id="activecrewregistry-i3" name="activecrewregistry-i3"
              type="text"
              placeholder="Filter by Name..."
              value={filters.name}
              onChange={e => setFilters({ ...filters, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 focus:border-cyan-500 outline-none text-slate-300"
            />
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l4">Designation</label>
            <select id="activecrewregistry-i4" name="activecrewregistry-i4"
              value={filters.designation}
              onChange={e => setFilters({ ...filters, designation: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="ALL">ALL DESIGNATIONS</option>
              <option value="Station Controller / Train Operator">Station Controller / Train Operator</option>
              <option value="Station Superintendent">Station Superintendent</option>
              <option value="Crew Controller">Crew Controller</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l5">Depot</label>
            <select id="activecrewregistry-i5" name="activecrewregistry-i5"
              value={filters.depot}
              onChange={e => setFilters({ ...filters, depot: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="ALL">ALL DEPOTS</option>
              <option value="Peenya Depot (PYID)">Peenya Depot (PYID)</option>
              <option value="Challaghatta Depot">Challaghatta Depot</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l6">Department</label>
            <select id="activecrewregistry-i6" name="activecrewregistry-i6"
              value={filters.department}
              onChange={e => setFilters({ ...filters, department: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="ALL">ALL DEPARTMENTS</option>
              <option value="Operations">Operations</option>
              <option value="HR">HR</option>
              <option value="Safety">Safety</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l7">Operational Crew (Status)</label>
            <select id="activecrewregistry-i7" name="activecrewregistry-i7"
              value={filters.operationalCrew}
              onChange={e => setFilters({ ...filters, operationalCrew: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="ALL">ALL OPERATIONAL CREW</option>
              <option value="ACTIVE">ACTIVE CREW</option>
              <option value="INACTIVE">INACTIVE MASTER</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l8">Medical Validity</label>
            <select id="activecrewregistry-i8" name="activecrewregistry-i8"
              value={filters.medical}
              onChange={e => setFilters({ ...filters, medical: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="ALL">ALL MEDICAL RECORDS</option>
              <option value="VALID">VALID ONLY</option>
              <option value="EXPIRED">EXPIRED ONLY</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l9">Competency Validity</label>
            <select id="activecrewregistry-i9" name="activecrewregistry-i9"
              value={filters.competency}
              onChange={e => setFilters({ ...filters, competency: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="ALL">ALL COMPETENCY RECORDS</option>
              <option value="VALID">VALID ONLY</option>
              <option value="EXPIRED">EXPIRED ONLY</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l10">Roster Archive View</label>
            <select id="activecrewregistry-i10" name="activecrewregistry-i10"
              value={filters.deleted}
              onChange={e => setFilters({ ...filters, deleted: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="NO">ACTIVE EMPLOYEES ONLY</option>
              <option value="YES">SOFT-DELETED / ARCHIVED</option>
              <option value="ALL">ALL REGISTRY DATA</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l11">User Account Access</label>
            <select id="activecrewregistry-i11" name="activecrewregistry-i11"
              value={filters.activeUser}
              onChange={e => setFilters({ ...filters, activeUser: e.target.value })}
              className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
            >
              <option value="ALL">ALL USERS</option>
              <option value="YES">ENABLED LOGINS</option>
              <option value="NO">DISABLED LOGINS</option>
            </select>
          </div>
        </div>
      )}

      {/* 4. Bulk Operations Panel */}
      {showBulkPanel && (
        <form onSubmit={handleBulkSubmit} className="bg-slate-900 border border-indigo-900 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-2">
            <h4 className="text-xs font-black uppercase text-indigo-400 flex items-center gap-1.5">
              <Sliders size={15} /> Bulk Command Deck ({selectedIds.length} employees selected)
            </h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1">
              <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l12">Select Operations Command</label>
              <select id="activecrewregistry-i12" name="activecrewregistry-i12"
                value={bulkFields.action}
                onChange={e => setBulkFields({ ...bulkFields, action: e.target.value })}
                className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
              >
                <option value="">-- SELECT COMMAND --</option>
                <option value="ACTIVATE">☑ BULK ACTIVATE OPERATIONAL STATUS</option>
                <option value="DEACTIVATE">☐ BULK DEACTIVATE OPERATIONAL STATUS</option>
                <option value="DELETE">🗑 BULK SOFT DELETE</option>
                <option value="RESTORE">🔄 BULK RESTORE DELETED</option>
                <option value="UPDATE_DEPOT">UPDATE DEPOT</option>
                <option value="UPDATE_ROLE">UPDATE ROLE</option>
                <option value="UPDATE_DESIGNATION">UPDATE DESIGNATION</option>
                <option value="UPDATE_DEPARTMENT">UPDATE DEPARTMENT</option>
                <option value="UPDATE_MOBILE">UPDATE MOBILE (SINGLE ONLY)</option>
                <option value="UPDATE_EMAIL">UPDATE EMAIL (SINGLE ONLY)</option>
              </select>
            </div>

            {bulkFields.action === 'UPDATE_DEPOT' && (
              <div className="space-y-1">
                <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l13">Depot Destination</label>
                <select id="activecrewregistry-i13" name="activecrewregistry-i13"
                  value={bulkFields.depot}
                  onChange={e => setBulkFields({ ...bulkFields, depot: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
                >
                  <option value="">-- SELECT DEPOT --</option>
                  <option value="Peenya Depot (PYID)">Peenya Depot (PYID)</option>
                  <option value="Challaghatta Depot">Challaghatta Depot</option>
                </select>
              </div>
            )}

            {bulkFields.action === 'UPDATE_ROLE' && (
              <div className="space-y-1">
                <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l14">Role Destination</label>
                <select id="activecrewregistry-i14" name="activecrewregistry-i14"
                  value={bulkFields.role}
                  onChange={e => setBulkFields({ ...bulkFields, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
                >
                  <option value="">-- SELECT ROLE --</option>
                  <option value="Train Operator">Train Operator</option>
                  <option value="Station Controller">Station Controller</option>
                  <option value="Station Superintendent">Station Superintendent</option>
                  <option value="Crew Controller">Crew Controller</option>
                </select>
              </div>
            )}

            {bulkFields.action === 'UPDATE_DESIGNATION' && (
              <div className="space-y-1">
                <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l15">Designation Destination</label>
                <select id="activecrewregistry-i15" name="activecrewregistry-i15"
                  value={bulkFields.designation}
                  onChange={e => setBulkFields({ ...bulkFields, designation: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
                >
                  <option value="">-- SELECT DESIGNATION --</option>
                  <option value="Station Controller / Train Operator">Station Controller / Train Operator</option>
                  <option value="Station Superintendent">Station Superintendent</option>
                  <option value="Crew Controller">Crew Controller</option>
                </select>
              </div>
            )}

            {bulkFields.action === 'UPDATE_DEPARTMENT' && (
              <div className="space-y-1">
                <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l16">Department Name</label>
                <input id="activecrewregistry-i16" name="activecrewregistry-i16"
                  type="text"
                  placeholder="e.g. Operations"
                  value={bulkFields.department}
                  onChange={e => setBulkFields({ ...bulkFields, department: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
                />
              </div>
            )}

            {bulkFields.action === 'UPDATE_MOBILE' && (
              <div className="space-y-1">
                <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l17">New Mobile Number (10 digits)</label>
                <input id="activecrewregistry-i17" name="activecrewregistry-i17"
                  type="text"
                  placeholder="e.g. 9110238017"
                  value={bulkFields.mobileNumber}
                  onChange={e => setBulkFields({ ...bulkFields, mobileNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
                />
              </div>
            )}

            {bulkFields.action === 'UPDATE_EMAIL' && (
              <div className="space-y-1">
                <label className="text-slate-500 font-bold block" htmlFor="activecrewregistry-l18">New Email Address</label>
                <input id="activecrewregistry-i18" name="activecrewregistry-i18"
                  type="email"
                  placeholder="e.g. mail@domain.com"
                  value={bulkFields.email}
                  onChange={e => setBulkFields({ ...bulkFields, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-850 rounded p-2 text-slate-300"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-slate-950 font-black px-6 py-2 rounded uppercase tracking-wider transition-colors text-[10px]"
            >
              Execute Command
            </button>
          </div>
        </form>
      )}

      {/* Selected Employee Provisioning Console */}
      {selectedIds.length === 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 border-b border-slate-850 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/40 px-2 py-0.5 rounded font-black tracking-widest uppercase">
                  Selected Profile ID: #{selectedIds[0]}
                </span>
                <span className="text-slate-100 font-bold text-xs">
                  {employees.find(e => e.employeeId === selectedIds[0])?.employeeName}
                </span>
                <span className="text-[9px] bg-slate-950 text-slate-450 border border-slate-850 px-1.5 py-0.2 rounded font-mono uppercase">
                  Role: {employees.find(e => e.employeeId === selectedIds[0])?.role}
                </span>
              </div>
              <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-widest">
                Enterprise Account Administration & Real-time Provisioning Console
              </p>
            </div>
            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 text-[9px] font-black tracking-wider">
              <button
                type="button"
                onClick={async () => {
                  const emp = employees.find(e => e.employeeId === selectedIds[0]);
                  if (emp) {
                    try {
                      await provisioningService.provisionEmployee({ ...emp, operationalCrew: 'YES' }, currentUser.displayName || currentUser.email);
                      alert(`Account #${emp.employeeId} has been successfully provisioned & activated in Firebase!`);
                    } catch (e) {
                      alert("Provisioning failed: " + e.message);
                    }
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all"
              >
                Activate Account
              </button>
              
              <button
                type="button"
                onClick={async () => {
                  const emp = employees.find(e => e.employeeId === selectedIds[0]);
                  if (emp) {
                    if (emp.employeeId === '20726') return alert("SUPER_ADMIN role cannot be deactivated.");
                    try {
                      await provisioningService.provisionEmployee({ ...emp, operationalCrew: 'NO' }, currentUser.displayName || currentUser.email);
                      alert(`Account #${emp.employeeId} has been deactivated & login disabled.`);
                    } catch (e) {
                      alert("Deactivation failed: " + e.message);
                    }
                  }
                }}
                className="bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-350 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all"
              >
                Deactivate Account
              </button>

              <button
                type="button"
                onClick={async () => {
                  const emp = employees.find(e => e.employeeId === selectedIds[0]);
                  if (emp) {
                    try {
                      await provisioningService.resetPasswordForce(emp.employeeId, currentUser.displayName || currentUser.email);
                      alert(`Password reset forced. Default password "12345678" set, user must reset on first login.`);
                    } catch (e) {
                      alert("Failed to force reset password: " + e.message);
                    }
                  }
                }}
                className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/20 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all"
              >
                Reset Password
              </button>

              <button
                type="button"
                onClick={async () => {
                  const emp = employees.find(e => e.employeeId === selectedIds[0]);
                  if (emp) {
                    try {
                      await provisioningService.unlockAccount(emp.employeeId, currentUser.displayName || currentUser.email);
                      alert(`Account #${emp.employeeId} unlocked successfully and blocked devices cleared.`);
                    } catch (e) {
                      alert("Failed to unlock: " + e.message);
                    }
                  }
                }}
                className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all"
              >
                Unlock Account
              </button>

              <button
                type="button"
                onClick={async () => {
                  const emp = employees.find(e => e.employeeId === selectedIds[0]);
                  if (emp) {
                    if (emp.employeeId === '20726') return alert("SUPER_ADMIN role cannot be deactivated.");
                    try {
                      await import('firebase/firestore').then(({ doc: fdoc, updateDoc }) => 
                        updateDoc(fdoc(db, 'userAccessControl', emp.employeeId), { canLogin: false, active: false })
                      );
                      alert(`Login disabled for #${emp.employeeId}`);
                    } catch (e) {
                      alert("Failed to disable login: " + e.message);
                    }
                  }
                }}
                className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all"
              >
                Disable Login
              </button>
              
              <div className="relative group">
                <button type="button" className="bg-cyan-650/10 hover:bg-cyan-650/20 text-cyan-400 border border-cyan-500/20 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all flex items-center gap-1">
                  Assign Role ▾
                </button>
                <div className="absolute right-0 mt-1 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl py-1 w-44 hidden group-hover:block z-25 text-left">
                  {['SUPER_ADMIN', 'ADMIN', 'ADMIN_SS', 'CREW_CONTROLLER', 'STATION_CONTROLLER', 'ALS', 'TRAIN_OPERATOR', 'VIEWER'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={async () => {
                        const emp = employees.find(e => e.employeeId === selectedIds[0]);
                        if (emp) {
                          if (emp.employeeId === '20726') return alert("SUPER_ADMIN role cannot be downgraded.");
                          try {
                            await import('firebase/firestore').then(({ doc: fdoc, updateDoc, setDoc }) => Promise.all([
                              updateDoc(fdoc(db, 'crewRegistry', emp.employeeId), { role: r }),
                              updateDoc(fdoc(db, 'users', emp.employeeId), { role: r }),
                              setDoc(fdoc(db, 'userPermissions', emp.employeeId), { employeeId: emp.employeeId, permissions: getRoleDefaultPermissions(r) }, { merge: true })
                            ]));
                            const qSystem = query(collection(db, 'system_users'), where('employeeId', '==', emp.employeeId));
                            const snapSystem = await getDocs(qSystem);
                            if (!snapSystem.empty) {
                              await updateDoc(doc(db, 'system_users', snapSystem.docs[0].id), { role: r });
                            }
                            alert(`Role changed to ${r} successfully.`);
                          } catch (e) {
                            alert("Failed to change role: " + e.message);
                          }
                        }
                      }}
                      className="w-full px-3 py-1.5 hover:bg-slate-900 text-slate-300 font-bold hover:text-white"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const emp = employees.find(e => e.employeeId === selectedIds[0]);
                  if (emp) {
                    const permDoc = await getDoc(doc(db, 'userPermissions', emp.employeeId));
                    if (permDoc.exists()) {
                      setRegistryEmpPermissions(permDoc.data().permissions || {});
                    } else {
                      setRegistryEmpPermissions(getRoleDefaultPermissions(emp.role || 'Train Operator'));
                    }
                    setShowPermissionsModal(true);
                  }
                }}
                className="bg-indigo-650/10 hover:bg-indigo-650/20 text-indigo-400 border border-indigo-500/20 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all"
              >
                View Permissions
              </button>

              <button
                type="button"
                onClick={async () => {
                  const emp = employees.find(e => e.employeeId === selectedIds[0]);
                  if (emp) {
                    const logsQ = query(collection(db, 'auditLogs'), where('employeeId', '==', emp.employeeId), orderBy('timestamp', 'desc'));
                    const snap = await getDocs(logsQ);
                    setRegistryAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    setActiveAuditEmpId(emp.employeeId);
                    setActiveAuditEmpName(emp.employeeName);
                    setShowRegistryAuditModal(true);
                  }
                }}
                className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 px-2.5 py-1.5 rounded uppercase tracking-wider transition-all"
              >
                Audit History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Main Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
            <LayoutGrid size={15} /> Crew Directory Matrix
          </h3>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input id="activecrewregistry-i19" name="activecrewregistry-i19"
              type="text"
              placeholder="Search registry..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded pl-8 pr-3 py-1.5 focus:border-cyan-500 outline-none text-xs text-slate-200"
            />
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[60vh] relative">
          {loading ? (
            <div className="text-center py-12 text-slate-500 animate-pulse uppercase tracking-wider text-xs">
              Synchronizing with Firestore Database...
            </div>
          ) : sortedFilteredEmployees.length === 0 ? (
            <div className="text-center py-12 text-slate-500 italic uppercase tracking-wider text-xs">
              No matching employee records found in master registry.
            </div>
          ) : (
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="text-[10px] text-slate-500 uppercase tracking-widest sticky top-0 bg-slate-950 z-10">
                <tr className="border-b border-slate-850">
                  <th className="p-3 text-center">
                    <input id="activecrewregistry-i20" name="activecrewregistry-i20"
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === sortedFilteredEmployees.length}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(sortedFilteredEmployees.map(x => x.employeeId));
                        else setSelectedIds([]);
                      }}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                    />
                  </th>
                  <th className="p-3 text-center">☑ Active</th>
                  <th className="p-3 cursor-pointer" onClick={() => requestSort('employeeId')}>Employee ID <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-3 cursor-pointer" onClick={() => requestSort('employeeName')}>Employee Name <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-3">Designation</th>
                  <th className="p-3 cursor-pointer" onClick={() => requestSort('mobileNumber')}>Mobile Number <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-3 cursor-pointer" onClick={() => requestSort('email')}>Email ID <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-3 text-center">Competency Valid</th>
                  <th className="p-3 text-center">Medical Valid</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {paginatedEmployees.map((emp, empIdx) => {
                  const todayStr = new Date().toISOString().split('T')[0];
                  const isMedExp = emp.medicalValidTill && emp.medicalValidTill < todayStr;
                  const isCompExp = emp.competencyValidTill && emp.competencyValidTill < todayStr;
                  const isSelected = selectedIds.includes(emp.employeeId);

                  return (
                    <tr 
                      key={emp.id || (emp.employeeId ? `emp_${emp.employeeId}_${empIdx}` : `emp_row_${empIdx}`)} 
                      className={`hover:bg-slate-950/40 transition-colors ${emp.deleted ? 'bg-rose-950/5 opacity-55' : emp.operationalCrew !== 'YES' ? 'opacity-55' : ''}`}
                    >
                      <td className="p-3 text-center">
                        <input id="activecrewregistry-i21" name="activecrewregistry-i21"
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) setSelectedIds([...selectedIds, emp.employeeId]);
                            else setSelectedIds(selectedIds.filter(x => x !== emp.employeeId));
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                        />
                      </td>
                      <td className="p-3 text-center">
                        <input id="activecrewregistry-i22" name="activecrewregistry-i22"
                          type="checkbox"
                          checked={emp.operationalCrew === 'YES'}
                          onChange={e => toggleActiveCheckbox(emp, e.target.checked)}
                          disabled={!canWrite || emp.deleted}
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 h-4.5 w-4.5 cursor-pointer disabled:opacity-40"
                        />
                      </td>
                      <td className="p-3 font-bold text-cyan-400">#{emp.employeeId}</td>
                      <td className="p-3 font-bold text-slate-100">{emp.employeeName}</td>
                      <td className="p-3 text-slate-400">{emp.designation}</td>
                      <td className="p-3 text-slate-400 font-mono">{emp.mobileNumber || '--'}</td>
                      <td className="p-3 text-slate-400 font-mono">{emp.email || '--'}</td>
                      <td className="p-3 text-center">
                        {emp.competencyValidTill ? (
                          isCompExp 
                            ? <span className="text-rose-400 font-bold bg-rose-950/20 border border-rose-500/30 px-2 py-0.5 rounded text-[9px]">EXPIRED</span>
                            : <span className="text-emerald-400 font-bold bg-emerald-950/20 border border-emerald-500/30 px-2 py-0.5 rounded text-[9px]">{emp.competencyValidTill}</span>
                        ) : <span className="text-slate-650">N/A</span>}
                      </td>
                      <td className="p-3 text-center">
                        {emp.medicalValidTill ? (
                          isMedExp 
                            ? <span className="text-rose-400 font-bold bg-rose-950/20 border border-rose-500/30 px-2 py-0.5 rounded text-[9px]">EXPIRED</span>
                            : <span className="text-emerald-400 font-bold bg-emerald-950/20 border border-emerald-500/30 px-2 py-0.5 rounded text-[9px]">{emp.medicalValidTill}</span>
                        ) : <span className="text-slate-650">N/A</span>}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                          emp.currentStatus === 'WO' ? 'bg-purple-950 text-purple-400' :
                          ['CL', 'EL', 'ML'].includes(emp.currentStatus) ? 'bg-cyan-950 text-cyan-400' :
                          'bg-slate-950 text-slate-400'
                        }`}>{emp.currentStatus || 'DUTY'}</span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button 
                          onClick={() => openViewDialog(emp)} 
                          className="text-slate-400 hover:text-slate-200"
                          title="View Profile Details"
                        >
                          <Eye size={13} />
                        </button>
                         {!emp.deleted && (
                          <>
                            {(canWrite || (userRole === 'TRAIN_OPERATOR' && String(emp.employeeId) === String(currentUser.email?.split('@')[0] || ''))) && (
                              <button 
                                onClick={() => openEditDialog(emp)} 
                                className="text-cyan-400 hover:text-cyan-300"
                                title="Edit Employee details"
                              >
                                <Edit size={13} />
                              </button>
                            )}
                            {canWrite && (
                              <button 
                                onClick={() => handleDeleteEmployee(emp)} 
                                className="text-rose-400 hover:text-rose-300"
                                title="Soft Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </>
                        )}
                        {canWrite && emp.deleted && (
                          <button 
                            onClick={() => handleRestoreEmployee(emp)} 
                            className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-0.5 inline-block text-[9px] border border-emerald-500/30 px-1 py-0.2 rounded"
                          >
                            <RotateCcw size={10} /> Restore
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pager controls */}
        <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-between items-center text-xs">
          <div className="flex items-center gap-3">
            <span className="text-slate-500 font-bold">
              Showing {currentPage * rowsPerPage - rowsPerPage + 1} - {Math.min(currentPage * rowsPerPage, sortedFilteredEmployees.length)} of {sortedFilteredEmployees.length} records
            </span>
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 rounded px-2 py-0.5 text-slate-400">
              <span className="text-[10px] text-slate-500 font-bold uppercase">Rows:</span>
              <select id="activecrewregistry-i23" name="activecrewregistry-i23"
                value={rowsPerPage}
                onChange={e => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-transparent border-none text-cyan-400 font-bold outline-none cursor-pointer text-xs"
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="500">500</option>
                <option value="1000">All (1000)</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button 
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(currentPage - 1)}
              className="p-1 bg-slate-900 border border-slate-800 rounded disabled:opacity-50 text-slate-400"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="font-bold text-slate-300">Page {currentPage} of {totalPages || 1}</span>
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage(currentPage + 1)}
              className="p-1 bg-slate-900 border border-slate-800 rounded disabled:opacity-50 text-slate-400"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 6. Real-time Audit Logs View */}
      {!isTrainOperator && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-850 pb-2 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-400" /> Database Registry Operational Audit Log
          </h3>
          <div className="max-h-[220px] overflow-y-auto space-y-2 text-[10px]">
            {auditLogs.length === 0 ? (
              <div className="text-center py-6 text-slate-650 italic uppercase">No log entries logged in audit registry.</div>
            ) : (
              auditLogs.map((log, idx) => (
                <div key={log.id || `audit_${idx}`} className="bg-slate-950 border border-slate-850 p-2.5 rounded flex flex-col md:flex-row justify-between md:items-center text-slate-400 gap-2">
                  <div>
                    <span className="font-bold text-cyan-400">#{log.employeeId} {log.employeeName}</span>
                    <span className="mx-2 text-indigo-400">[{log.action}]</span>
                    {log.reason && <p className="text-slate-550 inline italic">({log.reason})</p>}
                    <div className="text-slate-600 block mt-1 font-bold">
                      Change: <span className="text-rose-500/80">{log.oldValue || 'None'}</span> ➔ <span className="text-emerald-400">{log.newValue || 'None'}</span>
                    </div>
                  </div>
                  <div className="text-left md:text-right border-t md:border-t-0 border-slate-850 pt-2 md:pt-0">
                    <span className="font-bold text-slate-300 block text-[9px] uppercase tracking-wide">User: {log.changedBy}</span>
                    <span className="text-[9px] text-slate-550 block mt-0.5">{log.date} @ {log.time}</span>
                    <span className="text-[8px] text-slate-600 block italic">{log.device?.substring(0, 40)}...</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT EMPLOYEE DIALOG MODAL */}
      {/* ========================================================================= */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-30">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                <PlusCircle size={17} /> {showAddModal ? "Add New Employee Profile" : `Edit Profile #${selectedEmployee?.employeeId}`}
              </h3>
              <button 
                onClick={() => {
                  setShowAddModal(false);
                  setShowEditModal(false);
                }} 
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* Tabs Selector */}
            <div className="flex bg-slate-950/50 border-b border-slate-850 text-xs">
              {[
                { id: 'personal', label: '1. Personal Profile' },
                { id: 'operational', label: '2. Operational Roles' },
                { id: 'system', label: '3. System Credentials' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id)}
                  className={`flex-1 py-3 text-center font-bold transition-colors ${modalTab === tab.id ? 'bg-slate-900 text-cyan-400 border-b-2 border-cyan-500' : 'text-slate-500 hover:text-slate-350'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={showAddModal ? handleAddEmployee : handleEditEmployee} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              
              {/* Tab 1: Personal Info */}
              {modalTab === 'personal' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l19">Employee ID (digits only)*</label>
                    <input id="activecrewregistry-i24" name="activecrewregistry-i24"
                      type="text"
                      required
                      disabled={showEditModal} // ID cannot be updated on edit
                      placeholder="e.g. 20726"
                      value={formFields.employeeId}
                      onChange={e => setFormFields({ ...formFields, employeeId: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l20">Employee Name*</label>
                    <input id="activecrewregistry-i25" name="activecrewregistry-i25"
                      type="text"
                      required
                      disabled={isFieldDisabled('employeeName')}
                      placeholder="e.g. NAGESHA N"
                      value={formFields.employeeName}
                      onChange={e => setFormFields({ ...formFields, employeeName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l21">Mobile Contact Number*</label>
                    <input id="activecrewregistry-i26" name="activecrewregistry-i26"
                      type="text"
                      required
                      disabled={isFieldDisabled('mobileNumber')}
                      placeholder="10-digit mobile number"
                      value={formFields.mobileNumber}
                      onChange={e => setFormFields({ ...formFields, mobileNumber: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l22">Email Address</label>
                    <input id="activecrewregistry-i27" name="activecrewregistry-i27"
                      type="email"
                      disabled={isFieldDisabled('email')}
                      placeholder="e.g. email@bmrc.co.in"
                      value={formFields.email}
                      onChange={e => setFormFields({ ...formFields, email: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l23">Blood Group</label>
                    <select id="activecrewregistry-i28" name="activecrewregistry-i28"
                      value={formFields.bloodGroup}
                      disabled={isFieldDisabled('bloodGroup')}
                      onChange={e => setFormFields({ ...formFields, bloodGroup: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 text-slate-300 focus:border-cyan-500 outline-none disabled:opacity-40"
                    >
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l24">Emergency Contact Number</label>
                    <input id="activecrewregistry-i29" name="activecrewregistry-i29"
                      type="text"
                      disabled={isFieldDisabled('emergencyContact')}
                      placeholder="Secondary contact number"
                      value={formFields.emergencyContact}
                      onChange={e => setFormFields({ ...formFields, emergencyContact: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l25">Photo Asset Link URL</label>
                    <input id="activecrewregistry-i30" name="activecrewregistry-i30"
                      type="text"
                      disabled={isFieldDisabled('photo')}
                      placeholder="e.g. /assets/photos/emp20726.jpg"
                      value={formFields.photo}
                      onChange={e => setFormFields({ ...formFields, photo: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Operational Info */}
              {modalTab === 'operational' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l26">Designation*</label>
                    <select id="activecrewregistry-i31" name="activecrewregistry-i31"
                      value={formFields.designation}
                      disabled={isFieldDisabled('designation')}
                      onChange={e => setFormFields({ ...formFields, designation: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 text-slate-300 focus:border-cyan-500 outline-none disabled:opacity-40"
                    >
                      <option value="Station Controller / Train Operator">Station Controller / Train Operator</option>
                      <option value="Station Superintendent">Station Superintendent</option>
                      <option value="Crew Controller">Crew Controller</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l27">Depot*</label>
                    <select id="activecrewregistry-i32" name="activecrewregistry-i32"
                      value={formFields.depot}
                      disabled={isFieldDisabled('depot')}
                      onChange={e => setFormFields({ ...formFields, depot: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 text-slate-300 focus:border-cyan-500 outline-none disabled:opacity-40"
                    >
                      <option value="Peenya Depot (PYID)">Peenya Depot (PYID)</option>
                      <option value="Challaghatta Depot">Challaghatta Depot</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l28">Department*</label>
                    <input id="activecrewregistry-i33" name="activecrewregistry-i33"
                      type="text"
                      required
                      disabled={isFieldDisabled('department')}
                      placeholder="e.g. Operations"
                      value={formFields.department}
                      onChange={e => setFormFields({ ...formFields, department: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l29">Badge Number Reference</label>
                    <input id="activecrewregistry-i34" name="activecrewregistry-i34"
                      type="text"
                      disabled={isFieldDisabled('badgeNumber')}
                      placeholder="Leave blank for auto B-[ID]"
                      value={formFields.badgeNumber}
                      onChange={e => setFormFields({ ...formFields, badgeNumber: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l30">Competency Certificate No</label>
                    <input id="activecrewregistry-i35" name="activecrewregistry-i35"
                      type="text"
                      disabled={isFieldDisabled('competencyNumber')}
                      placeholder="Leave blank for auto C-[ID]"
                      value={formFields.competencyNumber}
                      onChange={e => setFormFields({ ...formFields, competencyNumber: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l31">Competency Validity Date</label>
                    <input id="activecrewregistry-i36" name="activecrewregistry-i36"
                      type="date"
                      disabled={isFieldDisabled('competencyValidTill')}
                      value={formFields.competencyValidTill}
                      onChange={e => setFormFields({ ...formFields, competencyValidTill: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-300 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l32">Medical Validity Date</label>
                    <input id="activecrewregistry-i37" name="activecrewregistry-i37"
                      type="date"
                      disabled={isFieldDisabled('medicalValidTill')}
                      value={formFields.medicalValidTill}
                      onChange={e => setFormFields({ ...formFields, medicalValidTill: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-300 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l33">Date of Joining (DOJ)</label>
                    <input id="activecrewregistry-i38" name="activecrewregistry-i38"
                      type="date"
                      disabled={isFieldDisabled('doj')}
                      value={formFields.doj}
                      onChange={e => setFormFields({ ...formFields, doj: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-300 disabled:opacity-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l34">Retirement Date</label>
                    <input id="activecrewregistry-i39" name="activecrewregistry-i39"
                      type="date"
                      disabled={isFieldDisabled('retirementDate')}
                      value={formFields.retirementDate}
                      onChange={e => setFormFields({ ...formFields, retirementDate: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-300 disabled:opacity-40"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input name="activecrewregistry-i40"
                      type="checkbox"
                      id="form-operational"
                      disabled={isFieldDisabled('operationalCrew')}
                      checked={formFields.operationalCrew === 'YES'}
                      onChange={e => setFormFields({ ...formFields, operationalCrew: e.target.checked ? 'YES' : 'NO' })}
                      className="rounded border-slate-750 bg-slate-950 text-emerald-500 focus:ring-emerald-500 h-5 w-5 cursor-pointer disabled:opacity-40"
                    />
                    <label htmlFor="form-operational" className="text-slate-300 font-bold cursor-pointer">
                      ☑ Include in Active Operations Crew List
                    </label>
                  </div>
                </div>
              )}

              {/* Tab 3: System Accounts */}
              {modalTab === 'system' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l35">Roster Log Status</label>
                    <select id="activecrewregistry-i41" name="activecrewregistry-i41"
                      value={formFields.currentStatus}
                      disabled={isFieldDisabled('currentStatus')}
                      onChange={e => setFormFields({ ...formFields, currentStatus: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 text-slate-300 focus:border-cyan-500 outline-none disabled:opacity-40"
                    >
                      <option value="DUTY">DUTY</option>
                      <option value="WO">WEEKLY OFF (WO)</option>
                      <option value="CL">CASUAL LEAVE (CL)</option>
                      <option value="EL">EARNED LEAVE (EL)</option>
                      <option value="ML">MEDICAL LEAVE (ML)</option>
                      <option value="ABSENT (AB)">ABSENT (AB)</option>
                      <option value="REST">REST</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold block" htmlFor="activecrewregistry-l36">Internal Audit Remarks</label>
                    <input id="activecrewregistry-i42" name="activecrewregistry-i42"
                      type="text"
                      disabled={isFieldDisabled('remarks')}
                      placeholder="e.g. Added manually via DB Deck"
                      value={formFields.remarks}
                      onChange={e => setFormFields({ ...formFields, remarks: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-750 rounded p-2.5 focus:border-cyan-500 outline-none text-slate-200 disabled:opacity-40"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input name="activecrewregistry-i43"
                      type="checkbox"
                      id="form-active-user"
                      disabled={isFieldDisabled('activeUser')}
                      checked={formFields.activeUser}
                      onChange={e => setFormFields({ ...formFields, activeUser: e.target.checked })}
                      className="rounded border-slate-750 bg-slate-950 text-indigo-500 focus:ring-indigo-500 h-5 w-5 cursor-pointer disabled:opacity-40"
                    />
                    <label htmlFor="form-active-user" className="text-slate-300 font-bold cursor-pointer">
                      ☑ Active User account (Can Login to PWA)
                    </label>
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input name="activecrewregistry-i44"
                      type="checkbox"
                      id="form-system-user"
                      disabled={isFieldDisabled('systemUser')}
                      checked={formFields.systemUser}
                      onChange={e => setFormFields({ ...formFields, systemUser: e.target.checked })}
                      className="rounded border-slate-750 bg-slate-950 text-indigo-500 focus:ring-indigo-500 h-5 w-5 cursor-pointer disabled:opacity-40"
                    />
                    <label htmlFor="form-system-user" className="text-slate-300 font-bold cursor-pointer">
                      ☑ System Admin permissions
                    </label>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-950/20 -mx-6 -mb-6 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setShowEditModal(false);
                  }}
                  className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold px-5 py-2.5 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-black px-8 py-2.5 rounded transition-colors flex items-center gap-1.5"
                >
                  <Save size={15} /> Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAIL PROFILE VIEW MODAL */}
      {/* ========================================================================= */}
      {showViewModal && selectedEmployee && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-30">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-xl w-full flex flex-col">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                <Users size={16} /> Employee Registry File: #{selectedEmployee.employeeId}
              </h3>
              <button onClick={() => setShowViewModal(false)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 text-xs">
              <div className="flex items-center gap-4 border-b border-slate-850 pb-4">
                <div className="h-16 w-16 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-center overflow-hidden">
                  {selectedEmployee.photo ? (
                    <img src={selectedEmployee.photo} alt="Photo" className="h-full w-full object-cover" />
                  ) : (
                    <Users size={28} className="text-slate-700" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-100 uppercase">{selectedEmployee.employeeName}</h4>
                  <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">{selectedEmployee.designation}</p>
                  <span className="text-[8.5px] bg-slate-950 text-slate-500 border border-slate-850 px-1.5 py-0.5 rounded uppercase mt-1 inline-block">
                    Depot: {selectedEmployee.depot}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {[
                  { label: 'Mobile Number', val: selectedEmployee.mobileNumber },
                  { label: 'Email Address', val: selectedEmployee.email || 'N/A' },
                  { label: 'Department', val: selectedEmployee.department || 'Operations' },
                  { label: 'Designated Role', val: selectedEmployee.role || 'Train Operator' },
                  { label: 'Badge Reference', val: selectedEmployee.badgeNumber },
                  { label: 'Competency Number', val: selectedEmployee.competencyNumber },
                  { label: 'Competency Valid', val: selectedEmployee.competencyValidTill || 'N/A' },
                  { label: 'Medical Valid', val: selectedEmployee.medicalValidTill || 'N/A' },
                  { label: 'Date of Joining', val: selectedEmployee.doj || 'N/A' },
                  { label: 'Retirement Date', val: selectedEmployee.retirementDate || 'N/A' },
                  { label: 'Blood Group', val: selectedEmployee.bloodGroup || 'N/A' },
                  { label: 'Emergency Contact', val: selectedEmployee.emergencyContact || 'N/A' },
                  { label: 'Roster Operational Status', val: selectedEmployee.operationalCrew === 'YES' ? 'ACTIVE CREW' : 'INACTIVE/STANDBY' },
                  { label: 'Login Access (PWA)', val: selectedEmployee.activeUser ? 'ENABLED' : 'DISABLED' },
                  { label: 'System Admin Perms', val: selectedEmployee.systemUser ? 'YES' : 'NO' },
                  { label: 'Current Duty Roster Status', val: selectedEmployee.currentStatus || 'DUTY' }
                ].map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <span className="text-[8.5px] text-slate-550 font-bold uppercase tracking-wider block">{item.label}</span>
                    <span className="text-slate-200 font-bold block">{item.val}</span>
                  </div>
                ))}
              </div>

              {selectedEmployee.remarks && (
                <div className="bg-slate-950/60 border border-slate-850 p-2.5 rounded text-[10px] text-slate-400 italic">
                  Remarks: {selectedEmployee.remarks}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => setShowViewModal(false)}
                className="bg-slate-850 hover:bg-slate-800 text-slate-300 font-bold px-6 py-2 rounded"
              >
                Close File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EXCEL IMPORT PREVIEW DIALOG MODAL */}
      {/* ========================================================================= */}
      {showImportPreview && importPreview && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-35">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-3xl w-full flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <FileSpreadsheet size={17} /> Excel Import Data sync Preview
              </h3>
              <button 
                onClick={() => {
                  setShowImportPreview(false);
                  setImportPreview(null);
                  if (importFileRef.current) importFileRef.current.value = "";
                }} 
                className="text-slate-400 hover:text-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="bg-emerald-950/20 border border-emerald-500/25 p-3 rounded-lg">
                  <span className="text-[9px] text-emerald-400 font-bold block uppercase">NEW TO CREATE</span>
                  <span className="text-2xl font-black text-emerald-400">{importPreview.newDocs.length}</span>
                </div>
                <div className="bg-cyan-950/20 border border-cyan-500/25 p-3 rounded-lg">
                  <span className="text-[9px] text-cyan-400 font-bold block uppercase">TO UPDATE</span>
                  <span className="text-2xl font-black text-cyan-400">{importPreview.updateDocs.length}</span>
                </div>
                <div className="bg-slate-950/40 border border-slate-800 p-3 rounded-lg">
                  <span className="text-[9px] text-slate-500 font-bold block uppercase">UNCHANGED/DUPE</span>
                  <span className="text-2xl font-black text-slate-400">{importPreview.duplicateCount}</span>
                </div>
                <div className="bg-rose-950/20 border border-rose-500/25 p-3 rounded-lg">
                  <span className="text-[9px] text-rose-400 font-bold block uppercase">MISSING / SOFT DELETE</span>
                  <span className="text-2xl font-black text-rose-400">{importPreview.deleteDocs.length}</span>
                </div>
              </div>

              {/* Lists of Changes */}
              <div className="space-y-4">
                {importPreview.newDocs.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-black text-emerald-400 border-b border-slate-850 pb-1">New Employees</h5>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {importPreview.newDocs.map((d, idx) => (
                        <div key={d.id || d.employeeId || `new_${idx}`} className="text-slate-400">
                          <strong className="text-slate-200">#{d.employeeId} {d.employeeName}</strong> ({d.designation} - {d.depot})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importPreview.updateDocs.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-black text-cyan-400 border-b border-slate-850 pb-1">Updates to Apply</h5>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {importPreview.updateDocs.map((d, idx) => (
                        <div key={d.id || d.employeeId || `upd_${idx}`} className="text-slate-400">
                          <strong className="text-slate-200">#{d.employeeId} {d.employeeName}</strong> ({d.designation} - {d.depot})
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importPreview.deleteDocs.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-black text-rose-400 border-b border-slate-850 pb-1">Missing in Import (Will be soft-deleted)</h5>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {importPreview.deleteDocs.map((d, idx) => (
                        <div key={d.id || d.employeeId || `del_${idx}`} className="text-slate-400">
                          <strong className="text-slate-200">#{d.employeeId} {d.employeeName}</strong> ({d.designation} - {d.depot})
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-2">
              <button 
                onClick={() => {
                  setShowImportPreview(false);
                  setImportPreview(null);
                  if (importFileRef.current) importFileRef.current.value = "";
                }}
                className="bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-350 font-bold px-4 py-2 rounded"
              >
                Abort Import
              </button>
              <button 
                onClick={confirmExcelImport}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-6 py-2 rounded flex items-center gap-1.5 transition-colors"
              >
                Confirm & Sync Firestore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DYNAMIC PERMISSIONS OVERRIDE MODAL */}
      {showPermissionsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-4xl w-full flex flex-col max-h-[85vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                🛡 Permissions Matrix Override: #{selectedIds[0]} ({employees.find(e => e.employeeId === selectedIds[0])?.employeeName})
              </h3>
              <button onClick={() => setShowPermissionsModal(false)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(MODULE_PERMISSIONS_MAP).map(([modName, allowedActions]) => {
                  const currentModPerms = registryEmpPermissions[modName] || {};
                  return (
                    <div key={modName} className="bg-slate-955 border border-slate-855 p-3 rounded-lg space-y-2">
                      <span className="font-bold text-slate-200">{modName}</span>
                      <div className="flex flex-wrap gap-2">
                        {allowedActions.map(action => {
                          const hasAction = currentModPerms[action] === true;
                          return (
                            <button
                              key={action}
                              type="button"
                              onClick={() => {
                                setRegistryEmpPermissions(prev => ({
                                  ...prev,
                                  [modName]: {
                                    ...(prev[modName] || {}),
                                    [action]: !hasAction
                                  }
                                }));
                              }}
                              className={`px-2 py-1 rounded border text-[9px] font-bold uppercase transition-all ${
                                hasAction 
                                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' 
                                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-350'
                              }`}
                            >
                              {action}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 bg-slate-955 border-t border-slate-800 flex justify-end gap-2 text-xs">
              <button 
                type="button"
                onClick={() => setShowPermissionsModal(false)}
                className="bg-slate-900 border border-slate-700 text-slate-300 font-bold px-4 py-2 rounded"
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={async () => {
                  try {
                    await import('firebase/firestore').then(({ doc: fdoc, setDoc }) => 
                      setDoc(fdoc(db, 'userPermissions', selectedIds[0]), {
                        employeeId: selectedIds[0],
                        permissions: registryEmpPermissions
                      }, { merge: true })
                    );
                    alert("Permissions overrides saved successfully in Firestore.");
                    setShowPermissionsModal(false);
                  } catch (e) {
                    alert("Failed to save permissions: " + e.message);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black px-6 py-2 rounded uppercase tracking-wider"
              >
                Save Permissions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REGISTRY AUDIT HISTORY MODAL */}
      {showRegistryAuditModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl max-w-2xl w-full flex flex-col max-h-[80vh]">
            <div className="p-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                📋 Audit Trail Logs: #{activeAuditEmpId} ({activeAuditEmpName})
              </h3>
              <button onClick={() => setShowRegistryAuditModal(false)} className="text-slate-400 hover:text-slate-200">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-2 text-[10px]">
              {registryAuditLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-650 italic">No audit log history entries recorded for this employee.</div>
              ) : (
                registryAuditLogs.map((log, idx) => (
                  <div key={log.id || `audit_hist_${idx}`} className="bg-slate-955 border border-slate-850 p-3 rounded text-slate-400 space-y-1">
                    <div className="flex justify-between items-center text-[9px] uppercase tracking-wide">
                      <span className="font-bold text-cyan-400">{log.action}</span>
                      <span className="text-slate-550">
                        {log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleString() : '--'}
                      </span>
                    </div>
                    {log.performedByName && (
                      <div className="text-[9px] text-slate-550">Performed by: <span className="font-bold text-slate-350">{log.performedByName}</span></div>
                    )}
                    {log.details && (
                      <div className="text-slate-350 font-mono text-[9.5px] bg-slate-950/40 p-1.5 rounded border border-slate-850/50 mt-1">{log.details}</div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-slate-955 border-t border-slate-800 flex justify-end">
              <button 
                type="button"
                onClick={() => setShowRegistryAuditModal(false)}
                className="bg-slate-855 hover:bg-slate-800 text-slate-300 font-bold px-6 py-2 rounded"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

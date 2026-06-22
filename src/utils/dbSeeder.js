import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

export const seedDatabaseIfNeeded = async (db) => {
  try {
    // 1. Seed Roles Matrix if empty
    const rolesCheck = await getDocs(collection(db, 'roles'));
    if (rolesCheck.empty) {
      console.log("Seeding roles collection...");
      const defaultRoles = {
        SUPER_ADMIN: {
          roleName: "SUPER_ADMIN",
          permissions: {
            Dashboard: "Full",
            "Crew Registry": "Full",
            "Duty Roster": "Full",
            "Shift Exchange": "Full",
            "Duty Swap": "Full",
            "Manual Override": "Full",
            Reports: "Full",
            "User Management": "Full",
            "Role Management": "Full",
            Settings: "Full"
          }
        },
        ADMIN_SS: {
          roleName: "ADMIN_SS",
          permissions: {
            Dashboard: "Full",
            "Crew Registry": "Full",
            "Duty Roster": "Full",
            "Shift Exchange": "Full",
            "Duty Swap": "Full",
            "Manual Override": "Full",
            Reports: "Full",
            "User Management": "Full",
            "Role Management": "Full",
            Settings: "No"
          }
        },
        CREW_CONTROLLER: {
          roleName: "CREW_CONTROLLER",
          permissions: {
            Dashboard: "Full",
            "Crew Registry": "View",
            "Duty Roster": "View",
            "Shift Exchange": "Full",
            "Duty Swap": "Full",
            "Manual Override": "Full",
            Reports: "Full",
            "User Management": "No",
            "Role Management": "No",
            Settings: "No"
          }
        },
        STATION_CONTROLLER: {
          roleName: "STATION_CONTROLLER",
          permissions: {
            Dashboard: "View",
            "Crew Registry": "View",
            "Duty Roster": "View",
            "Shift Exchange": "View",
            "Duty Swap": "View",
            "Manual Override": "No",
            Reports: "View",
            "User Management": "No",
            "Role Management": "No",
            Settings: "No"
          }
        },
        TRAIN_OPERATOR: {
          roleName: "TRAIN_OPERATOR",
          permissions: {
            Dashboard: "View",
            "Crew Registry": "No",
            "Duty Roster": "Own",
            "Shift Exchange": "Request",
            "Duty Swap": "Request",
            "Manual Override": "No",
            Reports: "No",
            "User Management": "No",
            "Role Management": "No",
            Settings: "No"
          }
        },
        VIEWER: {
          roleName: "VIEWER",
          permissions: {
            Dashboard: "View",
            "Crew Registry": "View",
            "Duty Roster": "No",
            "Shift Exchange": "No",
            "Duty Swap": "No",
            "Manual Override": "No",
            Reports: "View",
            "User Management": "No",
            "Role Management": "No",
            Settings: "No"
          }
        }
      };
      
      for (const [roleId, roleData] of Object.entries(defaultRoles)) {
        await setDoc(doc(db, 'roles', roleId), roleData);
      }
      
      // Also add ADMIN_Station_Superintendent role doc explicitly
      await setDoc(doc(db, 'roles', 'ADMIN_Station_Superintendent'), {
        roleName: "ADMIN_Station_Superintendent",
        permissions: defaultRoles.ADMIN_SS.permissions
      });
    }

    // 2. Seed Crew Registry if empty
    const registryCheck = await getDocs(collection(db, 'crewRegistry'));
    if (registryCheck.empty) {
      console.log("Seeding crewRegistry collection...");
      const batch = writeBatch(db);
      BMRCL_CREW_REGISTRY.forEach(employee => {
        const empRef = doc(db, 'crewRegistry', String(employee.id));
        batch.set(empRef, {
          employeeId: String(employee.id),
          employeeName: employee.name,
          email: employee.email || "",
          designation: employee.designation,
          contact: employee.contact,
          active: true
        });
      });
      await batch.commit();
    }

    // 3. Seed users, userPermissions, and userAccessControl if empty
    const usersCheck = await getDocs(collection(db, 'users'));
    if (usersCheck.empty) {
      console.log("Seeding users, userPermissions, and userAccessControl collections...");
      const batch = writeBatch(db);
      
      BMRCL_CREW_REGISTRY.forEach(employee => {
        const empId = String(employee.id);
        const role = getDefaultRole(empId, employee.designation);
        
        // A. Seed users doc
        const userRef = doc(db, 'users', empId);
        batch.set(userRef, {
          employeeId: empId,
          employeeName: employee.name,
          designation: employee.designation,
          mobileNumber: employee.contact || "",
          email: employee.email || "",
          depot: "Peenya Industry Depot",
          role: role,
          active: true,
          status: "ACTIVE",
          lastLogin: null,
          lastLoginDevice: ""
        });
        
        // B. Seed userAccessControl doc
        const accessRef = doc(db, 'userAccessControl', empId);
        batch.set(accessRef, {
          canLogin: true,
          canAccessWebApp: true,
          canAccessMobileApp: true,
          canExportReports: true,
          canApproveRequests: (role === 'SUPER_ADMIN' || role === 'ADMIN_Station_Superintendent' || role === 'ADMIN_SS' || role === 'CREW_CONTROLLER'),
          canAccessAdminModules: (role === 'SUPER_ADMIN' || role === 'ADMIN_Station_Superintendent' || role === 'ADMIN_SS'),
          canManageUsers: (role === 'SUPER_ADMIN'),
          forceLogout: false,
          blockedDevices: [],
          deviceStatus: "ACTIVE"
        });
        
        // C. Seed userPermissions doc
        const permsRef = doc(db, 'userPermissions', empId);
        batch.set(permsRef, {
          employeeId: empId,
          permissions: getRoleDefaultPermissions(role)
        });
      });
      
      await batch.commit();
      console.log("Seeding completed successfully.");
    }
  } catch (error) {
    console.error("Error in seeding database:", error);
  }
};

const getDefaultRole = (employeeId, designation) => {
  if (String(employeeId) === '20726') return 'SUPER_ADMIN';
  if (designation === 'Station Superintendent') return 'ADMIN_Station_Superintendent';
  if (designation === 'Crew Controller' || designation === 'CREW_CONTROLLER') return 'CREW_CONTROLLER';
  if (designation === 'Station Controller') return 'STATION_CONTROLLER';
  if (designation === 'Train Operator' || designation === 'Station Controller / Train Operator') return 'TRAIN_OPERATOR';
  return 'VIEWER';
};

export const getRoleDefaultPermissions = (role) => {
  const allModules = [
    'Dashboard',
    'Crew Registry',
    'Duty Roster',
    'Shift Exchange',
    'Duty Swap',
    'Automated Dispatch Gate',
    'Live Relief Tracking',
    'Emergency Relief Module',
    'Reports Center',
    'User Control Center'
  ];

  const defaultPerms = {};
  allModules.forEach(mod => {
    defaultPerms[mod] = {};
  });

  if (role === 'SUPER_ADMIN') {
    allModules.forEach(mod => {
      if (mod === 'Dashboard') {
        defaultPerms[mod] = { 'View': true, 'Edit': true, 'Admin Access': true };
      } else if (mod === 'Crew Registry' || mod === 'Duty Roster') {
        defaultPerms[mod] = { 'View': true, 'Create': true, 'Edit': true, 'Delete': true, 'Approve': true };
      } else if (mod === 'Shift Exchange' || mod === 'Duty Swap' || mod === 'Automated Dispatch Gate' || mod === 'Emergency Relief Module') {
        defaultPerms[mod] = { 'View': true, 'Create Request': true, 'Approve Request': true, 'Reject Request': true, 'Full Control': true, 'Dispatch': true, 'Override Dispatch': true, 'Generate Relief': true, 'Approve Relief': true };
      } else if (mod === 'Live Relief Tracking') {
        defaultPerms[mod] = { 'View': true, 'Update': true, 'Approve': true };
      } else if (mod === 'Reports Center') {
        defaultPerms[mod] = { 'View': true, 'Export Excel': true, 'Export CSV': true, 'Export PDF': true, 'Print Reports': true };
      } else if (mod === 'User Control Center') {
        defaultPerms[mod] = { 'View': true, 'Manage Users': true, 'Assign Permissions': true, 'Assign Roles': true, 'Delete Users': true };
      }
    });
  } else if (role === 'ADMIN_Station_Superintendent' || role === 'ADMIN_SS') {
    allModules.forEach(mod => {
      if (mod === 'Dashboard') {
        defaultPerms[mod] = { 'View': true, 'Edit': true, 'Admin Access': true };
      } else if (mod === 'Crew Registry' || mod === 'Duty Roster') {
        defaultPerms[mod] = { 'View': true, 'Create': true, 'Edit': true, 'Delete': true, 'Approve': true };
      } else if (mod === 'Shift Exchange' || mod === 'Duty Swap' || mod === 'Automated Dispatch Gate' || mod === 'Emergency Relief Module') {
        defaultPerms[mod] = { 'View': true, 'Create Request': true, 'Approve Request': true, 'Reject Request': true, 'Full Control': true, 'Dispatch': true, 'Override Dispatch': true, 'Generate Relief': true, 'Approve Relief': true };
      } else if (mod === 'Live Relief Tracking') {
        defaultPerms[mod] = { 'View': true, 'Update': true, 'Approve': true };
      } else if (mod === 'Reports Center') {
        defaultPerms[mod] = { 'View': true, 'Export Excel': true, 'Export CSV': true, 'Export PDF': true, 'Print Reports': true };
      } else if (mod === 'User Control Center') {
        defaultPerms[mod] = { 'View': true, 'Manage Users': false, 'Assign Permissions': false, 'Assign Roles': false, 'Delete Users': false };
      }
    });
  } else if (role === 'CREW_CONTROLLER') {
    allModules.forEach(mod => {
      if (mod === 'Dashboard') {
        defaultPerms[mod] = { 'View': true, 'Edit': false, 'Admin Access': false };
      } else if (mod === 'Crew Registry' || mod === 'Duty Roster') {
        defaultPerms[mod] = { 'View': true, 'Create': false, 'Edit': false, 'Delete': false, 'Approve': false };
      } else if (mod === 'Shift Exchange' || mod === 'Duty Swap' || mod === 'Automated Dispatch Gate' || mod === 'Emergency Relief Module') {
        defaultPerms[mod] = { 'View': true, 'Create Request': true, 'Approve Request': true, 'Reject Request': true, 'Full Control': true, 'Dispatch': true, 'Override Dispatch': true, 'Generate Relief': true, 'Approve Relief': true };
      } else if (mod === 'Live Relief Tracking') {
        defaultPerms[mod] = { 'View': true, 'Update': true, 'Approve': true };
      } else if (mod === 'Reports Center') {
        defaultPerms[mod] = { 'View': true, 'Export Excel': true, 'Export CSV': true, 'Export PDF': true, 'Print Reports': true };
      } else if (mod === 'User Control Center') {
        defaultPerms[mod] = { 'View': false, 'Manage Users': false, 'Assign Permissions': false, 'Assign Roles': false, 'Delete Users': false };
      }
    });
  } else if (role === 'STATION_CONTROLLER') {
    allModules.forEach(mod => {
      if (mod === 'Dashboard') {
        defaultPerms[mod] = { 'View': true, 'Edit': false, 'Admin Access': false };
      } else if (mod === 'Crew Registry' || mod === 'Duty Roster') {
        defaultPerms[mod] = { 'View': true, 'Create': false, 'Edit': false, 'Delete': false, 'Approve': false };
      } else if (mod === 'Shift Exchange' || mod === 'Duty Swap') {
        defaultPerms[mod] = { 'View': true, 'Create Request': true, 'Approve Request': false, 'Reject Request': false, 'Full Control': false };
      } else if (mod === 'Automated Dispatch Gate' || mod === 'Emergency Relief Module') {
        defaultPerms[mod] = { 'View': true, 'Dispatch': false, 'Override Dispatch': false, 'Full Control': false, 'Generate Relief': false, 'Approve Relief': false };
      } else if (mod === 'Live Relief Tracking') {
        defaultPerms[mod] = { 'View': true, 'Update': false, 'Approve': false };
      } else if (mod === 'Reports Center') {
        defaultPerms[mod] = { 'View': true, 'Export Excel': false, 'Export CSV': false, 'Export PDF': false, 'Print Reports': false };
      } else if (mod === 'User Control Center') {
        defaultPerms[mod] = { 'View': false, 'Manage Users': false, 'Assign Permissions': false, 'Assign Roles': false, 'Delete Users': false };
      }
    });
  } else if (role === 'TRAIN_OPERATOR') {
    allModules.forEach(mod => {
      if (mod === 'Dashboard') {
        defaultPerms[mod] = { 'View': true, 'Edit': false, 'Admin Access': false };
      } else if (mod === 'Crew Registry' || mod === 'Duty Roster') {
        defaultPerms[mod] = { 'View': false, 'Create': false, 'Edit': false, 'Delete': false, 'Approve': false };
      } else if (mod === 'Shift Exchange' || mod === 'Duty Swap') {
        defaultPerms[mod] = { 'View': true, 'Create Request': true, 'Approve Request': false, 'Reject Request': false, 'Full Control': false };
      } else if (mod === 'Automated Dispatch Gate' || mod === 'Emergency Relief Module') {
        defaultPerms[mod] = { 'View': true, 'Dispatch': false, 'Override Dispatch': false, 'Full Control': false, 'Generate Relief': false, 'Approve Relief': false };
      } else if (mod === 'Live Relief Tracking') {
        defaultPerms[mod] = { 'View': true, 'Update': false, 'Approve': false };
      } else if (mod === 'Reports Center') {
        defaultPerms[mod] = { 'View': false, 'Export Excel': false, 'Export CSV': false, 'Export PDF': false, 'Print Reports': false };
      } else if (mod === 'User Control Center') {
        defaultPerms[mod] = { 'View': false, 'Manage Users': false, 'Assign Permissions': false, 'Assign Roles': false, 'Delete Users': false };
      }
    });
  } else if (role === 'VIEWER') {
    allModules.forEach(mod => {
      if (mod === 'Dashboard') {
        defaultPerms[mod] = { 'View': true, 'Edit': false, 'Admin Access': false };
      } else if (mod === 'Crew Registry' || mod === 'Duty Roster') {
        defaultPerms[mod] = { 'View': true, 'Create': false, 'Edit': false, 'Delete': false, 'Approve': false };
      } else if (mod === 'Shift Exchange' || mod === 'Duty Swap') {
        defaultPerms[mod] = { 'View': false, 'Create Request': false, 'Approve Request': false, 'Reject Request': false, 'Full Control': false };
      } else if (mod === 'Automated Dispatch Gate' || mod === 'Emergency Relief Module') {
        defaultPerms[mod] = { 'View': false, 'Dispatch': false, 'Override Dispatch': false, 'Full Control': false, 'Generate Relief': false, 'Approve Relief': false };
      } else if (mod === 'Live Relief Tracking') {
        defaultPerms[mod] = { 'View': false, 'Update': false, 'Approve': false };
      } else if (mod === 'Reports Center') {
        defaultPerms[mod] = { 'View': true, 'Export Excel': false, 'Export CSV': false, 'Export PDF': false, 'Print Reports': false };
      } else if (mod === 'User Control Center') {
        defaultPerms[mod] = { 'View': false, 'Manage Users': false, 'Assign Permissions': false, 'Assign Roles': false, 'Delete Users': false };
      }
    });
  }

  return defaultPerms;
};


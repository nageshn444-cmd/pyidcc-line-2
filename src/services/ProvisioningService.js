import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db } from '../firebase';
import { doc, setDoc, updateDoc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { getRoleDefaultPermissions } from '../utils/dbSeeder';

const firebaseConfig = {
  apiKey: "AIzaSyDucdRrkYezPjjzZ250pqZUovb3B8MO5lg",
  authDomain: "pyidline2crew-41022.firebaseapp.com",
  projectId: "pyidline2crew-41022",
  storageBucket: "pyidline2crew-41022.firebasestorage.app",
  messagingSenderId: "783173298649",
  appId: "1:783173298649:web:f3283c39f648a6481c51c8",
  measurementId: "G-MZ63RZPQD2"
};

class ProvisioningService {
  async provisionEmployee(employee, updatedBy, explicitUid = null) {
    const employeeId = String(employee.employeeId || employee.id);
    const employeeName = employee.employeeName || employee.name || '';
    const email = employee.email || `${employeeId}@pyidcc.bmrcl.com`;
    const mobileNumber = employee.mobileNumber || employee.contact || '';
    const designation = employee.designation || 'Station Controller / Train Operator';
    const role = employee.role || 'Train Operator';
    const depot = employee.depot || 'Peenya Depot (PYID)';
    const department = employee.department || 'Operations';
    const operationalCrew = employee.operationalCrew || 'YES';

    if (operationalCrew === 'YES') {
      let uid = explicitUid;
      
      if (!uid) {
        // 1. Try to check if user profile already exists to find the UID
        const systemUsersRef = collection(db, 'system_users');
        const q = query(systemUsersRef, where('employeeId', '==', employeeId));
        const qSnap = await getDocs(q);
        
        if (!qSnap.empty) {
          uid = qSnap.docs[0].id;
        }
      }
      
      if (!uid) {
        // 2. Create in Firebase Auth using the sandboxed instance
        const tempApp = initializeApp(firebaseConfig, `tempApp_${Date.now()}`);
        const tempAuth = getAuth(tempApp);
        try {
          let authPassword = String(employeeId);
          if (authPassword.length < 6) {
            authPassword = authPassword.padEnd(6, '0');
          }
          const authResult = await createUserWithEmailAndPassword(tempAuth, email, authPassword);
          uid = authResult.user.uid;
          await signOut(tempAuth);
        } catch (err) {
          if (err.code === 'auth/email-already-in-use') {
            console.log("Auth user already exists.");
          } else {
            console.error("Auth creation failed:", err);
            throw err;
          }
        } finally {
          await deleteApp(tempApp);
        }
      }

      const finalUid = uid || employeeId; // Fallback to employeeId if no uid found

      // 3. Write/Update system_users
      await setDoc(doc(db, 'system_users', finalUid), {
        uid: finalUid,
        employeeId,
        employeeName,
        email,
        role,
        designation,
        depot,
        department,
        active: true,
        firstLogin: true, // Force password change flag
        passwordResetRequired: true,
        status: 'ACTIVE',
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy
      }, { merge: true });

      // 4. Write/Update users
      await setDoc(doc(db, 'users', employeeId), {
        employeeId,
        employeeName,
        email,
        role,
        designation,
        depot,
        department,
        active: true,
        firstLogin: true,
        passwordResetRequired: true,
        status: 'ACTIVE',
        operationalCrew: 'YES',
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy
      }, { merge: true });

      // 5. Write/Update userAccessControl
      await setDoc(doc(db, 'userAccessControl', employeeId), {
        employeeId,
        canLogin: true,
        canAccessWebApp: true,
        canAccessMobileApp: true,
        forceLogout: false,
        deviceStatus: 'ACTIVE',
        active: true,
        canApproveRequests: ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS', 'CREW_CONTROLLER'].includes(role),
        canAccessAdminModules: ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(role),
        canManageUsers: ['SUPER_ADMIN', 'ADMIN_Station_Superintendent', 'ADMIN_SS'].includes(role)
      }, { merge: true });

      // 6. Write/Update userPermissions if not exists
      const permDocRef = doc(db, 'userPermissions', employeeId);
      const permDocSnap = await getDoc(permDocRef);
      if (!permDocSnap.exists()) {
        await setDoc(permDocRef, {
          employeeId,
          permissions: getRoleDefaultPermissions(role)
        });
      }

      // 7. Write audit log
      await addDoc(collection(db, 'auditLogs'), {
        employeeId,
        employeeName,
        action: 'ACCOUNT_ACTIVATED',
        module: 'Crew Registry',
        oldValue: 'INACTIVE',
        newValue: 'ACTIVE',
        changedBy: updatedBy,
        timestamp: serverTimestamp()
      });

    } else {
      // Deactivate account
      // 1. Find UID from system_users
      const systemUsersRef = collection(db, 'system_users');
      const q = query(systemUsersRef, where('employeeId', '==', employeeId));
      const qSnap = await getDocs(q);
      
      if (!qSnap.empty) {
        const uid = qSnap.docs[0].id;
        await updateDoc(doc(db, 'system_users', uid), {
          active: false,
          status: 'INACTIVE',
          updatedAt: new Date().toISOString(),
          updatedBy: updatedBy
        });
      }

      // 2. Update users
      await updateDoc(doc(db, 'users', employeeId), {
        active: false,
        status: 'INACTIVE',
        operationalCrew: 'NO',
        updatedAt: new Date().toISOString(),
        updatedBy: updatedBy
      });

      // 3. Update userAccessControl
      await updateDoc(doc(db, 'userAccessControl', employeeId), {
        canLogin: false,
        active: false,
        deviceStatus: 'BLOCKED'
      });

      // 4. Log audit
      await addDoc(collection(db, 'auditLogs'), {
        employeeId,
        employeeName,
        action: 'ACCOUNT_DEACTIVATED',
        module: 'Crew Registry',
        oldValue: 'ACTIVE',
        newValue: 'INACTIVE',
        changedBy: updatedBy,
        timestamp: serverTimestamp()
      });
    }
  }

  async resetPasswordForce(employeeId, updatedBy) {
    // Force user reset on next login
    await updateDoc(doc(db, 'users', String(employeeId)), {
      firstLogin: true,
      passwordResetRequired: true
    });
    
    // Find UID from system_users
    const systemUsersRef = collection(db, 'system_users');
    const q = query(systemUsersRef, where('employeeId', '==', String(employeeId)));
    const qSnap = await getDocs(q);
    
    if (!qSnap.empty) {
      const uid = qSnap.docs[0].id;
      await updateDoc(doc(db, 'system_users', uid), {
        firstLogin: true,
        passwordResetRequired: true
      });
    }

    // Log audit
    await addDoc(collection(db, 'auditLogs'), {
      employeeId: String(employeeId),
      action: 'PASSWORD_RESET_FORCED',
      module: 'Crew Registry',
      changedBy: updatedBy,
      timestamp: serverTimestamp()
    });
  }

  async unlockAccount(employeeId, updatedBy) {
    await updateDoc(doc(db, 'userAccessControl', String(employeeId)), {
      canLogin: true,
      active: true,
      deviceStatus: 'ACTIVE',
      blockedDevices: []
    });

    // Log audit
    await addDoc(collection(db, 'auditLogs'), {
      employeeId: String(employeeId),
      action: 'ACCOUNT_UNLOCKED',
      module: 'Crew Registry',
      changedBy: updatedBy,
      timestamp: serverTimestamp()
    });
  }

  async approveLoginRequest(request, approvedBy) {
    // Check if the request document exists first
    const requestRef = doc(db, 'login_requests', request.requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) {
      throw new Error("This request no longer exists (it may have been already handled).");
    }

    const today = new Date();
    const approvedDate = today.toLocaleDateString('en-GB').replace(/\//g, '-');
    const approvedTime = today.toTimeString().split(' ')[0].substring(0, 5);

    const employeeId = String(request.employeeId);
    const employeeName = request.employeeName || 'Unknown';
    const email = request.email || `${employeeId}@pyidcc.bmrcl.com`;
    const designation = request.designation || 'Station Controller / Train Operator';
    const role = request.requestedRole || 'Train Operator';
    const depot = request.depot || 'Peenya Depot (PYID)';
    const department = request.department || 'Operations';

    // 1. Provision Auth account if it doesn't exist, and create system_users / users / userAccessControl
    const mockEmployee = {
      employeeId,
      employeeName,
      email,
      designation,
      role,
      depot,
      department,
      operationalCrew: 'YES',
      active: true
    };

    await this.provisionEmployee(mockEmployee, approvedBy, request.firebaseUid || null);

    // Get the UID from system_users
    let uid = request.firebaseUid || '';
    if (!uid) {
      const q = query(collection(db, 'system_users'), where('employeeId', '==', employeeId));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        uid = qSnap.docs[0].id;
      }
    }

    // 2. Set additional fields
    const userUpdates = {
      approved: true,
      loginEnabled: true,
      approvedBy,
      approvedTime,
      approvedDate,
      status: 'ACTIVE',
      active: true,
      updatedAt: new Date().toISOString(),
      updatedBy: approvedBy
    };

    if (uid) {
      await updateDoc(doc(db, 'system_users', uid), userUpdates);
    }
    await updateDoc(doc(db, 'users', employeeId), userUpdates);

    // 3. Update the login request status in firestore
    await updateDoc(doc(db, 'login_requests', request.requestId), {
      requestStatus: 'Approved',
      approvedBy,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Also update legacy request if it exists
    try {
      await updateDoc(doc(db, 'loginRequests', request.requestId), {
        status: 'APPROVED',
        approvedBy,
        approvedAt: serverTimestamp()
      });
    } catch (e) {
      // Ignore
    }

    // 4. Log audit
    await addDoc(collection(db, 'auditLogs'), {
      employeeId,
      employeeName,
      action: 'LOGIN_REQUEST_APPROVED',
      module: 'User Control Center',
      details: `Approved login request for ${employeeName} (${employeeId})`,
      changedBy: approvedBy,
      timestamp: serverTimestamp()
    });
  }

  async rejectLoginRequest(request, rejectedBy, reason) {
    const employeeId = String(request.employeeId);
    
    // 1. Update the login request status
    await updateDoc(doc(db, 'login_requests', request.requestId), {
      requestStatus: 'Rejected',
      rejectedBy,
      rejectionReason: reason,
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Also update legacy request if it exists
    try {
      await updateDoc(doc(db, 'loginRequests', request.requestId), {
        status: 'REJECTED',
        rejectedBy,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason
      });
    } catch (e) {
      // Ignore
    }

    // 2. Log audit
    await addDoc(collection(db, 'auditLogs'), {
      employeeId,
      action: 'LOGIN_REQUEST_REJECTED',
      module: 'User Control Center',
      details: `Rejected login request for ${request.employeeName} (${employeeId}). Reason: ${reason}`,
      changedBy: rejectedBy,
      timestamp: serverTimestamp()
    });
  }
}

export const provisioningService = new ProvisioningService();
export default provisioningService;

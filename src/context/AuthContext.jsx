import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  query, 
  where, 
  serverTimestamp, 
  updateDoc,
  onSnapshot
} from 'firebase/firestore';
import { seedDatabaseIfNeeded } from '../utils/dbSeeder';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';

const AuthContext = createContext();

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  // Initialize DB data (roles and crew registry) only when a SUPER_ADMIN logs in
  useEffect(() => {
    const initDb = async () => {
      if (userProfile?.role === 'SUPER_ADMIN') {
        await seedDatabaseIfNeeded(db);
      }
    };
    initDb();
  }, [userProfile]);

  // Monitor auth state changes in real-time
  useEffect(() => {
    let unsubscribeSystemUser = () => {};
    let unsubscribeUser = () => {};
    let unsubscribeAccessControl = () => {};
    let unsubscribePermissions = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        // 1. Listen to system_users using UID
        unsubscribeSystemUser = onSnapshot(doc(db, 'system_users', user.uid), (sysUserDoc) => {
          if (sysUserDoc.exists()) {
            const sysProfile = sysUserDoc.data();
            const empId = String(sysProfile.employeeId);

            // 2. Listen to users (master employee access profile) using employeeId
            unsubscribeUser();
            unsubscribeUser = onSnapshot(doc(db, 'users', empId), (userDoc) => {
              if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // Combine system_users data with users data
                setUserProfile(prev => ({
                  ...prev,
                  ...sysProfile,
                  ...userData
                }));

                // Check active/block status
                if (!userData.active || userData.status === 'INACTIVE' || userData.status === 'SUSPENDED' || userData.status === 'BLOCKED') {
                  console.log(`User status is ${userData.status || 'INACTIVE'}. Forcing sign out...`);
                  signOut(auth);
                  return;
                }
              }
            }, (error) => {
              console.error("Error listening to users collection:", error);
            });

            // 3. Listen to userAccessControl using employeeId
            unsubscribeAccessControl();
            unsubscribeAccessControl = onSnapshot(doc(db, 'userAccessControl', empId), (accessDoc) => {
              if (accessDoc.exists()) {
                const accessData = accessDoc.data();
                
                // Combine with profile
                setUserProfile(prev => ({
                  ...prev,
                  accessControl: accessData
                }));

                // Check access controls & device status
                const isUserAgentBlocked = accessData.blockedDevices && accessData.blockedDevices.includes(navigator.userAgent);
                if (
                  accessData.canLogin === false || 
                  accessData.canAccessWebApp === false || 
                  accessData.deviceStatus === 'BLOCKED' ||
                  isUserAgentBlocked ||
                  accessData.forceLogout === true
                ) {
                  console.log("Access control restriction or force logout triggered. Logging out...");
                  
                  // Reset forceLogout flag if it was true, so user can log in later if unblocked
                  if (accessData.forceLogout === true) {
                    updateDoc(doc(db, 'userAccessControl', empId), { forceLogout: false }).catch(() => {});
                  }
                  
                  signOut(auth);
                  return;
                }
              }
            }, (error) => {
              console.error("Error listening to userAccessControl:", error);
            });

            // 4. Listen to userPermissions using employeeId
            unsubscribePermissions();
            unsubscribePermissions = onSnapshot(doc(db, 'userPermissions', empId), (permDoc) => {
              if (permDoc.exists()) {
                setPermissions(permDoc.data().permissions || {});
              } else {
                // Fallback to role permissions if no custom document
                if (sysProfile.role) {
                  getDoc(doc(db, 'roles', sysProfile.role)).then((roleDoc) => {
                    if (roleDoc.exists()) {
                      setPermissions(roleDoc.data().permissions || {});
                    }
                  });
                }
              }
            }, (error) => {
              console.error("Error listening to userPermissions:", error);
            });

          } else {
            setUserProfile(null);
            setPermissions({});
          }
        }, (error) => {
          console.error("Error listening to system_users:", error);
        });
      } else {
        setUserProfile(null);
        setPermissions({});
      }
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeSystemUser();
      unsubscribeUser();
      unsubscribeAccessControl();
      unsubscribePermissions();
    };
  }, []);

  // Log user actions into the Firestore auditLogs collection
  const logAudit = async (action, performedBy, performedByName, details) => {
    try {
      await addDoc(collection(db, 'auditLogs'), {
        action,
        performedBy,
        performedByName,
        details,
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }
  };

  // Helper to log logins to loginHistory
  const logLoginHistory = async (employeeId, name, status, reason = "") => {
    // Under Firestore rules, only authenticated users can write to login_history.
    // Therefore, we skip writing failed login attempts (where auth.currentUser is null) to Firestore.
    if (!auth.currentUser) {
      console.warn(`Skipping writing FAILED login log for ${employeeId} to Firestore because user is not authenticated.`);
      return;
    }
    try {
      await addDoc(collection(db, 'login_history'), {
        employeeId,
        employeeName: name,
        timestamp: serverTimestamp(),
        device: navigator.userAgent,
        status,
        reason
      });
    } catch (e) {
      console.error("Failed to log login history:", e);
    }
  };

  // 1. Employee ID + Password Login
  const loginWithIdAndPassword = async (employeeId, password) => {
    const email = `${employeeId}@pyidcc.bmrcl.com`;
    try {
      // 1. Authenticate with Firebase Auth first to establish credentials
      const result = await signInWithEmailAndPassword(auth, email, password);

      // 2. Perform Firestore authorization checks using the authenticated user credentials
      // Prior check in users collection
      const userRecordDoc = await getDoc(doc(db, 'users', String(employeeId)));
      if (userRecordDoc.exists()) {
        const uData = userRecordDoc.data();
        if (!uData.active || uData.status === 'INACTIVE' || uData.status === 'SUSPENDED' || uData.status === 'BLOCKED') {
          await signOut(auth);
          throw new Error(`Your account status is currently ${uData.status || 'INACTIVE'}. Access Denied.`);
        }
      }

      // Prior check in userAccessControl collection
      const accessControlDoc = await getDoc(doc(db, 'userAccessControl', String(employeeId)));
      if (accessControlDoc.exists()) {
        const aData = accessControlDoc.data();
        const isUserAgentBlocked = aData.blockedDevices && aData.blockedDevices.includes(navigator.userAgent);
        if (aData.canLogin === false || aData.canAccessWebApp === false || aData.deviceStatus === 'BLOCKED' || isUserAgentBlocked) {
          await signOut(auth);
          throw new Error("Access is disabled for this account or device.");
        }
      }

      // Load user profile
      const userDoc = await getDoc(doc(db, 'system_users', result.user.uid));
      if (!userDoc.exists()) {
        await signOut(auth);
        throw new Error("User Profile not found in database.");
      }

      const profile = userDoc.data();
      if (!profile.active) {
        await signOut(auth);
        throw new Error("This account is currently deactivated. Please contact an Administrator.");
      }

      // Update last login timestamp
      await updateDoc(doc(db, 'system_users', result.user.uid), {
        lastLogin: serverTimestamp()
      });
      // Also update in users collection
      await updateDoc(doc(db, 'users', String(employeeId)), {
        lastLogin: serverTimestamp(),
        lastLoginDevice: navigator.userAgent
      });

      await logLoginHistory(employeeId, profile.employeeName, "SUCCESS");
      await logAudit("LOGIN", result.user.uid, profile.employeeName, `Logged in via Employee ID + Password.`);
      return result.user;
    } catch (err) {
      await logLoginHistory(employeeId, "Unknown", "FAILED", err.message);
      throw err;
    }
  };

  // 2. Register Employee ID + Password Account
  const registerWithIdAndPassword = async (employeeId, password, name) => {
    // Validate Employee ID against local registry data to avoid read permission errors before authentication
    const registryEmployee = BMRCL_CREW_REGISTRY.find(emp => String(emp.id) === String(employeeId));
    if (!registryEmployee) {
      throw new Error("Employee ID is not found in the BMRCL Crew Registry.");
    }

    const email = `${employeeId}@pyidcc.bmrcl.com`;
    try {
      // 1. Create Firebase Auth user first
      const result = await createUserWithEmailAndPassword(auth, email, password);

      // 2. Perform Firestore checks using the newly established credentials
      // Prior check in users collection
      const userRecordDoc = await getDoc(doc(db, 'users', String(employeeId)));
      if (userRecordDoc.exists()) {
        const uData = userRecordDoc.data();
        if (!uData.active || uData.status === 'INACTIVE' || uData.status === 'SUSPENDED' || uData.status === 'BLOCKED') {
          await signOut(auth);
          throw new Error(`Your account status is currently ${uData.status || 'INACTIVE'}. Registration Denied.`);
        }
      }

      // Prior check in userAccessControl collection
      const accessControlDoc = await getDoc(doc(db, 'userAccessControl', String(employeeId)));
      if (accessControlDoc.exists()) {
        const aData = accessControlDoc.data();
        if (aData.canLogin === false || aData.canAccessWebApp === false || aData.deviceStatus === 'BLOCKED') {
          await signOut(auth);
          throw new Error("Access is disabled for this account or device.");
        }
      }

      // Map roles: 20726 = SUPER_ADMIN
      // Station Superintendent = ADMIN_Station_Superintendent
      // CREW_CONTROLLER = CREW_CONTROLLER
      // Train Operator / Station Controller = TRAIN_OPERATOR
      const isSuperAdmin = String(employeeId) === '20726';
      let role = 'TRAIN_OPERATOR';
      if (isSuperAdmin) {
        role = 'SUPER_ADMIN';
      } else if (registryEmployee.designation === 'Station Superintendent') {
        role = 'ADMIN_Station_Superintendent';
      } else if (registryEmployee.designation === 'CREW_CONTROLLER') {
        role = 'CREW_CONTROLLER';
      } else if (registryEmployee.designation === 'Station Controller / Train Operator') {
        role = 'TRAIN_OPERATOR';
      }

      const userProfileData = {
        employeeId: String(employeeId),
        employeeName: registryEmployee.name,
        email: registryEmployee.email || email,
        designation: registryEmployee.designation,
        role,
        depot: "Peenya Industry Depot",
        active: true,
        passwordResetRequired: false,
        lastLogin: serverTimestamp()
      };

      // Save user doc in system_users
      await setDoc(doc(db, 'system_users', result.user.uid), userProfileData);
      
      // Save or merge user doc in users
      await setDoc(doc(db, 'users', String(employeeId)), {
        employeeId: String(employeeId),
        employeeName: registryEmployee.name,
        email: registryEmployee.email || email,
        designation: registryEmployee.designation,
        role,
        depot: "Peenya Industry Depot",
        active: true,
        status: "ACTIVE",
        lastLogin: serverTimestamp(),
        lastLoginDevice: navigator.userAgent
      }, { merge: true });

      // Update local profile states instantly
      setUserProfile(userProfileData);
      
      // Fetch permissions
      const roleDoc = await getDoc(doc(db, 'roles', role));
      if (roleDoc.exists()) {
        setPermissions(roleDoc.data().permissions || {});
      }

      await logLoginHistory(employeeId, registryEmployee.name, "SUCCESS", "Account registered & logged in");
      await logAudit("USER_REGISTER", result.user.uid, registryEmployee.name, `Account created for Employee ID ${employeeId}.`);
      return result.user;
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        throw new Error("This Employee ID is already registered. Please login instead.");
      }
      throw err;
    }
  };

  // 3. Google Sign-In with Registry fallback
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const userEmail = result.user.email;

    try {
      // Find in registry
      const registryQuery = query(collection(db, 'crewRegistry'), where('email', '==', userEmail));
      const registrySnap = await getDocs(registryQuery);

      if (registrySnap.empty) {
        // Submit registration request
        // First check if pending request exists
        const reqQuery = query(
          collection(db, 'registrationRequests'), 
          where('email', '==', userEmail),
          where('status', '==', 'PENDING')
        );
        const reqSnap = await getDocs(reqQuery);

        if (reqSnap.empty) {
          await addDoc(collection(db, 'registrationRequests'), {
            email: userEmail,
            name: result.user.displayName || "Unknown",
            status: "PENDING",
            requestedAt: serverTimestamp()
          });
        }

        await signOut(auth);
        throw new Error("Your Google email is not associated with any Crew Registry record. A registration request has been submitted for Admin approval.");
      }

      const employee = registrySnap.docs[0].data();
      const empId = employee.employeeId;

      // Prior check in users collection
      const userRecordDoc = await getDoc(doc(db, 'users', String(empId)));
      if (userRecordDoc.exists()) {
        const uData = userRecordDoc.data();
        if (!uData.active || uData.status === 'INACTIVE' || uData.status === 'SUSPENDED' || uData.status === 'BLOCKED') {
          await signOut(auth);
          throw new Error(`Your account status is currently ${uData.status || 'INACTIVE'}. Access Denied.`);
        }
      }

      // Prior check in userAccessControl collection
      const accessControlDoc = await getDoc(doc(db, 'userAccessControl', String(empId)));
      if (accessControlDoc.exists()) {
        const aData = accessControlDoc.data();
        const isUserAgentBlocked = aData.blockedDevices && aData.blockedDevices.includes(navigator.userAgent);
        if (aData.canLogin === false || aData.canAccessWebApp === false || aData.deviceStatus === 'BLOCKED' || isUserAgentBlocked) {
          await signOut(auth);
          throw new Error("Access is disabled for this account or device.");
        }
      }

      // Check if user doc exists, otherwise create it
      const userDocRef = doc(db, 'system_users', result.user.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      let finalProfile;
      if (!userDocSnap.exists()) {
        const isSuperAdmin = empId === '20726' || userEmail === 'nageshn444@gmail.com';
        let role = 'TRAIN_OPERATOR';
        if (isSuperAdmin) {
          role = 'SUPER_ADMIN';
        } else if (employee.designation === 'Station Superintendent') {
          role = 'ADMIN_Station_Superintendent';
        } else if (employee.designation === 'CREW_CONTROLLER') {
          role = 'CREW_CONTROLLER';
        } else if (employee.designation === 'Station Controller / Train Operator') {
          role = 'TRAIN_OPERATOR';
        }

        finalProfile = {
          employeeId: empId,
          employeeName: employee.employeeName,
          email: userEmail,
          designation: employee.designation,
          role,
          depot: "Peenya Industry Depot",
          active: true,
          passwordResetRequired: false,
          lastLogin: serverTimestamp()
        };

        await setDoc(userDocRef, finalProfile);
        
        // Ensure registered in users collection as well
        await setDoc(doc(db, 'users', String(empId)), {
          employeeId: empId,
          employeeName: employee.employeeName,
          email: userEmail,
          designation: employee.designation,
          role,
          depot: "Peenya Industry Depot",
          active: true,
          status: "ACTIVE",
          lastLogin: serverTimestamp(),
          lastLoginDevice: navigator.userAgent
        }, { merge: true });

        await logAudit("USER_CREATE", result.user.uid, employee.employeeName, `User profile created via Google Sign-In.`);
      } else {
        finalProfile = userDocSnap.data();
        if (!finalProfile.active) {
          await signOut(auth);
          throw new Error("This account is currently deactivated. Please contact an Administrator.");
        }
        await updateDoc(userDocRef, {
          lastLogin: serverTimestamp()
        });
        await updateDoc(doc(db, 'users', String(empId)), {
          lastLogin: serverTimestamp(),
          lastLoginDevice: navigator.userAgent
        });
      }

      setUserProfile(finalProfile);

      // Load permissions
      const roleDoc = await getDoc(doc(db, 'roles', finalProfile.role));
      if (roleDoc.exists()) {
        setPermissions(roleDoc.data().permissions || {});
      }

      await logLoginHistory(empId, employee.employeeName, "SUCCESS", "Logged in via Google");
      await logAudit("LOGIN", result.user.uid, employee.employeeName, `Logged in via Google account.`);
      return result.user;
    } catch (err) {
      await logLoginHistory("Unknown", result.user.displayName || "Unknown", "FAILED", err.message);
      await signOut(auth);
      throw err;
    }
  };

  // 4. Send Password Reset
  const requestPasswordReset = async (employeeId) => {
    const email = `${employeeId}@pyidcc.bmrcl.com`;
    try {
      await sendPasswordResetEmail(auth, email);
      await logAudit("PASSWORD_RESET_REQUEST", "system", "System", `Password reset email dispatched for Employee ID: ${employeeId}.`);
    } catch (err) {
      throw err;
    }
  };

  // 5. Logout
  const logout = async () => {
    if (currentUser && userProfile) {
      await logAudit("LOGOUT", currentUser.uid, userProfile.employeeName, `Logged out of session.`);
    }
    await signOut(auth);
    setCurrentUser(null);
    setUserProfile(null);
    setPermissions({});
  };

  // Helper to check user permissions (supports both legacy structure and new detailed structure)
  const hasPermission = (moduleName, requiredLevel) => {
    if (userProfile?.role === 'SUPER_ADMIN') return true;
    
    // 1. Map legacy module names to new modules
    let newModuleName = moduleName;
    if (moduleName === 'Reports') newModuleName = 'Reports Center';
    if (moduleName === 'User Management' || moduleName === 'Role Management' || moduleName === 'Settings') {
      newModuleName = 'User Control Center';
    }
    if (moduleName === 'Manual Override') newModuleName = 'Automated Dispatch Gate';

    const levelOrObj = permissions[newModuleName] || permissions[moduleName];
    if (!levelOrObj) return false;

    // 2. Check if it's the new detailed permission object
    if (typeof levelOrObj === 'object') {
      if (requiredLevel === 'Full') {
        return (
          levelOrObj['Full Control'] === true ||
          levelOrObj['Approve'] === true ||
          levelOrObj['Admin Access'] === true ||
          levelOrObj['Delete'] === true ||
          levelOrObj['Manage Users'] === true ||
          levelOrObj['Assign Permissions'] === true ||
          levelOrObj['Assign Roles'] === true ||
          levelOrObj['Override Dispatch'] === true
        );
      }
      if (requiredLevel === 'View' || requiredLevel === 'Own') {
        return levelOrObj['View'] === true;
      }
      if (requiredLevel === 'Request') {
        return levelOrObj['Create Request'] === true || levelOrObj['View'] === true;
      }
      return false;
    }

    // 3. Fallback to legacy string permissions
    if (levelOrObj === 'No') return false;
    if (requiredLevel === 'Full') return levelOrObj === 'Full';
    if (requiredLevel === 'View' || requiredLevel === 'Own') return levelOrObj === 'Full' || levelOrObj === 'View' || levelOrObj === 'Own';
    if (requiredLevel === 'Request') return levelOrObj === 'Full' || levelOrObj === 'Request';
    return false;
  };

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      userProfile, 
      permissions,
      loginWithIdAndPassword, 
      registerWithIdAndPassword,
      loginWithGoogle, 
      logout,
      requestPasswordReset,
      hasPermission,
      logAudit
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
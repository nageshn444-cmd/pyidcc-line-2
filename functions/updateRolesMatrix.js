import admin from 'firebase-admin';
import { cert } from 'firebase-admin/app';
import { readFile } from 'fs/promises';
import { join } from 'path';

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

const newRolePermissions = {
  ADMIN_SS: {
    Dashboard: "Full",
    "Crew Registry": "Full",
    "Duty Roster": "Full",
    "Shift Exchange": "Full",
    "Duty Swap": "Full",
    "Automated Dispatch Gate": "Full",
    "Live Relief Tracking": "Full",
    "Emergency Relief Module": "Full",
    "Reports Center": "Full",
    "User Control Center": "Full",
    "KM Calculator Suite": "Full",
    "Rake Registry": "Full",
    "Leave Requests": "Full",
    "AI ALS Cab Inspection": "Full"
  },
  ADMIN_Station_Superintendent: {
    Dashboard: "Full",
    "Crew Registry": "Full",
    "Duty Roster": "Full",
    "Shift Exchange": "Full",
    "Duty Swap": "Full",
    "Automated Dispatch Gate": "View",
    "Live Relief Tracking": "View",
    "Emergency Relief Module": "View",
    "Reports Center": "View",
    "User Control Center": "View",
    "KM Calculator Suite": "View",
    "Rake Registry": "View",
    "Leave Requests": "View",
    "AI ALS Cab Inspection": "View"
  },
  CREW_CONTROLLER: {
    Dashboard: "Full",
    "Crew Registry": "Full",
    "Duty Roster": "Full",
    "Shift Exchange": "Full",
    "Duty Swap": "Full",
    "Automated Dispatch Gate": "No",
    "Live Relief Tracking": "No",
    "Emergency Relief Module": "No",
    "Reports Center": "No",
    "User Control Center": "No",
    "KM Calculator Suite": "No",
    "Rake Registry": "No",
    "Leave Requests": "No",
    "AI ALS Cab Inspection": "No"
  },
  STATION_CONTROLLER: {
    Dashboard: "No",
    "Crew Registry": "No",
    "Duty Roster": "No",
    "Shift Exchange": "No",
    "Duty Swap": "No",
    "Automated Dispatch Gate": "No",
    "Live Relief Tracking": "No",
    "Emergency Relief Module": "No",
    "Reports Center": "No",
    "User Control Center": "No",
    "KM Calculator Suite": "No",
    "Rake Registry": "No",
    "Leave Requests": "No",
    "AI ALS Cab Inspection": "No"
  },
  SUPER_ADMIN: {
    Dashboard: "Full",
    "Crew Registry": "Full",
    "Duty Roster": "Full",
    "Shift Exchange": "Full",
    "Duty Swap": "Full",
    "Automated Dispatch Gate": "Full",
    "Live Relief Tracking": "Full",
    "Emergency Relief Module": "Full",
    "Reports Center": "Full",
    "User Control Center": "Full",
    "KM Calculator Suite": "Full",
    "Rake Registry": "Full",
    "Leave Requests": "Full",
    "AI ALS Cab Inspection": "Full"
  },
  TRAIN_OPERATOR: {
    Dashboard: "View",
    "Crew Registry": "Own",
    "Duty Roster": "Own",
    "Shift Exchange": "Request",
    "Duty Swap": "Request",
    "Automated Dispatch Gate": "View",
    "Live Relief Tracking": "View",
    "Emergency Relief Module": "View",
    "Reports Center": "View",
    "User Control Center": "View",
    "KM Calculator Suite": "View",
    "Rake Registry": "View",
    "Leave Requests": "View",
    "AI ALS Cab Inspection": "View"
  },
  VIEWER: {
    Dashboard: "View",
    "Crew Registry": "View",
    "Duty Roster": "View",
    "Shift Exchange": "View",
    "Duty Swap": "View",
    "Automated Dispatch Gate": "View",
    "Live Relief Tracking": "View",
    "Emergency Relief Module": "View",
    "Reports Center": "No",
    "User Control Center": "No",
    "KM Calculator Suite": "No",
    "Rake Registry": "No",
    "Leave Requests": "No",
    "AI ALS Cab Inspection": "No"
  }
};

async function updatePermissions() {
  console.log("Loading service account credentials...");
  const serviceAccountPath = join(process.cwd(), "config", "serviceAccount.json");
  let serviceAccount;
  try {
    const fileContent = await readFile(serviceAccountPath, "utf-8");
    serviceAccount = JSON.parse(fileContent);
  } catch (e) {
    console.warn("Could not read serviceAccount.json, trying fallback credentials file...");
    const altPath = join(process.cwd(), "config", "pyidline2crew-41022-firebase-adminsdk-fbsvc-65ba945435.json");
    const altContent = await readFile(altPath, "utf-8");
    serviceAccount = JSON.parse(altContent);
  }

  admin.initializeApp({
    credential: cert(serviceAccount)
  });

  const db = admin.firestore();
  console.log("Updating role permissions in Firestore...");
  const batch = db.batch();

  for (const [roleId, permissions] of Object.entries(newRolePermissions)) {
    const fullPerms = {};
    MODULES.forEach(mod => {
      fullPerms[mod] = permissions[mod] || "No";
    });

    const roleRef = db.collection('roles').doc(roleId);
    batch.set(roleRef, {
      roleName: roleId,
      permissions: fullPerms
    }, { merge: true });

    const rolePermRef = db.collection('role_permissions').doc(roleId);
    batch.set(rolePermRef, {
      roleName: roleId,
      permissions: fullPerms
    }, { merge: true });

    console.log(`Prepared update for role: ${roleId}`);
  }

  await batch.commit();
  console.log("All role permissions updated successfully in Firestore.");
}

updatePermissions().catch(console.error);

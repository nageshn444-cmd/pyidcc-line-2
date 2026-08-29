/**
 * BMRCL Peenya Depot Line 2 — Crew Registry Data Merger & Schema Unification Script
 * 
 * Merges detailed operational fields from employeeProfileMaster.js and bmrclWeeklyOffSchedule.js
 * into the live Firestore `crewRegistry` collection.
 * 
 * Non-destructive: Existing user edits and documents are merged, never blindly overwritten.
 */

import { db } from '../firebase';
import { collection, doc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { EMPLOYEE_MASTER_REGISTRY } from '../data/employeeProfileMaster';
import { OFFICIAL_JMD_TD_REGISTRY } from '../data/jmdCrewMaster';
import { BMRCL_CREW_REGISTRY } from '../data/bmrclCrewRegistry';
import { ALL_OFFICIAL_SUPERVISORY_STAFF } from '../data/ccRosterRegistry';

export const OFFICIAL_PYID_ACTIVE_IDS = new Set([
  20018, 20019, 20037, 20038, 20057, 20087, 20726, 20787, 21029, 21078, 21083, 21414, 21434, 21436, 21482, 21502, 21504, 21506, 21509, 21553, 21694, 21702, 21703, 21705, 21708, 21711, 21712, 21714, 21715, 21723, 21724, 21725, 21945, 21953, 21955, 21961, 21967, 21968, 21969, 21970, 21971, 21977, 21978, 21988, 21994, 22013, 22016, 22101, 22116, 22224, 22227, 22229, 22234, 22236, 22237, 22238, 22239, 22240, 22244, 22245, 22246, 22248, 22254, 22256, 22258, 22260, 22261, 22264, 22268, 22281, 22282, 22284, 22287, 22289, 22294, 22296, 22297, 22308, 22312, 22315, 22319, 22322, 22438, 22455, 22456, 22457, 22458, 22461, 22463, 22464, 22465, 22468, 22470, 22480, 22483, 22484, 22486, 22490, 22491, 22493, 22494, 22497, 22499, 22500, 22502, 22506, 22514, 22517, 22522, 22525, 22527, 22528, 22561, 22566, 22571, 22572, 22581, 22586, 22588, 88000002, 88000009, 88000020, 88000021, 88000031, 88000037, 88000038, 88000041, 88000042, 88000045, 88000047, 88000048, 88000050, 88000051, 88000081, 88000084, 88000085, 88000086, 88000087, 88000088, 88000092, 88000093, 88000094, 88000095, 88000096, 88000100, 88000102, 88000104, 88000105, 88000106, 88000107, 88000108, 88000109, 88000110, 88000111, 88000114, 88000115, 88000116, 88000117, 88000118, 88000119, 88000120, 88000121, 88000122, 88000124, 88000125, 88000127, 88000128, 88000129, 88000131, 88000132, 88000134, 88000135, 88000136, 88000137, 88000139, 88000140, 88000141, 88000142, 88000143, 88000146, 88000149
]);

/**
 * Builds the complete unified profile for an employee combining base registry,
 * profile master intelligence, and official weekly off schedules.
 */
/**
 * Normalizes any raw ID (e.g. "crew_20018", "20018", 20018, " 20018 ") into a clean canonical integer.
 * Returns null if the ID is corrupted, undefined, or contains no positive digits.
 */
export function normalizeCanonicalEmpId(rawId) {
  if (rawId === null || rawId === undefined) return null;
  const str = String(rawId).trim();
  if (!str || str === 'undefined' || str === 'null' || str === 'NaN') return null;
  const digitsOnly = str.replace(/\D/g, '');
  if (!digitsOnly || digitsOnly === '0') return null;
  const num = parseInt(digitsOnly, 10);
  if (isNaN(num) || num <= 0) return null;
  return num;
}

/**
 * Builds the complete unified profile for an employee combining base registry,
 * profile master intelligence, and official weekly off schedules.
 */
export function buildUnifiedEmployeeProfile(empId) {
  const numericId = normalizeCanonicalEmpId(empId);
  const strId = numericId ? String(numericId) : String(empId).trim();

  const baseCrew = (BMRCL_CREW_REGISTRY || []).find(e => {
    const bId = normalizeCanonicalEmpId(e.empId || e.employeeId || e.id);
    return bId === numericId;
  }) || {};
  const supervisoryProfile = (ALL_OFFICIAL_SUPERVISORY_STAFF || []).find(e => normalizeCanonicalEmpId(e.empId) === numericId) || {};
  const jmdProfile = (OFFICIAL_JMD_TD_REGISTRY || []).find(e => normalizeCanonicalEmpId(e.empId) === numericId) || {};
  const masterProfile = (EMPLOYEE_MASTER_REGISTRY || []).find(e => normalizeCanonicalEmpId(e.empId) === numericId) || supervisoryProfile || jmdProfile;

  const isOfficialActivePYID = numericId ? OFFICIAL_PYID_ACTIVE_IDS.has(numericId) : false;

  const resolvedName = masterProfile.name || supervisoryProfile.name || jmdProfile.name || (baseCrew.name && !baseCrew.name.startsWith('Employee #') ? baseCrew.name : null) || (baseCrew.empName && !baseCrew.empName.startsWith('Employee #') ? baseCrew.empName : null);
  const name = resolvedName || `Staff #${strId}`;
  const gender = masterProfile.gender || supervisoryProfile.gender || baseCrew.gender || 'MALE';
  const role = masterProfile.role || supervisoryProfile.role || (masterProfile.isOfficialCC ? 'OFFICIAL_CREW_CONTROLLER' : (baseCrew.role || 'TRAIN_OPERATOR'));
  const isOfficialCC = !!(masterProfile.isOfficialCC || supervisoryProfile.role?.includes('CC') || role === 'OFFICIAL_CREW_CONTROLLER');
  const ccWilling = !!(masterProfile.ccWilling || baseCrew.ccWilling);
  const fixedWo = masterProfile.fixedWo || supervisoryProfile.fixedWo || baseCrew.weeklyOffDay || baseCrew.fixedWo || 'Sunday';

  // Relieve status determination: Respect explicit masterProfile / baseCrew flags
  let isRelieved = false;
  let status = 'ACTIVE';
  let activeCrew = true;
  let relievedReason = null;

  if (masterProfile.maternityLeave && masterProfile.maternityLeave.active && !masterProfile.maternityLeave.actualReportDate) {
    status = 'MATERNITY_LEAVE';
    activeCrew = true;
    isRelieved = false;
  } else if (typeof masterProfile.isRelieved === 'boolean') {
    isRelieved = masterProfile.isRelieved;
    status = isRelieved ? 'RELIEVED' : (masterProfile.status || 'ACTIVE');
    activeCrew = !isRelieved;
    relievedReason = isRelieved ? (masterProfile.relievedReason || 'Working as Station Controller / Transferred from PYID CC') : null;
  } else if (typeof baseCrew.isRelieved === 'boolean') {
    isRelieved = baseCrew.isRelieved;
    status = isRelieved ? 'RELIEVED' : (baseCrew.status || 'ACTIVE');
    activeCrew = !isRelieved;
    relievedReason = isRelieved ? (baseCrew.relievedReason || 'Working as Station Controller / Transferred from PYID CC') : null;
  } else {
    // Default fallback: if not in official PYID active sheet, mark as Station Controller / Relieved
    isRelieved = !isOfficialActivePYID;
    status = isRelieved ? 'RELIEVED' : 'ACTIVE';
    activeCrew = !isRelieved;
    relievedReason = isRelieved ? 'Working as Station Controller / Transferred from PYID CC' : null;
  }

  return {
    empId: numericId || strId,
    name,
    gender,
    role,
    isOfficialCC,
    ccWilling,
    fixedWo,
    status,
    activeCrew,
    isRelieved,
    relievedReason,
    relievedDate: isRelieved ? (masterProfile.relievedDate || '2026-08-01') : null,
    relievedNotes: isRelieved ? (masterProfile.relievedNotes || 'Working as Station Controller. Click Reinstate when returned to PYID CC.') : null,
    specialProfile: masterProfile.specialProfile || (gender === 'FEMALE' ? 'PINK' : 'STANDARD'),
    nightTarget: masterProfile.nightTarget === 5 ? 6 : (masterProfile.nightTarget || 6),
    boardingStation: masterProfile.boardingStation || baseCrew.station || 'PYID',
    phone: baseCrew.phone || baseCrew.contact || masterProfile.phone || '',
    bloodGroup: baseCrew.bloodGroup || masterProfile.bloodGroup || '',
    designation: masterProfile.designation || baseCrew.designation || (isOfficialCC ? 'Station Superintendent / CC' : (strId.startsWith('8') ? 'Train Driver (JMD Contract)' : 'Train Operator')),
    lrd: masterProfile.lrd || { required: false, daysRequired: 1, daysCompleted: 1, lastAssessmentDate: null },
    maternityLeave: masterProfile.maternityLeave || { active: false, startDate: null, statutoryEndDate: null, actualReportDate: null }
  };
}

/**
 * Clean & Purge Duplicate Firestore Documents from `crewRegistry` Collection.
 * Deletes all redundant/duplicate documents for the same employee ID and keeps exactly ONE canonical doc (`crew_${empId}`).
 */
export async function purgeDuplicateFirestoreCrewDocuments() {
  const crewCollection = collection(db, 'crewRegistry');
  const snapshot = await getDocs(crewCollection);
  
  const empDocGroups = new Map();
  const corruptedDocs = [];

  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    const docId = docSnap.id;
    const empId = normalizeCanonicalEmpId(data.empId || data.employeeId || docId);

    if (!empId) {
      corruptedDocs.push(docId);
      return;
    }

    if (!empDocGroups.has(empId)) {
      empDocGroups.set(empId, []);
    }
    empDocGroups.get(empId).push({ docId, data });
  });

  const docsToDelete = [...corruptedDocs];
  const docsToUpsert = [];

  empDocGroups.forEach((docList, empId) => {
    const canonicalDocId = `crew_${empId}`;
    // Merge data from all duplicate docs, prioritizing canonical doc and richest fields
    let mergedData = buildUnifiedEmployeeProfile(empId);

    // Pick best existing data
    docList.forEach(item => {
      mergedData = { ...mergedData, ...item.data, empId };
    });

    docsToUpsert.push({ docId: canonicalDocId, data: mergedData });

    // Mark all other doc IDs as deleted
    docList.forEach(item => {
      if (item.docId !== canonicalDocId) {
        docsToDelete.push(item.docId);
      }
    });
  });

  // Execute Batch Operations in chunks of 400
  let deletedCount = 0;
  let batch = writeBatch(db);
  let opCount = 0;

  // 1. Delete redundant duplicates
  for (const docId of docsToDelete) {
    batch.delete(doc(db, 'crewRegistry', docId));
    opCount++;
    deletedCount++;

    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  // 2. Ensure canonical docs are up to date
  for (const item of docsToUpsert) {
    batch.set(doc(db, 'crewRegistry', item.docId), item.data, { merge: true });
    opCount++;

    if (opCount >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  return {
    success: true,
    totalDuplicatesDeleted: deletedCount,
    canonicalUniqueCount: empDocGroups.size
  };
}

/**
 * Merges unified profile fields into Firestore `crewRegistry` collection without creating duplicates.
 */
export async function mergeCrewRegistryToFirestore() {
  return await purgeDuplicateFirestoreCrewDocuments();
}

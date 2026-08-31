/**
 * Enterprise Excel Firebase Cloud Persistence Service
 * Stores workbooks, snapshots, and audit logs into separate Firestore collections.
 * Does NOT touch any existing operational collections.
 */

import { db } from '../../firebase';
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, 
  deleteDoc, serverTimestamp, query, orderBy, limit, addDoc 
} from 'firebase/firestore';

const COLLECTION_WORKBOOKS = 'excelWorkbooks';
const COLLECTION_VERSIONS  = 'excelWorkbookVersions';
const COLLECTION_AUDIT     = 'excelAuditLogs';

/**
 * Saves or updates a workbook in Firestore.
 */
export async function saveWorkbookToFirestore(workbook, currentUser) {
  if (!workbook || !workbook.id) return null;

  try {
    const docRef = doc(db, COLLECTION_WORKBOOKS, workbook.id);
    const payload = {
      id: workbook.id,
      name: workbook.name || 'Untitled Workbook',
      activeSheetId: workbook.activeSheetId,
      sheetList: Object.values(workbook.sheets || {}).map(s => ({ id: s.id, name: s.name })),
      sheets: workbook.sheets || {},
      version: (workbook.version || 1) + 1,
      ownerId: currentUser?.uid || currentUser?.employeeId || 'anonymous',
      updatedBy: currentUser?.displayName || currentUser?.name || currentUser?.email || 'Crew Controller',
      updatedAt: serverTimestamp()
    };

    await setDoc(docRef, payload, { merge: true });
    return { ...workbook, version: payload.version };
  } catch (err) {
    console.error('Firestore workbook save error:', err);
    throw err;
  }
}

/**
 * Loads a single workbook from Firestore by ID.
 */
export async function loadWorkbookFromFirestore(workbookId) {
  if (!workbookId) return null;
  try {
    const docRef = doc(db, COLLECTION_WORKBOOKS, workbookId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (err) {
    console.error('Firestore workbook load error:', err);
    return null;
  }
}

/**
 * Lists all cloud-stored workbooks.
 */
export async function listCloudWorkbooks() {
  try {
    const colRef = collection(db, COLLECTION_WORKBOOKS);
    const q = query(colRef, orderBy('updatedAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (err) {
    console.warn('Could not list cloud workbooks:', err);
    return [];
  }
}

/**
 * Creates a version snapshot in Firestore.
 */
export async function saveWorkbookVersion(workbook, currentUser, changeNote = '') {
  if (!workbook || !workbook.id) return;
  try {
    const colRef = collection(db, COLLECTION_VERSIONS);
    await addDoc(colRef, {
      workbookId: workbook.id,
      name: workbook.name,
      sheets: workbook.sheets,
      version: workbook.version || 1,
      changeNote,
      savedBy: currentUser?.displayName || currentUser?.name || 'User',
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('Could not save workbook version:', err);
  }
}

/**
 * Records an audit log entry for workbook actions.
 */
export async function recordExcelAuditLog(action, workbookId, details = {}, currentUser = null) {
  try {
    const colRef = collection(db, COLLECTION_AUDIT);
    await addDoc(colRef, {
      action,
      workbookId,
      details,
      user: currentUser?.displayName || currentUser?.name || currentUser?.email || 'OCC-2 Controller',
      userId: currentUser?.uid || currentUser?.employeeId || 'OCC-2',
      timestamp: serverTimestamp()
    });
  } catch (err) {
    // Non-blocking
    console.debug('Excel audit log skipped:', err);
  }
}

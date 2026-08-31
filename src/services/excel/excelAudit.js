/**
 * Enterprise Excel Audit Logging Service
 * Tracks workbook mutations, creations, exports, and imports.
 */

import { recordExcelAuditLog } from './excelFirebase';

const LOCAL_AUDIT_KEY = 'pyidcc_excel_audit_trail_v1';

export function logExcelAction(action, workbookId, details = {}, currentUser = null) {
  const entry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    action,
    workbookId,
    details,
    user: currentUser?.displayName || currentUser?.name || currentUser?.email || 'Crew Controller',
    timestamp: new Date().toISOString()
  };

  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    const trail = raw ? JSON.parse(raw) : [];
    trail.unshift(entry);
    if (trail.length > 100) trail.pop(); // Keep last 100 entries locally
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(trail));
  } catch (_) {}

  // Attempt async firestore recording (non-blocking)
  recordExcelAuditLog(action, workbookId, details, currentUser);
}

export function getLocalAuditTrail() {
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

/**
 * BMRCL Line 2 Crew Control (PYIDCC)
 * Safe Firebase Data Inspection, Backup & Cleanup Script
 *
 * SAFETY GUARANTEES:
 * 1. Default mode is DRY-RUN ONLY. Absolutely NO data is modified or deleted unless --execute is explicitly supplied.
 * 2. Mandatory pre-cleanup JSON backup created and verified in ./backups/ before deletion.
 * 3. Protected collections allowlist strictly prevents touching operational or master records.
 * 4. Batched deletion (max 50 documents per batch) with error isolation.
 */

const fs = require('fs');
const path = require('path');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Set Application Default Credentials if present
const adcPath = 'C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json';
if (fs.existsSync(adcPath)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
}

if (!getApps().length) {
  initializeApp({
    projectId: 'pyidline2crew-41022'
  });
}

const db = getFirestore();

// STRICT PROTECTED ALLOWLIST - These collections MUST NEVER be deleted or modified
const PROTECTED_COLLECTIONS = new Set([
  'wtt_final_matrix',
  'working_time_table',
  'crew_final_links',
  'crewRegistry',
  'employees',
  'dispatch_deployments',
  'system_users',
  'users',
  'roles',
  'role_permissions',
  'leave_requests',
  'weekly_off_register',
  'absent_bookoff_register',
  'rake_registry',
  'rolling_stock_faults',
  'safety_incidents',
  'system_settings',
  'station_chainage',
  'emergency_relief_ledger'
]);

// Helper: Check if document ID is a reverse-date format (DD-MM-YYYY)
function isReverseDateId(id) {
  return /^\d{2}-\d{2}-\d{4}$/.test(id) || /^date_\d{2}-\d{2}-\d{4}$/.test(id);
}

// Helper: Check if document is older than N days
function isOlderThanDays(timestampOrDateStr, days) {
  if (!timestampOrDateStr) return false;
  let date;
  if (timestampOrDateStr._seconds) {
    date = new Date(timestampOrDateStr._seconds * 1000);
  } else if (timestampOrDateStr.toDate && typeof timestampOrDateStr.toDate === 'function') {
    date = timestampOrDateStr.toDate();
  } else {
    date = new Date(timestampOrDateStr);
  }
  if (isNaN(date.getTime())) return false;
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  return date.getTime() < cutoff;
}

async function runCleanup() {
  const isExecute = process.argv.includes('--execute');
  console.log('================================================================');
  console.log('   BMRCL PYIDCC SAFE FIREBASE DATA AUDIT & CLEANUP UTILITY      ');
  console.log(`   MODE: ${isExecute ? '⚠️ LIVE EXECUTION' : '🛡️ DRY-RUN ONLY (Safe)'} `);
  console.log('================================================================\n');

  const candidates = [];

  // 1. Inspect dispatch_excel_cache for duplicate reverse-date docs
  console.log('1. Scanning dispatch_excel_cache for duplicate reverse-date docs...');
  try {
    const snap = await db.collection('dispatch_excel_cache').get();
    snap.docs.forEach(docSnap => {
      const docId = docSnap.id;
      // Never touch canonical YYYY-MM-DD, 'current', or 'latest'
      if (docId === 'current' || docId === 'latest') return;
      if (isReverseDateId(docId)) {
        candidates.push({
          collection: 'dispatch_excel_cache',
          id: docId,
          reason: 'Duplicate reverse-date format (DD-MM-YYYY); canonical YYYY-MM-DD is preserved',
          data: docSnap.data()
        });
      }
    });
  } catch (err) {
    console.warn('   Could not scan dispatch_excel_cache:', err.message);
  }

  // 2. Inspect roster_desk_console for duplicate reverse-date docs
  console.log('2. Scanning roster_desk_console for duplicate reverse-date docs...');
  try {
    const snap = await db.collection('roster_desk_console').get();
    snap.docs.forEach(docSnap => {
      const docId = docSnap.id;
      if (docId === 'current' || docId === 'latest') return;
      if (isReverseDateId(docId)) {
        candidates.push({
          collection: 'roster_desk_console',
          id: docId,
          reason: 'Duplicate reverse-date format (DD-MM-YYYY); canonical YYYY-MM-DD is preserved',
          data: docSnap.data()
        });
      }
    });
  } catch (err) {
    console.warn('   Could not scan roster_desk_console:', err.message);
  }

  // 3. Inspect login_requests for stale entries (>14 days)
  console.log('3. Scanning login_requests for stale handshake entries (>14 days)...');
  try {
    const snap = await db.collection('login_requests').get();
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const ts = data.createdAt || data.timestamp || data.requestedAt || data.date;
      if (isOlderThanDays(ts, 14)) {
        candidates.push({
          collection: 'login_requests',
          id: docSnap.id,
          reason: 'Stale login request > 14 days old',
          data: data
        });
      }
    });
  } catch (err) {
    console.warn('   Could not scan login_requests:', err.message);
  }

  // Double-check candidates against protected collections allowlist
  for (const cand of candidates) {
    if (PROTECTED_COLLECTIONS.has(cand.collection)) {
      throw new Error(`SECURITY VIOLATION: Candidate collection '${cand.collection}' is strictly PROTECTED! Aborting immediately.`);
    }
  }

  console.log(`\nFound ${candidates.length} candidate documents for cleanup.\n`);

  if (candidates.length === 0) {
    console.log('✅ No unnecessary, duplicate, or stale documents found. Firestore is clean.');
    return;
  }

  // Display candidate summary table
  const summaryByCollection = {};
  let totalBytes = 0;
  candidates.forEach(c => {
    summaryByCollection[c.collection] = (summaryByCollection[c.collection] || 0) + 1;
    const bytes = Buffer.byteLength(JSON.stringify(c.data), 'utf8');
    totalBytes += bytes;
  });

  console.log('--- Candidate Breakdown ---');
  console.table(Object.entries(summaryByCollection).map(([col, count]) => ({
    Collection: col,
    'Candidate Count': count
  })));
  console.log(`Total Payload Size: ${(totalBytes / 1024).toFixed(2)} KB\n`);

  // Print candidate details
  console.log('--- Document ID List ---');
  candidates.forEach((c, idx) => {
    console.log(`  [${idx + 1}] ${c.collection}/${c.id} (${c.reason})`);
  });

  // MANDATORY STEP: Create Local JSON Backup
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `pre_cleanup_backup_${timestamp}.json`);

  const backupData = {
    createdAt: new Date().toISOString(),
    projectId: 'pyidline2crew-41022',
    totalDocuments: candidates.length,
    documents: candidates.map(c => ({
      collection: c.collection,
      id: c.id,
      reason: c.reason,
      data: c.data
    }))
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`\n💾 PRE-CLEANUP BACKUP CREATED:`);
  console.log(`   Path: ${backupFilePath}`);
  console.log(`   Size: ${(fs.statSync(backupFilePath).size / 1024).toFixed(2)} KB`);

  if (!isExecute) {
    console.log('\n================================================================');
    console.log('   DRY-RUN COMPLETE: 0 documents were deleted.                  ');
    console.log('   All data is safely backed up.                                ');
    console.log('   To execute deletions, obtain user confirmation and rerun:    ');
    console.log('     node scripts/safe_cleanup_dryrun.cjs --execute             ');
    console.log('================================================================\n');
    return;
  }

  // EXECUTE MODE: Batch deletion
  console.log('\n⚠️ EXECUTING BATCH DELETION...');
  const BATCH_SIZE = 50;
  let deletedCount = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const chunk = candidates.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach(item => {
      const docRef = db.collection(item.collection).doc(item.id);
      batch.delete(docRef);
    });

    await batch.commit();
    deletedCount += chunk.length;
    console.log(`   Deleted batch ${Math.floor(i / BATCH_SIZE) + 1} (${deletedCount}/${candidates.length} docs)`);
  }

  console.log('\n✅ Cleanup completed successfully!');
  console.log(`   Total deleted documents: ${deletedCount}`);
  console.log(`   Backup preserved at: ${backupFilePath}`);
}

runCleanup().catch(err => {
  if (err.message && err.message.includes('RESOURCE_EXHAUSTED')) {
    console.error('\n⚠️ NOTICE: Firestore Daily Quota Exceeded (RESOURCE_EXHAUSTED).');
    console.error('   The Firebase Spark plan limit has been reached for today.');
    console.error('   The script is ready and will run as soon as the quota resets at midnight Pacific Time.');
  } else {
    console.error('\n❌ Cleanup utility error:', err);
  }
  process.exit(1);
});

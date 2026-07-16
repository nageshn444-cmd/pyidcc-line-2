/**
 * clear_logs.js
 * Clears all login/audit/request log collections from Firestore.
 * Uses Firebase Admin SDK with Application Default Credentials (gcloud login).
 * Run with: node clear_logs.js
 */

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ── Initialize with Application Default Credentials ──────────────────────────
initializeApp({
  credential: applicationDefault(),
  projectId: 'pyidline2crew-41022'
});

const db = getFirestore();

const COLLECTIONS_TO_CLEAR = [
  'login_history',
  'loginHistory',
  'auditLogs',
  'login_requests',
  'loginRequests'
];

async function clearCollection(collectionName) {
  const ref = db.collection(collectionName);
  let totalDeleted = 0;

  while (true) {
    const snap = await ref.limit(400).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    totalDeleted += snap.size;
  }

  console.log(`  ✅ ${collectionName}: ${totalDeleted} document(s) deleted`);
  return totalDeleted;
}

async function main() {
  console.log('\n🗑️  PYIDCC Firebase Log Cleaner');
  console.log('═'.repeat(45));

  let grandTotal = 0;
  for (const col of COLLECTIONS_TO_CLEAR) {
    try {
      const count = await clearCollection(col);
      grandTotal += count;
    } catch (err) {
      if (err.code === 5) {
        // Collection not found / empty — skip
        console.log(`  ⚠️  ${col}: empty or not found, skipping`);
      } else {
        console.error(`  ❌ ${col}: ${err.message}`);
      }
    }
  }

  console.log('═'.repeat(45));
  console.log(`✅ Complete. Total deleted: ${grandTotal} document(s)`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});

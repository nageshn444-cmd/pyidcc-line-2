/**
 * clear_logs_rest.js
 * Clears Firestore collections via the REST API using a gcloud access token.
 * Run: node scripts/clear_logs_rest.js
 */

const https = require('https');

const PROJECT_ID  = 'pyidline2crew-41022';
const DATABASE    = '(default)';
const BASE_URL    = `firestore.googleapis.com`;
const BASE_PATH   = `/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

const COLLECTIONS = [
  'login_history',
  'loginHistory',
  'auditLogs',
  'login_requests',
  'loginRequests'
];

// ── Get access token from gcloud ─────────────────────────────────────────────
const { execSync } = require('child_process');
let ACCESS_TOKEN;
try {
  ACCESS_TOKEN = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
} catch (e) {
  console.error('❌ Could not get gcloud access token. Run: gcloud auth login');
  process.exit(1);
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function httpsRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function listDocs(collectionId, pageToken = null) {
  let path = `${BASE_PATH}/${collectionId}?pageSize=300`;
  if (pageToken) path += `&pageToken=${pageToken}`;
  const res = await httpsRequest('GET', path);
  return res.body;
}

async function deleteDoc(docPath) {
  // docPath is the full resource name
  const path = `/v1/${docPath}`;
  await httpsRequest('DELETE', path);
}

// ── Batch delete via runQuery + commit ───────────────────────────────────────
async function clearCollection(colId) {
  let totalDeleted = 0;
  let pageToken = null;

  do {
    const result = await listDocs(colId, pageToken);
    const docs = result.documents || [];

    if (docs.length === 0) break;

    // Build a batch commit (max 20 at a time to be safe)
    for (const doc of docs) {
      await deleteDoc(doc.name);
      totalDeleted++;
    }

    pageToken = result.nextPageToken || null;
  } while (pageToken);

  console.log(`  ✅ ${colId}: ${totalDeleted} document(s) deleted`);
  return totalDeleted;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🗑️  PYIDCC Firestore Log Cleaner (REST API)');
  console.log('═'.repeat(50));

  let grand = 0;
  for (const col of COLLECTIONS) {
    try {
      grand += await clearCollection(col);
    } catch (err) {
      console.error(`  ❌ ${col}: ${err.message}`);
    }
  }

  console.log('═'.repeat(50));
  console.log(`✅ Complete. Total deleted: ${grand} document(s)\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

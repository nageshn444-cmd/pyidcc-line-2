/**
 * clear_logs_rest.cjs
 * Clears Firestore log collections via the REST API using gcloud access token.
 */

const https = require('https');
const { execSync } = require('child_process');

const PROJECT_ID = 'pyidline2crew-41022';
const BASE_URL   = 'firestore.googleapis.com';
const BASE_PATH  = `/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const COLLECTIONS = [
  'login_history',
  'loginHistory',
  'auditLogs',
  'login_requests',
  'loginRequests'
];

let ACCESS_TOKEN;
try {
  ACCESS_TOKEN = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
  console.log('✓ Got gcloud access token');
} catch (e) {
  console.error('❌ Could not get gcloud access token. Run: gcloud auth login');
  process.exit(1);
}

function httpsRequest(method, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: BASE_URL, path, method,
        headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
      },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function clearCollection(colId) {
  let total = 0;
  let pageToken = null;

  do {
    let path = `${BASE_PATH}/${colId}?pageSize=300&mask.fieldPaths=__name__`;
    if (pageToken) path += `&pageToken=${encodeURIComponent(pageToken)}`;

    const res = await httpsRequest('GET', path);
    if (res.status !== 200) {
      console.log(`  ⚠️  ${colId}: HTTP ${res.status} — ${JSON.stringify(res.body).slice(0,120)}`);
      break;
    }

    const docs = res.body.documents || [];
    if (docs.length === 0) break;

    for (const d of docs) {
      // d.name is like: projects/xxx/databases/(default)/documents/collection/docId
      const docPath = `/v1/${d.name}`;
      const del = await httpsRequest('DELETE', docPath);
      if (del.status === 200 || del.status === 204) total++;
      else console.log(`    ⚠️ Delete ${d.name} -> HTTP ${del.status}`);
    }

    pageToken = res.body.nextPageToken || null;
  } while (pageToken);

  console.log(`  ✅ ${colId}: ${total} document(s) deleted`);
  return total;
}

async function main() {
  console.log('\n🗑️  PYIDCC Firestore Log Cleaner');
  console.log('═'.repeat(45));

  let grand = 0;
  for (const col of COLLECTIONS) {
    try { grand += await clearCollection(col); }
    catch (err) { console.error(`  ❌ ${col}: ${err.message}`); }
  }

  console.log('═'.repeat(45));
  console.log(`✅ Complete. Total deleted: ${grand} document(s)\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

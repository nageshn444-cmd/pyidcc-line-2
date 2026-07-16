const fs = require('fs');
const path = require('path');

// Read tokens from firebase-tools.json
const firebaseToolsPath = 'C:\\Users\\nages\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
const tokens = config.tokens;

async function run() {
  const accessToken = tokens.access_token;
  const projectId = 'pyidline2crew-41022';
  
  console.log("Fetching latest audit logs...");
  const auditRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/auditLogs?pageSize=5&orderBy=timestamp%20desc`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (auditRes.ok) {
    const auditData = await auditRes.json();
    console.log("Latest Audit Logs:");
    console.log(JSON.stringify(auditData.documents || [], null, 2));
  } else {
    console.error("Failed to fetch audit logs:", await auditRes.text());
  }

  console.log("\nFetching latest login history...");
  const loginRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/login_history?pageSize=5&orderBy=timestamp%20desc`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (loginRes.ok) {
    const loginData = await loginRes.json();
    console.log("Latest Login History:");
    console.log(JSON.stringify(loginData.documents || [], null, 2));
  } else {
    console.error("Failed to fetch login history:", await loginRes.text());
  }
}

run().catch(console.error);

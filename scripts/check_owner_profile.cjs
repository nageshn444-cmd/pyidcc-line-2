const fs = require('fs');
const path = require('path');

// Read tokens from firebase-tools.json
const firebaseToolsPath = 'C:\\Users\\nages\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
const tokens = config.tokens;

async function run() {
  const accessToken = tokens.access_token;
  const projectId = 'pyidline2crew-41022';
  
  console.log("Checking owner profiles in system_users...");
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/system_users`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (res.ok) {
    const data = await res.json();
    console.log("Documents in system_users:");
    const docs = data.documents || [];
    for (const doc of docs) {
      const fields = doc.fields || {};
      const email = fields.email ? fields.email.stringValue : '';
      const empId = fields.employeeId ? fields.employeeId.stringValue : '';
      if (email === 'nageshn444@gmail.com' || empId === '20726') {
        console.log("MATCH FOUND:", doc.name);
        console.log(JSON.stringify(fields, null, 2));
      }
    }
  } else {
    console.error("Failed to fetch system_users:", await res.text());
  }
}

run().catch(console.error);

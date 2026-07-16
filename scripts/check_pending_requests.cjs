const fs = require('fs');
const path = require('path');

// Read tokens from firebase-tools.json
const firebaseToolsPath = 'C:\\Users\\nages\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
const tokens = config.tokens;

async function run() {
  const accessToken = tokens.access_token;
  const projectId = 'pyidline2crew-41022';
  
  console.log("Fetching registrationRequests...");
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/registrationRequests`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (res.ok) {
    const data = await res.json();
    console.log("Documents in registrationRequests:");
    console.log(JSON.stringify(data.documents || [], null, 2));
  } else {
    console.error("Failed to fetch registrationRequests:", await res.text());
  }
}

run().catch(console.error);

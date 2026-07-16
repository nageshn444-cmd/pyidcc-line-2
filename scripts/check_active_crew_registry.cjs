const fs = require('fs');
const path = require('path');

// Read tokens from firebase-tools.json
const firebaseToolsPath = 'C:\\Users\\nages\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
const tokens = config.tokens;

async function run() {
  const accessToken = tokens.access_token;
  const projectId = 'pyidline2crew-41022';
  
  console.log("Fetching activeCrewRegistry...");
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/activeCrewRegistry?pageSize=5`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (res.ok) {
    const data = await res.json();
    console.log("Documents in activeCrewRegistry:");
    console.log(JSON.stringify(data.documents || [], null, 2));
  } else {
    console.error("Failed to fetch activeCrewRegistry:", await res.text());
  }
}

run().catch(console.error);

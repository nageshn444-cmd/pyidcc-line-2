const fs = require('fs');
const path = require('path');

// Read tokens from firebase-tools.json
const firebaseToolsPath = 'C:\\Users\\nages\\.config\\configstore\\firebase-tools.json';
const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
const tokens = config.tokens;

async function run() {
  const accessToken = tokens.access_token;
  const projectId = 'pyidline2crew-41022';
  
  console.log("Removing pending registration request...");
  const deleteUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/registrationRequests/kiNP0UVvq1DHTXdiT2b8`;
  const res = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (res.ok) {
    console.log("Success! Cleaned up pending registrationRequests/kiNP0UVvq1DHTXdiT2b8.");
  } else {
    console.error("Failed to delete request:", await res.text());
  }
}

run().catch(console.error);

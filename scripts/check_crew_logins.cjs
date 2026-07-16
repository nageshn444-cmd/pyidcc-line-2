const fs = require('fs');
const path = require('path');

// 1. Read tokens from firebase-tools.json
const firebaseToolsPath = 'C:\\Users\\nages\\.config\\configstore\\firebase-tools.json';
if (!fs.existsSync(firebaseToolsPath)) {
  console.error("Error: firebase-tools.json not found. Please log in using 'firebase login'.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
const tokens = config.tokens;

if (!tokens || !tokens.refresh_token) {
  console.error("Error: No refresh token found in firebase-tools.json.");
  process.exit(1);
}

// 2. Parse local crew registry
const registryPath = path.join(__dirname, '../src/components/BmrclCrewRegistry.js');
if (!fs.existsSync(registryPath)) {
  console.error(`Error: Crew registry not found at ${registryPath}`);
  process.exit(1);
}

const registryContent = fs.readFileSync(registryPath, 'utf8');
const lines = registryContent.split('\n');
const crewList = [];

for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('{') && (trimmed.endsWith('},') || trimmed.endsWith('}'))) {
    try {
      const jsonStr = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
      const parsed = JSON.parse(jsonStr);
      crewList.push(parsed);
    } catch (e) {
      console.warn("Failed to parse registry line:", trimmed, e.message);
    }
  }
}

console.log(`Parsed ${crewList.length} crew members from local registry.\n`);

// 3. Helper to get token
async function getAccessToken() {
  return tokens.access_token;
}

// 4. Helper to list all documents in a collection via REST API
async function listAllDocuments(collectionName, accessToken) {
  let documents = [];
  let pageToken = '';
  const projectId = 'pyidline2crew-41022';
  
  do {
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionName}?pageSize=300`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Failed to list documents in ${collectionName}: ${res.statusText} - ${errText}`);
    }
    
    const data = await res.json();
    if (data.documents) {
      documents = documents.concat(data.documents);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  
  return documents;
}

// 5. Main validation logic
async function run() {
  console.log("Refreshing Google OAuth2 Access Token...");
  const accessToken = await getAccessToken();
  console.log("Token successfully refreshed.");

  console.log("Fetching Firestore collections...");
  const [sysUsersDocs, usersDocs, uacDocs] = await Promise.all([
    listAllDocuments('system_users', accessToken),
    listAllDocuments('users', accessToken),
    listAllDocuments('userAccessControl', accessToken)
  ]);

  console.log(`Successfully fetched from Firestore:`);
  console.log(`- system_users:      ${sysUsersDocs.length} documents`);
  console.log(`- users:             ${usersDocs.length} documents`);
  console.log(`- userAccessControl: ${uacDocs.length} documents\n`);

  // Helper to extract fields from Firestore document format
  const parseFirestoreDoc = (doc) => {
    const fields = doc.fields || {};
    const result = {};
    for (const [key, valueObj] of Object.entries(fields)) {
      if (valueObj.stringValue !== undefined) result[key] = valueObj.stringValue;
      else if (valueObj.booleanValue !== undefined) result[key] = valueObj.booleanValue;
      else if (valueObj.integerValue !== undefined) result[key] = Number(valueObj.integerValue);
      else if (valueObj.nullValue !== undefined) result[key] = null;
    }
    const parts = doc.name.split('/');
    result._id = parts[parts.length - 1];
    return result;
  };

  // Convert array of docs to maps by employeeId/id
  const systemUsersMap = {}; // Key is employeeId
  sysUsersDocs.forEach(d => {
    const parsed = parseFirestoreDoc(d);
    if (parsed.employeeId) {
      systemUsersMap[String(parsed.employeeId)] = parsed;
    }
  });

  const usersMap = {};
  usersDocs.forEach(d => {
    const parsed = parseFirestoreDoc(d);
    usersMap[String(parsed._id)] = parsed;
  });

  const uacMap = {};
  uacDocs.forEach(d => {
    const parsed = parseFirestoreDoc(d);
    uacMap[String(parsed._id)] = parsed;
  });

  console.log("=================== CREW LOGIN TEST RESULTS ===================");

  let totalChecked = 0;
  let totalReadyToLogin = 0;
  let totalBlocked = 0;
  let totalMissingProfile = 0;

  const warnings = [];

  crewList.forEach(crew => {
    const empId = String(crew.id);
    totalChecked++;

    const sysProfile = systemUsersMap[empId];
    const userProfile = usersMap[empId];
    const uacProfile = uacMap[empId];

    if (!sysProfile) {
      totalMissingProfile++;
      warnings.push({
        id: empId,
        name: crew.name,
        reason: "No entry in 'system_users' (account is not initialized/signed up)."
      });
      return;
    }

    const isApproved = sysProfile.approved === true;
    const isLoginEnabled = sysProfile.loginEnabled === true;
    const isActive = sysProfile.active === true || sysProfile.status === 'ACTIVE';

    const canLoginUac = uacProfile ? uacProfile.canLogin === true : false;
    const userActive = userProfile ? userProfile.active === true : false;

    const fullyReady = isApproved && isLoginEnabled && isActive && canLoginUac && userActive;

    if (fullyReady) {
      totalReadyToLogin++;
    } else {
      totalBlocked++;
      const blockedReasons = [];
      if (!isApproved) blockedReasons.push("Not approved in system_users");
      if (!isLoginEnabled) blockedReasons.push("Login disabled in system_users");
      if (!isActive) blockedReasons.push("Inactive status in system_users");
      if (!uacProfile) blockedReasons.push("Missing userAccessControl document");
      else if (!canLoginUac) blockedReasons.push("canLogin false in userAccessControl");
      if (!userProfile) blockedReasons.push("Missing users document");
      else if (!userActive) blockedReasons.push("Inactive in users document");

      warnings.push({
        id: empId,
        name: crew.name,
        reason: `Blocked from login: ${blockedReasons.join(', ')}`
      });
    }
  });

  console.log(`Total Checked in Registry: ${totalChecked}`);
  console.log(`Fully Ready to Log In:     ${totalReadyToLogin}`);
  console.log(`Blocked / Inactive Logins: ${totalBlocked}`);
  console.log(`Not Signed Up (Missing):   ${totalMissingProfile}`);
  console.log("===============================================================");

  if (warnings.length > 0) {
    console.log(`\nWarnings/Issues list (${warnings.length} total):`);
    warnings.slice(0, 30).forEach(w => {
      console.log(`- EMP #${w.id} (${w.name}): ${w.reason}`);
    });
    if (warnings.length > 30) {
      console.log(`... and ${warnings.length - 30} more.`);
    }
  } else {
    console.log("\nAll crew member accounts are perfectly configured and ready for login!");
  }
}

run().catch(err => {
  console.error("Check failed:", err);
  process.exit(1);
});

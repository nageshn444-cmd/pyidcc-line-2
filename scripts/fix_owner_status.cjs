const fs = require('fs');
const path = require('path');

// 1. Read tokens from firebase-tools.json
const firebaseToolsPath = 'C:\\Users\\nages\\.config\\configstore\\firebase-tools.json';
if (!fs.existsSync(firebaseToolsPath)) {
  console.error("Error: firebase-tools.json not found.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(firebaseToolsPath, 'utf8'));
const tokens = config.tokens;

async function run() {
  const accessToken = tokens.access_token;
  const projectId = 'pyidline2crew-41022';
  
  console.log("Searching system_users for email: nageshn444@gmail.com...");
  
  // Run query to find the document
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const queryRes = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'system_users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'email' },
            op: 'EQUAL',
            value: { stringValue: 'nageshn444@gmail.com' }
          }
        }
      }
    })
  });

  if (!queryRes.ok) {
    throw new Error(`Query failed: ${queryRes.statusText} - ${await queryRes.text()}`);
  }

  const queryResult = await queryRes.json();
  
  if (!queryResult || queryResult.length === 0 || !queryResult[0].document) {
    console.log("No system_users document found for nageshn444@gmail.com.");
    process.exit(0);
  }

  const docData = queryResult[0].document;
  const docName = docData.name; // Full path, e.g. projects/.../documents/system_users/UID
  const parts = docName.split('/');
  const uid = parts[parts.length - 1];
  
  console.log(`Found system_users document. UID: ${uid}`);
  console.log("Current document fields:", JSON.stringify(docData.fields, null, 2));

  // Let's update this document to make sure approved, loginEnabled, active are true, and status is ACTIVE.
  console.log("\nUpdating document status to ACTIVE...");
  
  const updateUrl = `https://firestore.googleapis.com/v1/${docName}?updateMask.fieldPaths=approved&updateMask.fieldPaths=loginEnabled&updateMask.fieldPaths=active&updateMask.fieldPaths=status`;
  
  const updateRes = await fetch(updateUrl, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        approved: { booleanValue: true },
        loginEnabled: { booleanValue: true },
        active: { booleanValue: true },
        status: { stringValue: 'ACTIVE' }
      }
    })
  });

  if (!updateRes.ok) {
    throw new Error(`Update failed: ${updateRes.statusText} - ${await updateRes.text()}`);
  }

  console.log("Success! Updated nageshn444@gmail.com's system_users status to ACTIVE.");
  
  // Also check if they exist in the users collection
  console.log("\nChecking 'users' collection for document ID 20726...");
  const userUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/20726`;
  const userRes = await fetch(userUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (userRes.ok) {
    const userData = await userRes.json();
    console.log("Current users/20726 fields:", JSON.stringify(userData.fields, null, 2));
    
    // Update users/20726 to be ACTIVE as well
    console.log("Updating users/20726 status to ACTIVE...");
    const userUpdateUrl = `${userUrl}?updateMask.fieldPaths=active&updateMask.fieldPaths=status&updateMask.fieldPaths=operationalCrew`;
    const userUpdateRes = await fetch(userUpdateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          active: { booleanValue: true },
          status: { stringValue: 'ACTIVE' },
          operationalCrew: { stringValue: 'YES' }
        }
      })
    });
    if (userUpdateRes.ok) {
      console.log("Success! Updated users/20726 status to ACTIVE.");
    } else {
      console.error("Failed to update users/20726:", await userUpdateRes.text());
    }
  } else {
    console.log("users/20726 document not found.");
  }

  // Also check userAccessControl for 20726
  console.log("\nChecking 'userAccessControl' collection for document ID 20726...");
  const uacUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/userAccessControl/20726`;
  const uacRes = await fetch(uacUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (uacRes.ok) {
    const uacData = await uacRes.json();
    console.log("Current userAccessControl/20726 fields:", JSON.stringify(uacData.fields, null, 2));
    
    // Update userAccessControl/20726
    console.log("Updating userAccessControl/20726 to allow login...");
    const uacUpdateUrl = `${uacUrl}?updateMask.fieldPaths=canLogin&updateMask.fieldPaths=active`;
    const uacUpdateRes = await fetch(uacUpdateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          canLogin: { booleanValue: true },
          active: { booleanValue: true }
        }
      })
    });
    if (uacUpdateRes.ok) {
      console.log("Success! Updated userAccessControl/20726 canLogin to true.");
    } else {
      console.error("Failed to update userAccessControl/20726:", await uacUpdateRes.text());
    }
  } else {
    console.log("userAccessControl/20726 document not found.");
  }
}

run().catch(err => {
  console.error("Error occurred:", err);
  process.exit(1);
});

// pushJsonToFirestore.js
// Reads local JSON roster backups and pushes them to Firestore in batches.
// Run this after Firestore quota resets (after ~12:30 PM IST).

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

process.env.GOOGLE_APPLICATION_CREDENTIALS = "C:\\Users\\nages\\.gcloud-config\\application_default_credentials.json";

initializeApp({ projectId: "pyidline2crew-41022" });
const db = getFirestore();

const JSON_DIR = path.join(__dirname, '..', 'roster_json_backup');

async function pushToFirestore() {
  const files = fs.readdirSync(JSON_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.error("No JSON files found in roster_json_backup/. Run exportRosterToJson.js first.");
    process.exit(1);
  }

  let totalWritten = 0;

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(JSON_DIR, file), 'utf8'));
    const docIds = Object.keys(data);
    console.log(`\nPushing ${file}: ${docIds.length} duties...`);

    // Write in batches of 400 to stay well under the 500 batch limit
    const BATCH_SIZE = 400;
    for (let i = 0; i < docIds.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const slice = docIds.slice(i, i + BATCH_SIZE);
      for (const docId of slice) {
        batch.set(db.collection('crew_final_links').doc(docId), data[docId]);
      }
      await batch.commit();
      console.log(`  ✅ Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${slice.length} docs)`);
      totalWritten += slice.length;
    }
  }

  console.log(`\n🎉 Done! Total duties written to Firestore: ${totalWritten}`);
}

pushToFirestore().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});

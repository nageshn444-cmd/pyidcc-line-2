const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

try {
  initializeApp();
  const db = getFirestore();
  db.collection('system_users').limit(5).get().then(snap => {
    console.log("Success! Read", snap.size, "documents.");
    snap.forEach(doc => {
      console.log(doc.id, "=>", doc.data());
    });
    process.exit(0);
  }).catch(err => {
    console.error("Failed to query system_users:", err.message);
    process.exit(1);
  });
} catch (err) {
  console.error("Initialization failed:", err.message);
  process.exit(1);
}

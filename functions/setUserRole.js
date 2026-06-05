import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile } from 'fs/promises';
import { join } from 'path';

// This script upgrades a user's role in Firestore.
// Usage: node functions/setUserRole.js <email> <ROLE>

async function run() {
  const email = process.argv[2];
  const role = process.argv[3];

  if (!email || !role) {
    console.error('Usage: node functions/setUserRole.js <email> <ROLE>');
    console.error('Example: node functions/setUserRole.js your.email@bmrcl.co.in CREW_CONTROLLER');
    process.exit(1);
  }

  const validRoles = ['ADMIN', 'CREW_CONTROLLER', 'TRAIN_OPERATOR', 'VIEWER'];
  if (!validRoles.includes(role)) {
    console.error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  try {
    // Note: Assuming you have a serviceAccount.json in your config folder 
    // based on the directory structure provided.
    const serviceAccountPath = join(process.cwd(), 'config', 'serviceAccount.json');
    let serviceAccount;
    
    try {
        const fileContent = await readFile(serviceAccountPath, 'utf-8');
        serviceAccount = JSON.parse(fileContent);
    } catch (e) {
        // Fallback to the other long-named json file in config
        console.warn("Could not read serviceAccount.json, trying the other credentials file...");
        const altPath = join(process.cwd(), 'config', 'pyidline2crew-41022-firebase-adminsdk-fbsvc-65ba945435.json');
        const altContent = await readFile(altPath, 'utf-8');
        serviceAccount = JSON.parse(altContent);
    }

    initializeApp({
      credential: cert(serviceAccount)
    });

    const db = getFirestore();

    console.log(`Searching for user with email: ${email}...`);
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', email).get();

    if (snapshot.empty) {
      console.log(`User ${email} not found in Firestore 'users' collection.`);
      console.log('Note: They must log in to the web app at least once via Google Sign-In to be created.');
      process.exit(0);
    }

    const userDoc = snapshot.docs[0];
    await userDoc.ref.update({ role: role });

    console.log(`Successfully updated ${email} to role: ${role}`);
    
  } catch (error) {
    console.error('Error updating user role:', error);
  }
}

run();

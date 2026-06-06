// Run this from Firebase Functions to seed initial employee data
// Or run locally: node functions/initializeEmployees.js

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./config/serviceAccount.json'); // You'll need to download this from Firebase

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://pyidline2crew-41022.firebaseio.com'
});

const db = admin.firestore();

// Sample employee data to initialize
const sampleEmployees = [
  {
    id: 'EMP001',
    name: 'Station Superintendent',
    contact: '+91-9876543210',
    email: 'superintendent@bmrcl.in',
    designation: 'Station Superintendent',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'EMP002',
    name: 'Operator Alpha',
    contact: '+91-9876543211',
    email: 'operator.alpha@bmrcl.in',
    designation: 'Station Controller / Train Operator',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  },
  {
    id: 'EMP003',
    name: 'Operator Beta',
    contact: '+91-9876543212',
    email: 'operator.beta@bmrcl.in',
    designation: 'Station Controller / Train Operator',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }
];

// Initialize employees collection
async function initializeEmployees() {
  try {
    console.log('Initializing employees collection...');
    
    const batch = db.batch();
    
    for (const emp of sampleEmployees) {
      const docRef = db.collection('employees').doc(emp.id);
      batch.set(docRef, emp);
    }
    
    await batch.commit();
    console.log(`✅ Successfully initialized ${sampleEmployees.length} employees`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error initializing employees:', error);
    process.exit(1);
  }
}

initializeEmployees();

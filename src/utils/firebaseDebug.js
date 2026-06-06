// Firebase Debug Utility
// Use this to diagnose Firebase connection issues

import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

export const debugFirebase = async () => {
  console.group('🔍 Firebase Debug Information');
  
  try {
    // Test 1: Check Firestore Connection
    console.log('Test 1: Checking Firestore Connection...');
    await getDoc(doc(db, 'test', 'connection'));
    console.log('✅ Firestore connected successfully');
    
    // Test 2: Check employees collection
    console.log('\nTest 2: Checking employees collection...');
    const employeesRef = collection(db, 'employees');
    const employeesSnapshot = await getDocs(employeesRef);
    
    console.log(`✅ Collection found: ${employeesSnapshot.size} employees`);
    
    if (employeesSnapshot.size === 0) {
      console.warn('⚠️ WARNING: No employees found in collection');
      console.warn('💡 Add employees manually or run initializeEmployees.js');
    } else {
      console.log('Employee IDs:');
      employeesSnapshot.docs.forEach((doc, idx) => {
        console.log(`  ${idx + 1}. ${doc.id} - ${doc.data().name}`);
      });
    }
    
    // Test 3: Check Firebase config
    console.log('\nTest 3: Firebase Configuration:');
    console.log('Project ID:', db.app?.options?.projectId || 'NOT FOUND');
    
    console.groupEnd();
    return { success: true, employeeCount: employeesSnapshot.size };
    
  } catch (error) {
    console.error('❌ Error during debug:', error);
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.groupEnd();
    return { success: false, error: error.message };
  }
};

// Make available globally for browser console
if (typeof window !== 'undefined') {
  window.debugFirebase = debugFirebase;
}

// src/utils/seedCrew.js
import { db } from '../firebase'; // Ensure your firebase init path is correct
import { doc, setDoc } from 'firebase/firestore';
import { bmrclCrewRegistry } from '../data/bmrclCrewRegistry'; // Adjust import to your actual file

async function seedCrewData() {
  console.log("Starting bulk upload...");
  
  for (const crew of bmrclCrewRegistry) {
    try {
      // Use Employee ID as the Document ID for easy lookup
      const crewRef = doc(db, 'system_users', String(crew.employeeId));
      await setDoc(crewRef, {
        employeeId: String(crew.employeeId),
        employeeName: crew.name,
        designation: crew.designation || 'OPERATOR',
        depot: crew.depot || 'PYID',
        active: true,
        email: crew.email, // Ensure your registry has emails
        role: 'USER',
        accountSetup: false // Flag to force password setup
      });
      console.log(`Uploaded: ${crew.name} (${crew.employeeId})`);
    } catch (e) {
      console.error(`Error uploading ${crew.name}:`, e);
    }
  }
  console.log("Bulk upload complete.");
}

seedCrewData();
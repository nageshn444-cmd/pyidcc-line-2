import { db } from '../src/firebase.js';
import { writeBatch, doc } from 'firebase/firestore';

// Direct data array mirror mapping from your production personnel registry
const PARSED_CREW = [
  { id: "20726", name: "NAGESHA N", contact: "9110238017", desig: "Station Superintendent" },
  { id: "21430", name: "KRISHNA MURTHY V", contact: "7019472154", desig: "Station Controller / Train Operator" },
  { id: "21434", name: "PRUTHVIRAJ L K", contact: "8088821541", desig: "Station Controller / Train Operator" },
  { id: "21436", name: "MANJUNATHA K R", contact: "9916984731", desig: "Station Controller / Train Operator" },
  { id: "21449", name: "BHAVYA KN", contact: "9591611861", desig: "Station Controller / Train Operator" },
  { id: "21460", name: "KAVITHA M N", contact: "9036109108", desig: "Station Controller / Train Operator" },
  { id: "21468", name: "GIRISH V", contact: "9686165508", desig: "Station Controller / Train Operator" }
];

export async function populateLiveShiftSimulation() {
  console.log("Initializing active operational tracks for Train IDs 201-223...");
  const batch = writeBatch(db);
  const todayStr = new Date().toISOString().split('T')[0];

  // Systematically seed all 23 trains inside your required line parameter bounds
  for (let id = 201; id <= 223; id++) {
    const docRef = doc(db, 'daily_crew_tracks', `${todayStr}_${id}`);
    
    // Toggle every third train into a high-frequency NGSA-PUTH Short Loop track
    const isShortLoop = (id % 3 === 0);
    
    const driver = PARSED_CREW[id % PARSED_CREW.length];
    const reliever = PARSED_CREW[(id + 1) % PARSED_CREW.length];

    // Build the standardized data payload format matching your parsing rules
    const payload = {
      date: todayStr,
      trainId: id,
      activeTripIndex: Math.floor(Math.random() * 40) + 1,
      operationalMode: "ATO",
      isShortLoopActive: isShortLoop,
      terminalLoopRoute: isShortLoop ? "NGSA-PUTH" : "BIET-APTS",
      
      currentOperator: {
        employeeId: driver.id,
        name: driver.name,
        designation: driver.desig,
        contactNumber: driver.contact,
        dutyNumber: D-
      },
      
      nextOperator: {
        employeeId: reliever.id,
        name: reliever.name,
        designation: reliever.desig,
        takeoverLocation: isShortLoop ? "NGSA" : "PEENYA",
        scheduledTakeoverTime: "14:45:00",
        takeoverDutyNumber: D-,
        alertSent: false
      }
    };

    batch.set(docRef, payload, { merge: true });
  }

  await batch.commit();
  console.log("Success: All 23 operational train tracks successfully loaded into Firestore.");
}
